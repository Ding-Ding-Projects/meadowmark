import { UPDATE_FEED_URL_PLACEHOLDER } from '../../identity.js';

/**
 * Feed configuration constants.
 *
 * No release of this project has shipped yet, so there is no real update
 * host to point at. The canonical placeholder lives in `identity.ts`
 * (`UPDATE_FEED_URL_PLACEHOLDER`) alongside the app's other identity
 * constants and is re-exported here so callers of this module do not
 * need to know it originates elsewhere. It uses the `.invalid` top
 * level domain reserved by RFC 2606 specifically so it can never
 * resolve on the real internet - it documents the expected shape of a
 * real feed URL, not something to dial. {@link UpdaterService} treats
 * this exact value (and `null`/empty) as "not configured" and refuses
 * to make any network request against it.
 *
 * When a real release pipeline exists, the host application should pass
 * a real `feedUrl` (for example the GitHub Releases-backed host that
 * publishes the Squirrel.Windows `RELEASES` file and its `.nupkg`
 * packages) into {@link UpdaterService}'s constructor.
 */
export const UPDATE_FEED_PLACEHOLDER = UPDATE_FEED_URL_PLACEHOLDER;

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
