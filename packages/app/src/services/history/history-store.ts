/**
 * Local, Git-backed version history for records the app owns (save
 * games, settings, and any other user-managed record a future lane wants
 * to version).
 *
 * The history repository is an ISOLATED git working tree that lives
 * inside the application data directory (the caller passes its path in;
 * see index.ts's defaultHistoryRepoDir helper). It is never a `.git`
 * inside a folder the player manages themselves — a player who exports a
 * town to a folder of their choosing must never find a hidden `.git`
 * sitting in it.
 *
 * History is APPEND-ONLY. restoreRevision() never rewrites or resets
 * history: it reads an old revision's content and commits it again as a
 * brand-new commit, so an undo can itself be undone by restoring back to
 * the revision that preceded it. prune() is the one operation that does
 * rewrite the underlying commit chain, and it exists specifically as an
 * explicit, caller-invoked retention/cleanup action — never triggered
 * automatically, and it always keeps every commit within the supplied
 * retention window (and, by default, every labeled commit) intact.
 *
 * commitSnapshot() must NEVER throw. A failed history write must never
 * fail the operation the user actually asked for (saving the game,
 * changing a setting, demolishing a building); it logs the failure to
 * the console and returns a structured CommitResult describing what
 * happened, and the caller carries on. Every other method here performs
 * an explicit, user-requested history action (browsing, diffing,
 * restoring, labeling, pruning, exporting) and may throw a descriptive
 * error, since the caller is already in a dedicated "look at history"
 * flow that can surface and react to a failure.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../../atomic-write';
import { detectGit, runGit, GitCommandError, GitUnavailableError } from './git-cli';
import { sanitizeRecordPath } from './paths';
import type {
  CommitResult,
  DiffResult,
  ExportOptions,
  HistoryAvailability,
  HistorySnapshotInput,
  PruneResult,
  RecordSummary,
  RetentionPolicy,
  Revision,
} from './types';

/** Thrown by read/administrative history methods (list, diff, label,
 * prune, export, restore) when history is not available on this machine.
 * commitSnapshot() never throws this — it reports unavailability via its
 * CommitResult instead, per this module's non-throwing-write contract. */
export class HistoryUnavailableError extends Error {
  constructor(public readonly reason: string) {
    super(`Local version history is unavailable: ${reason}`);
    this.name = 'HistoryUnavailableError';
  }
}

/** Thrown when an explicit history action (label, restore, prune,
 * export, diff) fails for a reason other than history being globally
 * unavailable — a bad revision hash, an invalid label, a git command
 * that exited non-zero. Carries the original detail in `message`. */
export class HistoryOperationError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'HistoryOperationError';
  }
}

/** Field/record separators chosen from the ASCII control range that can
 * never appear in ordinary text content, so they safely delimit git log
 * output without any risk of a commit message or file name containing
 * one by coincidence. */
const FIELD_SEP = '\x1f'; // unit separator
const RECORD_SEP = '\x1e'; // record separator

const LOG_FORMAT = `${RECORD_SEP}%H${FIELD_SEP}%h${FIELD_SEP}%cI${FIELD_SEP}%N${FIELD_SEP}%B${FIELD_SEP}`;

const ACTION_TRAILER_RE = /^Meadowmark-Action:\s*(.+)$/m;

/** Commit messages we refuse verbatim: generic placeholders that name
 * nothing about what actually changed. This cannot catch every
 * uninformative message a caller might pass, but it stops the most
 * common lazy defaults ("Updated", "Saved", ...) at the door, keeping
 * the promise that the history panel reads as a list of real events
 * rather than a wall of "Updated". */
const BANNED_GENERIC_MESSAGES = new Set([
  'updated',
  'update',
  'saved',
  'save',
  'change',
  'changed',
  'changes',
  'commit',
  'snapshot',
  'wip',
  'auto save',
  'autosave',
  '.',
]);

function validateMessage(message: string): string | null {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return 'message must be a non-empty string describing what changed.';
  }
  if (BANNED_GENERIC_MESSAGES.has(trimmed.toLowerCase())) {
    return `message "${trimmed}" is too generic to say what actually changed. Name the change instead, e.g. "Demolished the bakery".`;
  }
  return null;
}

function validateLabel(label: string): string | null {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return 'label must be a non-empty string.';
  }
  if (trimmed.includes('\n')) {
    return 'label must be a single line.';
  }
  if (trimmed.length > 200) {
    return 'label must be 200 characters or fewer.';
  }
  return null;
}

/**
 * Parses a git "raw" date (`--date=raw` / GIT_*_DATE format: unix epoch
 * seconds, a space, then a signed timezone offset, e.g. "1699999999
 * -0400") into epoch milliseconds. `new Date(...)` cannot parse this
 * format directly — its first token looks numeric but is not a valid
 * Date constructor input, and passing it through unparsed would make
 * every keepSince comparison silently wrong (either NaN, always false,
 * or always true depending on the runtime). We only need the absolute
 * instant for comparison, so the timezone offset itself is irrelevant:
 * the epoch-seconds field alone already identifies the exact instant.
 */
function parseGitRawDateMs(rawDate: string): number {
  const seconds = Number.parseInt(rawDate.trim().split(/\s+/)[0] ?? '', 10);
  return Number.isFinite(seconds) ? seconds * 1000 : Number.NaN;
}

function buildCommitMessage(message: string, action?: string): string {
  const subject = message.trim();
  if (!action) {
    return subject;
  }
  return `${subject}\n\nMeadowmark-Action: ${action.trim()}`;
}

function parseLogChunk(chunk: string): Revision | null {
  const trimmed = chunk.replace(/^\n+/, '');
  if (trimmed.length === 0) {
    return null;
  }

  const parts = trimmed.split(FIELD_SEP);
  const hash = parts[0] ?? '';
  const shortHash = parts[1] ?? '';
  const date = parts[2] ?? '';
  const notesRaw = parts[3] ?? '';
  const body = parts[4] ?? '';
  const filesBlob = parts.slice(5).join(FIELD_SEP);

  if (!hash) {
    return null;
  }

  const labels = notesRaw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const actionMatch = ACTION_TRAILER_RE.exec(body);
  const action = actionMatch ? actionMatch[1]?.trim() : undefined;
  const subjectLine = body.split('\n')[0]?.trim() ?? '';

  const filesChanged = filesBlob
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    hash,
    shortHash,
    date,
    action,
    message: subjectLine,
    labels,
    filesChanged,
  };
}

export interface HistoryStoreOptions {
  /** Branch name used when the repository is first created. Ignored on
   * an already-initialized repository (its existing branch is used as
   * found). Defaults to "main". */
  defaultBranch?: string;
}

export class HistoryStore {
  private readonly repoDir: string;
  private readonly defaultBranch: string;
  private availability: HistoryAvailability = {
    available: false,
    reason: 'init() has not run yet.',
  };
  private initialized = false;

  constructor(repoDir: string, options: HistoryStoreOptions = {}) {
    this.repoDir = repoDir;
    this.defaultBranch = options.defaultBranch ?? 'main';
  }

  /** Directory this store's isolated git repository lives in. */
  getRepoDir(): string {
    return this.repoDir;
  }

  /**
   * Idempotent setup: creates the repo directory if missing, detects
   * whether `git` is usable, and if so initializes the repository (only
   * if it doesn't already have a `.git`) with a stable local identity so
   * commits never depend on the machine's global git configuration
   * (which frequently isn't set at all on a fresh machine, and would
   * otherwise make every commit fail).
   *
   * Safe to call multiple times; later calls re-verify config rather
   * than re-initializing. Never throws: any failure is captured in the
   * returned/stored availability instead.
   */
  async init(): Promise<HistoryAvailability> {
    try {
      await fs.mkdir(this.repoDir, { recursive: true });
    } catch (err) {
      this.availability = {
        available: false,
        reason: `Could not create the history directory: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
      this.initialized = true;
      return this.availability;
    }

    const detection = await detectGit(this.repoDir);
    if (!detection.available) {
      this.availability = { available: false, reason: detection.reason };
      this.initialized = true;
      return this.availability;
    }

    const gitDirExists = await fs
      .stat(path.join(this.repoDir, '.git'))
      .then((stat) => stat.isDirectory())
      .catch(() => false);

    if (!gitDirExists) {
      try {
        await this.createRepo();
      } catch (err) {
        this.availability = {
          available: false,
          reason: `Failed to initialize the history repository: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
        this.initialized = true;
        return this.availability;
      }
    }

    try {
      await this.applyLocalConfig();
    } catch (err) {
      this.availability = {
        available: false,
        reason: `Failed to configure the history repository: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
      this.initialized = true;
      return this.availability;
    }

    this.availability = { available: true, gitVersion: detection.version };
    this.initialized = true;
    return this.availability;
  }

  /** Returns the last availability result computed by init(). Throws if
   * init() has never been called — every entry point in this class calls
   * init() lazily via ensureReady(), so this is mainly useful for a
   * caller (e.g. a settings screen) that wants to show status without
   * performing any history operation. */
  getAvailability(): HistoryAvailability {
    return this.availability;
  }

  private async createRepo(): Promise<void> {
    try {
      await runGit(this.repoDir, ['init', `--initial-branch=${this.defaultBranch}`]);
    } catch (err) {
      // Older git (< 2.28) doesn't understand --initial-branch. Fall back
      // to a plain init followed by pointing HEAD at our chosen branch
      // name before the first commit exists.
      if (err instanceof GitCommandError) {
        await runGit(this.repoDir, ['init']);
        await runGit(this.repoDir, ['symbolic-ref', 'HEAD', `refs/heads/${this.defaultBranch}`]);
        return;
      }
      throw err;
    }
  }

  private async applyLocalConfig(): Promise<void> {
    // A dedicated local identity: this repository never has a remote and
    // is never attributed to a real person, so we don't want it silently
    // depending on (or polluting) the machine's global git user.name /
    // user.email, which frequently isn't configured on a fresh machine
    // and would otherwise make every single commit fail.
    await runGit(this.repoDir, ['config', 'user.name', 'Meadowmark Local History']);
    await runGit(this.repoDir, ['config', 'user.email', 'local-history@meadowmark.invalid']);
    // Never sign commits here: this repo has no remote, nothing ever
    // reads its signatures, and the project's permanent no-signing
    // policy applies everywhere.
    await runGit(this.repoDir, ['config', 'commit.gpgsign', 'false']);
    await runGit(this.repoDir, ['config', 'tag.gpgsign', 'false']);
    // Keep snapshot bytes exactly what we wrote: no line-ending
    // rewriting, since a save/settings file's bytes are the actual
    // content being versioned, not source code.
    await runGit(this.repoDir, ['config', 'core.autocrlf', 'false']);
    await runGit(this.repoDir, ['config', 'core.safecrlf', 'false']);
    // Never leave HEAD detached silently or print advice noise into
    // stderr that we'd otherwise have to filter out of error reporting.
    await runGit(this.repoDir, ['config', 'advice.detachedHead', 'false']);
  }

  private async ensureReady(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private async resolveBranch(): Promise<string> {
    try {
      const { stdout } = await runGit(this.repoDir, ['symbolic-ref', '--short', 'HEAD']);
      return stdout.trim() || this.defaultBranch;
    } catch {
      return this.defaultBranch;
    }
  }

  /**
   * Records a snapshot of one record's full content. Writes the content
   * into the history repository's working tree via atomicWriteFile,
   * stages it, and commits only if the staged content actually differs
   * from HEAD — an unchanged state records nothing, so listRevisions()
   * stays a list of real events rather than a wall of no-op commits.
   *
   * NEVER THROWS. Every failure path — history unavailable, invalid
   * input, or an unexpected git error — is reported through the returned
   * CommitResult, and this method logs the failure to the console before
   * returning it. Callers must treat committed:false as informational,
   * never as a reason to fail whatever real operation (saving, editing,
   * demolishing) triggered the snapshot attempt.
   */
  async commitSnapshot(input: HistorySnapshotInput): Promise<CommitResult> {
    try {
      await this.ensureReady();

      if (!this.availability.available) {
        return {
          committed: false,
          reason: 'history-unavailable',
          detail: this.availability.reason,
        };
      }

      let sanitizedPath: string;
      try {
        sanitizedPath = sanitizeRecordPath(input.recordPath);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[history] rejected commitSnapshot: ${detail}`);
        return { committed: false, reason: 'invalid-input', detail };
      }

      const messageError = validateMessage(input.message);
      if (messageError) {
        console.error(`[history] rejected commitSnapshot: ${messageError}`);
        return { committed: false, reason: 'invalid-input', detail: messageError };
      }

      const absolutePath = path.join(this.repoDir, sanitizedPath);
      await atomicWriteFile(absolutePath, input.content);
      await runGit(this.repoDir, ['add', '--', sanitizedPath]);

      const hasChanges = await this.hasStagedChanges();
      if (!hasChanges) {
        // Undo the (no-op) stage so the index stays clean for the next
        // caller's diff --cached check, and report that nothing changed.
        await runGit(this.repoDir, ['reset', '--', sanitizedPath]).catch(() => {
          /* best-effort cleanup; harmless if it fails */
        });
        return { committed: false, reason: 'no-changes' };
      }

      const fullMessage = buildCommitMessage(input.message, input.action);
      await runGit(this.repoDir, ['commit', '-m', fullMessage]);
      const { stdout } = await runGit(this.repoDir, ['rev-parse', 'HEAD']);
      return { committed: true, commitHash: stdout.trim() };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[history] commitSnapshot failed, continuing without it: ${detail}`);
      return {
        committed: false,
        reason: err instanceof GitUnavailableError ? 'history-unavailable' : 'git-error',
        detail,
      };
    }
  }

  private async hasStagedChanges(): Promise<boolean> {
    try {
      await runGit(this.repoDir, ['diff', '--cached', '--quiet']);
      return false; // exit 0: no differences staged
    } catch (err) {
      if (err instanceof GitCommandError && err.code === 1) {
        return true; // exit 1: differences are staged
      }
      throw err;
    }
  }

  private assertAvailable(): void {
    if (!this.availability.available) {
      throw new HistoryUnavailableError(this.availability.reason ?? 'unknown reason');
    }
  }

  /**
   * Lists revisions, newest first. Pass `recordPath` to scope to one
   * record's history; pass `limit` to cap the count (default: all).
   * Returns an empty array (never throws) when the repository has no
   * commits yet, since "no history recorded so far" is a normal state,
   * not an error.
   */
  async listRevisions(options: { recordPath?: string; limit?: number } = {}): Promise<Revision[]> {
    await this.ensureReady();
    this.assertAvailable();

    const args = ['log', '--notes', '--name-only', '--date=iso-strict', `--pretty=format:${LOG_FORMAT}`];
    if (options.limit !== undefined) {
      args.push('-n', String(options.limit));
    }
    let sanitizedPath: string | undefined;
    if (options.recordPath !== undefined) {
      try {
        sanitizedPath = sanitizeRecordPath(options.recordPath);
      } catch (err) {
        throw new HistoryOperationError(
          err instanceof Error ? err.message : String(err),
          err,
        );
      }
      args.push('--', sanitizedPath);
    }

    let stdout: string;
    try {
      const result = await runGit(this.repoDir, args);
      stdout = result.stdout;
    } catch (err) {
      if (err instanceof GitCommandError && /does not have any commits yet/i.test(err.stderr)) {
        return [];
      }
      throw new HistoryOperationError(
        `Failed to list revisions: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    return stdout
      .split(RECORD_SEP)
      .map(parseLogChunk)
      .filter((rev): rev is Revision => rev !== null);
  }

  /** Summarizes every distinct record path ever committed, with each
   * one's latest revision and total revision count. Useful for a history
   * panel's top-level "which records have history" view. */
  async listRecords(): Promise<RecordSummary[]> {
    const revisions = await this.listRevisions();
    const summaries = new Map<string, RecordSummary>();

    // Oldest-affecting-first isn't needed here: listRevisions() is
    // newest-first, so the FIRST time we see a recordPath is its latest
    // revision, and we just keep counting after that.
    for (const revision of revisions) {
      for (const recordPath of revision.filesChanged) {
        const existing = summaries.get(recordPath);
        if (existing) {
          existing.revisionCount += 1;
        } else {
          summaries.set(recordPath, {
            recordPath,
            latestHash: revision.hash,
            latestDate: revision.date,
            revisionCount: 1,
          });
        }
      }
    }

    return Array.from(summaries.values()).sort((a, b) => a.recordPath.localeCompare(b.recordPath));
  }

  /**
   * Produces a unified diff between two revisions. When `recordPath` is
   * given, the diff is scoped to that one record; otherwise it covers
   * every record that changed between the two revisions.
   */
  async diffRevisions(fromHash: string, toHash: string, recordPath?: string): Promise<DiffResult> {
    await this.ensureReady();
    this.assertAvailable();

    let sanitizedPath: string | undefined;
    if (recordPath !== undefined) {
      try {
        sanitizedPath = sanitizeRecordPath(recordPath);
      } catch (err) {
        throw new HistoryOperationError(err instanceof Error ? err.message : String(err), err);
      }
    }

    const pathArgs = sanitizedPath !== undefined ? ['--', sanitizedPath] : [];

    try {
      const [{ stdout: patch }, { stdout: namesOut }] = await Promise.all([
        runGit(this.repoDir, ['diff', fromHash, toHash, ...pathArgs]),
        runGit(this.repoDir, ['diff', '--name-only', fromHash, toHash, ...pathArgs]),
      ]);

      const filesChanged = namesOut
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      return { fromHash, toHash, patch, filesChanged };
    } catch (err) {
      throw new HistoryOperationError(
        `Failed to diff ${fromHash}..${toHash}: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /**
   * Restores a record to the content it had at `hash`, writing that
   * content back into the history repository's working tree and
   * recording the restore as a NEW commit (never rewinding or resetting
   * history). Returns the restored content so the caller can also apply
   * it to the record's real, live location — this store only knows
   * about its own isolated repository, not where the live file actually
   * lives.
   *
   * If the record at `hash` is already byte-identical to the record's
   * current content, the underlying commitSnapshot() call reports
   * committed:false with reason "no-changes" (there is nothing to
   * restore to that isn't already the current state) rather than
   * creating a redundant commit.
   */
  async restoreRevision(
    hash: string,
    recordPath: string,
  ): Promise<{ content: string; commit: CommitResult }> {
    await this.ensureReady();
    this.assertAvailable();

    let sanitizedPath: string;
    try {
      sanitizedPath = sanitizeRecordPath(recordPath);
    } catch (err) {
      throw new HistoryOperationError(err instanceof Error ? err.message : String(err), err);
    }

    let content: string;
    let originalSubject = '';
    try {
      const { stdout } = await runGit(this.repoDir, ['show', `${hash}:${sanitizedPath}`]);
      content = stdout;
      const logResult = await runGit(this.repoDir, ['log', '-1', '--pretty=format:%s', hash]);
      originalSubject = logResult.stdout.trim();
    } catch (err) {
      throw new HistoryOperationError(
        `Failed to read "${sanitizedPath}" at revision ${hash}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err,
      );
    }

    const shortHash = hash.slice(0, 12);
    const message = originalSubject
      ? `Restored "${sanitizedPath}" to revision ${shortHash} ("${originalSubject}")`
      : `Restored "${sanitizedPath}" to revision ${shortHash}`;

    const commit = await this.commitSnapshot({
      recordPath: sanitizedPath,
      content,
      message,
      action: 'restore',
    });

    return { content, commit };
  }

  /**
   * Attaches a human-readable label to a revision (e.g. "Before the big
   * farmhouse remodel"). A revision may carry any number of labels.
   * Labeled revisions are, by default, exempt from prune() regardless of
   * age (see RetentionPolicy.neverPruneLabeled).
   */
  async labelRevision(hash: string, label: string): Promise<void> {
    await this.ensureReady();
    this.assertAvailable();

    const labelError = validateLabel(label);
    if (labelError) {
      throw new HistoryOperationError(labelError);
    }

    try {
      await runGit(this.repoDir, ['notes', 'append', '-m', label.trim(), hash]);
    } catch (err) {
      throw new HistoryOperationError(
        `Failed to label revision ${hash}: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /**
   * Applies an explicit retention policy, permanently removing revisions
   * outside it. This is the one operation in this store that rewrites
   * the underlying commit chain (see the module-level doc comment for
   * why that's still consistent with history being otherwise
   * append-only): every OTHER revision-producing action here — including
   * restoreRevision() — only ever adds a new commit and never deletes or
   * rewrites an existing one.
   *
   * Requires at least one of `keepLatest` or `keepSince`: a policy with
   * neither is indistinguishable from "delete everything", and that must
   * never happen by omission. Labeled revisions are kept regardless of
   * age unless the caller explicitly sets `neverPruneLabeled: false`.
   *
   * Rebuilds the kept commits into a fresh linear history preserving
   * each one's original tree, author, and commit timestamps, then moves
   * the branch ref to the new tip in one atomic ref update. If anything
   * fails before that ref update, the original history is left
   * completely untouched.
   */
  async prune(policy: RetentionPolicy): Promise<PruneResult> {
    await this.ensureReady();
    if (!this.availability.available) {
      return { performed: false, prunedCount: 0, keptCount: 0, reason: this.availability.reason };
    }

    if (policy.keepLatest === undefined && policy.keepSince === undefined) {
      return {
        performed: false,
        prunedCount: 0,
        keptCount: 0,
        reason: 'RetentionPolicy must specify keepLatest and/or keepSince.',
      };
    }
    if (policy.keepLatest !== undefined && policy.keepLatest < 0) {
      return {
        performed: false,
        prunedCount: 0,
        keptCount: 0,
        reason: 'keepLatest must be zero or greater.',
      };
    }

    const neverPruneLabeled = policy.neverPruneLabeled ?? true;

    let commits: Array<{
      hash: string;
      tree: string;
      authorName: string;
      authorEmail: string;
      authorDate: string;
      committerName: string;
      committerEmail: string;
      committerDate: string;
      message: string;
      notes: string;
    }>;

    try {
      commits = await this.readCommitsOldestFirst();
    } catch (err) {
      return {
        performed: false,
        prunedCount: 0,
        keptCount: 0,
        reason: `Failed to read history for pruning: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }

    if (commits.length === 0) {
      return { performed: true, prunedCount: 0, keptCount: 0, reason: 'no revisions recorded yet' };
    }

    const keptFlags = new Array<boolean>(commits.length).fill(false);

    if (policy.keepLatest !== undefined && policy.keepLatest > 0) {
      const start = Math.max(0, commits.length - policy.keepLatest);
      for (let i = start; i < commits.length; i += 1) {
        keptFlags[i] = true;
      }
    }

    if (policy.keepSince !== undefined) {
      const cutoff = policy.keepSince.getTime();
      commits.forEach((commit, i) => {
        if (parseGitRawDateMs(commit.committerDate) >= cutoff) {
          keptFlags[i] = true;
        }
      });
    }

    if (neverPruneLabeled) {
      commits.forEach((commit, i) => {
        if (commit.notes.trim().length > 0) {
          keptFlags[i] = true;
        }
      });
    }

    const keptCount = keptFlags.filter(Boolean).length;
    const prunedCount = commits.length - keptCount;

    if (prunedCount === 0) {
      return { performed: true, prunedCount: 0, keptCount, reason: 'nothing eligible for pruning' };
    }

    if (keptCount === 0) {
      return {
        performed: false,
        prunedCount: 0,
        keptCount: commits.length,
        reason: 'This retention policy would remove every revision; refusing to prune all history.',
      };
    }

    const branch = await this.resolveBranch();
    const hashMap = new Map<string, string>();
    let parent: string | undefined;

    try {
      for (const [i, commit] of commits.entries()) {
        if (!keptFlags[i]) {
          continue;
        }
        const args = ['commit-tree', commit.tree];
        if (parent) {
          args.push('-p', parent);
        }
        args.push('-m', commit.message);

        const { stdout } = await runGit(this.repoDir, args, {
          env: {
            GIT_AUTHOR_NAME: commit.authorName,
            GIT_AUTHOR_EMAIL: commit.authorEmail,
            GIT_AUTHOR_DATE: commit.authorDate,
            GIT_COMMITTER_NAME: commit.committerName,
            GIT_COMMITTER_EMAIL: commit.committerEmail,
            GIT_COMMITTER_DATE: commit.committerDate,
          },
        });
        const newHash = stdout.trim();
        hashMap.set(commit.hash, newHash);
        parent = newHash;
      }

      if (!parent) {
        return {
          performed: false,
          prunedCount: 0,
          keptCount: commits.length,
          reason: 'Rebuilding kept revisions produced no commits; refusing to update history.',
        };
      }

      // Only now do we touch the real branch ref, and only after every
      // kept commit was successfully rebuilt. If anything above threw,
      // we never reach this line and the original history is untouched.
      await runGit(this.repoDir, ['update-ref', `refs/heads/${branch}`, parent]);

      // Re-attach labels: every kept commit got a new hash, so any note
      // (label) on the old hash needs copying onto the new one or it
      // becomes unreachable.
      for (const commit of commits) {
        if (!commit.notes.trim()) {
          continue;
        }
        const newHash = hashMap.get(commit.hash);
        if (!newHash) {
          continue;
        }
        await runGit(this.repoDir, ['notes', 'add', '-f', '-m', commit.notes, newHash]).catch(
          () => {
            // Best-effort: the ref move already succeeded, which is the
            // part that matters most. A note that fails to re-attach is
            // logged and otherwise non-fatal to the prune itself.
            console.error(`[history] failed to re-attach label onto ${newHash} during prune`);
          },
        );
      }
    } catch (err) {
      return {
        performed: false,
        prunedCount: 0,
        keptCount: commits.length,
        reason: `Prune failed while rebuilding history; original history is untouched. ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }

    // Reclaiming disk space is best-effort and non-fatal: the history
    // itself has already been safely rewritten by this point regardless
    // of whether gc succeeds.
    await runGit(this.repoDir, ['reflog', 'expire', '--expire=now', '--all']).catch(() => {});
    await runGit(this.repoDir, ['gc', '--prune=now', '--quiet']).catch(() => {});

    return { performed: true, prunedCount, keptCount };
  }

  private async readCommitsOldestFirst(): Promise<
    Array<{
      hash: string;
      tree: string;
      authorName: string;
      authorEmail: string;
      authorDate: string;
      committerName: string;
      committerEmail: string;
      committerDate: string;
      message: string;
      notes: string;
    }>
  > {
    const format = [
      '%H',
      '%T',
      '%an',
      '%ae',
      '%ad',
      '%cn',
      '%ce',
      '%cd',
      '%N',
      '%B',
    ].join(FIELD_SEP);

    let stdout: string;
    try {
      const result = await runGit(this.repoDir, [
        'log',
        '--reverse',
        '--notes',
        '--date=raw',
        // No trailing FIELD_SEP here (unlike LOG_FORMAT above): this
        // query has no --name-only file list following each entry, so a
        // trailing separator would just leave a stray control character
        // glued onto the end of the parsed commit message.
        `--pretty=format:${RECORD_SEP}${format}`,
      ]);
      stdout = result.stdout;
    } catch (err) {
      if (err instanceof GitCommandError && /does not have any commits yet/i.test(err.stderr)) {
        return [];
      }
      throw err;
    }

    return stdout
      .split(RECORD_SEP)
      .map((chunk) => chunk.replace(/^\n+/, ''))
      .filter((chunk) => chunk.length > 0)
      .map((chunk) => {
        const parts = chunk.split(FIELD_SEP);
        return {
          hash: parts[0] ?? '',
          tree: parts[1] ?? '',
          authorName: parts[2] ?? '',
          authorEmail: parts[3] ?? '',
          authorDate: parts[4] ?? '',
          committerName: parts[5] ?? '',
          committerEmail: parts[6] ?? '',
          committerDate: parts[7] ?? '',
          notes: parts[8] ?? '',
          // Keep the FULL raw body here (subject + any trailer, e.g. the
          // "Meadowmark-Action:" line), not just the subject line: this
          // is fed straight back into `commit-tree -m` when rebuilding
          // kept commits during prune(), and truncating it to one line
          // would silently strip the action trailer from every commit
          // that survives a prune.
          message: parts.slice(9).join(FIELD_SEP).replace(/\n+$/, ''),
        };
      })
      .filter((commit) => commit.hash.length > 0);
  }

  /**
   * Produces a redacted export of the full history. `redactPaths` names
   * record paths to omit entirely from the export; every such omission
   * is recorded explicitly in the export (never silently dropped) so a
   * reader can see that something was intentionally left out rather than
   * concluding the record has no history.
   *
   * format: 'text' (the default) produces a human-readable changelog
   * with dates, actions, messages, and labels but no raw file content —
   * the safer choice when the export's destination isn't fully trusted.
   * format: 'json' additionally includes each non-redacted record's
   * content at each revision that touched it.
   */
  async exportHistory(options: ExportOptions = {}): Promise<string> {
    await this.ensureReady();
    this.assertAvailable();

    const redactPaths = new Set(options.redactPaths ?? []);
    const format = options.format ?? 'text';
    const revisions = await this.listRevisions();

    if (format === 'text') {
      const lines: string[] = [
        `Meadowmark local history export`,
        `Generated: ${new Date().toISOString()}`,
        redactPaths.size > 0
          ? `Redacted record paths (content omitted, metadata retained): ${Array.from(redactPaths).join(', ')}`
          : 'No record paths were redacted.',
        '',
      ];
      for (const revision of revisions) {
        const labelPart = revision.labels.length > 0 ? ` [labels: ${revision.labels.join(', ')}]` : '';
        const actionPart = revision.action ? ` (${revision.action})` : '';
        lines.push(`${revision.date}  ${revision.shortHash}  ${revision.message}${actionPart}${labelPart}`);
        for (const file of revision.filesChanged) {
          lines.push(`    - ${file}${redactPaths.has(file) ? ' [redacted]' : ''}`);
        }
      }
      return lines.join('\n');
    }

    const jsonRevisions = await Promise.all(
      revisions.map(async (revision) => {
        const files = await Promise.all(
          revision.filesChanged.map(async (filePath) => {
            if (redactPaths.has(filePath)) {
              return { path: filePath, redacted: true as const };
            }
            try {
              const { stdout } = await runGit(this.repoDir, [
                'show',
                `${revision.hash}:${filePath}`,
              ]);
              return { path: filePath, redacted: false as const, content: stdout };
            } catch (err) {
              return {
                path: filePath,
                redacted: false as const,
                content: null,
                readError: err instanceof Error ? err.message : String(err),
              };
            }
          }),
        );
        return { ...revision, files };
      }),
    );

    return JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        redactedPaths: Array.from(redactPaths),
        revisions: jsonRevisions,
      },
      null,
      2,
    );
  }
}
