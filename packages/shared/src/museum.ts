/**
 * Museum: thematic exhibits of artifacts. Each artifact is first fully
 * assembled from 6 mine fragments (see mine.ts's ARTIFACT_FRAGMENTS_REQUIRED
 * / checkArtifactCompletion) and appears in state.mine.completedArtifacts;
 * donating it here moves it into a specific exhibit slot - each slot wants
 * one exact artifact id, not a player's free choice, so "which artifact
 * goes where" is fixed by the catalog rather than by the donation call.
 *
 * Completing every slot in an exhibit pays a one-time coins/cash reward
 * and grants a small PERMANENT bonus (crop yield, factory speed, order
 * payout, or zoo income) that stays in effect for the rest of the save -
 * see museumBonusTotal() for how a caller reads that back.
 */

import type { GameState, MuseumExhibitProgress, MuseumState } from "./types.js";

/** Player level at which the museum building unlocks (see town.ts's doc comment: "... Museum L30 ..."). */
export const MUSEUM_UNLOCK_LEVEL = 30;

export type MuseumBonusKind = "cropYieldBonus" | "factorySpeedBonus" | "orderRewardBonus" | "zooIncomeBonus";

export interface MuseumExhibitDef {
  exhibitId: string;
  /** The artifact ids (from mine.ts's ARTIFACT_IDS) this exhibit needs, exactly one donation each - order defines slot index. */
  artifactIds: string[];
  rewardCoins: number;
  rewardCash: number;
  bonusKind: MuseumBonusKind;
  /** Fractional bonus this exhibit grants once completed, e.g. 0.02 == +2%. Callers add this to 1 for a multiplier. */
  bonusValue: number;
}

export function createInitialMuseum(): MuseumState {
  return { unlocked: false, exhibits: [], donatedArtifactIds: [] };
}

export function maybeUnlockMuseum(state: GameState): GameState {
  if (state.museum.unlocked || state.economy.level < MUSEUM_UNLOCK_LEVEL) return state;
  return { ...state, museum: { ...state.museum, unlocked: true } };
}

export interface DonateResult {
  state: GameState;
  donated: boolean;
  /** True only on the exact donation that completed every slot in the exhibit (i.e. the reward/bonus was just granted). */
  exhibitCompleted: boolean;
  reason?:
    | "notUnlocked"
    | "unknownExhibit"
    | "artifactNotInExhibit"
    | "artifactAlreadyDonated"
    | "artifactNotOwned"
    | "exhibitAlreadyHasArtifact";
}

/**
 * Donates a completed artifact (state.mine.completedArtifacts) into the
 * named exhibit's matching slot. Fails cleanly (no state change) if the
 * museum isn't unlocked, the artifact isn't actually completed, was
 * already donated anywhere (an artifact can only ever be donated once,
 * to one exhibit), doesn't belong to this exhibit, or this exhibit
 * already holds it.
 */
export function donateArtifact(
  state: GameState,
  catalogByExhibit: Record<string, MuseumExhibitDef>,
  exhibitId: string,
  artifactId: string,
): DonateResult {
  if (!state.museum.unlocked) return { state, donated: false, exhibitCompleted: false, reason: "notUnlocked" };

  const def = catalogByExhibit[exhibitId];
  if (!def) return { state, donated: false, exhibitCompleted: false, reason: "unknownExhibit" };
  if (!def.artifactIds.includes(artifactId)) {
    return { state, donated: false, exhibitCompleted: false, reason: "artifactNotInExhibit" };
  }
  if (state.museum.donatedArtifactIds.includes(artifactId)) {
    return { state, donated: false, exhibitCompleted: false, reason: "artifactAlreadyDonated" };
  }
  if (!state.mine.completedArtifacts.includes(artifactId)) {
    return { state, donated: false, exhibitCompleted: false, reason: "artifactNotOwned" };
  }

  const existing = state.museum.exhibits.find((e) => e.exhibitId === exhibitId);
  if (existing?.donatedArtifactIds.includes(artifactId)) {
    return { state, donated: false, exhibitCompleted: false, reason: "exhibitAlreadyHasArtifact" };
  }

  const donatedArtifactIds = existing ? [...existing.donatedArtifactIds, artifactId] : [artifactId];
  const wasCompleted = existing?.completed ?? false;
  const nowCompleted = def.artifactIds.every((id) => donatedArtifactIds.includes(id));

  const progress: MuseumExhibitProgress = { exhibitId, donatedArtifactIds, completed: nowCompleted };
  const exhibits = existing
    ? state.museum.exhibits.map((e) => (e.exhibitId === exhibitId ? progress : e))
    : [...state.museum.exhibits, progress];

  let next: GameState = {
    ...state,
    museum: { ...state.museum, exhibits, donatedArtifactIds: [...state.museum.donatedArtifactIds, artifactId] },
  };

  const justCompleted = nowCompleted && !wasCompleted;
  if (justCompleted) {
    next = {
      ...next,
      economy: { ...next.economy, coins: next.economy.coins + def.rewardCoins, cash: next.economy.cash + def.rewardCash },
    };
  }

  return { state: next, donated: true, exhibitCompleted: justCompleted };
}

/**
 * Combined permanent bonus fraction for a given bonus kind, summed across
 * every completed exhibit that grants it. Callers add this to 1 for a
 * multiplier (e.g. `1 + museumBonusTotal(state, catalog, "cropYieldBonus")`).
 * Pure and RNG-free, so calling it from anywhere (including inside
 * tick()'s deterministic subsystems) never affects reproducibility.
 */
export function museumBonusTotal(state: GameState, catalog: MuseumExhibitDef[], kind: MuseumBonusKind): number {
  let total = 0;
  for (const def of catalog) {
    if (def.bonusKind !== kind) continue;
    const progress = state.museum.exhibits.find((e) => e.exhibitId === def.exhibitId);
    if (progress?.completed) total += def.bonusValue;
  }
  return total;
}
