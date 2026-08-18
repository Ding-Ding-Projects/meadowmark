/**
 * Boosters: earned-only timed boosts. 2x grow, 2x factory speed, faster
 * train, an instant energy refill, a free order reroll, and a temporary
 * barn overflow allowance. All boosters are earned through play (chests,
 * achievements, dailies) - there is no purchase path anywhere in this
 * module or any other.
 */

import type { ActiveBooster, BoosterInventoryItem, BoosterKind, BoosterState, GameEvent, GameState } from "./types";
import { isReady } from "./time";

export const BOOSTER_DEFAULT_DURATIONS_MS: Record<BoosterKind, number> = {
  growSpeed2x: 30 * 60 * 1000,
  factorySpeed2x: 30 * 60 * 1000,
  trainSpeed2x: 60 * 60 * 1000,
  energyRefill: 0, // instant, not a timed effect
  orderReroll: 0, // instant, consumed on use
  barnOverflow: 60 * 60 * 1000,
};

export function createInitialBoosters(): BoosterState {
  return { active: [], inventory: [] };
}

export function grantBooster(state: GameState, kind: BoosterKind, quantity: number): GameState {
  const existing = state.boosters.inventory.find((b) => b.kind === kind);
  const inventory = existing
    ? state.boosters.inventory.map((b) => (b.kind === kind ? { ...b, quantity: b.quantity + quantity } : b))
    : [...state.boosters.inventory, { kind, quantity }];
  return { ...state, boosters: { ...state.boosters, inventory } };
}

/**
 * Activates one booster from inventory. Instant boosters (energyRefill,
 * orderReroll) are applied by the caller separately (economy.ts /
 * orders.ts own that logic); this function only manages the timed-effect
 * lifecycle and inventory bookkeeping common to all booster kinds.
 */
export function activateBooster(
  state: GameState,
  id: string,
  kind: BoosterKind,
  now: number,
): { state: GameState; activated: boolean; reason?: "none" } {
  const item = state.boosters.inventory.find((b) => b.kind === kind && b.quantity > 0);
  if (!item) return { state, activated: false, reason: "none" };

  const inventory = state.boosters.inventory
    .map((b) => (b.kind === kind ? { ...b, quantity: b.quantity - 1 } : b))
    .filter((b) => b.quantity > 0);

  const duration = BOOSTER_DEFAULT_DURATIONS_MS[kind];
  const active =
    duration > 0
      ? [...state.boosters.active, { id, kind, startedAt: now, expiresAt: now + duration } as ActiveBooster]
      : state.boosters.active;

  return { state: { ...state, boosters: { active, inventory } }, activated: true };
}

export function isBoosterActive(boosters: BoosterState, kind: BoosterKind, now: number): boolean {
  return boosters.active.some((b) => b.kind === kind && now < b.expiresAt);
}

/** Speed multiplier to apply to a timer duration for a given category, honoring any active booster. */
export function speedMultiplier(boosters: BoosterState, kind: "growSpeed2x" | "factorySpeed2x" | "trainSpeed2x", now: number): number {
  const active = boosters.active.some((b) => b.kind === kind && now < b.expiresAt);
  return active ? 0.5 : 1;
}

export function tickBoosters(state: GameState, now: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const active = state.boosters.active.filter((b) => {
    const expired = isReady(b.expiresAt, now);
    if (expired) events.push({ type: "boosterExpired", boosterId: b.id, kind: b.kind, at: b.expiresAt });
    return !expired;
  });
  return { state: { ...state, boosters: { ...state.boosters, active } }, events };
}

export { type BoosterInventoryItem };
