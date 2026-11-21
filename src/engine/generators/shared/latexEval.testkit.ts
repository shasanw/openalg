// Test-only: evaluate the small LaTeX subset the Equations Topics print, so
// property tests can check an Answer by substituting it into the BAKED prompt
// string (not just the internal construction).
//
// Supported: integers and decimals, single letters (with _1 or _{1}
// subscripts), \pi, \frac{..}{..}, parentheses, |..| absolute value, ^2 or
// ^{..} powers, implicit multiplication, \cdot, unary minus, + and -.
// Also \sqrt{..} and \sqrt[n]{..}, and logarithms: \ln, \log (base 10) and
// \log_{b}, each applied to the single factor that follows (with its power),
// so "2\log_{3} x^{2} + \ln y" reads as 2 log3(x^2) + ln(y). The constant e is
// an ordinary letter: bind it in the env (e: Math.E).
// Trig: \sin \cos \tan \sec \csc \cot, optionally powered (\sin^{2} x, and
// \sin^{-1} as the inverse), \arcsin \arccos \arctan and \operatorname{arcsec}
// (arccsc, arccot), each applied to the following factor and any letters
// right after it ("\sin 2x" is sin(2x), "\sin x \cos x" a product). Degrees
// (30^{\circ} or 30^\circ) read as radians; \theta, \alpha, \beta, \phi are letters.

export type Env = Record<string, number>;

type Tok =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "sym"; v: string };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(s[i + 1] ?? ""))) {
      const m = s.slice(i).match(/^\d*\.?\d+/)!;
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ch === "\\") {
      const m = s.slice(i).match(/^\\([a-zA-Z]+|.)/)!;
      const cmd = m[1];
      i += m[0].length;
      if (cmd === "pi") out.push({ t: "var", name: "pi" });
      else if (cmd === "frac" || cmd === "cdot") out.push({ t: "sym", v: cmd });
      else if (cmd === "ln" || cmd === "log" || cmd === "sqrt") out.push({ t: "sym", v: cmd });
      else if (TRIG.has(cmd)) out.push({ t: "sym", v: cmd });
      else if (cmd === "operatorname") {
        const name = s.slice(i).match(/^\{([a-z]+)\}/);
        if (!name || !TRIG.has(name[1])) throw new Error(`unsupported operatorname in ${s}`);
        out.push({ t: "sym", v: name[1] });
        i += name[0].length;
      } else if (cmd === "circ") out.push({ t: "sym", v: "circ" });
      else if (GREEK.has(cmd)) out.push({ t: "var", name: cmd });
      else if (cmd === "left" || cmd === "right") continue;
      else if (cmd === "lvert" || cmd === "rvert") out.push({ t: "sym", v: "|" });
      else throw new Error(`unsupported command \\${cmd} in ${s}`);
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let name = ch;
      i++;
      const sub = s.slice(i).match(/^_(\d|\{\d+\})/);
      if (sub) {
        name += "_" + sub[1].replace(/[{}]/g, "");
        i += sub[0].length;
      }
      out.push({ t: "var", name });
      continue;
    }
    if ("+-()|{}^_[]".includes(ch)) {
      out.push({ t: "sym", v: ch });
      i++;
      continue;
    }
    throw new Error(`unexpected "${ch}" in ${s}`);
  }
  return degrees(out);
}

const TRIG = new Set(["sin", "cos", "tan", "sec", "csc", "cot", "arcsin", "arccos", "arctan", "arcsec", "arccsc", "arccot"]);
const GREEK = new Set(["theta", "alpha", "beta", "phi"]);
const isSymTok = (t: Tok | undefined, v: string) => t?.t === "sym" && t.v === v;

/** Collapse "^{\circ}" and "^\circ" into one "deg" token. */
function degrees(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (isSymTok(toks[i], "^") && isSymTok(toks[i + 1], "circ")) {
      out.push({ t: "sym", v: "deg" });
      i += 1;
    } else if (isSymTok(toks[i], "^") && isSymTok(toks[i + 1], "{") && isSymTok(toks[i + 2], "circ") && isSymTok(toks[i + 3], "}")) {
      out.push({ t: "sym", v: "deg" });
      i += 3;
    } else out.push(toks[i]);
  }
  return out;
}

function applyTrig(fn: string, x: number): number {
  switch (fn) {
    case "sin":
      return Math.sin(x);
    case "cos":
      return Math.cos(x);
    case "tan":
      return Math.tan(x);
    case "sec":
      return 1 / Math.cos(x);
    case "csc":
      return 1 / Math.sin(x);
    case "cot":
      return Math.cos(x) / Math.sin(x);
    case "arcsin":
      return Math.asin(x);
    case "arccos":
      return Math.acos(x);
    case "arctan":
      return Math.atan(x);
    case "arcsec":
      return Math.acos(1 / x);
    case "arccsc":
      return Math.asin(1 / x);
    case "arccot":
      return x === 0 ? Math.PI / 2 : x > 0 ? Math.atan(1 / x) : Math.PI + Math.atan(1 / x);
  }
  throw new Error(`unknown trig function ${fn}`);
}

class Parser {
  private i = 0;
  private absDepth = 0;
  constructor(
    private toks: Tok[],
    private env: Env,
  ) {}

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }
  private isSym(v: string): boolean {
    const t = this.peek();
    return t?.t === "sym" && t.v === v;
  }
  private expect(v: string) {
    if (!this.isSym(v)) throw new Error(`expected ${v}`);
    this.i++;
  }

  parseAll(): number {
    const v = this.expr();
    if (this.i !== this.toks.length) throw new Error("trailing tokens");
    return v;
  }

  expr(): number {
    let sign = 1;
    if (this.isSym("-")) {
      this.i++;
      sign = -1;
    } else if (this.isSym("+")) this.i++;
    let v = sign * this.term();
    for (;;) {
      if (this.isSym("+")) {
        this.i++;
        v += this.term();
      } else if (this.isSym("-")) {
        this.i++;
        v -= this.term();
      } else return v;
    }
  }

  private startsFactor(): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.t !== "sym") return true;
    if (t.v === "|") return this.absDepth === 0;
    return ["(", "frac", "{", "ln", "log", "sqrt"].includes(t.v) || TRIG.has(t.v);
  }

  term(): number {
    let v = this.power();
    for (;;) {
      if (this.isSym("cdot")) {
        this.i++;
        v *= this.power();
      } else if (this.startsFactor()) v *= this.power();
      else return v;
    }
  }

  power(): number {
    let base = this.atom();
    if (this.isSym("deg")) {
      this.i++;
      base *= Math.PI / 180;
    }
    if (!this.isSym("^")) return base;
    this.i++;
    const t = this.peek();
    let exp: number;
    if (t?.t === "num") {
      this.i++;
      exp = t.v;
    } else exp = this.group();
    return base ** exp;
  }

  group(): number {
    this.expect("{");
    const saved = this.absDepth;
    this.absDepth = 0;
    const v = this.expr();
    this.absDepth = saved;
    this.expect("}");
    return v;
  }

  atom(): number {
    const t = this.peek();
    if (!t) throw new Error("unexpected end");
    if (t.t === "num") {
      this.i++;
      return t.v;
    }
    if (t.t === "var") {
      this.i++;
      if (t.name === "pi") return Math.PI;
      if (!(t.name in this.env)) throw new Error(`unbound ${t.name}`);
      return this.env[t.name];
    }
    if (t.v === "frac") {
      this.i++;
      const n = this.group();
      const d = this.group();
      return n / d;
    }
    if (t.v === "{") return this.group();
    if (t.v === "sqrt") {
      this.i++;
      let index = 2;
      if (this.isSym("[")) {
        this.i++;
        index = this.expr();
        this.expect("]");
      }
      const radicand = this.group();
      return radicand < 0 && index % 2 === 1 ? -((-radicand) ** (1 / index)) : radicand ** (1 / index);
    }
    if (t.v === "ln" || t.v === "log") {
      this.i++;
      let base = t.v === "ln" ? Math.E : 10;
      if (t.v === "log" && this.isSym("_")) {
        this.i++;
        base = this.group();
      }
      const arg = this.power();
      if (!(arg > 0)) throw new Error(`log of non-positive ${arg}`);
      return Math.log(arg) / Math.log(base);
    }
    if (TRIG.has(t.v)) {
      this.i++;
      let exp = 1;
      if (this.isSym("^")) {
        this.i++;
        const e = this.peek();
        if (e?.t === "num") {
          this.i++;
          exp = e.v;
        } else exp = this.group();
      }
      let arg = this.power();
      while (this.peek()?.t === "var") arg *= this.power();
      if (exp === -1 && !t.v.startsWith("arc")) return applyTrig(`arc${t.v}`, arg);
      return applyTrig(t.v, arg) ** exp;
    }
    if (t.v === "(") {
      this.i++;
      const saved = this.absDepth;
      this.absDepth = 0;
      const v = this.expr();
      this.absDepth = saved;
      this.expect(")");
      return v;
    }
    if (t.v === "|") {
      this.i++;
      this.absDepth++;
      const v = this.expr();
      this.absDepth--;
      this.expect("|");
      return Math.abs(v);
    }
    throw new Error(`unexpected ${t.v}`);
  }
}

/** Evaluate a LaTeX expression with the given variable values. */
export function evalLatex(latex: string, env: Env = {}): number {
  return new Parser(tokenize(latex), env).parseAll();
}

/** Tokenize once when sampling the same printed expression at many points. */
export function prepareLatex(latex: string): (env: Env) => number {
  const tokens = tokenize(latex);
  return (env) => new Parser(tokens, env).parseAll();
}

/** Split "lhs = rhs" (exactly one "="). */
export function splitEquation(latex: string): [string, string] {
  const parts = latex.split("=");
  if (parts.length !== 2) throw new Error(`not one equation: ${latex}`);
  return [parts[0].trim(), parts[1].trim()];
}

/** The values in an Answer like "x = -7, \frac{3}{2}" (top-level commas). */
export function answerValues(answer: string): { v: string; values: number[] } {
  const [v, rhs] = splitEquation(answer);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < rhs.length; i++) {
    if (rhs[i] === "{") depth++;
    else if (rhs[i] === "}") depth--;
    else if (rhs[i] === "," && depth === 0) {
      parts.push(rhs.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(rhs.slice(start));
  return { v, values: parts.map((p) => evalLatex(p)) };
}

export function close(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}
