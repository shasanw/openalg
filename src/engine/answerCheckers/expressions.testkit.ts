import type { Problem } from "../types";
import { evalArithmetic } from "../generators/foundations/arithmeticEval.testkit";
import { countTerms, termDegrees } from "../generators/polynomials/polynomials.testkit";
import { equalPolynomials } from "./polynomial.testkit";
import { sameValue as equalRadicals, expectSimplest } from "../generators/radicals/radicals.testkit";
import { close, evalLatex } from "../generators/shared/latexEval.testkit";
import { check, coefficients, equal, gcd } from "./math.testkit";

function reduced(tex: string) {
  for (const m of tex.matchAll(/\\frac\{(-?\d+)\}\{(\d+)\}/g)) {
    equal(gcd(+m[1], +m[2]), 1);
    check(+m[2] > 1, "unit denominator");
  }
}
export function arithmetic(p: Problem) {
  equal(evalArithmetic(p.answer), evalArithmetic(p.prompt));
  check(/^-?(?:\d+(?:\.\d+)?|(?:\d+)?\\frac\{\d+\}\{\d+\})$/.test(p.answer), "unsimplified arithmetic");
  const mixed = p.answer.match(/^-?(\d+)\\frac\{(\d+)\}\{(\d+)\}$/);
  if (mixed) {
    check(+mixed[1] > 0 && +mixed[2] > 0 && +mixed[2] < +mixed[3], "invalid mixed number");
    check(p.params.answerForm !== "improper", "expected improper fraction");
  }
  if (p.params.answerForm === "mixed" && p.answer.includes("\\frac") && Math.abs(evalArithmetic(p.answer)) > 1)
    check(mixed, "expected mixed number");
  reduced(p.answer);
}

export function namePolynomial(p: Problem) {
  const d = Math.max(...termDegrees(p.prompt)),
    n = countTerms(p.prompt);
  const degree = ["constant", "linear", "quadratic", "cubic", "quartic", "quintic"][d] ?? `degree ${d}`;
  const terms = ["", "monomial", "binomial", "trinomial"][n] ?? `polynomial, ${n} terms`;
  check(p.answer === `\\text{${degree} ${terms}}`, "incorrect degree or term count");
}

function primitiveFactor(s: string) {
  const terms = s.replace(/^-/, "").split(/ [+-] /);
  const coeffs = terms.map((t) => Number(t.match(/^\d+/)?.[0] ?? 1));
  equal(coeffs.reduce(gcd), 1);
  for (const v of terms[0].match(/[a-z]/g) ?? []) check(!terms.every((t) => t.includes(v)), `common ${v} left in ${s}`);
}

export function equivalentExpression(p: Problem, a: string, b: string) {
  if (a.startsWith("\\text") || b.startsWith("\\text")) return a === b;
  if (p.generatorId.includes("radicals")) return equalRadicals(a, b);
  if (p.generatorId === "log-properties") {
    const probes = [
      { x: 2.3, y: 5.7, z: 1.9, w: 3.1, e: Math.E },
      { x: 0.7, y: 11.2, z: 4.4, w: 0.35, e: Math.E },
    ];
    return probes.every((env) => {
      const expected = evalLatex(a, env);
      try {
        return close(expected, evalLatex(b, env));
      } catch (error) {
        // A proposed logarithm outside its domain cannot equal the given expression.
        if (error instanceof Error && error.message.startsWith("log of non-positive")) return false;
        throw error;
      }
    });
  }
  return equalPolynomials(a, b);
}

export function expression(p: Problem) {
  if (p.answer === "\\text{prime}") {
    check(p.generatorId === "factoring-quadratics", "unexpected prime");
    primitiveFactor(p.prompt);
    // For a homogeneous binary quadratic, setting the second variable to
    // one gives the same discriminant as the univariate polynomial.
    const [v, second] = new Set(p.prompt.match(/[a-z]/g));
    const { a, b, c } = coefficients((x) => evalLatex(p.prompt, { [v]: x, ...(second ? { [second]: 1 } : {}) }));
    check(!Number.isInteger(Math.sqrt(b * b - 4 * a * c)), "reducible quadratic");
    return;
  }
  check(equivalentExpression(p, p.prompt, p.answer), `different values: ${p.prompt} and ${p.answer}`);
  if (p.generatorId.startsWith("factoring-")) {
    const factors = [...p.answer.matchAll(/\(([^()]+)\)/g)];
    check(factors.length > 0, "missing factors");
    for (const m of factors) {
      primitiveFactor(m[1]);
      if (p.generatorId === "factoring-gcf") continue;
      const vars = new Set(m[1].match(/[a-z]/g));
      if (vars.size === 1 && Math.max(...termDegrees(m[1])) === 2) {
        const [v] = vars;
        const { a, b, c } = coefficients((x) => evalLatex(m[1], { [v]: x }));
        check(!Number.isInteger(Math.sqrt(b * b - 4 * a * c)), `reducible quadratic factor ${m[1]}`);
      }
    }
    if (p.generatorId === "factoring-gcf") check(/^[^(]+\(/.test(p.answer), "missing GCF");
    else check(factors.length > 1 || /\)\^\{[23]\}$/.test(p.answer), "factorization incomplete");
  } else if (p.generatorId.includes("radicals")) {
    expectSimplest(p.answer);
    check(!p.answer.includes("("), "product still unexpanded");
    const fraction = p.answer.match(/^-?\\frac\{(.+)\}\{(\d*)([xy]?(?:\^\{\d+\})?)\}$/);
    const numerator = fraction ? fraction[1] : p.answer;
    const denominator = fraction ? Number(fraction[2] || 1) : 1;
    const terms = numerator.split(/ [+-] /);
    const keys = terms.map((t) => t.replace(/^-?\d*/, ""));
    check(new Set(keys).size === keys.length, "uncombined radical terms");
    for (const t of terms) {
      check((t.match(/\\sqrt/g)?.length ?? 0) <= 1, "uncombined radical product");
      check(!/\\sqrt(?:\[3\])?\{[01]\}/.test(t), "trivial radical");
    }
    const coeffs = terms.map((t) => Number(t.match(/^-?\d+/)?.[0] ?? 1));
    equal(coeffs.reduce(gcd, denominator), 1);
    if (fraction?.[3]) {
      const v = fraction[3][0];
      check(!terms.every((t) => t.split("\\sqrt")[0].includes(v)), "common variable in numerator and denominator");
    }
  } else if (p.generatorId === "log-properties") {
    const log = /\\(?:ln|log)(?:_\{\d+\})?/g;
    const expanded =
      p.params.direction === "expand" ||
      (p.params.direction === "mixed" && (p.prompt.match(log) ?? []).length === 1 && !/ [+-] /.test(p.prompt));
    const sum = expanded ? p.answer : p.prompt;
    const condensed = expanded ? p.prompt : p.answer;
    check((condensed.match(log) ?? []).length === 1 && /^\\(?:ln|log)/.test(condensed), "expected one logarithm");
    const variables = [...new Set(condensed.match(/[xyzw]/g) ?? [])].sort();
    const argumentsInSum = [...sum.matchAll(/\\(?:ln|log)(?:_\{\d+\})? ([xyzw])(?= |$)/g)].map((m) => m[1]).sort();
    check(
      variables.join("") === argumentsInSum.join("") && (sum.match(log) ?? []).length === variables.length,
      "expanded form must have one logarithm of each variable",
    );
  } else {
    check(!/[()]/.test(p.answer), "unexpanded answer");
    // A long-division remainder is a separate proper rational term.
    const polynomial =
      p.generatorId === "dividing-polynomials" ? p.answer.replace(/ [+-] \\frac\{\d+\}\{[^{}]+\}$/, "") : p.answer;
    const monomials = polynomial.split(/ [+-] /).map((term) => {
      const variables = term.replace(/^-?(?:\\frac\{\d+\}\{\d+\}|[\d.]+)?/, "");
      check(/^(?:[a-z](?:\^\{(?:[2-9]|\d{2})\})?)*$/.test(variables), "expected a simplified monomial");
      const powers = variables.match(/[a-z](?:\^\{\d+\})?/g) ?? [];
      check(new Set(powers.map((v) => v[0])).size === powers.length, "uncombined powers");
      return [...powers].sort().join("");
    });
    check(new Set(monomials).size === monomials.length, "uncombined terms");
  }
}
