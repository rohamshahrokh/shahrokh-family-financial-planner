/**
 * rng.ts — Seedable RNG primitives for Monte Carlo V4
 *
 * The V3 engine used Math.random() throughout, which makes simulations
 * non-reproducible. V4 introduces a small, allocation-free seeded RNG
 * (mulberry32) plus Box-Muller normals built on top of it.
 *
 * Why mulberry32? It's a 32-bit deterministic PRNG with a 2^32 period that
 * is sufficient for 10k-sim x 120-month x ~5-draws-per-month workloads, and
 * its state fits in a single number — cheap to clone, cheap to fork per sim.
 */

export type Rng = () => number;

/** Mulberry32 PRNG. Deterministic given seed. Returns [0,1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convert any string into a 32-bit seed (xfnv1a). */
export function hashSeed(input: string | number): number {
  if (typeof input === "number") return input >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Box-Muller standard normal using a supplied RNG. */
export function randNormalSeeded(rng: Rng, mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Draw a Bernoulli (probability p). */
export function bernoulli(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** Sample from a discrete categorical distribution. Returns index. */
export function sampleCategorical(rng: Rng, weights: number[]): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return 0;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
