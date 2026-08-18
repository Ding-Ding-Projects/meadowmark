/**
 * Helicopter: 2 small fast orders every ~30 minutes paying coins plus
 * reputation. A filled reputation bar opens a chest containing cash, a
 * real booster, and an expansion permit.
 */

import type { BoosterKind, GameEvent, GameState, GoodId, HeliChestReward, HelicopterOrder, HelicopterState, OrderRequirement } from "./types.js";
import type { RngState } from "./rng.js";
import { nextInt, pick } from "./rng.js";
import { hasAll, removeAll } from "./economy.js";
import { grantBooster } from "./boosters.js";
import { addAnimalCards } from "./zoo.js";
import { MINUTE_MS, isReady } from "./time.js";

/** Species whose cards a chest may drop. Mirrors balance/zoo.json; the tick cannot read files, so the list is compiled in and the balance validator keeps the two in step. */
const ZOO_CARD_SPECIES_IDS = ["lion", "zebra", "elephant", "flamingo", "otter", "seal", "penguin", "polar_bear", "arctic_fox", "tiger", "mountain_goat", "eagle"];

export const HELICOPTER_ORDER_COUNT = 2;
export const HELICOPTER_REFILL_DELAY_MS = 30 * MINUTE_MS;
export const HELICOPTER_REPUTATION_BAR_CAP = 10;

/** Booster kinds the reputation chest can hand out — every one of these is a real, applyable booster (see boosters.ts), never an invented category. */
export const HELI_CHEST_BOOSTER_KINDS: BoosterKind[] = [
  "growSpeed2x",
  "factorySpeed2x",
  "trainSpeed2x",
  "energyRefill",
  "orderReroll",
  "barnOverflow",
];
export const HELI_CHEST_CASH_MIN = 3;
export const HELI_CHEST_CASH_MAX = 6;
export const HELI_CHEST_EXPANSION_PERMITS = 1;

/** Rolls the reputation chest's contents. Called once, at the instant the bar fills — never re-rolled at open time, so what the UI shows before opening is exactly what the player receives. */
function rollHeliChestReward(rng: RngState): HeliChestReward {
  return {
    cash: nextInt(rng, HELI_CHEST_CASH_MIN, HELI_CHEST_CASH_MAX),
    boosterKind: pick(rng, HELI_CHEST_BOOSTER_KINDS),
    boosterQuantity: 1,
    expansionPermits: HELI_CHEST_EXPANSION_PERMITS,
      animalCards: { [pick(rng, ZOO_CARD_SPECIES_IDS)]: nextInt(rng, 1, 2) },
  };
}

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
  return { orders, reputationBar: 0, reputationBarCap: HELICOPTER_REPUTATION_BAR_CAP, chestReady: false, chestReward: null };
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
  rng: RngState,
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
  let chestReward = state.helicopter.chestReward;
  if (reputationBar >= state.helicopter.reputationBarCap && !chestReady) {
    chestReady = true;
    // Rolled once, right here, so the reward the UI shows before opening is
    // exactly what will be granted — never a guess invented at open time.
    chestReward = rollHeliChestReward(rng);
    events.push({ type: "helicopterChestReady", at: now });
  }

  return {
    state: {
      ...state,
      inventory: removeAll(state.inventory, bag),
      economy: { ...state.economy, coins: state.economy.coins + order.rewardCoins },
      helicopter: { ...state.helicopter, orders, reputationBar, chestReady, chestReward },
    },
    fulfilled: true,
    events,
  };
}

/** Grants the already-rolled chestReward (cash, a real booster, and an expansion permit) and resets the bar. A no-op if the chest isn't ready or (only possible on a corrupt/old save) its reward was never rolled. */
export function openHeliChest(state: GameState): GameState {
  const reward = state.helicopter.chestReward;
  if (!state.helicopter.chestReady || !reward) return state;
  const withCash: GameState = {
    ...state,
    economy: { ...state.economy, cash: state.economy.cash + reward.cash },
    expansions: { ...state.expansions, permits: state.expansions.permits + reward.expansionPermits },
    helicopter: { ...state.helicopter, reputationBar: 0, chestReady: false, chestReward: null },
  };
  let next: GameState = grantBooster(withCash, reward.boosterKind, reward.boosterQuantity);
  for (const [speciesId, count] of Object.entries(reward.animalCards)) {
    if (count > 0) next = addAnimalCards(next, speciesId, count);
  }
  return next;
}
