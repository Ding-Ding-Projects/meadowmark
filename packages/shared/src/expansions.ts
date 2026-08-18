/**
 * Expansions: ~40 land parcels, each costing escalating coins (5k, 12k,
 * 25k, ...) AND 2-6 expansion permits. Permits come from ship/helicopter
 * chests, never purchased.
 */

import type { ExpansionsState, GameState, ParcelState } from "./types";

export const EXPANSION_PARCEL_COUNT = 40;

/** Escalating coin cost for parcel at zero-based index. Starts at 5,000 and grows geometrically. */
export function parcelCoinCost(index: number): number {
  return Math.round(5000 * Math.pow(1.28, index));
}

/** Permit cost for parcel at zero-based index: rises from 2 to 6 across the run. */
export function parcelPermitCost(index: number): number {
  return Math.min(6, 2 + Math.floor(index / 8));
}

export function createInitialExpansions(): ExpansionsState {
  const parcels: ParcelState[] = [];
  for (let i = 0; i < EXPANSION_PARCEL_COUNT; i++) {
    parcels.push({ id: `parcel-${i}`, index: i, unlocked: i === 0 });
  }
  return { parcels, permits: 0 };
}

export function unlockNextParcel(state: GameState): { state: GameState; unlocked: boolean; reason?: "noneLeft" | "insufficientCoins" | "insufficientPermits" } {
  const locked = state.expansions.parcels.find((p) => !p.unlocked);
  if (!locked) return { state, unlocked: false, reason: "noneLeft" };

  const coinCost = parcelCoinCost(locked.index);
  const permitCost = parcelPermitCost(locked.index);
  if (state.economy.coins < coinCost) return { state, unlocked: false, reason: "insufficientCoins" };
  if (state.expansions.permits < permitCost) return { state, unlocked: false, reason: "insufficientPermits" };

  const parcels = state.expansions.parcels.map((p) => (p.id === locked.id ? { ...p, unlocked: true } : p));

  return {
    state: {
      ...state,
      economy: { ...state.economy, coins: state.economy.coins - coinCost },
      expansions: { parcels, permits: state.expansions.permits - permitCost },
    },
    unlocked: true,
  };
}
