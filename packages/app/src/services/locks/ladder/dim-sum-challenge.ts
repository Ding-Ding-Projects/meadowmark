/**
 * Ladder rung 1: a single dim-sum question, four choices.
 *
 * Generation and grading both happen here, on the trusted side. The
 * choice returned to the caller carries no correctness information --
 * the correct choice id is kept only in the challenge store, behind the
 * nonce, and is consumed (deleted) before grading, per
 * challenge-store.ts.
 */

import { randomInt } from 'node:crypto';
import { DIM_SUM_DISHES, dishById, type DimSumDish } from './dim-sum-bank';

export const DIM_SUM_CHALLENGE_TTL_MS = 60_000;
/** After this many wrong dishes (across possibly several questions), the
 * ladder moves to the arithmetic rung. */
export const DIM_SUM_MAX_WRONG = 5;

export interface DimSumChoice {
  id: string;
  english: string;
  cantonese: string;
  jyutping: string;
}

/** What the caller/UI receives: the prompt names one dish by its
 * Cantonese name and jyutping; the four choices are its English names,
 * shuffled, with no indication of which is correct. */
export interface DimSumChallengeView {
  nonce: string;
  promptCantonese: string;
  promptJyutping: string;
  choices: DimSumChoice[];
  expiresAt: number;
}

/** What is kept server-side behind the nonce. */
export interface DimSumAnswerState {
  correctChoiceId: string;
}

function pickDistinctRandom<T>(items: readonly T[], count: number, exclude?: T): T[] {
  const pool = exclude === undefined ? [...items] : items.filter((item) => item !== exclude);
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = randomInt(pool.length);
    picked.push(pool[index] as T);
    pool.splice(index, 1);
  }
  return picked;
}

function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/** Builds one question and its answer key. Callers store the answer key
 * in a ChallengeStore keyed by a fresh nonce and hand the view (without
 * the answer key) to the UI. */
export function generateDimSumChallenge(nonce: string, now: number = Date.now()): {
  view: DimSumChallengeView;
  answerState: DimSumAnswerState;
} {
  const [correct] = pickDistinctRandom<DimSumDish>(DIM_SUM_DISHES, 1);
  if (!correct) {
    throw new Error('Dim sum question bank is empty.');
  }
  const distractors = pickDistinctRandom<DimSumDish>(DIM_SUM_DISHES, 3, correct);
  const choices = shuffle([correct, ...distractors]).map((dish) => ({
    id: dish.id,
    english: dish.english,
    cantonese: dish.cantonese,
    jyutping: dish.jyutping,
  }));

  return {
    view: {
      nonce,
      promptCantonese: correct.cantonese,
      promptJyutping: correct.jyutping,
      choices,
      expiresAt: now + DIM_SUM_CHALLENGE_TTL_MS,
    },
    answerState: { correctChoiceId: correct.id },
  };
}

/** Grades a consumed answer state against the caller's chosen id. Purely
 * a comparison -- callers are responsible for having already consumed
 * the nonce from the challenge store before calling this, per
 * challenge-store.ts's single-use contract. */
export function gradeDimSumAnswer(answerState: DimSumAnswerState, chosenChoiceId: string): boolean {
  return answerState.correctChoiceId === chosenChoiceId && dishById(chosenChoiceId) !== undefined;
}
