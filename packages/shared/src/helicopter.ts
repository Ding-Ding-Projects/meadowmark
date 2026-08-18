/**
 * Helicopter: 2 small fast orders every ~30 minutes paying coins plus
 * reputation. A filled reputation bar opens a chest containing cash,
 * boosters, and animal cards.
 */

import type { GameEvent, GameState, GoodId, HelicopterOrder, HelicopterState, OrderRequirement } from "./types.js";
import type { RngState } from "./rng.js";
import { nextInt } from "./rng.js";
import { hasAll, removeAll } from "./economy.js";
import { MINUTE_MS, isReady } from "./time.js";

export const HELICOPTER_ORDER_COUNT = 2;
export const HELICOPTER_REFILL_DELAY_MS = 30 * MINUTE_MS;
export const HELICOPTER_REPUTATION_BAR_CAP = 10;

export interface HeliOrderableGood {
  goodId: GoodId;
  unlockLevel: number;
  baseValue: number;
}

export function createEmptyHelicopter(): HelicopterState {
  const orders: HelicopterOrder[] = [];
  for (let i = 0; i < HELICOPTER_ORDER_COUNT; i++) {
    orders.push({ id: `heli-${i}`, requirements: [], rewardCoins: 0, rewardReputationStars: 1, refillAt: 0 });
  }
  return { orders, reputationBar: 0, reputationBarCap: HELICOPTER_REPUTATION_BAR_CAP, chestReady: false };
}

export function generateHeliOrder(rng: RngState, availableGoods: HeliOrderableGood[], playerLevel: number): HelicopterOrder["requirements"] {
  const eligible = availableGoods.filter((g) => g.unlockLevel <= playerLevel);
  if (eligible.length === 0) throw new Error("generateHeliOrder: no orderable goods at this level");
  const goodIndex = nextInt(rng, 0, eligible.length - 1);
  const good = eligible[goodIndex];
  if (good === undefined) {
    // Cannot actually happen: goodIndex is bounded to [0, eligible.length - 1]
    // by construction, and eligible was just checked non-empty above.
    throw new Error(`generateHeliOrder: internal error - index ${goodIndex} out of bounds for eligible goods`);
  }
  const requirements: OrderRequirement[] = [{ goodId: good.goodId, quantity: nextInt(rng, 1, 4) }];
  return requirements;
}

export function tickHelicopter(
  state: GameState,
  rng: RngState,
  availableGoods: HeliOrderableGood[],
  now: number,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const orders = state.helicopter.orders.map((order) => {
    if (order.requirements.length > 0) return order;
    if (order.refillAt === null || !isReady(order.refillAt, now)) return order;
    const requirements = generateHeliOrder(rng, availableGoods, state.economy.level);
    const totalValue = requirements.reduce((sum, r) => {
      const good = availableGoods.find((g) => g.goodId === r.goodId)!;
      return sum + good.baseValue * r.quantity;
    }, 0);
    events.push({ type: "helicopterOrderRefilled", orderId: order.id, at: now });
    return {
      ...order,
      requirements,
      rewardCoins: Math.round(totalValue * 1.4 + state.economy.level * 3),
      rewardReputationStars: 1,
      refillAt: null,
    };
  });
  return { state: { ...state, helicopter: { ...state.helicopter, orders } }, events };
}

export function fulfillHeliOrder(
  state: GameState,
  orderId: string,
  now: number,
): { state: GameState; fulfilled: boolean; events: GameEvent[]; reason?: "missingGoods" | "empty" } {
  const order = state.helicopter.orders.find((o) => o.id === orderId);
  if (!order || order.requirements.length === 0) return { state, fulfilled: false, events: [], reason: "empty" };

  const bag: Record<string, number> = {};
  for (const r of order.requirements) bag[r.goodId] = r.quantity;
  if (!hasAll(state.inventory, bag)) return { state, fulfilled: false, events: [], reason: "missingGoods" };

  const orders = state.helicopter.orders.map((o) =>
    o.id === orderId ? { ...o, requirements: [], refillAt: now + HELICOPTER_REFILL_DELAY_MS } : o,
  );

  let reputationBar = state.helicopter.reputationBar + order.rewardReputationStars;
  const events: GameEvent[] = [];
  let chestReady = state.helicopter.chestReady;
  if (reputationBar >= state.helicopter.reputationBarCap && !chestReady) {
    chestReady = true;
    events.push({ type: "helicopterChestReady", at: now });
  }

  return {
    state: {
      ...state,
      inventory: removeAll(state.inventory, bag),
      economy: { ...state.economy, coins: state.economy.coins + order.rewardCoins },
      helicopter: { ...state.helicopter, orders, reputationBar, chestReady },
    },
    fulfilled: true,
    events,
  };
}

export interface HeliChestReward {
  cash: number;
  boosterKinds: string[];
  animalCards: Record<string, number>;
}

export function openHeliChest(state: GameState, reward: HeliChestReward): GameState {
  if (!state.helicopter.chestReady) return state;
  return {
    ...state,
    economy: { ...state.economy, cash: state.economy.cash + reward.cash },
    helicopter: { ...state.helicopter, reputationBar: 0, chestReady: false },
  };
}
