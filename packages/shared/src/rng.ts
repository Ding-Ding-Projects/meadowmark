/**
 * Deterministic seeded RNG (mulberry32).
 *
 * The whole simulation depends on this being reproducible: the seed and the
 * call counter live in the save file, so reloading a save (or replaying the
 * same elapsed time in different chunk sizes) produces bit-identical
 * results. Never reach for Math.random() anywhere else in this package.
 */

export interface RngState {
  /** 32-bit unsigned seed. */
  seed: number;
  /** Number of values drawn so far from this seed. Persisted for auditing/debugging; not required for correctness since seed mutates in place conceptually, but kept for save-compatibility and deterministic replay tooling. */
  counter: number;
}

export function createRng(seed: number): RngState {
  return { seed: seed >>> 0, counter: 0 };
}

/**
 * Advances the RNG state in place and returns a float in [0, 1).
 * Pure with respect to the caller's reference: callers must reassign
 * `state = rng.state` after use since this mutates the passed object's
 * fields directly for performance, but always returns the same object
 * reference so callers can also just discard the return value.
 */
export function nextFloat(state: RngState): number {
  state.counter += 1;
  let t = (state.seed += 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max] inclusive. */
export function nextInt(state: RngState, min: number, max: number): number {
  if (max < min) throw new Error(`nextInt: max (${max}) < min (${min})`);
  return min + Math.floor(nextFloat(state) * (max - min + 1));
}

/** True with probability p (0..1). */
export function chance(state: RngState, p: number): boolean {
  return nextFloat(state) < p;
}

/** Picks a uniformly random element from a non-empty array. */
export function pick<T>(state: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick: empty array");
  return items[nextInt(state, 0, items.length - 1)];
}

/**
 * Weighted pick. Weights must be non-negative and sum to > 0.
 */
export function pickWeighted<T>(
  state: RngState,
  items: readonly T[],
  weights: readonly number[],
): T {
  if (items.length !== weights.length || items.length === 0) {
    throw new Error("pickWeighted: items/weights length mismatch or empty");
  }
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error("pickWeighted: total weight must be > 0");
  let roll = nextFloat(state) * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Derives a stable 32-bit seed from an arbitrary string (e.g. a date string
 * "2026-08-17" for daily tasks, or the player's save id for world seeding).
 * Deterministic across platforms: plain char-code accumulation, no Buffer.
 */
export function seedFromString(input: string): number {
  let h = 2166136261 >>> 0; // FNV-1a offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
