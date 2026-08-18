/**
 * Mine: a grid of rock tiles costing 1 energy to dig. Tiles hide ore
 * (copper/iron/silver/gold/platinum), gems, tools (pick, dynamite clears a
 * cross, TNT clears a 3x3), and artifact fragments. 6 fragments complete
 * an artifact, which the Museum exhibits for a cash payout and a small
 * permanent bonus. A Foundry smelts ore into bars with coal. The mine
 * regenerates once per local calendar day.
 */

import type { GameEvent, GameState, MineState, MineTile, MineTileContent } from "./types.js";
import type { RngState } from "./rng.js";
import { nextFloat, pick, scopedRng } from "./rng.js";
import { DAY_MS, HOUR_MS, MAX_OFFLINE_MS, isReady, nextLocalDayBoundary } from "./time.js";

export const MINE_UNLOCK_LEVEL = 22;
export const MINE_GRID_WIDTH = 8;
export const MINE_GRID_HEIGHT = 8;
export const ARTIFACT_FRAGMENTS_REQUIRED = 6;
export const FOUNDRY_SMELT_TIME_MS = 2 * HOUR_MS;

/** Regeneration is daily, so the catch-up cap is just the offline clamp expressed in days (30). */
export const MINE_MAX_CATCHUP_BOUNDARIES = Math.floor(MAX_OFFLINE_MS / DAY_MS);

export const ORE_IDS = ["copper", "iron", "silver", "gold", "platinum"] as const;
export const GEM_IDS = ["quartz", "amethyst", "ruby", "sapphire", "diamond"] as const;
export const ARTIFACT_IDS = ["sundial", "totem", "urn", "tablet", "crown"] as const;

/** Weighted content distribution: mostly rock, some ore, rarer gems/tools/fragments. */
function rollTileContent(rng: RngState): MineTileContent {
  const bag: { weight: number; make: () => MineTileContent }[] = [
    { weight: 55, make: () => ({ kind: "rock" }) },
    { weight: 22, make: () => ({ kind: "ore", oreId: pick(rng, ORE_IDS as unknown as string[]) }) },
    { weight: 10, make: () => ({ kind: "gem", gemId: pick(rng, GEM_IDS as unknown as string[]) }) },
    { weight: 8, make: () => ({ kind: "tool", toolId: pick(rng, ["pick", "dynamite", "tnt"] as const) }) },
    { weight: 5, make: () => ({ kind: "artifactFragment", artifactId: pick(rng, ARTIFACT_IDS as unknown as string[]) }) },
  ];
  const total = bag.reduce((s, b) => s + b.weight, 0);
  let roll = nextFloat(rng) * total;
  for (const entry of bag) {
    roll -= entry.weight;
    if (roll <= 0) return entry.make();
  }
  const last = bag[bag.length - 1];
  if (last === undefined) {
    // Cannot actually happen: bag is the fixed 5-entry literal above, never
    // empty. The check exists so a future edit that did make it empty
    // fails loudly here instead of producing `undefined.make()`.
    throw new Error("rollTileContent: internal error - content bag is empty");
  }
  return last.make();
}

export function generateMineGrid(rng: RngState): MineTile[] {
  const tiles: MineTile[] = [];
  const count = MINE_GRID_WIDTH * MINE_GRID_HEIGHT;
  for (let i = 0; i < count; i++) {
    tiles.push({ index: i, dug: false, content: rollTileContent(rng) });
  }
  return tiles;
}

export function createInitialMine(): MineState {
  return {
    unlocked: false,
    gridWidth: MINE_GRID_WIDTH,
    gridHeight: MINE_GRID_HEIGHT,
    tiles: [],
    lastRegenAt: null,
    oreBars: {},
    artifactFragments: {},
    completedArtifacts: [],
    foundryQueue: [],
  };
}

/**
 * `now` is the instant the mine actually unlocks (not a stale prior
 * timestamp), since the initial grid generated here counts as this
 * moment's regeneration - tickMine()'s catch-up loop starts counting
 * forward from exactly this cursor. Uses a self-seeded RNG scoped to
 * `now` rather than the shared world RNG - see rng.ts's scopedRng() for
 * why every boundary-triggered mine regeneration needs this.
 */
export function maybeUnlockMine(state: GameState, now: number): GameState {
  if (state.mine.unlocked || state.economy.level < MINE_UNLOCK_LEVEL) return state;
  return {
    ...state,
    mine: { ...state.mine, unlocked: true, tiles: generateMineGrid(scopedRng("mine", now)), lastRegenAt: now },
  };
}

function neighborsCross(index: number, width: number, height: number): number[] {
  const x = index % width;
  const y = Math.floor(index / width);
  const result: number[] = [];
  const deltas: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of deltas) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) result.push(ny * width + nx);
  }
  return result;
}

function neighborsSquare3(index: number, width: number, height: number): number[] {
  const x = index % width;
  const y = Math.floor(index / width);
  const result: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) result.push(ny * width + nx);
    }
  }
  return result;
}

export interface DigResult {
  state: GameState;
  dug: boolean;
  events: GameEvent[];
  reason?: "alreadyDug" | "insufficientEnergy" | "outOfBounds";
}

/** Digs a single tile for 1 energy. If the tile holds dynamite/TNT, using it immediately clears the surrounding cross/3x3 for free (no extra energy cost on the cleared tiles). */
export function digTile(state: GameState, tileIndex: number): DigResult {
  if (tileIndex < 0 || tileIndex >= state.mine.tiles.length) return { state, dug: false, events: [], reason: "outOfBounds" };
  const tile = state.mine.tiles[tileIndex];
  if (tile === undefined) {
    // Cannot actually happen: the bounds check immediately above already
    // guarantees tileIndex is within [0, state.mine.tiles.length - 1].
    return { state, dug: false, events: [], reason: "outOfBounds" };
  }
  if (tile.dug) return { state, dug: false, events: [], reason: "alreadyDug" };
  if (state.economy.energy < 1) return { state, dug: false, events: [], reason: "insufficientEnergy" };

  let tiles = state.mine.tiles.map((t) => (t.index === tileIndex ? { ...t, dug: true } : t));
  let oreBars = state.mine.oreBars;
  let artifactFragments = state.mine.artifactFragments;
  const reward = collectTileReward(tile.content);
  oreBars = reward.oreBars ?? oreBars;
  if (reward.artifactId) {
    artifactFragments = {
      ...artifactFragments,
      [reward.artifactId]: (artifactFragments[reward.artifactId] ?? 0) + 1,
    };
  }

  if (tile.content.kind === "tool" && (tile.content.toolId === "dynamite" || tile.content.toolId === "tnt")) {
    const affected =
      tile.content.toolId === "dynamite"
        ? neighborsCross(tileIndex, state.mine.gridWidth, state.mine.gridHeight)
        : neighborsSquare3(tileIndex, state.mine.gridWidth, state.mine.gridHeight);
    tiles = tiles.map((t) => (affected.includes(t.index) ? { ...t, dug: true } : t));
  }

  return {
    state: {
      ...state,
      economy: { ...state.economy, energy: state.economy.energy - 1 },
      mine: { ...state.mine, tiles, oreBars, artifactFragments },
    },
    dug: true,
    events: [],
  };
}

function collectTileReward(content: MineTileContent): { oreBars?: Record<string, number>; artifactId?: string } {
  if (content.kind === "artifactFragment") return { artifactId: content.artifactId };
  return {};
}

/** Completes an artifact once all fragments are collected, adding it to the Museum exhibit list. */
export function checkArtifactCompletion(state: GameState, artifactId: string): { state: GameState; completed: boolean } {
  const held = state.mine.artifactFragments[artifactId] ?? 0;
  if (held < ARTIFACT_FRAGMENTS_REQUIRED || state.mine.completedArtifacts.includes(artifactId)) {
    return { state, completed: false };
  }
  return {
    state: {
      ...state,
      mine: {
        ...state.mine,
        artifactFragments: { ...state.mine.artifactFragments, [artifactId]: held - ARTIFACT_FRAGMENTS_REQUIRED },
        completedArtifacts: [...state.mine.completedArtifacts, artifactId],
      },
    },
    completed: true,
  };
}

export interface SmeltRecipe {
  oreId: string;
  oreQuantity: number;
  coalQuantity: number;
  barGoodId: string;
}

export function startSmelt(state: GameState, recipe: SmeltRecipe, now: number): { state: GameState; started: boolean } {
  const oreHeld = state.mine.oreBars[recipe.oreId] ?? 0;
  const coalHeld = state.inventory["coal"] ?? 0;
  if (oreHeld < recipe.oreQuantity || coalHeld < recipe.coalQuantity) return { state, started: false };

  return {
    state: {
      ...state,
      inventory: { ...state.inventory, coal: coalHeld - recipe.coalQuantity },
      mine: {
        ...state.mine,
        oreBars: { ...state.mine.oreBars, [recipe.oreId]: oreHeld - recipe.oreQuantity },
        foundryQueue: [
          ...state.mine.foundryQueue,
          { barGoodId: recipe.barGoodId, startedAt: now, readyAt: now + FOUNDRY_SMELT_TIME_MS },
        ],
      },
    },
    started: true,
  };
}

export function collectSmelt(state: GameState, index: number, now: number): { state: GameState; collected: boolean } {
  const job = state.mine.foundryQueue[index];
  if (!job || !isReady(job.readyAt, now)) return { state, collected: false };
  const foundryQueue = state.mine.foundryQueue.filter((_, i) => i !== index);
  return {
    state: {
      ...state,
      inventory: { ...state.inventory, [job.barGoodId]: (state.inventory[job.barGoodId] ?? 0) + 1 },
      mine: { ...state.mine, foundryQueue },
    },
    collected: true,
  };
}

/**
 * Regenerates the mine once per local calendar day actually crossed since
 * `lastRegenAt`, refilling every tile each time - never mid-day, and
 * never collapsing a multi-day gap into a single regeneration.
 *
 * This is the boundary-crossing catch-up loop: it walks day by day from
 * the stored cursor toward `now`, generating each day's grid from a fresh
 * RNG scoped to that exact boundary's timestamp (scopedRng(), NOT the
 * shared world RNG - see rng.ts for why: this loop's own iteration count
 * varies with how much time elapsed, and it shares tick() with other
 * boundary loops such as ship.ts's window reroll and village.ts's
 * request top-up, so drawing from one linear stream would make a day's
 * content depend on how many draws THOSE subsystems happened to consume
 * first, which itself depends on how the elapsed time was chunked into
 * tick() calls). With a self-seeded RNG per day, tick(30 days) once and
 * tick(1 day) applied 30 times regenerate the exact same 30 days of
 * content in the exact same order, full stop - no cross-subsystem
 * interleaving to go wrong.
 *
 * The loop is capped at MINE_MAX_CATCHUP_BOUNDARIES (30, matching the
 * 30-day offline clamp): a save opened after a year regenerates at most
 * 30 times, and the remaining days are deliberately forfeited - the
 * cursor jumps straight to `now` afterward so a later call never tries to
 * replay them. A clock that moves backward (or hasn't crossed a boundary
 * yet) simply does nothing; the cursor is never rewound.
 */
export function tickMine(state: GameState, now: number): { state: GameState; events: GameEvent[] } {
  if (!state.mine.unlocked) return { state, events: [] };

  const cursor0 = state.mine.lastRegenAt;
  if (cursor0 === null) {
    // Defensive only: maybeUnlockMine() always sets lastRegenAt the
    // instant it unlocks the mine, so an unlocked mine should never have
    // a null cursor. If it somehow does, treat "right now" as the
    // starting point rather than crashing or silently regenerating.
    return { state: { ...state, mine: { ...state.mine, lastRegenAt: now } }, events: [] };
  }
  if (now <= cursor0) {
    return { state, events: [] };
  }

  const events: GameEvent[] = [];
  let tiles = state.mine.tiles;
  let cursor = cursor0;
  let processed = 0;

  while (processed < MINE_MAX_CATCHUP_BOUNDARIES) {
    const boundary = nextLocalDayBoundary(cursor);
    if (boundary > now) break;
    tiles = generateMineGrid(scopedRng("mine", boundary));
    events.push({ type: "mineRegenerated", at: boundary });
    cursor = boundary;
    processed += 1;
  }

  if (nextLocalDayBoundary(cursor) <= now) {
    // Cap hit with more days still pending: forfeit them deliberately
    // (documented, matches MAX_OFFLINE_MS elsewhere) rather than looping
    // further. Regenerate once more anchored at `now` so the player
    // returns to a fresh mine, and jump the cursor to `now` so the
    // forfeited days are never replayed on a later call.
    tiles = generateMineGrid(scopedRng("mine", now));
    events.push({ type: "mineRegenerated", at: now });
    cursor = now;
  }

  return {
    state: { ...state, mine: { ...state.mine, tiles, lastRegenAt: cursor } },
    events,
  };
}
