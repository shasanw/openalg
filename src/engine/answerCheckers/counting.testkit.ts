import { ANSWER_PART_SEPARATOR } from "../format";
import type { Problem } from "../types";
import { fact, nCr, nPr, readNotation } from "../generators/counting/counting.testUtil";
import { proseOf, readCount } from "../generators/shared/matrices.testkit";
import { check, equal } from "./math.testkit";

function stages(text: string, ns: number[]): number {
  const [a, b] = ns;
  if (text.includes("lock's dial")) return a ** b;
  if (text.includes("license plate")) return 26 ** a * 10 ** b;
  if (text.includes("PIN")) return 10 ** a;
  if (text.includes("quiz")) return (b ?? 2) ** a;
  if (text.includes("sample space")) {
    const ways = [/coin/i, /six-sided die/i, /vowel/i, /spinner/i].map((device, i) =>
      device.test(text) ? [2, 6, 5, a][i] : 1,
    );
    return ways.reduce((u, v) => u * v, 1) ** (text.includes(" times") ? a : 1);
  }
  check(/outfits|routes|lunches|cars/.test(text), "unknown counting scenario");
  return ns.reduce((u, v) => u * v, 1);
}

function scenario(text: string, ns: number[]): [string, number] {
  const [a, b, c, d] = ns;
  if (/teacher.*students is chosen/.test(text)) return ["combination", nCr(c, a) * nCr(d, b)];
  if (/elects/.test(text))
    return ["permutation", nPr(a, (text.match(/a (?:vice president|president|treasurer|secretary)/g) ?? []).length)];
  if (/runners/.test(text))
    return ["permutation", nPr(a, (text.match(/first|second|third|fourth|fifth|sixth/g) ?? []).length)];
  if (/in a line/.test(text)) return ["permutation", fact(a)];
  if (/-digit code/.test(text)) return ["permutation", nPr(c - b + 1, a)];
  if (/prizes/.test(text)) return ["permutation", nPr(c, b)];
  if (/shelf|playlist/.test(text)) return ["permutation", nPr(b, a)];
  if (/handshakes/.test(text)) return ["combination", nCr(a, 2)];
  if (/toppings|test has/.test(text)) return ["combination", nCr(a, b)];
  if (/committee|trip|practice group/.test(text)) return ["combination", nCr(b, a)];
  throw new Error(`unrecognized scenario: ${text}`);
}

export function counting(p: Problem) {
  const notation = readNotation(p.prompt);
  if (notation) {
    equal(readCount(p.answer), notation.letter === "C" ? nCr(notation.n, notation.r) : nPr(notation.n, notation.r));
    return;
  }
  const text = proseOf(p.prompt),
    ns = [...text.matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (p.generatorId === "counting-principle") {
    equal(readCount(p.answer), stages(text, ns));
    return;
  }
  const word = text.match(/the letters of ([A-Z]+)/);
  if (word || text.includes("all of the digits")) {
    const symbols = word ? [...word[1]] : text.split("all of the digits ")[1].match(/\d/g)!;
    const repeats = [...new Set(symbols)].map((s) => fact(symbols.filter((c) => c === s).length));
    equal(readCount(p.answer), fact(symbols.length) / repeats.reduce((u, v) => u * v, 1));
    return;
  }
  const [kind, count] = scenario(text, ns);
  const parts = p.answer.split(ANSWER_PART_SEPARATOR);
  equal(readCount(parts.pop()!), count);
  if (p.params.ask === "both") check(parts.pop() === `\\text{${kind}}`, "wrong kind");
  equal(parts.length, 0);
}
