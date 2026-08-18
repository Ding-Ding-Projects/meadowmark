/**
 * Zoo: enclosures grouped by habitat (grass/water/rock/arctic). Animal
 * cards are collected (from helicopter/ship chests, achievements, etc.)
 * and spent to hatch species. Visitors pay coins and "zoo bucks" over
 * time, with bonuses for matching an enclosure's habitat to its species
 * and for grouping same-family species together, so layout is a real
 * decision rather than a formality.
 */

import type { GameState, GridPosition, ZooEnclosure, ZooHabitat, ZooState } from "./types";
import { isReady } from "./time";
import { MINUTE_MS } from "./time";

export const ZOO_UNLOCK_POPULATION = 400;
export const ZOO_INCOME_INTERVAL_MS = 10 * MINUTE_MS;

export interface ZooSpeciesCatalogEntry {
  speciesId: string;
  habitat: ZooHabitat;
  /** Family grouping key, e.g. "big-cat", "primate", "bird" - enclosures of the same family placed adjacent earn the grouping bonus. */
  family: string;
  cardsNeeded: number;
  baseIncomeCoins: number;
  baseIncomeZooBucks: number;
}

export function createInitialZoo(): ZooState {
  return { unlocked: false, enclosures: [], animalCards: {}, hatchedSpecies: [], zooBucks: 0 };
}

export function maybeUnlockZoo(state: GameState): GameState {
  if (state.zoo.unlocked || state.economy.population < ZOO_UNLOCK_POPULATION) return state;
  return { ...state, zoo: { ...state.zoo, unlocked: true } };
}

export function addAnimalCards(state: GameState, speciesId: string, count: number): GameState {
  return {
    ...state,
    zoo: {
      ...state.zoo,
      animalCards: { ...state.zoo.animalCards, [speciesId]: (state.zoo.animalCards[speciesId] ?? 0) + count },
    },
  };
}

export function hatchSpecies(state: GameState, species: ZooSpeciesCatalogEntry): { state: GameState; hatched: boolean } {
  const held = state.zoo.animalCards[species.speciesId] ?? 0;
  if (held < species.cardsNeeded || state.zoo.hatchedSpecies.includes(species.speciesId)) {
    return { state, hatched: false };
  }
  return {
    state: {
      ...state,
      zoo: {
        ...state.zoo,
        animalCards: { ...state.zoo.animalCards, [species.speciesId]: held - species.cardsNeeded },
        hatchedSpecies: [...state.zoo.hatchedSpecies, species.speciesId],
      },
    },
    hatched: true,
  };
}

export function buildEnclosure(state: GameState, id: string, habitat: ZooHabitat, position: GridPosition, footprint: { width: number; height: number }, now: number): GameState {
  const enclosure: ZooEnclosure = { id, habitat, position, footprint, speciesId: null, incomeAnchorAt: now };
  return { ...state, zoo: { ...state.zoo, enclosures: [...state.zoo.enclosures, enclosure] } };
}

export function assignSpeciesToEnclosure(state: GameState, enclosureId: string, speciesId: string): GameState {
  const enclosures = state.zoo.enclosures.map((e) => (e.id === enclosureId ? { ...e, speciesId } : e));
  return { ...state, zoo: { ...state.zoo, enclosures } };
}

function isAdjacent(a: ZooEnclosure, b: ZooEnclosure): boolean {
  const ax2 = a.position.x + a.footprint.width;
  const ay2 = a.position.y + a.footprint.height;
  const bx2 = b.position.x + b.footprint.width;
  const by2 = b.position.y + b.footprint.height;
  const xTouch = a.position.x <= bx2 && b.position.x <= ax2;
  const yTouch = a.position.y <= by2 && b.position.y <= ay2;
  return xTouch && yTouch;
}

/**
 * Collects accrued visitor income for an enclosure, applying a habitat
 * match bonus (species habitat === enclosure habitat) and a family
 * grouping bonus (an adjacent enclosure holds a species of the same
 * family), so where you place things actually matters.
 */
export function collectZooIncome(
  state: GameState,
  enclosureId: string,
  catalogBySpecies: Record<string, ZooSpeciesCatalogEntry>,
  now: number,
): { state: GameState; coinsGained: number; zooBucksGained: number } {
  const enclosure = state.zoo.enclosures.find((e) => e.id === enclosureId);
  if (!enclosure || !enclosure.speciesId) return { state, coinsGained: 0, zooBucksGained: 0 };
  const species = catalogBySpecies[enclosure.speciesId];
  if (!species) return { state, coinsGained: 0, zooBucksGained: 0 };

  const elapsed = Math.max(0, now - enclosure.incomeAnchorAt);
  const intervals = Math.floor(elapsed / ZOO_INCOME_INTERVAL_MS);
  if (intervals <= 0) return { state, coinsGained: 0, zooBucksGained: 0 };

  let multiplier = 1;
  if (species.habitat === enclosure.habitat) multiplier += 0.25;

  const hasFamilyNeighbor = state.zoo.enclosures.some((other) => {
    if (other.id === enclosure.id || !other.speciesId) return false;
    const otherSpecies = catalogBySpecies[other.speciesId];
    return otherSpecies && otherSpecies.family === species.family && isAdjacent(enclosure, other);
  });
  if (hasFamilyNeighbor) multiplier += 0.15;

  const coinsGained = Math.round(species.baseIncomeCoins * intervals * multiplier);
  const zooBucksGained = Math.round(species.baseIncomeZooBucks * intervals * multiplier);

  const enclosures = state.zoo.enclosures.map((e) =>
    e.id === enclosureId ? { ...e, incomeAnchorAt: e.incomeAnchorAt + intervals * ZOO_INCOME_INTERVAL_MS } : e,
  );

  return {
    state: {
      ...state,
      economy: { ...state.economy, coins: state.economy.coins + coinsGained },
      zoo: { ...state.zoo, enclosures, zooBucks: state.zoo.zooBucks + zooBucksGained },
    },
    coinsGained,
    zooBucksGained,
  };
}

export { isReady };
