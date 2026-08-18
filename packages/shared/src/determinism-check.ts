/**
 * Runnable script (not a test-framework test) that proves - or disproves -
 * the core architectural claim of this package: tick(state, 24h) applied
 * once must produce the exact same resulting state as tick(state, 1min)
 * applied 1440 times in a row, for the same starting state and the same
 * elapsed wall-clock span.
 *
 * Run it with:
 *
 *   node packages/shared/dist/determinism-check.js
 *
 * It builds two identical new games from a fixed seed, advances one
 * through a single 30-day tick() and the other through 43200 one-minute
 * ticks (30 days worth), deep-compares the two resulting states field by
 * field, and prints either "identical" or the first path at which they
 * differ. Exits 0 on identical, 1 otherwise, so it can be wired into a
 * CI step later without anyone having to read the output to know whether
 * it passed.
 *
 * Both runs pre-unlock the mine and the ship by directly setting
 * `mine.unlocked`/`ship.unlocked` (and rolling their very first
 * boundary's content once, before cloning, so both runs start from an
 * identical, unambiguous, already-established cursor) rather than
 * granting the player real xp, which this script does not simulate.
 * Without that, the mine (unlock level 22) and the ship (unlock level
 * 18) would never unlock at all during a run that never calls addXp(),
 * and the two of the four fixed sites this script exists to prove would
 * go completely untested.
 */

import { newGame, type NewGameOptions } from "./save";
import { tick, type TickConfig } from "./offline";
import { DAY_MS, MINUTE_MS } from "./time";
import { scopedRng } from "./rng";
import type { GameState } from "./types";
import type { DailyTaskTemplate } from "./dailies";
import type { RegattaTaskTemplate } from "./village";
import type { OrderableGood } from "./orders";
import type { HeliOrderableGood } from "./helicopter";
import type { ShippableGood } from "./ship";
import { generateMineGrid } from "./mine";
import { rollShipWindow } from "./ship";

const FIXED_SEED = 1234567890;
// A deliberately non-midnight, non-round instant, so day/window/interval
// boundaries don't all coincidentally line up and mask a real bug.
const START_TIME = Date.UTC(2026, 0, 1, 3, 17, 0);
const PRE_UNLOCK_LEVEL = 25; // above both MINE_UNLOCK_LEVEL (22) and SHIP_UNLOCK_LEVEL (18)

const dailyTaskTemplates: DailyTaskTemplate[] = [
  { targetKind: "harvestAny", describe: (q) => `Harvest ${q} crops`, targetIdPool: null, minQuantity: 3, maxQuantity: 10 },
  { targetKind: "fulfillOrder", describe: (q) => `Fulfil ${q} orders`, targetIdPool: null, minQuantity: 1, maxQuantity: 3 },
  { targetKind: "digTile", describe: (q) => `Dig ${q} mine tiles`, targetIdPool: null, minQuantity: 5, maxQuantity: 15 },
];

const regattaTaskTemplates: RegattaTaskTemplate[] = [
  { description: "Harvest 20 crops", targetKind: "harvestAny", minQuantity: 20, maxQuantity: 20, scoreValue: 10 },
  { description: "Fulfil 5 orders", targetKind: "fulfillOrder", minQuantity: 5, maxQuantity: 5, scoreValue: 15 },
];

const goodPool: { goodId: string; unlockLevel: number; baseValue: number }[] = [
  { goodId: "wheat", unlockLevel: 1, baseValue: 3 },
  { goodId: "corn", unlockLevel: 3, baseValue: 5 },
  { goodId: "egg", unlockLevel: 1, baseValue: 6 },
  { goodId: "milk", unlockLevel: 5, baseValue: 14 },
];

const tickConfig: TickConfig = {
  orderableGoods: goodPool as OrderableGood[],
  heliOrderableGoods: goodPool as HeliOrderableGood[],
  shippableGoods: goodPool as ShippableGood[],
  dailyTaskTemplates,
  regattaTaskTemplates,
  regattaScoreBarCap: 25,
  villageGoodPool: goodPool,
};

function buildInitialState(): GameState {
  const options: NewGameOptions = {
    playerName: "determinism-check",
    now: START_TIME,
    seed: FIXED_SEED,
    dailyTaskTemplates,
    regattaTaskTemplates,
    regattaScoreBarCap: 25,
  };
  const state = newGame(options);

  // Pre-unlock the mine and the ship, each with its very first boundary's
  // content already rolled at construction time (using the same
  // scopedRng() the real subsystems use for their catch-up loops), so
  // both runs below clone an identical, unambiguous, already-established
  // starting point rather than each independently hitting the "first
  // roll since unlocking" special case at two different `now` values.
  const tiles = generateMineGrid(scopedRng("mine", START_TIME));
  const ship = rollShipWindow(scopedRng("ship", START_TIME), goodPool as ShippableGood[], PRE_UNLOCK_LEVEL, START_TIME);

  return {
    ...state,
    economy: { ...state.economy, level: PRE_UNLOCK_LEVEL },
    mine: { ...state.mine, unlocked: true, tiles, lastRegenAt: START_TIME },
    ship,
  };
}

/**
 * Fields excluded from the comparison, by exact dot-path, with the reason
 * each one is legitimately allowed to differ. Empty by default - a field
 * only belongs here if it is genuinely, defensibly time-of-day/call-count
 * dependent by design, never because loosening the comparison was the
 * easiest way to get to "identical". If this script ever reports a real
 * difference, the fix is to fix the difference, not to add an entry here
 * without a documented, defensible reason.
 */
const EXCLUDED_PATHS: ReadonlySet<string> = new Set([
  // (none - see the comment above)
]);

/**
 * Deep-compares two JSON-safe values, returning the first differing path
 * (dot/bracket notation, e.g. "state.mine.tiles[7].dug") or null if the
 * two values are structurally identical - skipping any path listed in
 * EXCLUDED_PATHS entirely.
 */
function findFirstDifference(a: unknown, b: unknown, path: string): string | null {
  if (EXCLUDED_PATHS.has(path)) return null;
  if (a === b) return null;
  if (typeof a !== typeof b) return `${path} (type mismatch: ${JSON.stringify(a)} vs ${JSON.stringify(b)})`;
  if (a === null || b === null || typeof a !== "object") {
    return `${path} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`;
  }
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return `${path} (array/object mismatch)`;
  if (aArr && bArr) {
    if (a.length !== b.length) return `${path}.length (${a.length} vs ${b.length})`;
    for (let i = 0; i < a.length; i++) {
      const diff = findFirstDifference(a[i], b[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
  for (const key of keys) {
    const diff = findFirstDifference(aObj[key], bObj[key], path ? `${path}.${key}` : key);
    if (diff) return diff;
  }
  return null;
}

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function main(): void {
  const initial = buildInitialState();
  const totalSpanMs = 30 * DAY_MS;

  const coarseResult = tick(structuredClone(initial), totalSpanMs, initial.lastTickAt + totalSpanMs, tickConfig);

  let fineState = structuredClone(initial);
  const totalMinuteTicks = totalSpanMs / MINUTE_MS; // 43200
  for (let i = 0; i < totalMinuteTicks; i++) {
    const stepNow = fineState.lastTickAt + MINUTE_MS;
    const result = tick(fineState, MINUTE_MS, stepNow, tickConfig);
    fineState = result.state;
  }

  console.log(`determinism-check: coarse run = 1 tick() of ${totalSpanMs}ms; fine run = ${totalMinuteTicks} ticks() of ${MINUTE_MS}ms`);
  console.log(`determinism-check: coarse lastTickAt=${coarseResult.state.lastTickAt} fine lastTickAt=${fineState.lastTickAt}`);

  const diff = findFirstDifference(jsonRoundTrip(coarseResult.state), jsonRoundTrip(fineState), "state");

  if (diff === null) {
    console.log("determinism-check: identical");
    process.exitCode = 0;
  } else {
    console.log(`determinism-check: DIFFERS at ${diff}`);
    process.exitCode = 1;
  }
}

main();
