/**
 * Town: the buildable grid. Houses cost coins+materials and take 10min-6h
 * to build, each adding 8-40 population. Community buildings gate behind
 * population thresholds (Town Hall, Farmers' Market, Train Station L8,
 * Dock L18, Mine L22, Zoo L25, Museum L30, Restaurant, Cinema, School,
 * Hospital, Fire Station, Airport, Sports Arena). Decorations feed a "town
 * charm" score that pays a small daily coin bonus. Roads are placeable
 * grid cells with no footprint restrictions beyond collision.
 */

import type { BuildingTypeId, GameEvent, GameState, GridPosition, PlacedBuilding, ResourceBag, TownState } from "./types.js";
import { hasAll, removeAll } from "./economy.js";
import { isReady } from "./time.js";

export const TOWN_GRID_WIDTH = 40;
export const TOWN_GRID_HEIGHT = 40;

export function createInitialTown(): TownState {
  return { gridWidth: TOWN_GRID_WIDTH, gridHeight: TOWN_GRID_HEIGHT, buildings: [], charmScore: 0 };
}

export interface BuildingCatalogEntry {
  buildingTypeId: BuildingTypeId;
  footprint: { width: number; height: number };
  costCoins: number;
  costMaterials: ResourceBag;
  buildTimeMs: number;
  /** Population added once built (houses); 0 for community buildings/decorations. */
  populationReward: number;
  /** Minimum population required before this can be placed (community buildings); 0 for houses/decorations. */
  requiresPopulation: number;
  /** Minimum player level required; 0 if ungated. */
  requiresLevel: number;
  /** Charm score contributed once built (decorations). */
  charmValue: number;
  kind: "house" | "community" | "decoration" | "road";
}

function overlaps(a: { position: GridPosition; footprint: { width: number; height: number } }, b: typeof a): boolean {
  return !(
    a.position.x + a.footprint.width <= b.position.x ||
    b.position.x + b.footprint.width <= a.position.x ||
    a.position.y + a.footprint.height <= b.position.y ||
    b.position.y + b.footprint.height <= a.position.y
  );
}

export function canPlaceBuilding(
  state: GameState,
  catalog: BuildingCatalogEntry,
  position: GridPosition,
): { ok: boolean; reason?: "outOfBounds" | "collision" | "insufficientFunds" | "populationGate" | "levelGate" } {
  if (
    position.x < 0 ||
    position.y < 0 ||
    position.x + catalog.footprint.width > state.town.gridWidth ||
    position.y + catalog.footprint.height > state.town.gridHeight
  ) {
    return { ok: false, reason: "outOfBounds" };
  }

  const candidate = { position, footprint: catalog.footprint };
  for (const b of state.town.buildings) {
    if (overlaps(candidate, b)) return { ok: false, reason: "collision" };
  }

  if (state.economy.population < catalog.requiresPopulation) return { ok: false, reason: "populationGate" };
  if (state.economy.level < catalog.requiresLevel) return { ok: false, reason: "levelGate" };
  if (state.economy.coins < catalog.costCoins || !hasAll(state.inventory, catalog.costMaterials)) {
    return { ok: false, reason: "insufficientFunds" };
  }

  return { ok: true };
}

export function placeBuilding(
  state: GameState,
  catalog: BuildingCatalogEntry,
  position: GridPosition,
  id: string,
  now: number,
): { state: GameState; placed: boolean; reason?: string } {
  const check = canPlaceBuilding(state, catalog, position);
  if (!check.ok) return { state, placed: false, reason: check.reason };

  const building: PlacedBuilding = {
    id,
    buildingTypeId: catalog.buildingTypeId,
    position,
    footprint: catalog.footprint,
    rotation: 0,
    buildStartedAt: now,
    buildReadyAt: now + catalog.buildTimeMs,
  };

  return {
    state: {
      ...state,
      economy: { ...state.economy, coins: state.economy.coins - catalog.costCoins },
      inventory: removeAll(state.inventory, catalog.costMaterials),
      town: { ...state.town, buildings: [...state.town.buildings, building] },
    },
    placed: true,
  };
}

/** Resolves any building whose construction has finished: adds population and/or charm from the catalog and clears its build timestamps. */
export function tickTown(
  state: GameState,
  catalogByType: Record<BuildingTypeId, BuildingCatalogEntry>,
  now: number,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let population = state.economy.population;
  let charmScore = state.town.charmScore;

  const buildings = state.town.buildings.map((b) => {
    if (b.buildReadyAt === null || !isReady(b.buildReadyAt, now)) return b;
    const catalog = catalogByType[b.buildingTypeId];
    if (catalog) {
      population += catalog.populationReward;
      charmScore += catalog.charmValue;
    }
    events.push({ type: "buildingCompleted", buildingId: b.id, buildingTypeId: b.buildingTypeId, at: b.buildReadyAt });
    return { ...b, buildStartedAt: null, buildReadyAt: null };
  });

  return {
    state: {
      ...state,
      economy: { ...state.economy, population, populationCap: state.economy.populationCap },
      town: { ...state.town, buildings, charmScore },
    },
    events,
  };
}

/** Small daily coin bonus derived from the town's total charm score. Applied once per local day by dailies.ts's rollover logic. */
export function dailyCharmBonusCoins(charmScore: number): number {
  return Math.round(charmScore * 2);
}
