// The printed-Answer checkers must reject wrong Answers, not only accept the
// generators' right ones: hand-written Problems with known mistakes.
import { describe, expect, it } from "vitest";
import type { Problem } from "../../types";
import { NO_SOLUTION } from "../shared/equationKit";
import { expectExactSolutions } from "./trigEquation.testkit";
import { inverseTrig } from "./inverseTrig.answer.testkit";

const R = ";\\quad 0 \\le x < 2\\pi";
const D = ";\\quad 0^{\\circ} \\le \\theta < 360^{\\circ}";
const ALL = ";\\quad \\text{all solutions in radians}";

const ok = (prompt: string, answer: string) => expect(() => expectExactSolutions(prompt, answer)).not.toThrow();
const bad = (prompt: string, answer: string) => expect(() => expectExactSolutions(prompt, answer)).toThrow();

describe("trig equation checker", () => {
  it("accepts the exact solution set over one turn, in radians or degrees", () => {
    ok(`2\\sin x + 1 = 0${R}`, "x = \\frac{7\\pi}{6}, \\frac{11\\pi}{6}");
    ok(`2\\sin \\theta + 1 = 0${D}`, "\\theta = 210^{\\circ}, 330^{\\circ}");
    ok(`\\sin x = 2${R}`, NO_SOLUTION);
  });

  it("rejects a lost, an extra or a wrong-quadrant solution", () => {
    bad(`2\\sin x + 1 = 0${R}`, "x = \\frac{7\\pi}{6}");
    bad(`2\\sin x + 1 = 0${R}`, "x = \\frac{\\pi}{6}, \\frac{7\\pi}{6}, \\frac{11\\pi}{6}");
    bad(`2\\sin x + 1 = 0${R}`, "x = \\frac{5\\pi}{6}, \\frac{7\\pi}{6}");
    bad(`2\\sin x + 1 = 0${R}`, NO_SOLUTION);
  });

  it("rejects a solution where a printed function is undefined, even behind a zero factor", () => {
    ok(`\\cos x \\tan x = 0${R}`, "x = 0, \\pi");
    bad(`\\cos x \\tan x = 0${R}`, "x = 0, \\frac{\\pi}{2}, \\pi, \\frac{3\\pi}{2}");
    ok(`\\cos x \\tan \\frac{x}{2} = 0${R}`, "x = 0, \\frac{\\pi}{2}, \\frac{3\\pi}{2}");
    ok(`\\sin x \\tan\\left(x + \\frac{\\pi}{2}\\right) = 0${R}`, "x = \\frac{\\pi}{2}, \\frac{3\\pi}{2}");
    bad(`\\sin x \\tan\\left(x + \\frac{\\pi}{2}\\right) = 0${R}`, "x = 0, \\frac{\\pi}{2}, \\pi, \\frac{3\\pi}{2}");
  });

  it("finds roots off the grid of special angles, touching ones included", () => {
    bad(`3\\sin x = 1${R}`, NO_SOLUTION);
    bad(`25\\sin^{2} x - 10\\sin x + 1 = 0${R}`, NO_SOLUTION);
  });

  it("checks every family of a general solution over the whole period", () => {
    ok(`\\sin 2x = \\cos x${ALL}`, "x = \\frac{\\pi}{6} + \\frac{2\\pi k}{3}, \\frac{\\pi}{2} + 2\\pi k");
    bad(`\\sin 2x = \\cos x${ALL}`, "x = \\frac{\\pi}{6} + 2\\pi k, \\frac{5\\pi}{6} + 2\\pi k");
    ok(`\\tan x = 1${ALL}`, "x = \\frac{\\pi}{4} + \\pi k");
    bad(`\\tan x = 1${ALL}`, "x = \\frac{\\pi}{4} + 2\\pi k");
    bad(`\\sin 2x = \\frac{1}{2}${ALL}`, "x = \\frac{\\pi}{12} + 2\\pi k, \\frac{5\\pi}{12} + 2\\pi k");
    ok(`\\sin 2x = \\frac{1}{2}${ALL}`, "x = \\frac{\\pi}{12} + \\pi k, \\frac{5\\pi}{12} + \\pi k");
  });
});

const problem = (prompt: string, answer: string): Problem => ({
  kind: "generated",
  generatorId: "inverse-trig",
  params: {},
  seed: 0,
  prompt,
  answer,
  distractorHints: [],
});

describe("inverse trig checker", () => {
  const okI = (prompt: string, answer: string) => expect(() => inverseTrig(problem(prompt, answer))).not.toThrow();
  const badI = (prompt: string, answer: string) => expect(() => inverseTrig(problem(prompt, answer))).toThrow();

  it("checks principal values and the unit asked for", () => {
    okI("\\arcsin\\left(-\\frac{1}{2}\\right)", "-\\frac{\\pi}{6}");
    badI("\\arcsin\\left(-\\frac{1}{2}\\right)", "\\frac{11\\pi}{6}");
    okI("\\arcsin\\left(-\\frac{1}{2}\\right),\\quad \\text{in degrees}", "-30^{\\circ}");
    badI("\\arcsin\\left(-\\frac{1}{2}\\right),\\quad \\text{in degrees}", "-\\frac{\\pi}{6}");
    okI("\\cos^{-1}\\left(-\\frac{1}{2}\\right)", "\\frac{2\\pi}{3}");
    okI("\\operatorname{arccot}\\left(-1\\right)", "\\frac{3\\pi}{4}");
    badI("\\operatorname{arccot}\\left(-1\\right)", "-\\frac{\\pi}{4}");
  });

  it("checks compositions, traps and undefined values", () => {
    okI("\\arcsin\\left(\\sin \\frac{5\\pi}{6}\\right)", "\\frac{\\pi}{6}");
    badI("\\arcsin\\left(\\sin \\frac{5\\pi}{6}\\right)", "\\frac{5\\pi}{6}");
    okI("\\arccos\\left(\\cos 300^{\\circ}\\right)", "60^{\\circ}");
    okI("\\sin\\left(\\arccos\\left(\\frac{3}{5}\\right)\\right)", "\\frac{4}{5}");
    badI("\\tan\\left(\\arcsin\\left(-\\frac{3}{5}\\right)\\right)", "\\frac{3}{4}");
    okI("\\sin\\left(\\arcsin 2\\right)", "\\text{undefined}");
    badI("\\sin\\left(\\arcsin 2\\right)", "2");
    badI("\\sin\\left(\\arcsin\\left(\\frac{1}{3}\\right)\\right)", "\\text{undefined}");
  });
});
