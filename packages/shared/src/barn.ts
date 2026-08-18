/**
 * Barn: shared storage capacity that caps the sum of every good the player
 * holds. Upgrades consume train materials (planks, bricks, nails, glass,
 * slabs, paint, screws) rather than coins alone, tying storage growth to
 * the train loop.
 */

import type { BarnState, GameState, ResourceBag } from "./types";

export interface BarnUpgradeTier {
  level: number;
  capacity: number;
  costCoins: number;
  costMaterials: ResourceBag;
}

/** Barn upgrade table. Capacity grows steadily; material costs lean on later train materials at higher tiers. */
export const BARN_UPGRADE_TIERS: BarnUpgradeTier[] = [
  { level: 1, capacity: 60, costCoins: 0, costMaterials: {} },
  { level: 2, capacity: 90, costCoins: 500, costMaterials: { planks: 6, nails: 6 } },
  { level: 3, capacity: 130, costCoins: 1200, costMaterials: { planks: 10, nails: 10, bricks: 4 } },
  { level: 4, capacity: 180, costCoins: 2500, costMaterials: { bricks: 14, nails: 12, glass: 4 } },
  { level: 5, capacity: 240, costCoins: 4500, costMaterials: { bricks: 20, glass: 10, slabs: 6 } },
  { level: 6, capacity: 310, costCoins: 7500, costMaterials: { slabs: 14, glass: 12, paint: 6 } },
  { level: 7, capacity: 390, costCoins: 12000, costMaterials: { slabs: 20, paint: 12, screws: 10 } },
  { level: 8, capacity: 480, costCoins: 18000, costMaterials: { paint: 18, screws: 18, slabs: 20 } },
  { level: 9, capacity: 580, costCoins: 26000, costMaterials: { screws: 26, paint: 24, glass: 24 } },
  { level: 10, capacity: 700, costCoins: 36000, costMaterials: { screws: 36, slabs: 32, paint: 32 } },
];

export function nextBarnUpgrade(barn: BarnState): BarnUpgradeTier | null {
  return BARN_UPGRADE_TIERS.find((t) => t.level === barn.level + 1) ?? null;
}

export function canUpgradeBarn(state: Pick<GameState, "barn" | "economy" | "inventory">): boolean {
  const next = nextBarnUpgrade(state.barn);
  if (!next) return false;
  if (state.economy.coins < next.costCoins) return false;
  for (const goodId in next.costMaterials) {
    // costMaterials[goodId] always exists here since goodId came from its
    // own keys; the ?? 0 satisfies noUncheckedIndexedAccess's static
    // widening rather than covering a real missing-entry case.
    const required = next.costMaterials[goodId] ?? 0;
    if ((state.inventory[goodId] ?? 0) < required) return false;
  }
  return true;
}

export function upgradeBarn(state: GameState): GameState {
  const next = nextBarnUpgrade(state.barn);
  if (!next) return state;
  if (!canUpgradeBarn(state)) return state;

  const inventory = { ...state.inventory };
  for (const goodId in next.costMaterials) {
    const cost = next.costMaterials[goodId] ?? 0;
    inventory[goodId] = (inventory[goodId] ?? 0) - cost;
  }

  return {
    ...state,
    economy: { ...state.economy, coins: state.economy.coins - next.costCoins },
    inventory,
    barn: { level: next.level, capacity: next.capacity },
  };
}

