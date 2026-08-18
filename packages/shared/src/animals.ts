/**
 * Animals: chicken/cow/sheep/pig/goat/bee sheds, fed by Animal Feed,
 * producing eggs/milk/wool/bacon/goat milk/honey on timers. Sheds upgrade
 * for more slots.
 */

import type { AnimalsState, AnimalTypeId, AnimalUnit, GameEvent, GameState, GridPosition, ResourceBag } from "./types.js";
import { addGood, addXp, barnFreeSpace, removeGood } from "./economy.js";
import { isReady } from "./time.js";

export interface AnimalCatalogEntry {
  animalTypeId: AnimalTypeId;
  productGoodId: string;
  productionTimeMs: number;
  feedCost: number; // units of "animal_feed" good consumed to start a cycle
  xpReward: number;
  coinReward: number;
}

export const SHED_BASE_SLOTS = 3;
export const SHED_MAX_SLOTS = 12;

/**
 * Default world-grid layout for sheds: a row south of the fields, one
 * shed every SHED_SPACING_X tiles. This is the fallback used when a shed
 * is placed without an explicit position (and by save.ts's v1->v2
 * migration for a shed that predates the `position` field) - a real
 * "build a shed here" placement flow should pass its own chosen position
 * to createShed() instead.
 */
export const SHED_ORIGIN: GridPosition = { x: 2, y: 14 };
export const SHED_SPACING_X = 4;

export function defaultShedPosition(shedIndex: number): GridPosition {
  return { x: SHED_ORIGIN.x + shedIndex * SHED_SPACING_X, y: SHED_ORIGIN.y };
}

export function createShed(id: string, animalTypeId: AnimalTypeId, position: GridPosition): AnimalsState["sheds"][number] {
  return { id, animalTypeId, position, slots: SHED_BASE_SLOTS, animals: [] };
}

export function addAnimalUnit(state: GameState, shedId: string, unitId: string): GameState {
  const shed = state.animals.sheds.find((s) => s.id === shedId);
  if (!shed || shed.animals.length >= shed.slots) return state;
  const sheds = state.animals.sheds.map((s) =>
    s.id === shedId ? { ...s, animals: [...s.animals, { id: unitId, feedStartedAt: null, readyAt: null } as AnimalUnit] } : s,
  );
  return { ...state, animals: { sheds } };
}

/** Feeds one idle animal in the shed, starting its production timer. Consumes animal_feed from inventory. */
export function feedAnimal(
  state: GameState,
  shedId: string,
  animalUnitId: string,
  catalog: AnimalCatalogEntry,
  now: number,
): GameState {
  const feedGoodId = "animal_feed";
  if ((state.inventory[feedGoodId] ?? 0) < catalog.feedCost) return state;

  const sheds = state.animals.sheds.map((s) => {
    if (s.id !== shedId) return s;
    return {
      ...s,
      animals: s.animals.map((a) =>
        a.id === animalUnitId && a.feedStartedAt === null
          ? { ...a, feedStartedAt: now, readyAt: now + catalog.productionTimeMs }
          : a,
      ),
    };
  });

  const wasIdle = state.animals.sheds
    .find((s) => s.id === shedId)
    ?.animals.find((a) => a.id === animalUnitId)?.feedStartedAt === null;
  if (!wasIdle) return state;

  return {
    ...state,
    inventory: removeGood(state.inventory, feedGoodId, catalog.feedCost),
    animals: { sheds },
  };
}

/** Feeds every idle animal across every shed of the given type, stopping honestly when feed runs out. */
export function feedAll(
  state: GameState,
  catalogByType: Record<AnimalTypeId, AnimalCatalogEntry>,
  now: number,
): { state: GameState; fedCount: number; partial: boolean } {
  let inventory = state.inventory;
  let fedCount = 0;
  let partial = false;

  const sheds = state.animals.sheds.map((shed) => {
    const catalog = catalogByType[shed.animalTypeId];
    if (!catalog) return shed;
    const animals = shed.animals.map((animal) => {
      if (animal.feedStartedAt !== null) return animal;
      if ((inventory[catalog.productGoodId] === undefined && false)) return animal; // no-op guard, kept explicit
      if ((inventory["animal_feed"] ?? 0) < catalog.feedCost) {
        partial = true;
        return animal;
      }
      inventory = removeGood(inventory, "animal_feed", catalog.feedCost);
      fedCount += 1;
      return { ...animal, feedStartedAt: now, readyAt: now + catalog.productionTimeMs };
    });
    return { ...shed, animals };
  });

  return { state: { ...state, inventory, animals: { sheds } }, fedCount, partial };
}

export function collectProduct(
  state: GameState,
  shedId: string,
  animalUnitId: string,
  catalog: AnimalCatalogEntry,
  now: number,
): { state: GameState; collected: boolean; events: GameEvent[]; reason?: "notReady" | "barnFull" } {
  const shed = state.animals.sheds.find((s) => s.id === shedId);
  const unit = shed?.animals.find((a) => a.id === animalUnitId);
  if (!shed || !unit || !isReady(unit.readyAt, now)) {
    return { state, collected: false, events: [], reason: "notReady" };
  }
  if (barnFreeSpace(state) < 1) {
    return { state, collected: false, events: [], reason: "barnFull" };
  }

  const sheds = state.animals.sheds.map((s) =>
    s.id === shedId
      ? { ...s, animals: s.animals.map((a) => (a.id === animalUnitId ? { ...a, feedStartedAt: null, readyAt: null } : a)) }
      : s,
  );
  const xpResult = addXp(state.economy, catalog.xpReward, now);

  return {
    state: {
      ...state,
      economy: { ...xpResult.economy, coins: xpResult.economy.coins + catalog.coinReward },
      inventory: addGood(state.inventory, catalog.productGoodId, 1),
      animals: { sheds },
    },
    collected: true,
    events: xpResult.events,
  };
}

/** Collects every ready animal product across all sheds, stopping honestly when the barn fills. */
export function collectAll(
  state: GameState,
  catalogByType: Record<AnimalTypeId, AnimalCatalogEntry>,
  now: number,
): { state: GameState; goodsGained: ResourceBag; partial: boolean; events: GameEvent[] } {
  let inventory = state.inventory;
  let economy = state.economy;
  const goodsGained: ResourceBag = {};
  const events: GameEvent[] = [];
  let partial = false;

  const sheds = state.animals.sheds.map((shed) => {
    const catalog = catalogByType[shed.animalTypeId];
    if (!catalog) return shed;
    const animals = shed.animals.map((animal) => {
      if (!isReady(animal.readyAt, now)) return animal;
      if (barnFreeSpace({ inventory, barn: state.barn }) < 1) {
        partial = true;
        return animal;
      }
      inventory = addGood(inventory, catalog.productGoodId, 1);
      goodsGained[catalog.productGoodId] = (goodsGained[catalog.productGoodId] ?? 0) + 1;
      const xpResult = addXp(economy, catalog.xpReward, now);
      economy = { ...xpResult.economy, coins: xpResult.economy.coins + catalog.coinReward };
      events.push(...xpResult.events);
      return { ...animal, feedStartedAt: null, readyAt: null };
    });
    return { ...shed, animals };
  });

  return { state: { ...state, inventory, economy, animals: { sheds } }, goodsGained, partial, events };
}

export function tickAnimals(state: GameState, now: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const shed of state.animals.sheds) {
    for (const unit of shed.animals) {
      if (isReady(unit.readyAt, now) && unit.readyAt !== null) {
        events.push({ type: "animalProductReady", shedId: shed.id, animalUnitId: unit.id, at: unit.readyAt });
      }
    }
  }
  return { state, events };
}
