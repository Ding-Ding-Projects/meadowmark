/**
 * Local version history — public entry point.
 *
 * Wiring note for whoever hooks this into main.ts/ipc.ts (not this
 * module's job — this lane owns only packages/app/src/services/history):
 *
 *   import { HistoryStore, defaultHistoryRepoDir } from './services/history';
 *   import { dataDir } from './store';
 *
 *   const historyStore = new HistoryStore(defaultHistoryRepoDir(dataDir()));
 *   await historyStore.init(); // optional — every method calls it lazily,
 *                               // but calling it once at startup lets you
 *                               // show an immediate "history unavailable"
 *                               // state if git isn't installed.
 *
 * Call `historyStore.commitSnapshot(...)` right after every successful
 * save, settings write, or destructive town edit. It never throws and
 * never blocks or fails the real operation — see history-store.ts's
 * module doc comment for the full contract.
 */

import path from 'node:path';
import { detectGit } from './git-cli';
import type { HistoryAvailability } from './types';

export { HistoryStore, HistoryUnavailableError, HistoryOperationError } from './history-store';
export type { HistoryStoreOptions } from './history-store';
export { sanitizeRecordPath } from './paths';
export type {
  HistoryAvailability,
  HistorySnapshotInput,
  CommitResult,
  Revision,
  DiffResult,
  RetentionPolicy,
  PruneResult,
  ExportOptions,
  RecordSummary,
} from './types';

/**
 * The conventional location for the history repository: a "history"
 * subdirectory of the app's data directory. Passing this to
 * `new HistoryStore(...)` keeps the isolated git repo safely inside
 * application data, never inside any folder the player manages
 * themselves (e.g. an exported-town folder).
 */
export function defaultHistoryRepoDir(appDataDir: string): string {
  return path.join(appDataDir, 'history');
}

/**
 * Quick, standalone check for whether `git` is usable at all, without
 * constructing a HistoryStore or touching any repository. Useful for a
 * settings/about screen that wants to show git availability before the
 * player has triggered any history-producing action.
 */
export async function checkGitAvailability(cwd: string = process.cwd()): Promise<HistoryAvailability> {
  const result = await detectGit(cwd);
  return result.available
    ? { available: true, gitVersion: result.version }
    : { available: false, reason: result.reason };
}
