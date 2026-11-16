// End-to-end browser check of the Typst-WASM Preview, Print and PDF download
// (issue #24), with timings against the ADR 0002 budgets. Drives the real
// production build in headless Chromium and WebKit through Playwright.
//
//   pnpm build && pnpm check:typst            # Chromium + WebKit
//   pnpm check:typst --browsers=chromium      # one engine
//   pnpm check:typst --skip-throttled         # skip the slow 10 Mbps run
//   pnpm check:typst --url=https://...        # a deployed site instead of dist/
//
// With --url, set VERCEL_AUTOMATION_BYPASS_SECRET to get past Vercel's
// deployment protection on preview and staging URLs.
//
// What it does, per engine:
//  1. Cold visit (fresh profile): opens the app, opens the quadratic-formula
//     template at once, and times navigation -> first Preview page. Chromium
//     also runs it throttled to school wifi (10 Mbps / 40 ms RTT) via CDP,
//     reporting first paint, when the Typst download starts, the time to the
//     first Preview content (the KaTeX draft) and to the exact Typst Preview,
//     and checking the swap from draft to exact has no blank frame or jump.
//  2. Generates irrational and imaginary-root Worksheets with the Answer Key
//     on, checking for radicals and the imaginary unit in the Preview.
//  3. Warm recompiles: 10 title edits, timed from the input event to the new
//     title appearing in the Preview (includes the 50 ms debounce), plus the
//     longest main-thread task during a burst of rapid edits.
//  4. Export PDF (checks the download is `<title>.pdf` starting with %PDF)
//     and Print (checks the print iframe gets one SVG per Preview page).
//  5. Return visit (same profile, service worker active): times navigation ->
//     first Preview, and checks no Typst file came from the network.
//
// Exits non-zero if a functional check fails; budgets are reported, not
// enforced, since timings depend on the machine.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, webkit } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const engines = String(args.browsers ?? "chromium,webkit").split(",");
const port = Number(args.port ?? 4199);
const remote = typeof args.url === "string" ? args.url.replace(/\/?$/, "/") : null;
const base = remote ?? `http://localhost:${port}/`;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const extraHTTPHeaders = remote && bypass
  ? { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "samesitenone" }
  : undefined;
const outDir = new URL("../check-results/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const TYPST_ASSET = /\/assets\/(typst_ts_|NewCM|mitex-)/;
const BUDGET = { coldSchoolMs: 8000, recompileMs: 150, returnVisitMs: 1000 };

let failures = 0;
function check(ok, what) {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)];

// Start the production-like server (brotli, immutable caching) ourselves and
// stop exactly that process at the end. Not needed with --url.
const server = remote ? null : spawn(process.execPath, [new URL("./serve-dist.mjs", import.meta.url).pathname], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"],
});
if (server) await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes("serving") && resolve());
  server.on("exit", (code) => reject(new Error(`server exited ${code}`)));
});

/** Stub print() in every frame so the print iframe reports what it got. */
const PRINT_STUB = `
  window.print = function () {
    window.top.__printed = document.querySelectorAll(".page > svg").length;
  };`;

const previewSvgs = (page) => page.locator("svg.typst-doc");

/** Navigation start -> first Preview page, opening the template immediately. */
async function openTemplate(page) {
  await page.goto(base);
  await page.getByText("Solving quadratics by the quadratic formula").first().click();
  await previewSvgs(page).first().waitFor({ timeout: 120_000 });
  return await page.evaluate(() => performance.now());
}

async function previewText(page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll("svg.typst-doc")].map((s) => s.textContent).join(" "),
  );
}

/** Root type is a segmented control; changing it regenerates the Section. */
async function setRootType(page, label) {
  await page.getByRole("radiogroup", { name: "Root type" }).getByRole("radio", { name: label }).click();
}

/** Switch the Preview to the Answer Key (the Worksheet prints the full key by default). */
async function showAnswerKey(page) {
  await page.getByRole("radiogroup", { name: "Preview" }).getByRole("radio", { name: /Answer Key/ }).click();
}

/**
 * Logs, once per animation frame, what the Preview shows ("none", "draft" or
 * "exact") whenever it changes, with the first sheet's box, so a blank frame
 * or a jump between the draft and the exact Preview shows up.
 */
const PREVIEW_LOG = `
  window.__previewLog = [];
  addEventListener("click", () => (window.__clickAt ??= Math.round(performance.now())), { capture: true });
  let last = null;
  const sample = () => {
    const exact = document.querySelector("svg.typst-doc");
    const draft = document.querySelector("[data-preview-draft]");
    const state = exact ? "exact" : draft ? "draft" : "none";
    if (state === "draft" && !window.__draftReadable && document.fonts.status === "loaded" &&
        document.fonts.check("12px KaTeX_Main") && document.fonts.check("italic 12px KaTeX_Math")) {
      window.__draftReadable = Math.round(performance.now());
    }
    if (state !== last) {
      last = state;
      const sheet = exact ? exact.parentElement : draft?.querySelector("[data-draft-sheet]");
      const r = sheet?.getBoundingClientRect();
      window.__previewLog.push({
        state,
        t: Math.round(performance.now()),
        sheet: r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width) } : null,
      });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);`;

async function waitForPreviewText(page, needle) {
  await page.waitForFunction(
    (n) => [...document.querySelectorAll("svg.typst-doc")].some((s) => s.textContent.includes(n)),
    needle,
    { timeout: 30_000 },
  );
}

/** Record every request that leaves our origin (there must be none). */
function watchOrigin(ctx, offOrigin) {
  ctx.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith(base) && !url.startsWith("data:") && !url.startsWith("blob:")) offOrigin.add(url);
  });
}

async function runEngine(name, browserType) {
  console.log(`\n== ${name} ==`);
  const result = { engine: name };
  const browser = await browserType.launch();
  const offOrigin = new Set();

  // --- Cold, throttled (Chromium only: CDP network emulation) ---
  if (name === "chromium" && !args["skip-throttled"]) {
    const ctx = await browser.newContext({ extraHTTPHeaders, viewport: { width: 1400, height: 900 } });
    watchOrigin(ctx, offOrigin);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 40,
      downloadThroughput: (10 * 1e6) / 8,
      uploadThroughput: (10 * 1e6) / 8,
    });
    // Let the worker inherit the throttling too.
    await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await ctx.addInitScript(PREVIEW_LOG);
    await ctx.addInitScript(PRINT_STUB);
    // When each Typst file was requested, relative to navigation start.
    const typstRequests = [];
    let navAt = 0;
    ctx.on("request", (r) => {
      if (TYPST_ASSET.test(r.url())) typstRequests.push({ file: r.url().split("/").pop(), at: Date.now() - navAt });
    });
    // When the draft's KaTeX fonts arrive (they share the link with Typst).
    const katexFonts = [];
    ctx.on("requestfinished", (r) => {
      if (/\/assets\/KaTeX_/.test(r.url())) katexFonts.push(Date.now() - navAt);
    });
    navAt = Date.now();
    await page.goto(base);
    await page.getByText("Solving quadratics by the quadratic formula").first().click();
    const draft = await page
      .locator("[data-preview-draft]")
      .waitFor({ timeout: 10_000 })
      .then(() => true, () => false);
    check(draft, "cold 10 Mbps: Preview shows the draft while the compiler downloads");
    const banner = await page.getByText("Preparing the exact preview").isVisible().catch(() => false);
    check(banner, "cold 10 Mbps: the draft is marked as a draft");
    await page.waitForTimeout(3000);
    const progress = await page.getByRole("progressbar").getAttribute("aria-valuenow", { timeout: 1000 }).catch(() => null);
    check(Number(progress) > 0, `cold 10 Mbps: download progress shown (${progress}% after ~3 s)`);
    if (draft) await page.screenshot({ path: `${outDir}${name}-cold-draft.png` });
    // Print while the compiler is still downloading: it waits for Typst and
    // prints the exact pages, never the draft.
    const printClickedAt = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: "Print", exact: true }).click();
    await previewSvgs(page).first().waitFor({ timeout: 120_000 });
    await page.waitForFunction(() => window.__printed !== undefined, null, { timeout: 60_000 });
    const printed = await page.evaluate(() => window.__printed);
    // The stubbed print never fires afterprint, so take its overlay down.
    await page.evaluate(() => document.querySelectorAll("iframe").forEach((f) => f.remove()));
    await page.screenshot({ path: `${outDir}${name}-cold-exact.png` });
    check(printed > 0, `cold 10 Mbps: Print clicked during the download (at ${Math.round(printClickedAt)} ms) printed ${printed} exact Typst pages`);
    const log = await page.evaluate(() => window.__previewLog);
    const paint = await page.evaluate(() =>
      Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? -1),
    );
    const firstContent = log.find((e) => e.state !== "none");
    const ready = await page.evaluate(() =>
      Math.round(performance.getEntriesByName("openalg:typst-ready")[0]?.startTime ?? -1),
    );
    result.typstReadyMs = ready;
    // KaTeX's fonts block text until they load, so the draft is readable a little after it appears.
    result.coldSchoolDraftReadableMs = await page.evaluate(() => window.__draftReadable);
    const exact = log.find((e) => e.state === "exact");
    result.coldSchoolFirstContentMs = firstContent?.t;
    result.coldSchoolMs = exact?.t;
    result.firstPaintMs = paint;
    const firstTypst = Math.min(...typstRequests.map((r) => r.at));
    result.typstDownloadStartMs = firstTypst;
    const bytes = await page.evaluate(() =>
      performance.getEntriesByType("resource").reduce((s, e) => s + (e.transferSize || 0), 0),
    );
    console.log(`  cold 10 Mbps / 40 ms: first paint ${paint} ms; Typst download starts ~${firstTypst} ms after navigation (${typstRequests.length} files)`);
    result.coldSchoolClickMs = await page.evaluate(() => window.__clickAt);
    console.log(`  cold 10 Mbps / 40 ms: template clicked at ${result.coldSchoolClickMs} ms; draft ${result.coldSchoolFirstContentMs - result.coldSchoolClickMs} ms after the click`);
    console.log(`  cold 10 Mbps / 40 ms: compiler loaded at ${ready} ms; draft readable (KaTeX fonts loaded) at ${result.coldSchoolDraftReadableMs} ms`);
    console.log(`  cold 10 Mbps / 40 ms: first Preview content (${firstContent?.state}) ${result.coldSchoolFirstContentMs} ms, exact Typst Preview ${result.coldSchoolMs} ms (page-side transfer ${(bytes / 1e6).toFixed(2)} MB)`);
    if (katexFonts.length) {
      result.katexFontsMs = Math.max(...katexFonts);
      console.log(`  cold 10 Mbps / 40 ms: draft's ${katexFonts.length} KaTeX fonts all loaded by ${result.katexFontsMs} ms`);
    }
    const afterContent = log.slice(log.indexOf(firstContent));
    check(!afterContent.some((e) => e.state === "none"), `cold 10 Mbps: no blank frame between first content and the exact Preview (${log.map((e) => e.state).join(" -> ")})`);
    const d = log.find((e) => e.state === "draft");
    if (d && exact && d.sheet && exact.sheet) {
      const jump = Math.max(Math.abs(d.sheet.x - exact.sheet.x), Math.abs(d.sheet.y - exact.sheet.y), Math.abs(d.sheet.width - exact.sheet.width));
      result.swapJumpPx = jump;
      check(jump <= 2, `cold 10 Mbps: the first sheet keeps its place and width when the exact Preview replaces the draft (moved ${jump} px)`);
    }
    await ctx.close();
  }

  // --- Compiler loaded before the first Worksheet opens (the usual case:
  // the download overlaps choosing a Topic) ---
  {
    const ctx = await browser.newContext({ extraHTTPHeaders, viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.waitForFunction(() => performance.getEntriesByName("openalg:typst-ready").length > 0, null, { timeout: 60_000 });
    await page.waitForTimeout(1000);
    const t0 = await page.evaluate(() => performance.now());
    await page.getByText("Solving quadratics by the quadratic formula").first().click();
    await previewSvgs(page).first().waitFor({ timeout: 60_000 });
    result.firstAfterReadyMs = Math.round((await page.evaluate(() => performance.now())) - t0);
    console.log(`  first Preview when the compiler finished loading before the Worksheet opened: ${result.firstAfterReadyMs} ms after the click`);
    await ctx.close();
  }

  // --- Cold, unthrottled localhost ---
  const ctx = await browser.newContext({ extraHTTPHeaders, viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  watchOrigin(ctx, offOrigin);
  await ctx.addInitScript(PRINT_STUB);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  result.coldLocalMs = Math.round(await openTemplate(page));
  console.log(`  cold first Preview, localhost: ${result.coldLocalMs} ms`);

  // --- Radicals and imaginary roots, with the Answer Key ---
  await showAnswerKey(page);
  await setRootType(page, "Irrational");
  await waitForPreviewText(page, "√");
  let pages = await previewSvgs(page).count();
  check(pages >= 2, `irrational: ${pages} Preview pages (Problems + Answer Key), one SVG per page`);
  check((await previewText(page)).includes("√"), "irrational: radicals in the Preview");
  await page.screenshot({ path: `${outDir}${name}-irrational.png`, fullPage: false });

  await setRootType(page, "Imaginary");
  await waitForPreviewText(page, "𝑖");
  const text = await previewText(page);
  check(text.includes("𝑖") && text.includes("√"), "imaginary: imaginary unit and radicals in the Answer Key");
  await previewSvgs(page).last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}${name}-imaginary-key.png` });

  // --- Warm recompiles: title edits ---
  const title = page.getByLabel("Worksheet title");
  const edits = [];
  for (let i = 0; i < 12; i++) {
    const t = `Period ${i} quiz ZQ${i}`;
    const ms = await page.evaluate(async (t) => {
      const input = document.querySelector('input[aria-label="Worksheet title"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      const start = performance.now();
      const done = new Promise((resolve) => {
        const obs = new MutationObserver(() => {
          const svg = document.querySelector("svg.typst-doc");
          if (svg && svg.textContent.includes(t.split(" ").at(-1))) {
            obs.disconnect();
            requestAnimationFrame(() => resolve(performance.now() - start));
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
      });
      setter.call(input, t);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return await done;
    }, t);
    if (i >= 2) edits.push(ms); // first two warm the edit path
  }
  result.recompileMedianMs = Math.round(median(edits));
  result.recompileP95Ms = Math.round(p95(edits));
  console.log(`  warm recompile (title edit -> Preview painted, incl. 50 ms debounce): median ${result.recompileMedianMs} ms, p95 ${result.recompileP95Ms} ms`);

  // --- Rapid edits: the main thread never blocks for long ---
  const burst = await page.evaluate(async () => {
    const input = document.querySelector('input[aria-label="Worksheet title"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    let longest = 0;
    let observer;
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longest = Math.max(longest, e.duration);
      });
      observer.observe({ type: "longtask", buffered: false });
    } catch {
      observer = null;
    }
    let maxGap = 0;
    let last = performance.now();
    let running = true;
    const tick = () => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    for (let i = 0; i < 30; i++) {
      setter.call(input, `Burst ${i} BURSTEND${i}`);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 16));
    }
    await new Promise((resolve) => {
      const poll = () =>
        document.querySelector("svg.typst-doc")?.textContent.includes("BURSTEND29")
          ? resolve()
          : setTimeout(poll, 10);
      poll();
    });
    running = false;
    observer?.disconnect();
    return { longestTask: Math.round(longest), maxFrameGap: Math.round(maxGap) };
  });
  check(true, `30 rapid edits: Preview ends on the last edit; longest main-thread task ${burst.longestTask} ms, longest frame gap ${burst.maxFrameGap} ms`);
  result.burst = burst;

  // --- Export PDF ---
  await title.fill("Quadratic quiz");
  await waitForPreviewText(page, "Quadratic");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  const pdfPath = `${outDir}${name}-export.pdf`;
  await download.saveAs(pdfPath);
  const pdf = readFileSync(pdfPath);
  check(download.suggestedFilename() === "Quadratic quiz.pdf", `PDF download named "${download.suggestedFilename()}"`);
  check(pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 5000, `PDF starts with %PDF- (${pdf.length} bytes)`);

  // --- Print ---
  pages = await previewSvgs(page).count();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.waitForFunction(() => window.__printed !== undefined, null, { timeout: 30_000 });
  const printed = await page.evaluate(() => window.__printed);
  check(printed === pages, `Print iframe got ${printed} SVG pages (Preview shows ${pages})`);
  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);

  // --- Return visit ---
  // Give the service worker time to copy the files into its cache (first
  // visit), then open a new tab in the same profile.
  const swCached = await page.evaluate(async () => {
    const deadline = performance.now() + 15_000;
    while (performance.now() < deadline) {
      const keys = await caches.keys();
      for (const k of keys) {
        if ((await (await caches.open(k)).keys()).length >= 7) return k;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  });
  check(Boolean(swCached), `service worker cached the 7 Typst files (${swCached})`);
  await page.close();

  const fromNetwork = [];
  let seen = 0;
  const rv = [];
  for (let i = 0; i < 3; i++) {
    const again = await ctx.newPage();
    again.on("request", (r) => {
      if (TYPST_ASSET.test(r.url()) && !r.serviceWorker()) {
        // Requests the page or worker made; were they answered by the SW?
        r.response().then((res) => {
          seen++;
          if (res && !res.fromServiceWorker()) fromNetwork.push(r.url().split("/").pop());
        });
      }
    });
    rv.push(Math.round(await openTemplate(again)));
    await again.waitForTimeout(200);
    await again.close();
  }
  result.returnVisitMs = rv;
  console.log(`  return visit first Preview: ${rv.join(", ")} ms`);
  check(seen > 0 && fromNetwork.length === 0, `return visit: ${seen} Typst file requests, all served by the service worker${fromNetwork.length ? " (from network: " + fromNetwork.join(", ") + ")" : ""}`);

  check(offOrigin.size === 0, `every request stayed on our origin${offOrigin.size ? ": " + [...offOrigin].join(", ") : ""}`);
  await ctx.close();
  await browser.close();
  return result;
}

const results = [];
try {
  for (const name of engines) {
    results.push(await runEngine(name, name === "webkit" ? webkit : chromium));
  }
} finally {
  server?.kill();
}

console.log("\n== Budgets (ADR 0002) ==");
for (const r of results) {
  const rows = [
    r.coldSchoolFirstContentMs !== undefined && `cold 10 Mbps first content (draft) ${r.coldSchoolFirstContentMs} ms, readable ${r.coldSchoolDraftReadableMs} ms`,
    r.coldSchoolMs !== undefined && `cold 10 Mbps exact Preview ${r.coldSchoolMs} ms (budget < ${BUDGET.coldSchoolMs})`,
    `cold localhost ${r.coldLocalMs} ms`,
    `recompile median ${r.recompileMedianMs} / p95 ${r.recompileP95Ms} ms (budget < ${BUDGET.recompileMs})`,
    `return visit ${Math.max(...r.returnVisitMs)} ms worst of ${r.returnVisitMs.length} (budget < ${BUDGET.returnVisitMs})`,
  ].filter(Boolean);
  console.log(`${r.engine}: ${rows.join("; ")}`);
}
writeFileSync(`${outDir}results.json`, JSON.stringify(results, null, 2));
console.log(`\nScreenshots, PDFs and results.json in ${outDir}`);
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
