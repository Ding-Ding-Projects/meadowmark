/**
 * Toy locks + the unlock ladder: public entry point for this subsystem.
 *
 * `createLocksSubsystem` is the one thing the orchestrator needs to call.
 * It owns its own persistence (two JsonStore-backed files under the
 * app's data directory) and wires the lock service and the ladder
 * service together internally -- the only external dependency is a
 * `TotpVerifier`, supplied by whichever lane owns the authenticator
 * service.
 *
 * Everything this subsystem does is JUST FOR FUN. See recovery.ts's
 * `TOY_LOCK_DISCLAIMER` for the exact wording every result carries, and
 * ladder/types.ts for the five rules that keep the unlock ladder from
 * becoming a second, weaker password.
 */

import { JsonStore } from '../../store';
import { LockService, emptyLockRegistry, LOCK_REGISTRY_SCHEMA_VERSION, type LockRegistryFile } from './lock-service';
import { LadderService } from './ladder/ladder-service';
import { SkipBudget, emptySkipBudget, SKIP_BUDGET_SCHEMA_VERSION, type SkipBudgetFile } from './ladder/skip-budget';
import type { TotpVerifier } from './types';

export interface LocksSubsystemOptions {
  totp: TotpVerifier;
}

export interface LocksSubsystem {
  locks: LockService;
  ladder: LadderService;
}

export function createLocksSubsystem(options: LocksSubsystemOptions): LocksSubsystem {
  const registryStore = new JsonStore<LockRegistryFile>({
    fileName: 'toy-locks.json',
    schemaVersion: LOCK_REGISTRY_SCHEMA_VERSION,
    defaultValue: emptyLockRegistry,
  });

  const skipBudgetStore = new JsonStore<SkipBudgetFile>({
    fileName: 'ladder-skip-budget.json',
    schemaVersion: SKIP_BUDGET_SCHEMA_VERSION,
    defaultValue: emptySkipBudget,
  });

  const locks = new LockService(registryStore, options.totp);
  const ladder = new LadderService(locks, new SkipBudget(skipBudgetStore));

  return { locks, ladder };
}

// ---- re-exports for the orchestrator's IPC wiring and type-checking ----

export { LockService } from './lock-service';
export { LadderService } from './ladder/ladder-service';
export { TOY_LOCK_DISCLAIMER, getRecoveryInfo, type RecoveryInfo } from './recovery';
export { searchLocks, partitionKnownIds } from './search';
export { hashPassword, verifyPassword, type PasswordHash } from './password';
export {
  ATTEMPTS_BEFORE_LOCKOUT,
  computeLockoutDurationMs,
} from './lockout';
export type { LockoutController, LockoutSnapshot } from './lockout-controller';
export type {
  LockTarget,
  LockMethod,
  UnlockDuration,
  LockoutState,
  LockRecord,
  LockSummary,
  NewCredential,
  UnlockInput,
  UnlockFailureReason,
  UnlockResult,
  UnlockResultOk,
  UnlockResultFail,
  TotpVerifier,
} from './types';

export { getStartingRung } from './ladder/types';
export type {
  LadderRung,
  LadderAvailability,
  LadderUnavailableReason,
  LadderStepResult,
  LadderChallengeResult,
} from './ladder/types';
export { MAX_LADDER_SKIPS_PER_HOUR } from './ladder/skip-budget';
export type { DimSumChallengeView, DimSumChoice } from './ladder/dim-sum-challenge';
export { DIM_SUM_MAX_WRONG } from './ladder/dim-sum-challenge';
export type {
  ArithmeticChallengeView,
  ArithmeticProblemView,
  ArithmeticAnswerInput,
} from './ladder/arithmetic-challenge';
export { ARITHMETIC_PROBLEM_COUNT } from './ladder/arithmetic-challenge';
export type { WhackRoundView, MoleScheduleEntry, MoleHitOutcome } from './ladder/whack-a-mole-challenge';
export { WHACK_CELL_COUNT, WHACK_ROUND_DURATION_MS, WHACK_PASS_COUNT } from './ladder/whack-a-mole-challenge';
