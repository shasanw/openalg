import { describe, it, expect } from "vitest";
import { buildTypstDocument, escapeTypstText, TEXT_FONT } from "./typst";
import {
  allProblems,
  buildSection,
  buildWorksheet,
  ANSWER_KEY_FORMATS,
  DEFAULT_PRINT_CONFIG,
  setResponseFormat,
  type PrintConfig,
  type Worksheet,
} from "./worksheet";
import {
  assemble,
  choiceLetter,
  choiceSeed,
  MAX_CHOICES,
  MIN_CHOICES,
} from "./mc";
import { QUADRATIC_FACTORING_ID } from "./generators/quadraticFactoring";
import { QUADRATIC_FORMULA_ID } from "./generators/quadraticFormula";

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
      const cells = [...keyOf(doc.source).matchAll(/grid\.cell\[#box\(width: 1\.6em\)\[(\d+)\\\)\] @@M(\d+)@@[\s\S]*?Answer:\] @@M(\d+)@@/g)];
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
