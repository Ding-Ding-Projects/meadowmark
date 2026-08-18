/**
 * Save schema v1 plus a migration harness. `migrate(raw)` accepts whatever
 * a previous save-format version wrote to disk and carries it forward to
 * the current GameState shape, so a player's progress survives every
 * future balance/schema change. Add new migration steps to the chain
 * below rather than mutating an old one - each step should be a small,
 * independently reviewable transform from version N to N+1.
 */

import type { GameState } from "./types.js";
import { createRng, seedFromString } from "./rng.js";
import { createInitialFields } from "./fields.js";
import { createInitialTown } from "./town.js";
import { createInitialExpansions } from "./expansions.js";
import { createInitialZoo } from "./zoo.js";
import { createInitialMine } from "./mine.js";
import { createInitialMuseum } from "./museum.js";
import { createInitialBoosters } from "./boosters.js";
import { createInitialAchievements } from "./achievements.js";
import { createInitialDailies, type DailyTaskTemplate } from "./dailies.js";
import { createInitialVillage, type RegattaTaskTemplate } from "./village.js";
import { createEmptyOrderBoard } from "./orders.js";
import { createEmptyTrain } from "./train.js";
import { createEmptyHelicopter } from "./helicopter.js";
import { createEmptyShip } from "./ship.js";

export const CURRENT_SCHEMA_VERSION = 2;

export interface NewGameOptions {
  playerName: string;
  now: number;
  /** Seed for the world RNG. Defaults to a seed derived from playerName+now so two "new game" calls with different inputs never collide, while remaining fully deterministic for a given input pair (useful for tests/replays). */
  seed?: number;
  dailyTaskTemplates: DailyTaskTemplate[];
  regattaTaskTemplates: RegattaTaskTemplate[];
  regattaScoreBarCap?: number;
}

/** Creates a brand-new save at level 1 with the starting 6 plots, empty barn, and every other system in its default unlocked-or-not starting state. */
export function newGame(options: NewGameOptions): GameState {
  const { playerName, now } = options;
  const seed = options.seed ?? seedFromString(`${playerName}:${now}`);

  return {
    meta: { schemaVersion: CURRENT_SCHEMA_VERSION, createdAt: now, lastSavedAt: now, playerName },
    rng: createRng(seed),
    lastTickAt: now,

    economy: {
      coins: 500,
      cash: 0,
      xp: 0,
      level: 1,
      energy: 20,
      energyCap: 20,
      energyRegenAnchorAt: now,
      population: 0,
      populationCap: 20,
      reputationStars: 0,
    },
    inventory: {},
    barn: { capacity: 60, level: 1 },

    fields: createInitialFields(),
    animals: { sheds: [] },
    factories: { factories: [] },
    orders: createEmptyOrderBoard(),
    train: createEmptyTrain(),
    helicopter: createEmptyHelicopter(),
    ship: createEmptyShip(),
    town: createInitialTown(),
    expansions: createInitialExpansions(),
    zoo: createInitialZoo(),
    mine: createInitialMine(),
    museum: createInitialMuseum(),
    boosters: createInitialBoosters(),
    achievements: createInitialAchievements(),
    dailies: createInitialDailies(now, options.dailyTaskTemplates),
    village: createInitialVillage(now, options.regattaTaskTemplates, options.regattaScoreBarCap ?? 100),
  };
}

/**
 * A migration step transforms a raw save object from one schema version to
 * the next. Each step must be pure and must not assume anything about the
 * shape beyond "whatever version N actually wrote," since real save files
 * accumulate quirks that a hand-authored fixture never will.
 */
type MigrationStep = (raw: any) => any;

const MIGRATIONS: Record<number, MigrationStep> = {
  // v1 -> v2: added the museum system. A v1 save has no `museum` key at
  // all, so it starts every existing player at "not yet unlocked, nothing
  // donated" - the same state a save reaching level MUSEUM_UNLOCK_LEVEL
  // for the first time under v2 would start from.
  1: (raw) => ({ ...raw, museum: createInitialMuseum() }),
};

/**
 * Carries an arbitrary raw save object forward to CURRENT_SCHEMA_VERSION,
 * applying each migration step in order. Throws if the raw save has no
 * discoverable schemaVersion (i.e. it isn't a Meadowmark save at all) or
 * if a future/unknown version is encountered that this build doesn't know
 * how to migrate.
 */
export function migrate(raw: any): GameState {
  if (raw === null || typeof raw !== "object") {
    throw new Error("migrate: save data is not an object");
  }
  let version: number = raw?.meta?.schemaVersion;
  if (typeof version !== "number") {
    throw new Error("migrate: save data has no meta.schemaVersion - not a recognizable Meadowmark save");
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `migrate: save schema version ${version} is newer than this build supports (${CURRENT_SCHEMA_VERSION}). Update the app before loading this save.`,
    );
  }

  let working = raw;
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new Error(`migrate: no migration registered to carry save data from version ${version} forward`);
    }
    working = step(working);
    version += 1;
  }

  working.meta = { ...working.meta, schemaVersion: CURRENT_SCHEMA_VERSION };
  return working as GameState;
}

/** Serializes state to a plain JSON-safe object, stamping lastSavedAt. */
export function serialize(state: GameState, savedAt: number): GameState {
  return { ...state, meta: { ...state.meta, lastSavedAt: savedAt } };
}
