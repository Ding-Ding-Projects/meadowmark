/**
 * Public surface of the automatic update subsystem.
 *
 * Typical wiring in the main process, after `app.whenReady()`:
 *
 *   const updater = new UpdaterService({ feedUrl: realFeedUrlOrNull });
 *   await updater.checkPendingInstallOnStartup();
 *   updater.onStateChange((state) => { forward `state` to the renderer over IPC });
 *   await updater.check();
 *   updater.startBackgroundSchedule();
 *
 * On the "Restart to install" action from the UI (after the caller's own
 * unsaved-work confirmation): `await updater.applyUpdate();`
 * On the "Later" action: `updater.dismiss();`
 */
export { UpdaterService } from './updater-service.js';

export type {
  ReleaseEntry,
  UpdaterConfig,
  UpdaterState,
  UpdaterStateListener,
  UpdaterStatus,
} from './types.js';

export {
  DEFAULT_BACKGROUND_CHECK_INTERVAL_MS,
  MAX_PACKAGE_BYTES,
  MAX_RELEASES_FILE_BYTES,
  MIN_BACKGROUND_CHECK_INTERVAL_MS,
  RELEASES_FILE_NAME,
  UNSIGNED_UPDATE_WARNING,
  UPDATE_FEED_PLACEHOLDER,
} from './feed-config.js';

export { compareVersions, isNewerVersion, parseVersionComponents } from './semver.js';
export { parseReleasesFile, selectLatestFullRelease, ReleasesParseError } from './releases-parser.js';
export { sha1Hex, looksLikeZipArchive } from './hash.js';
export {
  DownloadHttpError,
  DownloadInsecureUrlError,
  DownloadOfflineError,
  DownloadTooLargeError,
} from './http-download.js';
