/**
 * Orders: the 6-slot order board. Orders are generated ONLY from goods the
 * player can actually produce at their current level - the game must never
 * offer an order it is impossible to fulfil. Pays coins, xp, and 0-2
 * reputation stars. A completed slot refills after ~3 minutes. Reroll
 * costs 1 cash.
 */

import type { GameEvent, GameState, GoodId, OrderRequirement, OrderSlot, OrdersState } from "./types";
import type { RngState } from "./rng";
import { nextInt, pickWeighted } from "./rng";
import { hasAll, removeAll } from "./economy";
import { MINUTE_MS, isReady } from "./time";

export const ORDER_BOARD_SIZE = 6;
export const ORDER_REFILL_DELAY_MS = 3 * MINUTE_MS;
export const ORDER_REROLL_COST_CASH = 1;

export interface OrderableGood {
  goodId: GoodId;
  unlockLevel: number;
  /** Base coin value per unit; used to scale order rewards fairly across cheap and expensive goods. */
  baseValue: number;
}

export function createEmptyOrderBoard(): OrdersState {
  const slots: OrderSlot[] = [];
  for (let i = 0; i < ORDER_BOARD_SIZE; i++) {
    slots.push({ id: `order-${i}`, order: null, refillAt: 0 });
  }
  return { slots };
}

/** Generates a random order using only goods the player is currently able to produce (unlockLevel <= playerLevel). */
export function generateOrder(
  rng: RngState,
  availableGoods: OrderableGood[],
  playerLevel: number,
): OrderSlot["order"] {
  const eligible = availableGoods.filter((g) => g.unlockLevel <= playerLevel);
  if (eligible.length === 0) {
    throw new Error("generateOrder: no orderable goods available at this level - orders must never be impossible");
  }

  const requirementCount = nextInt(rng, 1, Math.min(3, eligible.length));
  const chosen: OrderableGood[] = [];
  const pool = [...eligible];
  for (let i = 0; i < requirementCount && pool.length > 0; i++) {
    const idx = nextInt(rng, 0, pool.length - 1);
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
  }

  const requirements: OrderRequirement[] = chosen.map((g) => ({
    goodId: g.goodId,
    quantity: nextInt(rng, 2, 8),
  }));

  const totalValue = requirements.reduce((sum, r) => {
    const good = eligible.find((g) => g.goodId === r.goodId)!;
    return sum + good.baseValue * r.quantity;
  }, 0);

  const rewardCoins = Math.round(totalValue * 1.6 + playerLevel * 4);
  const rewardXp = Math.round(totalValue * 0.4 + playerLevel * 2);
  const rewardReputationStars = pickWeighted(rng, [0, 1, 2], [5, 4, 1]);

  return { requirements, rewardCoins, rewardXp, rewardReputationStars };
}

export function tickOrders(
  state: GameState,
  rng: RngState,
  availableGoods: OrderableGood[],
  now: number,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const slots = state.orders.slots.map((slot) => {
    if (slot.order !== null) return slot;
    if (slot.refillAt === null || !isReady(slot.refillAt, now)) return slot;
    const order = generateOrder(rng, availableGoods, state.economy.level);
    events.push({ type: "orderRefilled", slotId: slot.id, at: now });
    return { ...slot, order, refillAt: null };
  });
  return { state: { ...state, orders: { slots } }, events };
}

export function fulfillOrder(
  state: GameState,
  slotId: string,
  now: number,
): { state: GameState; fulfilled: boolean; reason?: "missingGoods" | "empty" } {
  const slot = state.orders.slots.find((s) => s.id === slotId);
  if (!slot || !slot.order) return { state, fulfilled: false, reason: "empty" };

  const requiredBag: Record<string, number> = {};
  for (const req of slot.order.requirements) requiredBag[req.goodId] = req.quantity;
  if (!hasAll(state.inventory, requiredBag)) return { state, fulfilled: false, reason: "missingGoods" };

  const slots = state.orders.slots.map((s) =>
    s.id === slotId ? { ...s, order: null, refillAt: now + ORDER_REFILL_DELAY_MS } : s,
  );

  return {
    state: {
      ...state,
      inventory: removeAll(state.inventory, requiredBag),
      economy: {
        ...state.economy,
        coins: state.economy.coins + slot.order.rewardCoins,
        xp: state.economy.xp + slot.order.rewardXp,
        reputationStars: state.economy.reputationStars + slot.order.rewardReputationStars,
      },
      orders: { slots },
    },
    fulfilled: true,
  };
}

export function rerollOrder(
  state: GameState,
  rng: RngState,
  slotId: string,
  availableGoods: OrderableGood[],
): { state: GameState; rerolled: boolean; reason?: "insufficientCash" | "empty" } {
  const slot = state.orders.slots.find((s) => s.id === slotId);
  if (!slot || !slot.order) return { state, rerolled: false, reason: "empty" };
  if (state.economy.cash < ORDER_REROLL_COST_CASH) return { state, rerolled: false, reason: "insufficientCash" };

  const order = generateOrder(rng, availableGoods, state.economy.level);
  const slots = state.orders.slots.map((s) => (s.id === slotId ? { ...s, order } : s));

  return {
    state: {
      ...state,
      economy: { ...state.economy, cash: state.economy.cash - ORDER_REROLL_COST_CASH },
      orders: { slots },
    },
    rerolled: true,
  };
}

