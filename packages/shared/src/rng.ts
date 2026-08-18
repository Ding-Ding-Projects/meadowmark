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

/**
 * Picks a uniformly random element from a non-empty array. Throws if the
 * array is empty - there is no sensible value to return, and the caller
 * needs to know its content pool is empty rather than silently getting
 * back `undefined` dressed up as a `T`.
 */
export function pick<T>(state: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick: empty array");
  const index = nextInt(state, 0, items.length - 1);
  const item = items[index];
  if (item === undefined) {
    // Cannot actually happen: index is constructed above to be within
    // [0, items.length - 1], so this lookup can never miss. The check
    // exists only so the compiler (and any future refactor that breaks
    // that invariant) can see it rather than us asserting it away.
    throw new Error(`pick: internal error - index ${index} out of bounds for array of length ${items.length}`);
  }
  return item;
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
    const item = items[i];
    const weight = weights[i];
    if (item === undefined || weight === undefined) {
      // Cannot actually happen: i stays within [0, items.length - 1] and
      // items/weights were checked to be the same length above.
      throw new Error(`pickWeighted: internal error - missing entry at index ${i}`);
    }
    roll -= weight;
    if (roll <= 0) return item;
  }
  const last = items[items.length - 1];
  if (last === undefined) {
    // Cannot actually happen: the length check above guarantees at least
    // one element, so this fallback always has something to return.
    throw new Error("pickWeighted: internal error - no element found for fallback return");
  }
  return last;
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
