/**
 * Public types for the local version history feature.
 *
 * See history-store.ts for the HistoryStore class that implements this
 * surface, and index.ts for the barrel export the rest of the app
 * (services orchestration wiring, IPC handlers, the future history-panel
 * UI) should import from.
 */

/** Whether local history is usable on this machine right now, and why not
 * when it isn't. Every entry point that could be blocked by a missing
 * `git` reports through this shape rather than throwing, so the caller
 * can show an honest "history unavailable" state instead of a crash or a
 * silent no-op. */
export interface HistoryAvailability {
  available: boolean;
  /** Present when `available` is false. Human-readable, safe to show in
   * the UI verbatim (never includes a path outside the app's own data
   * directory or any secret). */
  reason?: string;
  /** The `git --version` output, when available is true. */
  gitVersion?: string;
}

/** One record to snapshot into the history repository. `recordPath` is a
 * relative path (forward slashes, no `..` segments, no drive letter)
 * identifying what this snapshot is a revision of — e.g.
 * "saves/riverside-farm.json" or "settings.json". It becomes the file
 * path inside the isolated history repository, distinct from wherever the
 * live file actually lives. */
export interface HistorySnapshotInput {
  recordPath: string;
  /** Full content of the record at this point in time (not a diff). */
  content: string | Buffer;
  /** Commit message naming WHAT changed, e.g. "Demolished the bakery" or
   * "Renamed the farm to Riverside Hollow". Never a generic "Updated" —
   * see history-store.ts's message validation for why. */
  message: string;
  /** A short machine-readable category for filtering, e.g. "save",
   * "settings", "demolish", "restore". Free text lands in the commit
   * trailer and is included in every listRevisions() result. */
  action?: string;
}

/** Result of attempting to record a snapshot. `committed: false` is not
 * an error: it means the content was byte-identical to the current
 * revision, so nothing was recorded (an unchanged state records nothing,
 * so the panel stays a list of real events) — or that history is
 * unavailable, or that the underlying git command failed. Check `reason`
 * to tell those apart. Callers must never treat committed:false as fatal
 * to whatever operation triggered the snapshot attempt. */
export interface CommitResult {
  committed: boolean;
  commitHash?: string;
  /** Machine-checkable reason code, present whenever committed is false. */
  reason?: 'no-changes' | 'history-unavailable' | 'git-error' | 'invalid-input';
  /** Human-readable detail, safe to log. */
  detail?: string;
}

/** One revision of one or more records, as returned by listRevisions(). */
export interface Revision {
  hash: string;
  shortHash: string;
  /** ISO 8601 commit date/time, in the machine's local offset as git
   * recorded it. */
  date: string;
  /** The action tag supplied at commit time, if any. */
  action?: string;
  /** The commit message's first line — the human-facing summary, e.g.
   * "Demolished the bakery". */
  message: string;
  /** Any labels attached to this revision via labelRevision(). */
  labels: string[];
  /** Record paths this commit actually changed. */
  filesChanged: string[];
}

/** Result of diffing two revisions. */
export interface DiffResult {
  fromHash: string;
  toHash: string;
  /** Unified diff text, exactly as `git diff` produced it. Empty string
   * when the two revisions are identical for the requested scope. */
  patch: string;
  filesChanged: string[];
}

/** An explicit retention policy for prune(). At least one of keepLatest /
 * keepSince must be supplied — prune() refuses to run with no bound at
 * all, since an unbounded policy is indistinguishable from "delete
 * everything" and that must never happen by omission. */
export interface RetentionPolicy {
  /** Keep at most this many most-recent revisions overall. */
  keepLatest?: number;
  /** Keep every revision at or after this date; discard eligible
   * revisions older than it. */
  keepSince?: Date;
  /** When true (the default), a labeled revision is always kept
   * regardless of keepLatest/keepSince. Set to false only when the
   * caller has already confirmed with the user that labeled revisions
   * may also be pruned. */
  neverPruneLabeled?: boolean;
}

export interface PruneResult {
  /** True when the prune actually ran and (possibly) removed revisions.
   * False when it was refused (see reason) or history is unavailable. */
  performed: boolean;
  prunedCount: number;
  keptCount: number;
  reason?: string;
}

export interface ExportOptions {
  /** Record paths to omit entirely from the export (e.g. anything that
   * might carry a secret, or a record the caller has separately decided
   * is too large/sensitive to include). Matched by exact recordPath. */
  redactPaths?: string[];
  /** 'json' (default): one JSON document containing every revision's
   * metadata and, for non-redacted records, their content at each
   * revision. 'text': a human-readable changelog-style rendering with no
   * raw file content, just messages/dates/actions/labels — the safer
   * default when the export's destination is uncertain. */
  format?: 'json' | 'text';
}

/** Everything a caller needs to know about a single tracked record's
 * current state, without listing full history. */
export interface RecordSummary {
  recordPath: string;
  latestHash?: string;
  latestDate?: string;
  revisionCount: number;
}
