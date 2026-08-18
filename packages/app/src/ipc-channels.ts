/**
 * IPC channel name constants.
 *
 * This module MUST have no imports other than (at most) type-only ones.
 * It is the one thing both the main-process handler module (ipc.ts) and
 * the sandboxed preload (preload.ts) are allowed to share a VALUE import
 * with.
 *
 * Why this file exists at all, rather than preload.ts importing
 * IPC_CHANNELS straight out of ipc.ts: esbuild bundles whatever a value
 * import actually pulls in. ipc.ts imports store.ts, which imports
 * node:fs and node:path -- real Node built-ins that a sandboxed preload
 * (main.ts sets `sandbox: true` on the BrowserWindow, and that stays on
 * purpose) cannot touch. A preload that transitively requires("node:fs")
 * throws before it reaches contextBridge.exposeInMainWorld, so
 * `window.meadowmark` never gets defined and the renderer sees nothing --
 * with no error anywhere near the code that actually looks wrong.
 *
 * Keep this file a leaf: no imports of any other local module, ever. If
 * you need to add something both sides share, it either belongs here (if
 * it's inert data like this) or it needs its own leaf module -- it must
 * NOT be added to ipc.ts and then imported from preload.ts.
 */

export const IPC_CHANNELS = {
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  windowMaximizedChanged: 'window:maximized-changed',
  loadGame: 'game:load',
  saveGame: 'game:save',
  loadSettings: 'settings:load',
  saveSettings: 'settings:save',
  settingsServiceLoad: 'settings-service:load',
  settingsServiceSet: 'settings-service:set',
  settingsServiceSetMany: 'settings-service:set-many',
  settingsServiceResetToDefault: 'settings-service:reset-to-default',
  settingsServiceResetAllToDefaults: 'settings-service:reset-all-to-defaults',
  appInfo: 'app:info',
} as const;
