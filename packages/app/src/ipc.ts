/**
 * Main-process IPC handlers. Must match preload.ts's `window.meadowmark`
 * surface channel-for-channel: preload is the only thing allowed to call
 * these, and it only exposes what's registered here.
 */

import { BrowserWindow, app, ipcMain } from 'electron';
import { JsonStore } from './store';
import type { AppInfo, GameState, Settings } from './app-types';
import { SHIPPED_DISPLAY_NAME } from './identity';
import { IPC_CHANNELS } from './ipc-channels';

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

const settingsStore = new JsonStore<Settings>({
  fileName: 'settings.json',
  schemaVersion: 1,
  defaultValue: () => ({}),
});

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

  ipcMain.handle(IPC_CHANNELS.loadSettings, async (): Promise<Settings> => {
    return settingsStore.load();
  });

  ipcMain.handle(IPC_CHANNELS.saveSettings, async (_event, settings: Settings): Promise<void> => {
    await settingsStore.save(settings);
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
