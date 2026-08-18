/**
 * The unlock ladder's global skip budget.
 *
 * A machine can play dim-sum trivia, easy arithmetic, and even
 * whack-a-mole -- so what actually keeps the ladder from being a second,
 * much weaker password is a hard cap: at most MAX_LADDER_SKIPS_PER_HOUR
 * lockouts cleared via the ladder in any rolling hour, GLOBALLY (across
 * every toy lock in the app, not per lock -- a per-lock cap would let a
 * user with many locks skip far more often than intended just by having
 * more locks). Once the budget is spent, the clock is the only way
 * through for everyone until the window rolls forward.
 *
 * Persisted (not in-memory) specifically because it is the one piece of
 * ladder state where "just restart the app" must not reset anything --
 * unlike the ephemeral challenges in challenge-store.ts, refilling this
 * on restart would make the cap meaningless.
 */

import type { JsonStore } from '../../../store';

export const MAX_LADDER_SKIPS_PER_HOUR = 3;
const ROLLING_WINDOW_MS = 60 * 60_000;
/** How far back we keep raw timestamps before pruning them out of the
 * persisted file. Generously larger than the rolling window so a clock
 * that is briefly wrong in either direction cannot lose legitimate
 * recent skips; entries older than this are pure disk-space bloat and
 * are dropped unconditionally. */
const PRUNE_HORIZON_MS = 4 * ROLLING_WINDOW_MS;

export interface SkipBudgetFile {
  /** Epoch ms of each successful ladder win (lockout cleared via a
   * won rung), most-recent-last. */
  skips: number[];
}

export const SKIP_BUDGET_SCHEMA_VERSION = 1;

export function emptySkipBudget(): SkipBudgetFile {
  return { skips: [] };
}

function withinWindow(skips: readonly number[], now: number): number[] {
  return skips.filter((t) => now - t < ROLLING_WINDOW_MS);
}

export function remainingSkips(file: SkipBudgetFile, now: number = Date.now()): number {
  return Math.max(0, MAX_LADDER_SKIPS_PER_HOUR - withinWindow(file.skips, now).length);
}

/** Manages the persisted skip-budget file: read-check-write, so two
 * concurrent ladder wins cannot both slip in under a budget that was
 * only checked once. */
export class SkipBudget {
  constructor(private readonly store: JsonStore<SkipBudgetFile>) {}

  async remaining(now: number = Date.now()): Promise<number> {
    const file = await this.store.load();
    return remainingSkips(file, now);
  }

  /** Records one skip if (and only if) the budget allows it. Returns
   * `true` if it was recorded, `false` if the budget was already
   * exhausted -- callers must check the return value rather than assume
   * a prior `remaining()` call still holds, since state can change
   * between the two. */
  async trySpend(now: number = Date.now()): Promise<boolean> {
    const file = await this.store.load();
    const current = withinWindow(file.skips, now);
    if (current.length >= MAX_LADDER_SKIPS_PER_HOUR) {
      return false;
    }
    current.push(now);
    const pruned = current.filter((t) => now - t < PRUNE_HORIZON_MS);
    await this.store.save({ skips: pruned });
    return true;
  }
}
