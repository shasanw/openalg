import type { Problem } from "../types";
import { close, evalLatex, splitEquation } from "../generators/shared/latexEval.testkit";
import { check, coefficients, equal, expandSigns, gap, realRoots, sameNumbers } from "./math.testkit";

function names(tex: string) {
  return [...new Set(tex.replace(/\\[a-zA-Z]+/g, "").match(/[a-zA-Z](?:_\{?\d+\}?)?/g) ?? [])];
}
function roots(answer: string, v: string) {
  if (answer === "\\text{no solution}") return [];
  const [lhs, rhs] = splitEquation(answer);
  check(lhs === v, "wrong variable");
  return rhs
    .split(", ")
    .flatMap(expandSigns)
    .map((s) => evalLatex(s, { e: Math.E }));
}
export function equation(p: Problem) {
  const v = names(p.prompt)[0];
  const f = (x: number) => gap(p.prompt, { [v]: x });
  if (p.generatorId === "solving-proportions") {
    const xs = roots(p.answer, v);
    equal(xs.length, 1);
    equal(f(xs[0]), 0);
    check(!close(f(xs[0] + 1), 0), "non-unique proportion");
  } else if (p.prompt.includes("\\lvert")) {
    const candidates = [1, -1].flatMap((sign) => {
      const eq = p.prompt.replace(/\\lvert(.+?)\\rvert/, `(${sign})($1)`);
      return realRoots((x) => gap(eq, { [v]: x }));
    });
    sameNumbers(roots(p.answer, v), [...new Set(candidates.filter((x) => close(f(x), 0)))]);
  } else if (close(f(0), f(1))) {
    check(
      p.answer === (close(f(0), 0) ? "\\text{all real numbers}" : "\\text{no solution}"),
      "incorrect constant equation",
    );
  } else sameNumbers(roots(p.answer, v), realRoots(f));
}

export function literal(p: Problem) {
  const [eq, target] = p.prompt.split(", \\text{ for } ");
  const [lhs, rhs] = splitEquation(p.answer);
  check(lhs === target, "wrong subject");
  const vars = names(eq).filter((v) => v !== target);
  for (const k of [1, 2, 5]) {
    const env = Object.fromEntries(
      vars.map((v, i) => [v.replace(/[{}]/g, ""), 1.3 + (i + 1) ** 1.4 * (1 + k / (i + 2))]),
    );
    env[target.replace(/[{}]/g, "")] = evalLatex(rhs, env);
    equal(gap(eq, env), 0);
  }
}

export function quadratic(p: Problem) {
  const f = (x: number) => gap(p.prompt, { x });
  const { a, b, c } = coefficients(f),
    d = b * b - 4 * a * c;
  if (d >= 0) {
    sameNumbers(roots(p.answer, "x"), realRoots(f));
    return;
  }
  const [lhs, rhs] = splitEquation(p.answer);
  check(lhs === "x", "wrong variable");
  const conjugates = rhs.split(", ").flatMap(expandSigns);
  // The printed roots are linear in i. Evaluation at 0 and 1 separates their parts.
  const imaginary = conjugates.map((s) => {
    const re = evalLatex(s, { i: 0 });
    equal(re, -b / (2 * a));
    return evalLatex(s, { i: 1 }) - re;
  });
  const im = Math.sqrt(-d) / (2 * a);
  sameNumbers(imaginary, [-im, im]);
}

export function radicalEquation(p: Problem) {
  let [lhs, rhs] = splitEquation(p.prompt);
  if (!lhs.includes("\\sqrt")) [lhs, rhs] = [rhs, lhs];
  const m = lhs.match(/^(-?\d*)\\sqrt(?:\[(3)\])?\{([^{}]+)\}(.*)$/)!;
  const coef = m[1] === "-" ? -1 : Number(m[1] || 1);
  const power = Number(m[2] ?? 2);
  const otherRoot = rhs.match(/^\\sqrt(?:\[3\])?\{([^{}]+)\}$/);
  const candidates = realRoots((x) => {
    const other = otherRoot
      ? evalLatex(otherRoot[1], { x })
      : (evalLatex(rhs, { x }) - evalLatex(m[4] || "0", { x })) ** power;
    return coef ** power * evalLatex(m[3], { x }) - other;
  });
  sameNumbers(
    roots(p.answer, "x"),
    candidates.filter((x) => close(gap(p.prompt, { x }), 0)),
  );
}

function logParts(s: string) {
  const match = s.match(/^\\(ln|log)(?:_\{([^{}]+)\})? (.+)$/)!;
  return { base: match[2] ?? (match[1] === "ln" ? "e" : "10"), arg: match[3] };
}
export function logEquation(p: Problem) {
  const [lhs, rhs] = splitEquation(p.prompt);
  const parts = lhs.split(/ \+ (?=\\l)/).map(logParts);
  const other = rhs.startsWith("\\") ? logParts(rhs) : null;
  const candidates = realRoots((x) => {
    const env = { x, e: Math.E };
    return (
      parts.reduce((v, l) => v * evalLatex(l.arg, env), 1) -
      (other ? evalLatex(other.arg, env) : evalLatex(parts[0].base, env) ** evalLatex(rhs, env))
    );
  });
  sameNumbers(
    roots(p.answer, "x"),
    candidates.filter(
      (x) =>
        [...parts, ...(other ? [other] : [])].every((l) => evalLatex(l.arg, { x }) > 0) &&
        close(gap(p.prompt, { x }), 0),
    ),
  );
}
export function logForm(p: Problem) {
  const promptLog = p.prompt.startsWith("\\l");
  check(promptLog !== p.answer.startsWith("\\l"), "expected opposite form");
  const [log, exponent] = splitEquation(promptLog ? p.prompt : p.answer);
  const [power, value] = splitEquation(promptLog ? p.answer : p.prompt);
  const { base, arg } = logParts(log);
  const m = power.match(/^(.+)\^\{(.+)\}$/)!;
  const vars = names(p.prompt + " " + p.answer);
  for (const n of [2.3, 5.1]) {
    const env = Object.fromEntries(vars.map((v, i) => [v, n + i]));
    env.e = Math.E;
    if (vars.every((v) => v === "e")) {
      equal(evalLatex(m[1], env) ** evalLatex(m[2], env), evalLatex(value, env));
    }
    equal(evalLatex(m[1], env), evalLatex(base, env));
    equal(evalLatex(m[2], env), evalLatex(exponent, env));
    equal(evalLatex(value, env), evalLatex(arg, env));
  }
}
export function exponential(p: Problem) {
  const [exact, rounded] = p.answer.split(" \\approx ");
  const f = (x: number) => gap(p.prompt, { x, e: Math.E });
  if (exact !== "x") {
    const [lhs, rhs] = splitEquation(exact);
    check(lhs === "x", "wrong variable");
    const x = evalLatex(rhs, { e: Math.E });
    const [left, right] = splitEquation(p.prompt);
    const l = evalLatex(left, { x, e: Math.E }),
      r = evalLatex(right, { x, e: Math.E });
    if (p.generatorId === "exponential-common-base") equal(Math.log(l), Math.log(r));
    else equal(l, r);
  }
  if (p.generatorId === "exponential-equations-logs") {
    check(!!rounded === (p.params.answerForm !== "exact"), "missing or unexpected rounded answer");
    check((exact === "x") === (p.params.answerForm === "decimal"), "missing or unexpected exact answer");
  }
  if (rounded) {
    const x = Number(rounded),
      delta = 0.5 * 10 ** -Number(p.params.decimalPlaces);
    check(f(x - delta) * f(x + delta) <= 0, "root outside rounding interval");
  }
}
