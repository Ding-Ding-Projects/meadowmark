/**
 * Local version history — renderer-side bridge to the main process's
 * HistoryStore (packages/app/src/services/history), reached through
 * window.meadowmark.history. Mirrors the shape of settings/store.ts's
 * hostSettingsBridge(): typed loosely here (this package never imports
 * packages/app), resolved through `unknown` at the boundary.
 */

export interface HistoryAvailability {
  available: boolean;
  reason?: string;
  gitVersion?: string;
}

export interface Revision {
  hash: string;
  shortHash: string;
  date: string;
  action?: string;
  message: string;
  labels: string[];
  filesChanged: string[];
}

export interface RecordSummary {
  recordPath: string;
  latestHash?: string;
  latestDate?: string;
  revisionCount: number;
}

export interface DiffResult {
  fromHash: string;
  toHash: string;
  patch: string;
  filesChanged: string[];
}

export interface CommitResult {
  committed: boolean;
  commitHash?: string;
  reason?: string;
  detail?: string;
}

interface HistoryBridge {
  init: () => Promise<HistoryAvailability>;
  listRevisions: (options?: { recordPath?: string; limit?: number }) => Promise<Revision[]>;
  listRecords: () => Promise<RecordSummary[]>;
  diffRevisions: (fromHash: string, toHash: string, recordPath?: string) => Promise<DiffResult>;
  restoreRevision: (hash: string, recordPath: string) => Promise<{ content: string; commit: CommitResult }>;
  labelRevision: (hash: string, label: string) => Promise<void>;
  exportHistory: (options?: { redactPaths?: string[]; format?: "json" | "text" }) => Promise<string>;
}

function hostHistoryBridge(): HistoryBridge | null {
  const maybeWindow = window as unknown as { meadowmark?: { history?: HistoryBridge } };
  return maybeWindow.meadowmark?.history ?? null;
}

/** True whenever the app is running inside the Electron host with the
 * history bridge exposed. The browser/static fallback build has no main
 * process to keep a git-backed repository in, so the history panel shows
 * an honest "not available outside the app" state there instead. */
export function hasHistoryBridge(): boolean {
  return hostHistoryBridge() !== null;
}

export async function initHistory(): Promise<HistoryAvailability> {
  const bridge = hostHistoryBridge();
  if (!bridge) return { available: false, reason: "Local history is only available in the installed app." };
  try {
    return await bridge.init();
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function listRevisions(options?: { recordPath?: string; limit?: number }): Promise<Revision[]> {
  const bridge = hostHistoryBridge();
  if (!bridge) return [];
  return bridge.listRevisions(options);
}

export async function listRecords(): Promise<RecordSummary[]> {
  const bridge = hostHistoryBridge();
  if (!bridge) return [];
  return bridge.listRecords();
}

export async function diffRevisions(fromHash: string, toHash: string, recordPath?: string): Promise<DiffResult | null> {
  const bridge = hostHistoryBridge();
  if (!bridge) return null;
  return bridge.diffRevisions(fromHash, toHash, recordPath);
}

export async function restoreRevision(
  hash: string,
  recordPath: string,
): Promise<{ content: string; commit: CommitResult } | null> {
  const bridge = hostHistoryBridge();
  if (!bridge) return null;
  return bridge.restoreRevision(hash, recordPath);
}

export async function labelRevision(hash: string, label: string): Promise<boolean> {
  const bridge = hostHistoryBridge();
  if (!bridge) return false;
  await bridge.labelRevision(hash, label);
  return true;
}

export async function exportHistory(options?: { redactPaths?: string[]; format?: "json" | "text" }): Promise<string | null> {
  const bridge = hostHistoryBridge();
  if (!bridge) return null;
  return bridge.exportHistory(options);
}
