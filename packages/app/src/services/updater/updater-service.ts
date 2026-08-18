import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { app, autoUpdater as electronAutoUpdater } from 'electron';

import { atomicWriteFile } from '../../atomic-write.js';
import {
  DEFAULT_BACKGROUND_CHECK_INTERVAL_MS,
  MAX_PACKAGE_BYTES,
  MAX_RELEASES_FILE_BYTES,
  MIN_BACKGROUND_CHECK_INTERVAL_MS,
  RELEASES_FILE_NAME,
  UNSIGNED_UPDATE_WARNING,
  UPDATE_FEED_PLACEHOLDER,
} from './feed-config.js';
import {
  DownloadHttpError,
  DownloadInsecureUrlError,
  DownloadOfflineError,
  DownloadTooLargeError,
  fetchBody,
} from './http-download.js';
import { looksLikeZipArchive, sha1Hex } from './hash.js';
import { clearPendingInstallMarker, readPendingInstallMarker, writePendingInstallMarker } from './pending-install.js';
import { ReleasesParseError, parseReleasesFile, selectLatestFullRelease } from './releases-parser.js';
import { isNewerVersion } from './semver.js';
import type { ReleaseEntry, UpdaterConfig, UpdaterState, UpdaterStateListener } from './types.js';

/**
 * Chrome-style, honest automatic updater for the Squirrel.Windows
 * release channel.
 *
 * Design summary (see the state machine in `types.ts` for the full
 * contract):
 *
 *  - `check()` fetches and parses the feed's `RELEASES` file itself,
 *    picks the newest full package, downloads it, and verifies both its
 *    declared size and its SHA1 hash against what the feed published -
 *    all of that work happens in THIS process, so every failure mode
 *    (offline, malformed feed, wrong hash, truncated download) is
 *    caught and reported with the real reason before anything is ever
 *    called "ready".
 *  - None of that touches the running app. Downloading happens to a
 *    staged file on disk; nothing is applied, nothing restarts, nothing
 *    interrupts play.
 *  - `applyUpdate()` is the one action that changes anything, and it
 *    only runs when the caller invokes it (i.e. the user chose "Restart
 *    to install", after whatever unsaved-work confirmation the caller's
 *    own UI performs - this service has no opinion about unsaved game
 *    state and never restarts anything on its own). It hands off to
 *    Electron's built-in `autoUpdater`, which on win32 drives the real
 *    Squirrel.Windows `Update.exe` apply mechanism; this service does
 *    not reimplement package extraction or file swapping itself, since
 *    doing that safely is exactly Update.exe's job. The pre-flight
 *    validation above is what lets the "ready" state exist honestly
 *    before that handoff ever happens.
 *  - On the next app startup, `checkPendingInstallOnStartup()` compares
 *    the version Squirrel was told to install against the version that
 *    is actually running now. A mismatch means Squirrel rolled the
 *    install back, and that is reported as the explicit `rolled-back`
 *    state rather than silently vanishing.
 *
 * Nothing in this file requests, discovers, or invokes a code signer.
 * `UNSIGNED_UPDATE_WARNING` is shown on every `ready` state without
 * exception.
 */
export class UpdaterService {
  private readonly feedUrl: string | null;
  private readonly releaseNotesUrlTemplate: string | null;
  private readonly minCheckIntervalMs: number;
  private readonly stagingDir: string;

  private state: UpdaterState = { status: 'idle' };
  private readonly listeners = new Set<UpdaterStateListener>();

  private scheduleTimer: ReturnType<typeof setInterval> | null = null;
  private activeAbortController: AbortController | null = null;
  private checkInFlight = false;

  constructor(config: UpdaterConfig = {}) {
    const rawFeedUrl = config.feedUrl ?? UPDATE_FEED_PLACEHOLDER;
    this.feedUrl = normalizeFeedUrl(rawFeedUrl);
    this.releaseNotesUrlTemplate = config.releaseNotesUrlTemplate ?? null;
    this.minCheckIntervalMs = Math.max(
      config.minCheckIntervalMs ?? DEFAULT_BACKGROUND_CHECK_INTERVAL_MS,
      MIN_BACKGROUND_CHECK_INTERVAL_MS,
    );
    this.stagingDir = config.stagingDir ?? path.join(app.getPath('userData'), 'updates');
  }

  /** Current state. Read this for the initial render; subscribe with {@link onStateChange} for updates. */
  getState(): UpdaterState {
    return this.state;
  }

  /** Subscribes to state changes. Returns an unsubscribe function. Does not immediately replay the current state. */
  onStateChange(listener: UpdaterStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(next: UpdaterState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  /**
   * Call once at startup, before the first {@link check}. Detects a
   * rollback from the previous session (see class doc) and clears the
   * pending-install marker either way. Resolves to the state it set, if
   * any (`rolled-back`), or null when there was nothing pending.
   */
  async checkPendingInstallOnStartup(): Promise<UpdaterState | null> {
    const marker = await readPendingInstallMarker(this.stagingDir);
    if (!marker) {
      return null;
    }
    await clearPendingInstallMarker(this.stagingDir);

    const actualVersion = app.getVersion();
    if (actualVersion === marker.expectedVersion) {
      // Install succeeded; nothing to report. A normal check() call will
      // follow and correctly report `no-update`.
      return null;
    }

    const rolledBack: UpdaterState = {
      status: 'rolled-back',
      expectedVersion: marker.expectedVersion,
      actualVersion,
      detail:
        `The update to version ${marker.expectedVersion} requested at ${marker.requestedAt} ` +
        `did not take effect; the app is still running ${actualVersion}. Squirrel appears to ` +
        'have rolled the install back.',
      occurredAt: new Date().toISOString(),
    };
    this.setState(rolledBack);
    return rolledBack;
  }

  /** Starts a bounded background check schedule. Safe to call more than once; replaces any existing schedule. */
  startBackgroundSchedule(intervalMs: number = this.minCheckIntervalMs): void {
    this.stopBackgroundSchedule();
    const boundedInterval = Math.max(intervalMs, MIN_BACKGROUND_CHECK_INTERVAL_MS);
    this.scheduleTimer = setInterval(() => {
      void this.check();
    }, boundedInterval);
    // Node's interval handles keep the process alive; the updater is a
    // background convenience, never a reason to prevent app exit.
    this.scheduleTimer.unref?.();
  }

  /** Stops the background schedule, if one is running. Does not cancel a check already in flight. */
  stopBackgroundSchedule(): void {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  /** Cancels an in-flight check or download, if any. Transitions to `cancelled`. A no-op when nothing is in flight. */
  cancel(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
  }

  /** Stops new scheduled checks, cancels active work, and resolves once no check remains in flight. */
  async stopAndWaitUntilIdle(): Promise<void> {
    this.stopBackgroundSchedule();
    this.cancel();
    while (this.checkInFlight) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  }

  /**
   * Returns from the `ready` state to `idle` without discarding the
   * staged package - this is the "Later" action. The next {@link check}
   * will find the already-staged, already-validated package and move
   * straight back to `ready` without downloading again, provided the
   * feed still advertises the same version.
   */
  dismiss(): void {
    if (this.state.status === 'ready') {
      this.setState({ status: 'idle' });
    }
  }

  /**
   * Runs one full check: fetch the feed, decide whether a newer full
   * package exists, and if so download and validate it. Safe to call
   * while a background schedule is also running; a second concurrent
   * call while one is already in flight is a no-op that returns the
   * current state rather than racing it.
   */
  async check(): Promise<UpdaterState> {
    if (this.checkInFlight) {
      return this.state;
    }
    if (!this.feedUrl) {
      const next: UpdaterState = { status: 'no-feed-configured', placeholderUrl: UPDATE_FEED_PLACEHOLDER };
      this.setState(next);
      return next;
    }

    this.checkInFlight = true;
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    try {
      this.setState({ status: 'checking', startedAt: new Date().toISOString() });

      const currentVersion = app.getVersion();
      const releasesUrl = new URL(RELEASES_FILE_NAME, this.feedUrl).toString();

      const releasesText = await this.fetchText(releasesUrl, MAX_RELEASES_FILE_BYTES, abortController.signal);
      if (abortController.signal.aborted) {
        return this.finishCancelled();
      }

      let entries: ReleaseEntry[];
      try {
        entries = parseReleasesFile(releasesText);
      } catch (error) {
        return this.finishInvalidFeedMetadata(error);
      }

      const latest = selectLatestFullRelease(entries);
      if (!latest) {
        return this.finishInvalidFeedMetadata(
          new ReleasesParseError('RELEASES file contained no full-package entries'),
        );
      }

      if (!isNewerVersion(latest.version, currentVersion)) {
        const next: UpdaterState = { status: 'no-update', currentVersion, checkedAt: new Date().toISOString() };
        this.setState(next);
        return next;
      }

      // Skip re-downloading when an already-validated copy of this exact
      // release is already staged on disk from a previous check.
      const stagedPath = this.packagePathFor(latest);
      const alreadyStaged = await this.verifyStagedPackage(stagedPath, latest);
      if (alreadyStaged) {
        return this.finishReady(latest, currentVersion, stagedPath);
      }

      return await this.downloadAndValidate(latest, currentVersion, stagedPath, abortController.signal);
    } catch (error) {
      if (abortController.signal.aborted) {
        return this.finishCancelled();
      }
      return this.finishFromError(error);
    } finally {
      this.checkInFlight = false;
      this.activeAbortController = null;
    }
  }

  /**
   * Hands off to Electron's platform Squirrel updater to actually apply
   * the staged, already-validated release and restart the app. Only
   * valid from the `ready` state. The caller is responsible for any
   * "you have unsaved work" confirmation and for restoring focus if the
   * user backs out of that confirmation - this method performs the
   * install unconditionally once called, exactly like a real "Restart
   * to install" button click.
   */
  async applyUpdate(): Promise<void> {
    if (this.state.status !== 'ready') {
      throw new Error(`applyUpdate() called while updater state was "${this.state.status}", not "ready"`);
    }
    const readyState = this.state;

    if (process.platform !== 'win32') {
      this.setState({
        status: 'failed',
        reason: 'unsupported-platform',
        detail: `Automatic install is only implemented for Squirrel.Windows; the running platform is "${process.platform}".`,
        occurredAt: new Date().toISOString(),
      });
      return;
    }
    if (!this.feedUrl) {
      this.setState({
        status: 'failed',
        reason: 'no-feed-configured',
        detail: 'Cannot apply an update because no update feed is configured.',
        occurredAt: new Date().toISOString(),
      });
      return;
    }

    await writePendingInstallMarker(this.stagingDir, readyState.version);

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        cleanup();
        this.setState({
          status: 'failed',
          reason: 'install-failed',
          detail: `Squirrel install failed: ${error.message}`,
          occurredAt: new Date().toISOString(),
        });
        reject(error);
      };
      const onDownloaded = (): void => {
        cleanup();
        // quitAndInstall relaunches the app after Squirrel finishes
        // applying the update; nothing after this line will run.
        electronAutoUpdater.quitAndInstall();
        resolve();
      };
      const cleanup = (): void => {
        electronAutoUpdater.removeListener('error', onError);
        electronAutoUpdater.removeListener('update-downloaded', onDownloaded);
      };

      electronAutoUpdater.once('error', onError);
      electronAutoUpdater.once('update-downloaded', onDownloaded);
      try {
        electronAutoUpdater.setFeedURL({ url: this.feedUrl as string });
        electronAutoUpdater.checkForUpdates();
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async fetchText(url: string, maxBytes: number, signal: AbortSignal): Promise<string> {
    const { body } = await fetchBody(url, { maxBytes, signal, userAgent: this.userAgent() });
    return body.toString('utf8');
  }

  private async downloadAndValidate(
    latest: ReleaseEntry,
    currentVersion: string,
    stagedPath: string,
    signal: AbortSignal,
  ): Promise<UpdaterState> {
    const packageUrl = new URL(latest.filename, this.feedUrlOrThrow()).toString();

    this.setState({ status: 'downloading', version: latest.version, bytesDownloaded: 0, totalBytes: null });

    const { body } = await fetchBody(packageUrl, {
      maxBytes: MAX_PACKAGE_BYTES,
      signal,
      userAgent: this.userAgent(),
      onProgress: (bytesDownloaded, totalBytes) => {
        this.setState({ status: 'downloading', version: latest.version, bytesDownloaded, totalBytes });
      },
    });

    if (signal.aborted) {
      return this.finishCancelled();
    }

    if (body.length !== latest.sizeBytes) {
      const next: UpdaterState = {
        status: 'corrupt-asset',
        version: latest.version,
        detail: `downloaded ${body.length} bytes for "${latest.filename}" but the feed declared ${latest.sizeBytes}`,
        occurredAt: new Date().toISOString(),
      };
      this.setState(next);
      return next;
    }

    if (!looksLikeZipArchive(body)) {
      const next: UpdaterState = {
        status: 'corrupt-asset',
        version: latest.version,
        detail: `downloaded file "${latest.filename}" does not begin with a valid ZIP/.nupkg signature`,
        occurredAt: new Date().toISOString(),
      };
      this.setState(next);
      return next;
    }

    const actualSha1 = sha1Hex(body);
    if (actualSha1 !== latest.sha1) {
      const next: UpdaterState = {
        status: 'invalid-hash',
        version: latest.version,
        expectedSha1: latest.sha1,
        actualSha1,
        occurredAt: new Date().toISOString(),
      };
      this.setState(next);
      return next;
    }

    await atomicWriteFile(stagedPath, body);

    return this.finishReady(latest, currentVersion, stagedPath);
  }

  private finishReady(latest: ReleaseEntry, currentVersion: string, stagedPath: string): UpdaterState {
    const next: UpdaterState = {
      status: 'ready',
      version: latest.version,
      currentVersion,
      releaseNotesUrl: this.releaseNotesUrlTemplate
        ? this.releaseNotesUrlTemplate.replace('{version}', latest.version)
        : null,
      unsignedWarning: UNSIGNED_UPDATE_WARNING,
      packagePath: stagedPath,
      sha1: latest.sha1,
      readyAt: new Date().toISOString(),
    };
    this.setState(next);
    return next;
  }

  private finishCancelled(): UpdaterState {
    const next: UpdaterState = { status: 'cancelled', occurredAt: new Date().toISOString() };
    this.setState(next);
    return next;
  }

  private finishInvalidFeedMetadata(error: unknown): UpdaterState {
    const next: UpdaterState = {
      status: 'invalid-feed-metadata',
      detail: error instanceof Error ? error.message : String(error),
      occurredAt: new Date().toISOString(),
    };
    this.setState(next);
    return next;
  }

  private finishFromError(error: unknown): UpdaterState {
    const occurredAt = new Date().toISOString();
    if (error instanceof DownloadOfflineError) {
      const next: UpdaterState = { status: 'offline', detail: error.message, occurredAt };
      this.setState(next);
      return next;
    }
    if (error instanceof DownloadTooLargeError) {
      const next: UpdaterState = { status: 'failed', reason: 'package-too-large', detail: error.message, occurredAt };
      this.setState(next);
      return next;
    }
    if (error instanceof DownloadInsecureUrlError) {
      const next: UpdaterState = { status: 'invalid-feed-metadata', detail: error.message, occurredAt };
      this.setState(next);
      return next;
    }
    if (error instanceof DownloadHttpError) {
      const next: UpdaterState = { status: 'failed', reason: 'http-error', detail: error.message, occurredAt };
      this.setState(next);
      return next;
    }
    if (error instanceof ReleasesParseError) {
      const next: UpdaterState = { status: 'invalid-feed-metadata', detail: error.message, occurredAt };
      this.setState(next);
      return next;
    }
    const next: UpdaterState = {
      status: 'failed',
      reason: 'unexpected-error',
      detail: error instanceof Error ? error.message : String(error),
      occurredAt,
    };
    this.setState(next);
    return next;
  }

  private async verifyStagedPackage(stagedPath: string, entry: ReleaseEntry): Promise<boolean> {
    if (!existsSync(stagedPath)) {
      return false;
    }
    try {
      const data = await fs.readFile(stagedPath);
      return data.length === entry.sizeBytes && sha1Hex(data) === entry.sha1;
    } catch {
      return false;
    }
  }

  private packagePathFor(entry: ReleaseEntry): string {
    return path.join(this.stagingDir, entry.version, entry.filename);
  }

  private userAgent(): string {
    return `Meadowmark/${app.getVersion()} (Squirrel.Windows updater)`;
  }

  private feedUrlOrThrow(): string {
    if (!this.feedUrl) {
      throw new Error('feed URL is not configured');
    }
    return this.feedUrl;
  }
}

/** Normalizes a feed URL, treating null/empty/whitespace-only/placeholder values as "not configured". */
function normalizeFeedUrl(rawUrl: string | null | undefined): string | null {
  const trimmed = (rawUrl ?? '').trim();
  if (trimmed.length === 0 || trimmed === UPDATE_FEED_PLACEHOLDER) {
    return null;
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}
