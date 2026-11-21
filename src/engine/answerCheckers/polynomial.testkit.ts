// Exact comparison for the worksheet's integer polynomials and quotients.
// A sorted string of letters is a monomial: "xxy" represents x²y. For the
// small printed degrees the coefficients also fit exactly in JS integers.
type Polynomial = Map<string, number>;
type Quotient = { numerator: Polynomial; denominator: Polynomial };
const one: Polynomial = new Map([["", 1]]);

function addTerm(poly: Polynomial, variables: string, coefficient: number) {
  const n = (poly.get(variables) ?? 0) + coefficient;
  if (!Number.isSafeInteger(n)) throw new Error("polynomial coefficient out of range");
  if (n) poly.set(variables, n);
  else poly.delete(variables);
}
function product(a: Polynomial, b: Polynomial): Polynomial {
  const result: Polynomial = new Map();
  for (const [u, c] of a) for (const [v, d] of b) addTerm(result, [...(u + v)].sort().join(""), c * d);
  return result;
}
function multiply(a: Quotient, b: Quotient): Quotient {
  return { numerator: product(a.numerator, b.numerator), denominator: product(a.denominator, b.denominator) };
}
function divide(a: Quotient, b: Quotient) {
  if (!b.numerator.size) throw new Error("zero polynomial divisor");
  return multiply(a, { numerator: b.denominator, denominator: b.numerator });
}
function add(a: Quotient, b: Quotient, sign: number): Quotient {
  const numerator = product(a.numerator, b.denominator);
  for (const [v, c] of product(b.numerator, a.denominator)) addTerm(numerator, v, sign * c);
  return { numerator, denominator: product(a.denominator, b.denominator) };
}

function parse(tex: string): Quotient {
  // In a printed division "P \\div 2x^2", the entire monomial is the divisor.
  const divided = tex.split("\\div");
  if (divided.length > 1) return divided.map(parse).reduce(divide);
  const tokens = tex.replace(/\\left|\\right|\s/g, "").match(/\\[a-z]+|\d+|./g) ?? [];
  let i = 0;
  function take(s: string) {
    if (tokens[i++] !== s) throw new Error(`expected ${s} in ${tex}`);
  }
  function group(open: string, end: string) {
    take(open);
    const q = sum();
    take(end);
    return q;
  }
  function atom(): Quotient {
    if (tokens[i] === "(") return group("(", ")");
    if (tokens[i] === "\\frac") {
      i++;
      return divide(group("{", "}"), group("{", "}"));
    }
    const t = tokens[i++];
    if (/^\d+$/.test(t)) return { numerator: new Map(Number(t) ? [["", Number(t)]] : []), denominator: one };
    if (t?.length === 1 && /^[a-z]$/.test(t)) return { numerator: new Map([[t, 1]]), denominator: one };
    throw new Error(`unexpected token ${t} in ${tex}`);
  }
  function term(): Quotient {
    let result = { numerator: one, denominator: one };
    do {
      if (tokens[i] === "\\cdot") i++;
      const base = atom();
      let power = 1;
      if (tokens[i] === "^") {
        i++;
        const braced = tokens[i] === "{";
        if (braced) i++;
        power = Number(tokens[i++]);
        if (!Number.isInteger(power) || power < 0 || power > 20) throw new Error(`bad exponent in ${tex}`);
        if (braced) take("}");
      }
      for (let n = 0; n < power; n++) result = multiply(result, base);
    } while (i < tokens.length && !["+", "-", ")", "}"].includes(tokens[i]));
    return result;
  }
  function sum(): Quotient {
    let result: Quotient = { numerator: new Map(), denominator: one };
    do {
      const sign = tokens[i] === "-" ? -1 : 1;
      if (tokens[i] === "-" || tokens[i] === "+") i++;
      result = add(result, term(), sign);
    } while (tokens[i] === "+" || tokens[i] === "-");
    return result;
  }
  const q = sum();
  if (i !== tokens.length) throw new Error(`trailing tokens in ${tex}`);
  return q;
}

export function equalPolynomials(a: string, b: string): boolean {
  return add(parse(a), parse(b), -1).numerator.size === 0;
}
