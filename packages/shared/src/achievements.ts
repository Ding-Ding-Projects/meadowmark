/**
 * Achievements: ~40 tiered achievements tracking counters like harvests,
 * goods produced, orders filled, buildings placed, tiles dug, animals
 * hatched, and population, each paying cash + coins per tier crossed.
 * The actual ~40-entry catalog lives in balance/achievements.json; this
 * module is the generic tier-evaluation engine that catalog is read
 * through.
 */

import type { AchievementId, AchievementsState, GameEvent, GameState } from "./types.js";

export interface AchievementTier {
  threshold: number;
  rewardCoins: number;
  rewardCash: number;
}

export interface AchievementCatalogEntry {
  achievementId: AchievementId;
  /** Which counter this achievement tracks, e.g. "totalHarvests", "totalGoodsProduced", "ordersFulfilled", "buildingsPlaced", "tilesDug", "animalsHatched", "population". Counters are maintained by the app/UI layer as gameplay events occur and passed in via `counters` below. */
  counterKey: string;
  tiers: AchievementTier[];
}

export function createInitialAchievements(): AchievementsState {
  return { progress: {} };
}

/**
 * Given the current value of every tracked counter, advances every
 * achievement's tier as far as the counter allows, awarding the reward for
 * each newly crossed tier exactly once. Pure: returns new state + events.
 */
export function evaluateAchievements(
  state: GameState,
  catalog: AchievementCatalogEntry[],
  counters: Record<string, number>,
  now: number,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let coins = state.economy.coins;
  let cash = state.economy.cash;
  const progress = { ...state.achievements.progress };

  for (const entry of catalog) {
    const counterValue = counters[entry.counterKey] ?? 0;
    const current = progress[entry.achievementId] ?? { achievementId: entry.achievementId, tier: 0, progress: 0 };
    let tier = current.tier;

    // Read tiers[tier] once per iteration and let its own presence be the
    // loop condition - undefined means "no more tiers defined" (equivalent
    // to the old `tier < entry.tiers.length` check), so this is provably
    // safe rather than an assertion, and stops the compiler from having to
    // trust that two separate expressions agree about the same bound.
    while (true) {
      const reward = entry.tiers[tier];
      if (reward === undefined || counterValue < reward.threshold) break;
      coins += reward.rewardCoins;
      cash += reward.rewardCash;
      tier += 1;
      events.push({ type: "achievementTierUnlocked", achievementId: entry.achievementId, tier, at: now });
    }

    progress[entry.achievementId] = { achievementId: entry.achievementId, tier, progress: counterValue };
  }

  return {
    state: { ...state, economy: { ...state.economy, coins, cash }, achievements: { progress } },
    events,
  };
}
