/**
 * Fields: plantable plots. Starts at 6 plots, buyable up to a cap of 60
 * with an escalating coin cost. Crops NEVER wither - a ready harvest just
 * waits for the player, exactly like every other timer in this game.
 */

import type {
  CropId,
  FieldsState,
  GameEvent,
  GameState,
  HarvestAllResult,
  PlantAllResult,
  Plot,
  ResourceBag,
} from "./types";
import { addGood, barnFreeSpace } from "./economy";
import { isReady } from "./time";

export const STARTING_PLOT_COUNT = 6;
export const MAX_PLOT_COUNT = 60;

/** Coin cost to unlock the plot at the given zero-based index (0..MAX_PLOT_COUNT-1). Escalates smoothly past the free starting plots. */
export function plotUnlockCost(index: number): number {
  if (index < STARTING_PLOT_COUNT) return 0;
  const n = index - STARTING_PLOT_COUNT + 1;
  return Math.round(150 * Math.pow(n, 1.35));
}

export function createInitialFields(): FieldsState {
  const plots: Plot[] = [];
  for (let i = 0; i < MAX_PLOT_COUNT; i++) {
    plots.push({
      id: `plot-${i}`,
      index: i,
      unlocked: i < STARTING_PLOT_COUNT,
      cropId: null,
      plantedAt: null,
      readyAt: null,
    });
  }
  return { plots, nextPlotCost: plotUnlockCost(STARTING_PLOT_COUNT) };
}

export function unlockNextPlot(state: GameState): GameState {
  const locked = state.fields.plots.find((p) => !p.unlocked);
  if (!locked) return state;
  const cost = plotUnlockCost(locked.index);
  if (state.economy.coins < cost) return state;

  const plots = state.fields.plots.map((p) => (p.id === locked.id ? { ...p, unlocked: true } : p));
  const nextLocked = plots.find((p) => !p.unlocked);
  return {
    ...state,
    economy: { ...state.economy, coins: state.economy.coins - cost },
    fields: {
      plots,
      nextPlotCost: nextLocked ? plotUnlockCost(nextLocked.index) : 0,
    },
  };
}

/** Advances all growing plots: any plot whose growTimeMs has elapsed becomes ready. Growth timers use readyAt absolute stamps, so this is a pure re-check against `now` - nothing to do here except the check happens at read time (isReady), so this function is a no-op placeholder kept for symmetry with the other systems' tick steps and for future growth-stage logic (e.g. staged sprite states). */
export function tickFields(state: GameState, _now: number): { state: GameState; events: GameEvent[] } {
  // Crops resolve lazily via isReady()/plot.readyAt - no mutation needed on
  // tick itself. Kept as an explicit step so tick.ts has one place per
  // subsystem and future staged-growth visuals have somewhere to live.
  return { state, events: [] };
}

export function plant(
  state: GameState,
  plotId: string,
  cropId: CropId,
  growTimeMs: number,
  seedCostCoins: number,
  now: number,
): GameState {
  const plot = state.fields.plots.find((p) => p.id === plotId);
  if (!plot || !plot.unlocked || plot.cropId !== null) return state;
  if (state.economy.energy < 1) return state;
  if (state.economy.coins < seedCostCoins) return state;

  const plots = state.fields.plots.map((p) =>
    p.id === plotId
      ? { ...p, cropId, plantedAt: now, readyAt: now + growTimeMs }
      : p,
  );

  return {
    ...state,
    economy: {
      ...state.economy,
      energy: state.economy.energy - 1,
      coins: state.economy.coins - seedCostCoins,
    },
    fields: { ...state.fields, plots },
  };
}

export interface CropCatalogEntry {
  cropId: CropId;
  growTimeMs: number;
  seedCostCoins: number;
  xpReward: number;
  coinReward: number;
}

/**
 * Plants the same crop on every empty unlocked plot, stopping honestly the
 * moment energy or coins run out rather than planting some plots and
 * silently skipping the rest with no explanation.
 */
export function plantAll(
  state: GameState,
  crop: CropCatalogEntry,
  now: number,
): { state: GameState; result: PlantAllResult } {
  const emptyPlots = state.fields.plots.filter((p) => p.unlocked && p.cropId === null);
  if (emptyPlots.length === 0) {
    return { state, result: { plantedPlotIds: [], skippedPlotIds: [], partial: false, reason: "noEmptyPlots" } };
  }

  let energy = state.economy.energy;
  let coins = state.economy.coins;
  const plantedPlotIds: string[] = [];
  const skippedPlotIds: string[] = [];
  let plots = state.fields.plots;
  let partial = false;
  let reason: PlantAllResult["reason"];

  for (const plot of emptyPlots) {
    if (energy < 1) {
      partial = true;
      reason = "insufficientEnergy";
      skippedPlotIds.push(plot.id);
      continue;
    }
    if (coins < crop.seedCostCoins) {
      partial = true;
      reason = "insufficientCoins";
      skippedPlotIds.push(plot.id);
      continue;
    }
    energy -= 1;
    coins -= crop.seedCostCoins;
    plantedPlotIds.push(plot.id);
    plots = plots.map((p) =>
      p.id === plot.id ? { ...p, cropId: crop.cropId, plantedAt: now, readyAt: now + crop.growTimeMs } : p,
    );
  }

  return {
    state: {
      ...state,
      economy: { ...state.economy, energy, coins },
      fields: { ...state.fields, plots },
    },
    result: { plantedPlotIds, skippedPlotIds, partial, reason },
  };
}

export function harvest(
  state: GameState,
  plotId: string,
  crop: CropCatalogEntry,
  now: number,
): { state: GameState; harvested: boolean; reason?: "notReady" | "barnFull" } {
  const plot = state.fields.plots.find((p) => p.id === plotId);
  if (!plot || plot.cropId === null || !isReady(plot.readyAt, now)) {
    return { state, harvested: false, reason: "notReady" };
  }
  if (barnFreeSpace(state) < 1) {
    return { state, harvested: false, reason: "barnFull" };
  }

  const plots = state.fields.plots.map((p) =>
    p.id === plotId ? { ...p, cropId: null, plantedAt: null, readyAt: null } : p,
  );
  const { economy: economyAfterXp } = addXpForHarvest(state, crop.xpReward);

  return {
    state: {
      ...state,
      economy: { ...economyAfterXp, coins: economyAfterXp.coins + crop.coinReward },
      inventory: addGood(state.inventory, crop.cropId, 1),
      fields: { ...state.fields, plots },
    },
    harvested: true,
  };
}

function addXpForHarvest(state: GameState, xpReward: number) {
  // Kept intentionally simple (no level-up rollover here) - the caller in
  // tick.ts/the app layer is expected to route harvest xp through
  // economy.addXp() for level-up events. This local helper exists only so
  // fields.ts stays self-contained for direct unit testing of harvest().
  return { economy: { ...state.economy, xp: state.economy.xp + xpReward } };
}

/**
 * Harvests every ready plot for whatever crop is planted on it, stopping
 * the moment the barn fills and reporting that honestly rather than
 * dropping goods on the floor or continuing to "harvest" into nothing.
 */
export function harvestAll(
  state: GameState,
  catalog: Record<CropId, CropCatalogEntry>,
  now: number,
): { state: GameState; result: HarvestAllResult } {
  const readyPlots = state.fields.plots.filter((p) => p.cropId !== null && isReady(p.readyAt, now));

  let plots = state.fields.plots;
  let inventory = state.inventory;
  let economy = state.economy;
  const goodsGained: ResourceBag = {};
  const harvestedPlotIds: string[] = [];
  let xpGained = 0;
  let coinsGained = 0;
  let partial = false;

  for (const plot of readyPlots) {
    const crop = catalog[plot.cropId as CropId];
    if (!crop) continue;
    if (barnFreeSpace({ inventory, barn: state.barn }) < 1) {
      partial = true;
      break;
    }
    plots = plots.map((p) => (p.id === plot.id ? { ...p, cropId: null, plantedAt: null, readyAt: null } : p));
    inventory = addGood(inventory, crop.cropId, 1);
    goodsGained[crop.cropId] = (goodsGained[crop.cropId] ?? 0) + 1;
    xpGained += crop.xpReward;
    coinsGained += crop.coinReward;
    economy = { ...economy, xp: economy.xp + crop.xpReward, coins: economy.coins + crop.coinReward };
    harvestedPlotIds.push(plot.id);
  }

  return {
    state: { ...state, fields: { ...state.fields, plots }, inventory, economy },
    result: {
      harvestedPlotIds,
      goodsGained,
      xpGained,
      coinsGained,
      partial,
      reason: partial ? "barnFull" : undefined,
    },
  };
}
