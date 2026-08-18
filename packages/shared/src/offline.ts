/**
 * The master tick() function and offline resume. This is the single place
 * that composes every subsystem's own tick step into one deterministic
 * advance of the simulation - live play and offline progress both go
 * through exactly this function, so there is only ever one implementation
 * of "what happens when time passes."
 *
 * Determinism: every subsystem resolves readiness by comparing an absolute
 * `readyAt`/`refillAt` timestamp against `now`, and every RNG draw only
 * happens the instant a threshold is first crossed. That means
 * tick(state, 24h) once and tick(state, 1min) applied 1440 times in a row
 * produce bit-identical resulting state and the same event stream in the
 * same order - nothing here is proportional to how many times tick() was
 * called, only to what `now` ended up being.
 */

import type { BuildingTypeId, GameEvent, GameState, TickResult } from "./types";
import type { RngState } from "./rng";
import { reconcileEnergy } from "./economy";
import { tickAnimals } from "./animals";
import { tickFactories } from "./factories";
import { tickFields } from "./fields";
import { tickBoosters } from "./boosters";
import { type OrderableGood, tickOrders } from "./orders";
import { tickTrain } from "./train";
import { type HeliOrderableGood, tickHelicopter } from "./helicopter";
import { type ShippableGood, tickShip } from "./ship";
import { type BuildingCatalogEntry, tickTown } from "./town";
import { maybeUnlockZoo } from "./zoo";
import { maybeUnlockMine, tickMine } from "./mine";
import { type DailyTaskTemplate, tickDailies } from "./dailies";
import { type RegattaTaskTemplate, tickVillage } from "./village";
import { DAY_MS } from "./time";

/**
 * Content catalogs needed by the subsystems whose refills/rolls depend on
 * balance data. Every field is optional: a subsystem whose catalog is
 * omitted simply skips its content-dependent step for that tick (safe,
 * since every such step is itself gated behind an unlock/readiness check).
 * The app layer owns loading balance/*.json and building these catalogs;
 * this package never reads a file itself.
 */
export interface TickConfig {
  orderableGoods?: OrderableGood[];
  heliOrderableGoods?: HeliOrderableGood[];
  shippableGoods?: ShippableGood[];
  buildingCatalog?: Record<BuildingTypeId, BuildingCatalogEntry>;
  dailyTaskTemplates?: DailyTaskTemplate[];
  regattaTaskTemplates?: RegattaTaskTemplate[];
  regattaScoreBarCap?: number;
  villageGoodPool?: { goodId: string; unlockLevel: number; baseValue: number }[];
}

/**
 * Advances the simulation to `now`. `elapsedMs` is accepted for API
 * symmetry and caller-side bookkeeping (and must equal `now - state.lastTickAt`
 * for the result to be meaningful) but every subsystem resolves purely off
 * `now` and the absolute timestamps already in state, which is what makes
 * this safe to call in arbitrarily large or small increments.
 */
export function tick(state: GameState, elapsedMs: number, now: number, config: TickConfig = {}): TickResult {
  const events: GameEvent[] = [];
  let next = state;
  const rng: RngState = next.rng;

  next = { ...next, economy: reconcileEnergy(next.economy, now) };

  {
    const r = tickFields(next, now);
    next = r.state;
    events.push(...r.events);
  }
  {
    const r = tickAnimals(next, now);
    next = r.state;
    events.push(...r.events);
  }
  {
    const r = tickFactories(next, now);
    next = r.state;
    events.push(...r.events);
  }
  {
    const r = tickBoosters(next, now);
    next = r.state;
    events.push(...r.events);
  }
  {
    const r = tickTrain(next, now);
    next = r.state;
    events.push(...r.events);
  }

  if (config.orderableGoods) {
    const r = tickOrders(next, rng, config.orderableGoods, now);
    next = r.state;
    events.push(...r.events);
  }
  if (config.heliOrderableGoods) {
    const r = tickHelicopter(next, rng, config.heliOrderableGoods, now);
    next = r.state;
    events.push(...r.events);
  }
  if (config.shippableGoods) {
    const r = tickShip(next, rng, config.shippableGoods, now);
    next = r.state;
    events.push(...r.events);
  }
  if (config.buildingCatalog) {
    const r = tickTown(next, config.buildingCatalog, now);
    next = r.state;
    events.push(...r.events);
  }

  next = maybeUnlockZoo(next);
  next = maybeUnlockMine(next, rng);
  {
    const r = tickMine(next, rng, now);
    next = r.state;
    events.push(...r.events);
  }

  if (config.dailyTaskTemplates) {
    const r = tickDailies(next, config.dailyTaskTemplates, now);
    next = r.state;
    events.push(...r.events);
  }
  if (config.regattaTaskTemplates && config.villageGoodPool) {
    const r = tickVillage(
      next,
      rng,
      config.villageGoodPool,
      config.regattaTaskTemplates,
      config.regattaScoreBarCap ?? 100,
      now,
    );
    next = r.state;
    events.push(...r.events);
  }

  next = { ...next, rng, lastTickAt: now };

  return { state: next, events };
}

export const MAX_OFFLINE_MS = 30 * DAY_MS;

export interface OfflineSummary {
  elapsedMs: number;
  clampedToMax: boolean;
  readyHarvests: number;
  readyAnimalProducts: number;
  readyFactoryBatches: number;
  pausedFactoryBatches: number;
  trainArrivals: number;
  buildingsCompleted: number;
  ordersRefilled: number;
  heliOrdersRefilled: number;
  helicopterChestReady: boolean;
  shipChestReady: boolean;
  mineRegenerated: boolean;
  dailyTasksRolledOver: boolean;
  levelsGained: number;
  events: GameEvent[];
}

function summarize(events: GameEvent[], elapsedMs: number, clampedToMax: boolean): OfflineSummary {
  const summary: OfflineSummary = {
    elapsedMs,
    clampedToMax,
    readyHarvests: 0,
    readyAnimalProducts: 0,
    readyFactoryBatches: 0,
    pausedFactoryBatches: 0,
    trainArrivals: 0,
    buildingsCompleted: 0,
    ordersRefilled: 0,
    heliOrdersRefilled: 0,
    helicopterChestReady: false,
    shipChestReady: false,
    mineRegenerated: false,
    dailyTasksRolledOver: false,
    levelsGained: 0,
    events,
  };

  for (const e of events) {
    switch (e.type) {
      case "harvestReady":
        summary.readyHarvests += 1;
        break;
      case "animalProductReady":
        summary.readyAnimalProducts += 1;
        break;
      case "factoryProductionReady":
        summary.readyFactoryBatches += 1;
        break;
      case "factoryQueuePaused":
        summary.pausedFactoryBatches += 1;
        break;
      case "trainArrived":
        summary.trainArrivals += 1;
        break;
      case "buildingCompleted":
        summary.buildingsCompleted += 1;
        break;
      case "orderRefilled":
        summary.ordersRefilled += 1;
        break;
      case "helicopterOrderRefilled":
        summary.heliOrdersRefilled += 1;
        break;
      case "helicopterChestReady":
        summary.helicopterChestReady = true;
        break;
      case "shipChestReady":
        summary.shipChestReady = true;
        break;
      case "mineRegenerated":
        summary.mineRegenerated = true;
        break;
      case "levelUp":
        summary.levelsGained += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

/**
 * Resumes a save that has been away for `now - state.lastTickAt`
 * milliseconds, clamped to MAX_OFFLINE_MS (30 days) so a save opened after
 * a year away doesn't try to simulate a year of ticks - it simulates 30
 * days and the rest of the absence is simply not modeled, exactly as the
 * clamp implies. Returns the advanced state plus a returning-player
 * summary built from the very same event stream tick() itself produces.
 */
export function resumeOffline(state: GameState, now: number, config: TickConfig = {}): { state: GameState; summary: OfflineSummary } {
  const rawElapsed = Math.max(0, now - state.lastTickAt);
  const clampedToMax = rawElapsed > MAX_OFFLINE_MS;
  const elapsedMs = Math.min(rawElapsed, MAX_OFFLINE_MS);
  const effectiveNow = clampedToMax ? state.lastTickAt + elapsedMs : now;

  const result = tick(state, elapsedMs, effectiveNow, config);
  // If we clamped, `lastTickAt` intentionally lands short of the real wall
  // clock; the very next live tick() call will simply pick up from there
  // with a fresh (now-lastTickAt) elapsed window, exactly like any other
  // tick - no special-casing needed on the next call.

  return { state: result.state, summary: summarize(result.events, elapsedMs, clampedToMax) };
}
