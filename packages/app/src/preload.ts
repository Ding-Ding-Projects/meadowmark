/**
 * Preload bridge. Runs in an isolated, SANDBOXED context (main.ts sets
 * `sandbox: true` on the BrowserWindow, and that stays on -- see
 * ipc-channels.ts for why that matters here). Exposes a small, typed API
 * on `window.meadowmark` via contextBridge, matching ipc.ts channel-for-
 * channel.
 *
 * IMPORTANT: this file may only take VALUE imports from 'electron' and
 * from './ipc-channels' (a deliberately import-free leaf module). Every
 * other local import here must be `import type` (erased at build time).
 * A sandboxed preload gets almost no Node built-ins, so a value import
 * that transitively pulls in something like node:fs (e.g. importing
 * IPC_CHANNELS from ipc.ts, which imports store.ts) throws before
 * contextBridge.exposeInMainWorld runs, and window.meadowmark silently
 * never gets defined. tools/guards -- and your own judgment -- should
 * treat any new value import added here as suspect until proven leaf-only.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc-channels';
import type { AppInfo, GameState, Settings } from './app-types';

export interface MeadowmarkApi {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    /**
     * Subscribes to the main process's `maximize`/`unmaximize` events, so
     * the custom title bar's maximize/restore icon can reflect real
     * window state instead of just the state it last told the window to
     * go to. Returns an unsubscribe function.
     */
    onMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void;
  };
  loadGame: () => Promise<GameState | null>;
  saveGame: (state: GameState) => Promise<void>;
  loadSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
  appInfo: () => Promise<AppInfo>;
}

const api: MeadowmarkApi = {
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMinimize),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMaximize),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.windowClose),
    onMaximizedChanged: (callback: (isMaximized: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => {
        callback(isMaximized);
      };
      ipcRenderer.on(IPC_CHANNELS.windowMaximizedChanged, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.windowMaximizedChanged, listener);
      };
    },
  },
  loadGame: () => ipcRenderer.invoke(IPC_CHANNELS.loadGame),
  saveGame: (state: GameState) => ipcRenderer.invoke(IPC_CHANNELS.saveGame, state),
  loadSettings: () => ipcRenderer.invoke(IPC_CHANNELS.loadSettings),
  saveSettings: (settings: Settings) => ipcRenderer.invoke(IPC_CHANNELS.saveSettings, settings),
  appInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
};

contextBridge.exposeInMainWorld('meadowmark', api);

declare global {
  interface Window {
    meadowmark: MeadowmarkApi;
  }
}
