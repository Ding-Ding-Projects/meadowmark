/**
 * Preload bridge. Runs in an isolated context with Node integration
 * disabled in the renderer; exposes a small, typed API on
 * `window.meadowmark` via contextBridge, matching ipc.ts channel-for-
 * channel.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc';
import type { AppInfo, GameState, Settings } from './app-types';

export interface MeadowmarkApi {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
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
