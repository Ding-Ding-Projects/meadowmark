import { UPDATE_FEED_URL, UPDATE_RELEASE_NOTES_URL_TEMPLATE } from '../../identity.js';

/**
 * Feed configuration constants.
 *
 * The canonical GitHub Releases feed and release-notes template live in
 * `identity.ts` beside the app's other stable identity constants. They
 * are re-exported here so updater callers do not need to know where the
 * values originate.
 */
export const DEFAULT_UPDATE_FEED_URL = UPDATE_FEED_URL;
export const DEFAULT_RELEASE_NOTES_URL_TEMPLATE = UPDATE_RELEASE_NOTES_URL_TEMPLATE;

/** Name of the Squirrel.Windows feed metadata file, resolved against the feed base URL. */
export const RELEASES_FILE_NAME = 'RELEASES';

/** Lower bound on automatic background check frequency; see {@link UpdaterConfig.minCheckIntervalMs}. */
export const MIN_BACKGROUND_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/** Default background check frequency when the caller does not request a specific one. */
export const DEFAULT_BACKGROUND_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Fixed, honest copy shown on every `ready` state. Signing is permanently out of scope for this project. */
export const UNSIGNED_UPDATE_WARNING =
  'This update is not code-signed. Its integrity was checked with HTTPS transport and a published file hash, not a publisher signature. Windows may show an unknown-publisher warning when it installs.';

/** Upper bound on a single package download, defensively, regardless of what a feed claims. */
export const MAX_PACKAGE_BYTES = 500 * 1024 * 1024; // 500 MiB

/** Upper bound on the RELEASES metadata file itself. */
export const MAX_RELEASES_FILE_BYTES = 1 * 1024 * 1024; // 1 MiB

/** Maximum number of HTTP redirects the downloader will follow for any single request. */
export const MAX_REDIRECTS = 5;

/** Per-request network timeout. */
export const REQUEST_TIMEOUT_MS = 30 * 1000;
