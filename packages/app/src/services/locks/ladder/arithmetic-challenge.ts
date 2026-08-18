/**
 * Ladder rung 2: ten easy sums, single- and double-digit arithmetic,
 * nothing anybody needs paper for. ALL ten must be right, or the ladder
 * moves straight to whack-a-mole -- a single wrong sum fails the whole
 * batch, it is not a "try again" rung.
 */

import { randomInt, randomUUID } from 'node:crypto';

export const ARITHMETIC_CHALLENGE_TTL_MS = 90_000;
export const ARITHMETIC_PROBLEM_COUNT = 10;

type Operator = '+' | '-';

export interface ArithmeticProblemView {
  id: string;
  a: number;
  operator: Operator;
  b: number;
}

export interface ArithmeticChallengeView {
  nonce: string;
  problems: ArithmeticProblemView[];
  expiresAt: number;
}

export interface ArithmeticAnswerState {
  answers: Record<string, number>;
}

export interface ArithmeticAnswerInput {
  id: string;
  value: number;
}

function generateProblem(): { view: ArithmeticProblemView; answer: number } {
  const id = randomUUID();
  const useAddition = randomInt(2) === 0;
  if (useAddition) {
    const a = randomInt(1, 21); // 1..20
    const b = randomInt(1, 21);
    return { view: { id, a, operator: '+', b }, answer: a + b };
  }
  // Subtraction: keep the result non-negative so it stays "easy".
  const a = randomInt(1, 21);
  const b = randomInt(0, a + 1);
  return { view: { id, a, operator: '-', b }, answer: a - b };
}

export function generateArithmeticChallenge(nonce: string, now: number = Date.now()): {
  view: ArithmeticChallengeView;
  answerState: ArithmeticAnswerState;
} {
  const problems: ArithmeticProblemView[] = [];
  const answers: Record<string, number> = {};
  for (let i = 0; i < ARITHMETIC_PROBLEM_COUNT; i += 1) {
    const { view, answer } = generateProblem();
    problems.push(view);
    answers[view.id] = answer;
  }
  return {
    view: { nonce, problems, expiresAt: now + ARITHMETIC_CHALLENGE_TTL_MS },
    answerState: { answers },
  };
}

/** Every one of the ten problems must be present and correct. A missing
 * or extra id, or any single wrong value, fails the whole batch. */
export function gradeArithmeticAnswers(
  answerState: ArithmeticAnswerState,
  submitted: readonly ArithmeticAnswerInput[],
): boolean {
  const expectedIds = Object.keys(answerState.answers);
  if (submitted.length !== expectedIds.length) {
    return false;
  }
  const seen = new Set<string>();
  for (const entry of submitted) {
    if (seen.has(entry.id)) {
      return false; // duplicate id: not a legitimate full-batch submission
    }
    seen.add(entry.id);
    const expected = answerState.answers[entry.id];
    if (expected === undefined || expected !== entry.value) {
      return false;
    }
  }
  return expectedIds.every((id) => seen.has(id));
}
