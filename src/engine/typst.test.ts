import { describe, it, expect } from "vitest";
import { answerMath, buildTypstDocument, escapeTypstText, TEXT_FONT } from "./typst";
import { ANSWER_PART_SEPARATOR } from "./format";
import { PARABOLA_PROPERTIES_ID } from "./generators/parabolaProperties";
import {
  allProblems,
  buildSection,
  buildWorksheet,
  ANSWER_KEY_FORMATS,
  DEFAULT_PRINT_CONFIG,
  setResponseFormat,
  setVersionSettings,
  type AnswerKeyFormat,
  type PrintConfig,
  type ScrambleMode,
  type Worksheet,
} from "./worksheet";
import { deriveVersion, deriveVersions, versionChoices } from "./versions";
import {
  assemble,
  choiceLetter,
  choiceSeed,
  MAX_CHOICES,
  MIN_CHOICES,
} from "./mc";
import { QUADRATIC_FACTORING_ID } from "./generators/quadraticFactoring";
import { QUADRATIC_FORMULA_ID } from "./generators/quadraticFormula";
import { GRAPHING_QUADRATICS_ID } from "./generators/graphingQuadratics";
import { QUADRATIC_INEQUALITIES_ID } from "./generators/quadraticInequalities";

function ws(count: number, print?: Partial<PrintConfig>) {
  return buildWorksheet({
    generatorId: QUADRATIC_FACTORING_ID,
    baseSeed: 1,
    count,
    print: print ? { ...DEFAULT_PRINT_CONFIG, ...print } : undefined,
  });
}

describe("buildTypstDocument", () => {
  it("emits one math placeholder per prompt + answer with a full key", () => {
    const doc = buildTypstDocument(ws(5), { keyFormat: "full" });
    expect(doc.math).toHaveLength(10); // 5 prompts + 5 answers
    for (let i = 0; i < doc.math.length; i++) {
      expect(doc.source).toContain(`@@M${i}@@`);
    }
  });

  it("omits answers when keyFormat is none", () => {
    const doc = buildTypstDocument(ws(5), { keyFormat: "none" });
    expect(doc.math).toHaveLength(5);
    expect(doc.source).not.toContain("Answer Key");
  });

  it("every placeholder has a corresponding math entry and vice versa", () => {
    const doc = buildTypstDocument(ws(7), { keyFormat: "full" });
    const found = [...doc.source.matchAll(/@@M(\d+)@@/g)].map((m) =>
      Number(m[1]),
    );
    expect(found.sort((a, b) => a - b)).toEqual(
      doc.math.map((_, i) => i),
    );
  });

  it("includes the title and directions", () => {
    const w = ws(2);
    const doc = buildTypstDocument(w);
    expect(doc.source).toContain(escapeTypstText(w.title));
    expect(doc.source).toContain(escapeTypstText(w.sections[0].directions));
  });

  it("sets the text font explicitly to New Computer Modern", () => {
    expect(TEXT_FONT).toBe("New Computer Modern");
    expect(buildTypstDocument(ws(2)).source).toContain(
      '#set text(font: "New Computer Modern", size: 12pt)',
    );
  });

  it("is deterministic", () => {
    expect(buildTypstDocument(ws(4))).toEqual(buildTypstDocument(ws(4)));
  });
});

describe("buildTypstDocument Sections", () => {
  /** Hand-built: 3 factoring Problems, then 2 quadratic-formula Problems. */
  function twoSections(): Worksheet {
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 1,
      count: 3,
      directions: "Solve each equation by factoring.",
    });
    const second = buildSection({
      generatorId: QUADRATIC_FORMULA_ID,
      baseSeed: 2,
      count: 2,
      directions: "Solve using the quadratic formula.",
    });
    return { ...ws, sections: [...ws.sections, second] };
  }

  it("prints each Section's Directions above its own Problems", () => {
    const ws = twoSections();
    const { source } = buildTypstDocument(ws, { keyFormat: "none" });
    const first = source.indexOf("#emph[Solve each equation by factoring.]");
    const second = source.indexOf("#emph[Solve using the quadratic formula.]");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    // Problems 1-3 sit between the two Directions; 4-5 come after the second.
    const label = (n: number) => source.indexOf(`[${n}\\)]`);
    [1, 2, 3].forEach((n) => {
      expect(label(n)).toBeGreaterThan(first);
      expect(label(n)).toBeLessThan(second);
    });
    [4, 5].forEach((n) => expect(label(n)).toBeGreaterThan(second));
  });

  it("numbers Problems continuously across Sections, in the Answer Key too", () => {
    const ws = twoSections();
    const doc = buildTypstDocument(ws, { keyFormat: "full" });
    const labels = [...doc.source.matchAll(/\[(\d+)\\\)\]/g)].map((m) => Number(m[1]));
    expect(labels).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
    const problems = ws.sections.flatMap((s) => s.problems);
    expect(doc.math).toEqual([
      ...problems.map((p) => p.prompt),
      ...problems.map((p) => p.answer),
    ]);
  });
});

describe("buildTypstDocument print config", () => {
  it("reflects paper size, mapping legal to Typst's us-legal", () => {
    expect(buildTypstDocument(ws(2, { paper: "us-letter" })).source).toContain(
      `paper: "us-letter"`,
    );
    expect(buildTypstDocument(ws(2, { paper: "a4" })).source).toContain(
      `paper: "a4"`,
    );
    expect(buildTypstDocument(ws(2, { paper: "legal" })).source).toContain(
      `paper: "us-legal"`,
    );
  });

  it("reflects orientation via the flipped flag", () => {
    expect(
      buildTypstDocument(ws(2, { orientation: "portrait" })).source,
    ).toContain("flipped: false");
    expect(
      buildTypstDocument(ws(2, { orientation: "landscape" })).source,
    ).toContain("flipped: true");
  });

  it("reflects body font size in points", () => {
    expect(buildTypstDocument(ws(2, { fontSize: "small" })).source).toContain(
      'text(font: "New Computer Modern", size: 10pt)',
    );
    expect(buildTypstDocument(ws(2, { fontSize: "large" })).source).toContain(
      'text(font: "New Computer Modern", size: 14pt)',
    );
  });

  it("reflects margin presets in inches", () => {
    expect(buildTypstDocument(ws(2, { margin: "narrow" })).source).toContain(
      "margin: 0.5in",
    );
    expect(buildTypstDocument(ws(2, { margin: "normal" })).source).toContain(
      "margin: 1in",
    );
    expect(buildTypstDocument(ws(2, { margin: "wide" })).source).toContain(
      "margin: 1.5in",
    );
  });

  it("toggles page numbering", () => {
    expect(buildTypstDocument(ws(2, { pageNumbers: true })).source).toContain(
      `numbering: "1"`,
    );
    expect(buildTypstDocument(ws(2, { pageNumbers: false })).source).toContain(
      "numbering: none",
    );
  });

  it("reflects work-space spacing as the problem grid's row gutter", () => {
    expect(buildTypstDocument(ws(2, { spacing: "tight" })).source).toContain(
      "row-gutter: 1.2em",
    );
    expect(buildTypstDocument(ws(2, { spacing: "roomy" })).source).toContain(
      "row-gutter: 7em",
    );
  });

  it("shows or hides the name/date/period blanks", () => {
    expect(
      buildTypstDocument(ws(2, { showNameDatePeriod: true })).source,
    ).toContain("Name");
    expect(
      buildTypstDocument(ws(2, { showNameDatePeriod: false })).source,
    ).not.toContain("Name");
  });
});

describe("escapeTypstText", () => {
  it("escapes Typst markup characters", () => {
    expect(escapeTypstText("a #b [c] *d* @e")).toBe(
      "a \\#b \\[c\\] \\*d\\* \\@e",
    );
  });
});

describe("buildTypstDocument multiple choice", () => {
  function mcSheet(count: number, choices: number): Worksheet {
    return setResponseFormat(ws(count), { mode: "multiple-choice", choices });
  }

  it("prints each Problem's prompt followed by its lettered choices", () => {
    for (let choices = MIN_CHOICES; choices <= MAX_CHOICES; choices++) {
      const sheet = mcSheet(3, choices);
      const doc = buildTypstDocument(sheet, { keyFormat: "none" });
      const problems = allProblems(sheet);
      const expected = problems.flatMap((p) => [
        p.prompt,
        ...assemble(p, { choices, seed: choiceSeed(p) }).choices,
      ]);
      expect(doc.math).toEqual(expected);
      const letters = [...doc.source.matchAll(/\[\(([A-E])\)\]/g)].map((m) => m[1]);
      const one = [..."ABCDE"].slice(0, choices);
      expect(letters).toEqual([...one, ...one, ...one]);
    }
  });

  it("the Answer Key gives the correct letter and the Answer", () => {
    const sheet = mcSheet(6, 4);
    const doc = buildTypstDocument(sheet, { keyFormat: "full" });
    const key = doc.source.slice(doc.source.indexOf("Answer Key"));
    const keyLetters = [...key.matchAll(/#strong\[\(([A-E])\)\] @@M(\d+)@@/g)];
    const problems = allProblems(sheet);
    expect(keyLetters).toHaveLength(problems.length);
    keyLetters.forEach((m, i) => {
      const p = problems[i];
      const { choices, correctIndex } = assemble(p, { choices: 4, seed: choiceSeed(p) });
      expect(m[1]).toBe(choiceLetter(correctIndex));
      expect(doc.math[Number(m[2])]).toBe(p.answer);
      expect(choices[correctIndex]).toBe(p.answer);
    });
  });

  it("the lettered choice the key names is the Answer on the sheet", () => {
    const sheet = mcSheet(8, 5);
    const doc = buildTypstDocument(sheet, { keyFormat: "full" });
    const problems = allProblems(sheet);
    // Sheet math: per problem, prompt then 5 choices.
    const keyStart = doc.source.indexOf("Answer Key");
    const key = [...doc.source.slice(keyStart).matchAll(/#strong\[\(([A-E])\)\]/g)];
    problems.forEach((p, i) => {
      const letterIndex = key[i][1].charCodeAt(0) - 65;
      expect(doc.math[i * 6 + 1 + letterIndex]).toBe(p.answer);
    });
  });

  it("every placeholder has a math entry and vice versa", () => {
    const doc = buildTypstDocument(mcSheet(5, 4), { keyFormat: "full" });
    const found = [...doc.source.matchAll(/@@M(\d+)@@/g)].map((m) => Number(m[1]));
    expect(found.sort((a, b) => a - b)).toEqual(doc.math.map((_, i) => i));
  });

  it("free response prints no choices", () => {
    const doc = buildTypstDocument(ws(4), { keyFormat: "full" });
    expect(doc.source).not.toMatch(/\[\([A-E]\)\]/);
    expect(doc.math).toHaveLength(8);
  });

  it("is deterministic", () => {
    expect(buildTypstDocument(mcSheet(5, 3))).toEqual(buildTypstDocument(mcSheet(5, 3)));
  });
});

describe("Answer Key formats", () => {
  /** 3 factoring Problems, then 2 quadratic-formula Problems (numbered 1 to 5). */
  function twoSections(): Worksheet {
    const first = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 1,
      count: 3,
      directions: "Solve each equation by factoring.",
    });
    const second = buildSection({
      generatorId: QUADRATIC_FORMULA_ID,
      baseSeed: 2,
      count: 2,
      directions: "Solve using the quadratic formula.",
    });
    return { ...first, sections: [...first.sections, second] };
  }
  const mc = (w: Worksheet, choices = 4) =>
    setResponseFormat(w, { mode: "multiple-choice", choices });
  const keyOf = (source: string) => source.slice(source.indexOf("#pagebreak()"));
  const labels = (s: string) => [...s.matchAll(/\[(\d+)\\\)\]/g)].map((m) => Number(m[1]));

  it("prints the Worksheet's own format unless an option overrides it", () => {
    const sheet = { ...twoSections(), answerKeyFormat: "none" as const };
    expect(buildTypstDocument(sheet).source).not.toContain("Answer Key");
    expect(buildTypstDocument(sheet, { keyFormat: "full" }).source).toContain("Answer Key");
    const odds = { ...twoSections(), answerKeyFormat: "odds" as const };
    expect(buildTypstDocument(odds)).toEqual(buildTypstDocument(odds, { keyFormat: "odds" }));
  });

  it("every format and Response Format keeps placeholders and math in step", () => {
    for (const sheet of [twoSections(), mc(twoSections(), 3)]) {
      for (const keyFormat of ANSWER_KEY_FORMATS) {
        const doc = buildTypstDocument(sheet, { keyFormat });
        const found = [...doc.source.matchAll(/@@M(\d+)@@/g)].map((m) => Number(m[1]));
        expect(found.sort((a, b) => a - b)).toEqual(doc.math.map((_, i) => i));
      }
    }
  });

  it("none prints no key pages at all", () => {
    for (const sheet of [twoSections(), mc(twoSections())]) {
      const doc = buildTypstDocument(sheet, { keyFormat: "none" });
      expect(doc.source).not.toContain("#pagebreak()");
      expect(doc.source).not.toContain("Answer Key");
      expect(doc.source).not.toContain("Answer:");
      expect(labels(doc.source)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("full lists every Answer, numbered continuously across Sections", () => {
    const sheet = twoSections();
    const doc = buildTypstDocument(sheet, { keyFormat: "full" });
    expect(labels(keyOf(doc.source))).toEqual([1, 2, 3, 4, 5]);
    expect(doc.math.slice(5)).toEqual(allProblems(sheet).map((p) => p.answer));
  });

  it("odds lists only odd-numbered Problems, counting across Sections", () => {
    const sheet = twoSections();
    const doc = buildTypstDocument(sheet, { keyFormat: "odds" });
    const key = keyOf(doc.source);
    expect(key).toContain("odd-numbered problems");
    expect(labels(key)).toEqual([1, 3, 5]);
    const problems = allProblems(sheet);
    // Problem 5 is the second Section's second Problem.
    expect(doc.math.slice(5)).toEqual([problems[0], problems[2], problems[4]].map((p) => p.answer));
  });

  it("odds in multiple choice gives each odd Problem's correct letter and Answer", () => {
    const sheet = mc(twoSections(), 5);
    const doc = buildTypstDocument(sheet, { keyFormat: "odds" });
    const key = keyOf(doc.source);
    const entries = [...key.matchAll(/\[(\d+)\\\)\] #strong\[\(([A-E])\)\] @@M(\d+)@@/g)];
    const problems = allProblems(sheet);
    expect(entries.map((m) => Number(m[1]))).toEqual([1, 3, 5]);
    for (const [, n, letter, mi] of entries) {
      const p = problems[Number(n) - 1];
      const { correctIndex } = assemble(p, { choices: 5, seed: choiceSeed(p) });
      expect(letter).toBe(choiceLetter(correctIndex));
      expect(doc.math[Number(mi)]).toBe(p.answer);
    }
  });

  describe("in-context", () => {
    it("is a labelled copy of the Worksheet on fresh pages, numbered from 1", () => {
      const sheet = twoSections();
      const doc = buildTypstDocument(sheet, { keyFormat: "in-context" });
      const key = keyOf(doc.source);
      expect(key).toContain("#counter(page).update(1)");
      expect(key).toContain(escapeTypstText(sheet.title));
      expect(key).toContain("#emph[Solve each equation by factoring.]");
      expect(key).toContain("#emph[Solve using the quadratic formula.]");
      expect(key).toMatch(/fill: keycolor\)\[Answer Key\]/);
      // The key copy has no Name / Date / Period blanks to fill in.
      expect(key).not.toContain("Name #blank");
      expect(labels(doc.source)).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
    });

    it("prints each free-response Answer directly under its own Problem", () => {
      const sheet = twoSections();
      const doc = buildTypstDocument(sheet, { keyFormat: "in-context" });
      const cells = [...keyOf(doc.source).matchAll(/grid\.cell\[#set par\(hanging-indent: 1\.6em\)\n#box\(width: 1\.6em\)\[(\d+)\\\)\] @@M(\d+)@@[\s\S]*?Answer:\] @@M(\d+)@@/g)];
      const problems = allProblems(sheet);
      expect(cells).toHaveLength(problems.length);
      for (const [, n, prompt, answer] of cells) {
        const p = problems[Number(n) - 1];
        expect(doc.math[Number(prompt)]).toBe(p.prompt);
        expect(doc.math[Number(answer)]).toBe(p.answer);
      }
    });

    it("circles the correct letter in multiple choice and names it", () => {
      for (let choices = MIN_CHOICES; choices <= MAX_CHOICES; choices++) {
        const sheet = mc(twoSections(), choices);
        const doc = buildTypstDocument(sheet, { keyFormat: "in-context" });
        const key = keyOf(doc.source);
        const circled = [...key.matchAll(/radius: 50%[^\n]*?#strong\[([A-E])\]\]\]\] #text\(fill: keycolor\)\[@@M(\d+)@@\]/g)];
        const named = [...key.matchAll(/Answer: \(([A-E])\)/g)].map((m) => m[1]);
        const problems = allProblems(sheet);
        expect(circled).toHaveLength(problems.length);
        problems.forEach((p, i) => {
          const { correctIndex } = assemble(p, { choices, seed: choiceSeed(p) });
          const letter = choiceLetter(correctIndex);
          expect(circled[i][1]).toBe(letter);
          expect(doc.math[Number(circled[i][2])]).toBe(p.answer);
          expect(named[i]).toBe(letter);
        });
        // Every other choice keeps its plain "(X)" letter, as on the student copy.
        const student = doc.source.slice(0, doc.source.indexOf("#pagebreak()"));
        const plain = (src: string) => [...src.matchAll(/\[\(([A-E])\)\]/g)].length;
        expect(plain(key)).toBe(plain(student) - problems.length);
      }
    });

    it("leaves the student copy unmarked", () => {
      const doc = buildTypstDocument(mc(twoSections()), { keyFormat: "in-context" });
      const student = doc.source.slice(0, doc.source.indexOf("#pagebreak()"));
      expect(student).not.toContain("radius: 50%");
      expect(student).not.toContain("Answer:");
    });
  });
});

describe("multi-part Answers wrap between their parts", () => {
  function collect() {
    const math: string[] = [];
    const placeholder = (latex: string) => {
      math.push(latex);
      return `@@M${math.length - 1}@@`;
    };
    return { math, placeholder };
  }

  it("emits one unbreakable equation per part, separated by breakable text", () => {
    const { math, placeholder } = collect();
    const out = answerMath(
      ["\\text{Vertex: } (2, -1)", "\\text{Axis: } x = 2"].join(ANSWER_PART_SEPARATOR),
      placeholder,
    );
    expect(math).toEqual(["\\text{Vertex: } (2, -1)", "\\text{Axis: } x = 2"]);
    // A bare ";" after an embedded call would be swallowed by Typst.
    expect(out).toBe("#box[@@M0@@]#[;] #box[@@M1@@]");
  });

  it("leaves a single-part Answer as one breakable equation", () => {
    const { math, placeholder } = collect();
    expect(answerMath("x = 3, 5", placeholder)).toBe("@@M0@@");
    expect(math).toEqual(["x = 3, 5"]);
  });

  // Regression: the parabola Topic's Answer used to be one long equation that
  // overflowed into the next column of the key and of multiple-choice options.
  it.each([
    ["free response", false],
    ["multiple choice", true],
  ])("never sends a whole multi-part Answer as one equation (%s)", (_, mc) => {
    for (const key of ANSWER_KEY_FORMATS) {
      let sheet = buildWorksheet({
        generatorId: PARABOLA_PROPERTIES_ID,
        baseSeed: 3,
        count: 8,
        answerKeyFormat: key,
      });
      if (mc) sheet = setResponseFormat(sheet, { mode: "multiple-choice", choices: 4 });
      const { math } = buildTypstDocument(sheet);
      expect(math.some((m) => m.includes(ANSWER_PART_SEPARATOR))).toBe(false);
    }
  });
});

describe("buildTypstDocument Versions", () => {
  function quiz(): Worksheet {
    const first = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 21,
      count: 5,
      title: "Quiz",
    });
    const second = buildSection({
      generatorId: QUADRATIC_FORMULA_ID,
      baseSeed: 22,
      count: 4,
      directions: "Solve using the quadratic formula.",
    });
    return { ...first, sections: [...first.sections, second] };
  }
  const sheet = (
    mode: ScrambleMode,
    count = 3,
    opts: { mc?: number; key?: AnswerKeyFormat } = {},
  ) => {
    let w = setVersionSettings(quiz(), { count, mode });
    if (opts.mc) w = setResponseFormat(w, { mode: "multiple-choice", choices: opts.mc });
    if (opts.key) w = { ...w, answerKeyFormat: opts.key };
    return w;
  };
  /** The source with every math placeholder replaced by its LaTeX. */
  const resolved = ({ source, math }: { source: string; math: string[] }) =>
    source.replace(/@@M(\d+)@@/g, (_, i) => `<<${math[Number(i)]}>>`);
  const MODES: ScrambleMode[] = ["scramble-choices", "scramble-order", "new-questions"];

  it("a single Version prints exactly as before: unlabelled, all equals A", () => {
    for (const key of ANSWER_KEY_FORMATS) {
      const w = { ...quiz(), answerKeyFormat: key };
      const doc = buildTypstDocument(w, { version: "all" });
      expect(doc).toEqual(buildTypstDocument(w));
      expect(doc).toEqual(buildTypstDocument(w, { version: 0 }));
      expect(doc.source).not.toContain("Version");
    }
  });

  it("Version A of a multi-Version Worksheet is the base sheet, labelled", () => {
    for (const mode of MODES) {
      const multi = sheet(mode, 3, { mc: 4 });
      const a = buildTypstDocument(multi, { version: 0 });
      const plain = buildTypstDocument({ ...multi, versions: { count: 1, mode } });
      expect(a.math).toEqual(plain.math);
      expect(a.source).toContain("Version A");
      // Only the labels and the key's restarted page numbers differ.
      const unlabelled = a.source
        .replace(` \\\n#text(size: 12pt, weight: "bold")[Version A]`, "")
        .replace("Version A Answer Key", "Answer Key")
        .replace("#pagebreak()\n#counter(page).update(1)\n#align", "#pagebreak()\n#align");
      expect(unlabelled).toEqual(plain.source);
    }
  });

  it("the Preview option shows one Version, defaulting to A", () => {
    const w = sheet("scramble-order", 3);
    expect(buildTypstDocument(w)).toEqual(buildTypstDocument(w, { version: 0 }));
    const b = buildTypstDocument(w, { version: 1 }).source;
    expect(b).toContain("Version B");
    expect(b).not.toContain("Version A");
    expect(b).not.toContain("Version C");
  });

  it("all: every Version's student pages, then every Version's key, in order", () => {
    const doc = buildTypstDocument(sheet("scramble-order", 3, { key: "full" }), { version: "all" });
    const at = (s: string) => doc.source.indexOf(s);
    const order = [
      'weight: "bold")[Version A]',
      'weight: "bold")[Version B]',
      'weight: "bold")[Version C]',
      "[Version A Answer Key]",
      "[Version B Answer Key]",
      "[Version C Answer Key]",
    ].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual(order.slice().sort((a, b) => a - b));
    // Five fresh starts after the first Version, each restarting page numbers.
    expect(doc.source.match(/#pagebreak\(\)\n#counter\(page\)\.update\(1\)/g)).toHaveLength(5);
  });

  it("none prints only the student pages of every Version", () => {
    const doc = buildTypstDocument(sheet("new-questions", 3, { key: "none" }), { version: "all" });
    expect(doc.source).not.toContain("Answer Key");
    expect(doc.source.match(/#pagebreak\(\)/g)).toHaveLength(2);
  });

  it("every Version's full key matches that Version's Problems and letters", () => {
    for (const mode of MODES) {
      for (const choices of [0, 3, 5]) {
        const w = sheet(mode, 4, { mc: choices || undefined, key: "full" });
        for (const v of deriveVersions(w)) {
          const doc = buildTypstDocument(w, { version: v.index });
          const src = resolved(doc);
          const key = src.slice(src.indexOf("Answer Key]"));
          const problems = allProblems(v.worksheet);
          if (choices) {
            const entries = [...key.matchAll(/\[(\d+)\\\)\] #strong\[\(([A-E])\)\] <<(.*?)>>/g)];
            expect(entries).toHaveLength(problems.length);
            problems.forEach((p, i) => {
              const { correctIndex } = versionChoices(p, choices, v.choiceVariant);
              expect(entries[i][1]).toBe(String(i + 1));
              expect(entries[i][2]).toBe(choiceLetter(correctIndex));
              expect(entries[i][3]).toBe(p.answer);
            });
            // The student page prints that same Version's choices in that order.
            const student = src.slice(0, src.indexOf("Answer Key]"));
            problems.forEach((p) => {
              const { choices: rendered } = versionChoices(p, choices, v.choiceVariant);
              const at = student.indexOf(`<<${p.prompt}>>`);
              const block = student.slice(at);
              const printed = [...block.matchAll(/\[\(([A-E])\)\] <<(.*?)>>/g)]
                .slice(0, choices)
                .map((m) => m[2]);
              expect(printed).toEqual(rendered);
            });
          } else {
            const answers = [...key.matchAll(/\[(\d+)\\\)\] <<(.*?)>>/g)].map((m) => m[2]);
            expect(answers).toEqual(problems.map((p) => p.answer));
          }
        }
      }
    }
  });

  it("every Version's in-context key circles that Version's own letters", () => {
    for (const mode of MODES) {
      const w = sheet(mode, 3, { mc: 4, key: "in-context" });
      const doc = resolved(buildTypstDocument(w, { version: "all" }));
      for (const v of deriveVersions(w)) {
        const start = doc.indexOf(`[${v.label} Answer Key]`);
        const next = doc.indexOf("Answer Key]", start + 20);
        const key = doc.slice(start, next < 0 ? undefined : next);
        const circled = [...key.matchAll(/#strong\[([A-E])\]\]\]\] #text\(fill: keycolor\)\[<<(.*?)>>\]/g)];
        const problems = allProblems(v.worksheet);
        expect(circled).toHaveLength(problems.length);
        problems.forEach((p, i) => {
          const { correctIndex } = versionChoices(p, 4, v.choiceVariant);
          expect(circled[i][1]).toBe(choiceLetter(correctIndex));
          expect(circled[i][2]).toBe(p.answer);
        });
      }
    }
  });

  it("scramble-choices moves letters between Versions; scramble-order does not", () => {
    const letters = (w: Worksheet, i: number) =>
      [...buildTypstDocument(w, { version: i, keyFormat: "full" }).source.matchAll(/#strong\[\(([A-E])\)\]/g)].map((m) => m[1]);
    const choicesSheet = sheet("scramble-choices", 2, { mc: 5 });
    expect(letters(choicesSheet, 1)).not.toEqual(letters(choicesSheet, 0));
    const orderSheet = sheet("scramble-order", 2, { mc: 5 });
    const b = deriveVersion(orderSheet, 1).worksheet;
    // Same letters per Problem, just listed in Version B's order.
    const byPrompt = new Map(
      allProblems(orderSheet).map((p, i) => [p.prompt, letters(orderSheet, 0)[i]]),
    );
    expect(letters(orderSheet, 1)).toEqual(allProblems(b).map((p) => byPrompt.get(p.prompt)));
  });

  it("keeps placeholders and math in step across every Version", () => {
    for (const mode of MODES) {
      for (const keyFormat of ANSWER_KEY_FORMATS) {
        const doc = buildTypstDocument(sheet(mode, 3, { mc: 3 }), { version: "all", keyFormat });
        const found = [...doc.source.matchAll(/@@M(\d+)@@/g)].map((m) => Number(m[1]));
        expect(found.sort((a, b) => a - b)).toEqual(doc.math.map((_, i) => i));
      }
    }
  });
});

describe("graphs (#9)", () => {
  const graphing = (params: Record<string, string | boolean> = {}, count = 6) =>
    buildWorksheet({ generatorId: GRAPHING_QUADRATICS_ID, params, baseSeed: 5, count });
  /** Each graph drawn, as its frame's name and the name of what is drawn over it (or null). */
  const uses = (source: string) =>
    [...source.matchAll(/#oagraph\((oag\d+)(?:, over: (oag\d+))?\)/g)].map((m) => ({
      frame: m[1],
      over: m[2] ?? null,
    }));
  const refs = (source: string) => uses(source).map((u) => u.over ?? u.frame);
  const defs = (source: string) =>
    new Map([...source.matchAll(/^#let (oag\d+) = bytes\((.*)\)$/gm)].map((m) => [m[1], m[2]]));

  it("defines each distinct graph once, as a plain Typst string, and references it by name", () => {
    const { source } = buildTypstDocument(graphing(), { keyFormat: "none" });
    // every student grid is the same blank grid: one definition, six uses
    expect([...defs(source).keys()]).toEqual(["oag0"]);
    expect(refs(source)).toEqual(Array(6).fill("oag0"));
    const literal = defs(source).get("oag0")!;
    expect(literal).toMatch(/^"<svg [^"\\]*<\/svg>"$/);
    expect(source).toContain("#let oagraph(frame, over: none) = ");
  });

  it("keeps a cell with a graph on one page", () => {
    const { source } = buildTypstDocument(graphing(), { keyFormat: "full" });
    expect(source.match(/grid\.cell\(breakable: false\)/g)).toHaveLength(12);
  });

  it("emits no graph markup for Topics without graphs", () => {
    const { source } = buildTypstDocument(ws(4), { keyFormat: "in-context" });
    expect(source).not.toContain("oagraph");
    expect(source).not.toContain("breakable");
  });

  it("prints no grid on the student copy when the work space is the student's own paper", () => {
    const { source } = buildTypstDocument(graphing({ workSpace: "none" }), { keyFormat: "none" });
    expect(source).not.toContain("oagraph");
  });

  it("the full and odds keys draw each Answer's graph in the key colour after its text Answer", () => {
    const sheet = graphing();
    for (const keyFormat of ["full", "odds"] as const) {
      const { source } = buildTypstDocument(sheet, { keyFormat });
      const key = source.slice(source.indexOf("Answer Key"));
      const keyUses = uses(key);
      expect(keyUses).toHaveLength(keyFormat === "full" ? 6 : 3);
      for (const u of keyUses) {
        // drawn on the student's own blank grid, which carries no key ink
        expect(u.frame).toBe("oag0");
        expect(defs(source).get(u.over!)).toContain("#c62828");
      }
      expect(defs(source).get("oag0")).not.toContain("#c62828");
    }
  });

  it("the in-context key draws the Answer on the student's grid, in its place", () => {
    const sheet = graphing();
    const { source } = buildTypstDocument(sheet, { keyFormat: "in-context" });
    const key = source.slice(source.indexOf(`[Answer Key]`));
    const keyUses = uses(key);
    expect(keyUses).toHaveLength(6);
    for (const u of keyUses) {
      expect(u.frame).toBe("oag0");
      expect(u.over).not.toBeNull();
    }
    // each answer graph comes before its "Answer:" line
    const first = key.indexOf("#oagraph(");
    expect(first).toBeLessThan(key.indexOf("Answer:"));
  });

  it("the in-context key puts a number line with no blank line to replace after the Answer", () => {
    const sheet = buildWorksheet({ generatorId: QUADRATIC_INEQUALITIES_ID, baseSeed: 2, count: 2 });
    const { source } = buildTypstDocument(sheet, { keyFormat: "in-context" });
    const key = source.slice(source.indexOf(`[Answer Key]`));
    expect(key.indexOf("Answer:")).toBeLessThan(key.indexOf("#oagraph("));
    // and the student copy shows none
    expect(refs(source.slice(0, source.indexOf(`[Answer Key]`)))).toEqual([]);
  });

  it("multiple choice: the grid sits between the prompt and the choices, and the in-context key fills it in", () => {
    const sheet = setResponseFormat(graphing(), { mode: "multiple-choice", choices: 4 });
    const { source } = buildTypstDocument(sheet, { keyFormat: "in-context" });
    const firstCell = source.slice(source.indexOf("grid.cell"), source.indexOf("(B)"));
    expect(firstCell).toContain("#oagraph(oag0)");
    expect(firstCell.indexOf("#oagraph(")).toBeLessThan(firstCell.indexOf("(A)"));
    const key = source.slice(source.indexOf(`[Answer Key]`));
    expect(uses(key)).toHaveLength(6);
    expect(uses(key).every((u) => u.frame === "oag0" && u.over !== null)).toBe(true);
  });

  it("every Version prints its own graphs", () => {
    for (const mode of ["scramble-order", "new-questions"] as const) {
      const sheet = setVersionSettings(graphing(), { count: 3, mode });
      const all = buildTypstDocument(sheet, { version: "all", keyFormat: "full" });
      // three student copies of 6 grids, three keys of 6 answer graphs
      expect(uses(all.source)).toHaveLength(36);
      for (const u of uses(all.source)) {
        expect(defs(all.source).has(u.frame)).toBe(true);
        if (u.over) expect(defs(all.source).has(u.over)).toBe(true);
      }
    }
  });

  it("keeps the source small: 20 graphs share one frame, each answer is a small overlay", () => {
    const { source } = buildTypstDocument(graphing({}, 20), { keyFormat: "in-context" });
    expect(source.length).toBeLessThan(40_000);
    const lines = buildWorksheet({
      generatorId: QUADRATIC_INEQUALITIES_ID,
      params: { showNumberLine: true },
      baseSeed: 5,
      count: 20,
    });
    expect(buildTypstDocument(lines, { keyFormat: "in-context" }).source.length).toBeLessThan(40_000);
  });
});
