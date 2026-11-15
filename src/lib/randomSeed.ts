/**
 * A fresh seed per user action. Generators never call Math.random themselves;
 * they consume this seed deterministically.
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
