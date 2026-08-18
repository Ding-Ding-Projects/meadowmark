/**
 * Type surface for the automatic update subsystem.
 *
 * The updater is a strict, honest state machine. Every state either says
 * "nothing to report" or carries the exact facts needed to explain itself
 * to a user or to a caller wiring up UI: a real version string, a real
 * byte count, a real hash, a real error detail. There is no state that
 * merely says "something happened" - every terminal or waiting state
 * names what happened and why.
 *
 * Code signing is permanently out of scope for this project. Nothing in
 * this module ever requests, discovers, or invokes a signer, and nothing
 * here ever claims a package's *authenticity* was verified - only that
 * its bytes matched the hash published (over HTTPS) in the update feed.
 * That is a weaker guarantee than a real signature and the "ready" state
 * says so explicitly via `unsignedWarning`.
 */

/** One row of a Squirrel.Windows `RELEASES` feed file. */
export interface ReleaseEntry {
  /** Lowercase hex SHA1 of the package file, as published in the feed. */
  readonly sha1: string;
  /** Package file name, e.g. `meadowmark-1.2.3-full.nupkg`. */
  readonly filename: string;
  /** Declared size in bytes, as published in the feed. */
  readonly sizeBytes: number;
  /** Semantic version parsed out of the file name. */
  readonly version: string;
  /** Whether this entry is a delta package rather than a full package. */
  readonly isDelta: boolean;
}

/**
 * The complete set of states the updater can be in. Exactly one at a
 * time. Every variant is discriminated on `status` so a consumer can
 * exhaustively switch over it.
 */
export type UpdaterState =
  /** Nothing has happened yet since the service was constructed. */
  | { readonly status: 'idle' }
  /**
   * The configured feed URL is missing or is still the shipped
   * placeholder. No network request has been made and none will be made
   * until a real feed URL is configured. This is not an error - it is
   * the honest, expected state before this project has published its
   * first release.
   */
  | { readonly status: 'no-feed-configured'; readonly placeholderUrl: string }
  /** A check is in flight: fetching and parsing the feed's `RELEASES` file. */
  | { readonly status: 'checking'; readonly startedAt: string }
  /** The check completed and the running app is already the newest version. */
  | { readonly status: 'no-update'; readonly currentVersion: string; readonly checkedAt: string }
  /** A newer package is being downloaded. Progress is best-effort. */
  | {
      readonly status: 'downloading';
      readonly version: string;
      readonly bytesDownloaded: number;
      /** Null when the server did not send a Content-Length header. */
      readonly totalBytes: number | null;
    }
  /**
   * A newer package has been downloaded, its declared size and SHA1 hash
   * were both verified against the feed's `RELEASES` entry, and it is
   * staged on disk. Nothing further happens until the user chooses
   * "Restart to install" or "Later". This state is non-blocking - the
   * running app keeps playing normally while it is shown.
   */
  | {
      readonly status: 'ready';
      readonly version: string;
      readonly currentVersion: string;
      /** Link to the release's notes, or null when the feed did not publish one. */
      readonly releaseNotesUrl: string | null;
      /** Fixed, honest copy explaining the package is not code-signed. */
      readonly unsignedWarning: string;
      readonly packagePath: string;
      readonly sha1: string;
      readonly readyAt: string;
    }
  /** The check or download could not reach the feed host at all. */
  | { readonly status: 'offline'; readonly detail: string; readonly occurredAt: string }
  /** The `RELEASES` file was unreachable-but-served, empty, or malformed. */
  | { readonly status: 'invalid-feed-metadata'; readonly detail: string; readonly occurredAt: string }
  /** The downloaded package's SHA1 did not match the hash published in the feed. */
  | {
      readonly status: 'invalid-hash';
      readonly version: string;
      readonly expectedSha1: string;
      readonly actualSha1: string;
      readonly occurredAt: string;
    }
  /** The downloaded bytes were the wrong size, truncated, or not a valid package archive. */
  | { readonly status: 'corrupt-asset'; readonly version: string; readonly detail: string; readonly occurredAt: string }
  /** A check or download was cancelled by the caller before it finished. */
  | { readonly status: 'cancelled'; readonly occurredAt: string }
  /** A prior check, download, HTTP request, or install attempt failed for a reason not covered above. */
  | { readonly status: 'failed'; readonly reason: string; readonly detail: string; readonly occurredAt: string }
  /**
   * Detected on startup: a previous session staged and applied a
   * version that does not match the version currently running, which
   * means Squirrel rolled the install back. This is only ever set by
   * {@link UpdaterService.checkPendingInstallOnStartup}, never by a
   * plain check.
   */
  | { readonly status: 'rolled-back'; readonly expectedVersion: string; readonly actualVersion: string; readonly detail: string; readonly occurredAt: string };

export type UpdaterStatus = UpdaterState['status'];

/** Subscriber signature for {@link UpdaterService.onStateChange}. */
export type UpdaterStateListener = (state: UpdaterState) => void;

/** Configuration accepted by {@link UpdaterService}. */
export interface UpdaterConfig {
  /**
   * Base URL of the update feed directory, e.g.
   * `https://example.com/releases/win32/`. The service fetches
   * `RELEASES` relative to this URL and resolves package file names
   * against it. Pass `null`, an empty string, or the shipped
   * Pass null or an empty string to represent "not configured yet" -
   * the service will never attempt a network request in that case and
   * will report {@link UpdaterState} status `no-feed-configured`.
   */
  readonly feedUrl?: string | null;
  /**
   * Link shown to the user in the `ready` state's release notes action.
   * Independent of the feed URL because release notes commonly live on
   * a documentation site rather than the update host.
   */
  readonly releaseNotesUrlTemplate?: string | null;
  /**
   * Minimum bound, in milliseconds, between automatic background
   * checks. Enforced even if a caller requests a shorter interval, so a
   * misconfiguration cannot turn this into an unbounded polling loop.
   * Defaults to {@link MIN_BACKGROUND_CHECK_INTERVAL_MS}.
   */
  readonly minCheckIntervalMs?: number;
  /**
   * Directory used to stage downloaded packages and the pending-install
   * marker. Defaults to `<userData>/updates`. Exposed for tests; normal
   * callers should leave this unset.
   */
  readonly stagingDir?: string;
}
