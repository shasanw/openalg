// End-to-end browser check of the Typst-WASM Preview, Print and PDF download
// (issue #24), with timings against the ADR 0002 budgets. Drives the real
// production build in headless Chromium and WebKit through Playwright.
//
//   pnpm build && pnpm check:typst            # Chromium + WebKit
//   pnpm check:typst --browsers=chromium      # one engine
//   pnpm check:typst --skip-throttled         # skip the slow 10 Mbps run
//
// What it does, per engine:
//  1. Cold visit (fresh profile): opens the app, opens the quadratic-formula
//     template at once, and times navigation -> first Preview page. Chromium
//     also runs it throttled to school wifi (10 Mbps / 40 ms RTT) via CDP,
//     with the loading state checked while the compiler downloads.
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
const base = `http://localhost:${port}/`;
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
// stop exactly that process at the end.
const server = spawn(process.execPath, [new URL("./serve-dist.mjs", import.meta.url).pathname], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => {
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

async function setRootType(page, value) {
  await page.locator("select").first().selectOption(value);
  await page.getByRole("button", { name: "Generate", exact: true }).click();
}

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
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
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
    await page.goto(base);
    await page.getByText("Solving quadratics by the quadratic formula").first().click();
    const loading = await page
      .getByText("Getting the Preview ready")
      .waitFor({ timeout: 5000 })
      .then(() => true, () => false);
    check(loading, "cold 10 Mbps: Preview shows the loading state while the compiler downloads");
    await page.waitForTimeout(3000);
    const progress = await page.getByRole("progressbar").getAttribute("aria-valuenow").catch(() => null);
    check(Number(progress) > 0, `cold 10 Mbps: download progress shown (${progress}% after ~3 s)`);
    await previewSvgs(page).first().waitFor({ timeout: 120_000 });
    result.coldSchoolMs = Math.round(await page.evaluate(() => performance.now()));
    const bytes = await page.evaluate(() =>
      performance.getEntriesByType("resource").reduce((s, e) => s + (e.transferSize || 0), 0),
    );
    console.log(`  cold first Preview at 10 Mbps / 40 ms: ${result.coldSchoolMs} ms (page-side transfer ${(bytes / 1e6).toFixed(2)} MB)`);
    await ctx.close();
  }

  // --- Cold, unthrottled localhost ---
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  watchOrigin(ctx, offOrigin);
  await ctx.addInitScript(PRINT_STUB);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  result.coldLocalMs = Math.round(await openTemplate(page));
  console.log(`  cold first Preview, localhost: ${result.coldLocalMs} ms`);

  // --- Radicals and imaginary roots, with the Answer Key ---
  await page.getByLabel("Answer key").check();
  await setRootType(page, "irrational");
  await waitForPreviewText(page, "√");
  let pages = await previewSvgs(page).count();
  check(pages >= 2, `irrational: ${pages} Preview pages (Problems + Answer Key), one SVG per page`);
  check((await previewText(page)).includes("√"), "irrational: radicals in the Preview");
  await page.screenshot({ path: `${outDir}${name}-irrational.png`, fullPage: false });

  await setRootType(page, "imaginary");
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
  server.kill();
}

console.log("\n== Budgets (ADR 0002) ==");
for (const r of results) {
  const rows = [
    r.coldSchoolMs !== undefined && `cold 10 Mbps ${r.coldSchoolMs} ms (budget < ${BUDGET.coldSchoolMs})`,
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
