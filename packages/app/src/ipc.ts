/**
 * Main-process IPC handlers. Must match preload.ts's `window.meadowmark`
 * surface channel-for-channel: preload is the only thing allowed to call
 * these, and it only exposes what's registered here.
 */

import path from 'node:path';
import { BrowserWindow, app, ipcMain } from 'electron';
import { JsonStore } from './store';
import type { AppInfo, GameState, Settings, SettingsLoadPayload } from './app-types';
import { SHIPPED_DISPLAY_NAME } from './identity';
import { IPC_CHANNELS } from './ipc-channels';
import {
  SettingsStore,
  sanitizePartialSettings,
  type SettingsKey,
  type SettingsLoadResult,
  type SettingsValues,
} from './services/settings';

// Re-exported for convenience so main.ts (which is NOT sandboxed and can
// safely pull in the rest of this module's graph) can keep importing
// IPC_CHANNELS from here. preload.ts must import it from './ipc-channels'
// directly instead -- see that file's header comment for why.
export { IPC_CHANNELS };

const gameStore = new JsonStore<GameState | null>({
  fileName: 'save.json',
  schemaVersion: 1,
  defaultValue: () => null,
});

let settingsStore: SettingsStore | null = null;
let settingsLoadPromise: Promise<void> | null = null;
let settingsLoadResult: SettingsLoadResult = { fileExisted: false, warnings: [] };

async function getSettingsStore(): Promise<SettingsStore> {
  if (!settingsStore) {
    settingsStore = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
  }
  if (!settingsLoadPromise) {
    settingsLoadPromise = settingsStore.load().then((result) => {
      settingsLoadResult = result;
    });
  }
  await settingsLoadPromise;
  return settingsStore;
}

async function settingsSnapshot() {
  const store = await getSettingsStore();
  return {
    values: store.getBase(),
    provenance: store.getBaseProvenance(),
    loadResult: settingsLoadResult,
  };
}

/** Registers every IPC handler. Call once, after `app.whenReady()`. */
export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS.windowMinimize, () => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.windowMaximize, () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.windowClose, () => {
    getMainWindow()?.close();
  });

  ipcMain.handle(IPC_CHANNELS.loadGame, async (): Promise<GameState | null> => {
    return gameStore.load();
  });

  ipcMain.handle(IPC_CHANNELS.saveGame, async (_event, state: GameState): Promise<void> => {
    await gameStore.save(state);
  });

  ipcMain.handle(IPC_CHANNELS.loadSettings, async (): Promise<SettingsLoadPayload> => {
    const store = await getSettingsStore();
    return {
      values: store.getBase() as unknown as Settings,
      provenance: store.getBaseProvenance() as unknown as Record<string, unknown>,
      warnings: settingsLoadResult.warnings,
    };
  });

  ipcMain.handle(IPC_CHANNELS.saveSettings, async (_event, settings: Settings): Promise<void> => {
    const store = await getSettingsStore();
    const { values } = sanitizePartialSettings(settings);
    await store.setMany(values);
  });

  ipcMain.handle(IPC_CHANNELS.settingsServiceLoad, async () => {
    return settingsSnapshot();
  });

  ipcMain.handle(
    IPC_CHANNELS.settingsServiceSet,
    async (_event, key: SettingsKey, value: SettingsValues[SettingsKey]) => {
      const store = await getSettingsStore();
      await store.set(key, value);
      return settingsSnapshot();
    },
  );

  ipcMain.handle(IPC_CHANNELS.settingsServiceSetMany, async (_event, values: Partial<SettingsValues>) => {
    const store = await getSettingsStore();
    await store.setMany(values);
    return settingsSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.settingsServiceResetToDefault, async (_event, key: SettingsKey) => {
    const store = await getSettingsStore();
    await store.resetToDefault(key);
    return settingsSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.settingsServiceResetAllToDefaults, async () => {
    const store = await getSettingsStore();
    await store.resetAllToDefaults();
    return settingsSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.appInfo, (): AppInfo => {
    return {
      name: SHIPPED_DISPLAY_NAME,
      version: app.getVersion(),
      platform: process.platform,
      isDev: Boolean(process.env.MEADOWMARK_DEV),
    };
  });
}
