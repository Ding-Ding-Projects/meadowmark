/**
 * Stable application identity.
 *
 * These constants are the application's real identity: its package/app id,
 * the name of the folder its save data and settings live in, its update
 * feed, and the name it ships with. They must NEVER be derived from a
 * user-chosen display name.
 *
 * Meadowmark lets a player rename the window title / About text the app
 * shows them (a cosmetic label only). If that display name were ever used
 * to compute APP_ID or DATA_DIR_NAME, a rename would silently orphan every
 * saved farm, every setting, and the update feed the installed copy is
 * pointed at — the user would open the "renamed" app and find an empty
 * town waiting for them. Display is a setting; identity is a constant.
 * Keep them decoupled forever.
 */

/** electron-builder appId. Never changes across renames or rebrands. */
export const APP_ID = 'com.dingdingprojects.meadowmark';

/**
 * Name of the directory under the OS per-user application-data root
 * (Electron's `app.getPath('userData')` parent) where Meadowmark keeps its
 * save games, settings, and local history. Fixed forever, independent of
 * any display name the user chooses.
 */
export const DATA_DIR_NAME = 'Meadowmark';

/** The name Meadowmark ships with. Used in diagnostics/crash reports so a
 * bug reporter always names real software, even if the user has renamed
 * their own copy for display purposes. */
export const SHIPPED_DISPLAY_NAME = 'Meadowmark';

/**
 * Stable GitHub Releases latest-release route containing the Squirrel.Windows
 * `RELEASES` index and its referenced `.nupkg` assets. The packages are
 * intentionally unsigned; integrity relies on HTTPS transport plus the
 * hash and size published in `RELEASES`, never a publisher signature.
 */
export const UPDATE_FEED_URL =
  'https://github.com/Ding-Ding-Projects/meadowmark/releases/latest/download/';

/** Release page linked from an update-ready notification. */
export const UPDATE_RELEASE_NOTES_URL_TEMPLATE =
  'https://github.com/Ding-Ding-Projects/meadowmark/releases/latest';
