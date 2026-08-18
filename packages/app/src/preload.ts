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
import type { AppInfo, GameState, Settings, SettingsLoadPayload } from './app-types';
import type {
  SettingsKey,
  SettingsLoadResult,
  SettingsProvenance,
  SettingsValues,
} from './services/settings';
import type {
  CommitResult,
  DiffResult,
  ExportOptions,
  HistoryAvailability,
  PruneResult,
  RecordSummary,
  RetentionPolicy,
  Revision,
} from './services/history';
import type { ExportFormat, ExportWriteResult, LossReport } from './services/exports';
import type { ExportDatasetId } from './ipc';
import type { LogoManifest, LogoPresetSummary } from './services/logo';

export interface SettingsServiceSnapshot {
  values: SettingsValues;
  provenance: SettingsProvenance;
  loadResult: SettingsLoadResult;
}

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
  loadSettings: () => Promise<SettingsLoadPayload>;
  saveSettings: (settings: Settings) => Promise<void>;
  settings: {
    load: () => Promise<SettingsServiceSnapshot>;
    set: <K extends SettingsKey>(key: K, value: SettingsValues[K]) => Promise<SettingsServiceSnapshot>;
    setMany: (values: Partial<SettingsValues>) => Promise<SettingsServiceSnapshot>;
    resetToDefault: (key: SettingsKey) => Promise<SettingsServiceSnapshot>;
    resetAllToDefaults: () => Promise<SettingsServiceSnapshot>;
  };
  appInfo: () => Promise<AppInfo>;
  history: {
    init: () => Promise<HistoryAvailability>;
    listRevisions: (options?: { recordPath?: string; limit?: number }) => Promise<Revision[]>;
    listRecords: () => Promise<RecordSummary[]>;
    diffRevisions: (fromHash: string, toHash: string, recordPath?: string) => Promise<DiffResult>;
    restoreRevision: (hash: string, recordPath: string) => Promise<{ content: string; commit: CommitResult }>;
    labelRevision: (hash: string, label: string) => Promise<void>;
    prune: (policy: RetentionPolicy) => Promise<PruneResult>;
    exportHistory: (options?: ExportOptions) => Promise<string>;
  };
  exports: {
    lossReport: (datasetId: ExportDatasetId, format: ExportFormat) => Promise<LossReport>;
    write: (datasetId: ExportDatasetId, format: ExportFormat) => Promise<ExportWriteResult | { canceled: true }>;
  };
  logo: {
    listPresets: () => Promise<readonly LogoPresetSummary[]>;
    getManifest: () => Promise<LogoManifest | null>;
    previewPreset: (presetId: string) => Promise<string>;
    previewCurrent: () => Promise<string | null>;
    applyPreset: (presetId: string) => Promise<LogoManifest>;
    pickAndApplyCustom: () => Promise<LogoManifest | { canceled: true }>;
    reset: () => Promise<void>;
  };
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
  settings: {
    load: () => ipcRenderer.invoke(IPC_CHANNELS.settingsServiceLoad),
    set: (key, value) => ipcRenderer.invoke(IPC_CHANNELS.settingsServiceSet, key, value),
    setMany: (values) => ipcRenderer.invoke(IPC_CHANNELS.settingsServiceSetMany, values),
    resetToDefault: (key) => ipcRenderer.invoke(IPC_CHANNELS.settingsServiceResetToDefault, key),
    resetAllToDefaults: () => ipcRenderer.invoke(IPC_CHANNELS.settingsServiceResetAllToDefaults),
  },
  appInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
  history: {
    init: () => ipcRenderer.invoke(IPC_CHANNELS.historyInit),
    listRevisions: (options) => ipcRenderer.invoke(IPC_CHANNELS.historyListRevisions, options ?? {}),
    listRecords: () => ipcRenderer.invoke(IPC_CHANNELS.historyListRecords),
    diffRevisions: (fromHash, toHash, recordPath) =>
      ipcRenderer.invoke(IPC_CHANNELS.historyDiffRevisions, fromHash, toHash, recordPath),
    restoreRevision: (hash, recordPath) => ipcRenderer.invoke(IPC_CHANNELS.historyRestoreRevision, hash, recordPath),
    labelRevision: (hash, label) => ipcRenderer.invoke(IPC_CHANNELS.historyLabelRevision, hash, label),
    prune: (policy) => ipcRenderer.invoke(IPC_CHANNELS.historyPrune, policy),
    exportHistory: (options) => ipcRenderer.invoke(IPC_CHANNELS.historyExport, options ?? {}),
  },
  exports: {
    lossReport: (datasetId, format) => ipcRenderer.invoke(IPC_CHANNELS.exportsLossReport, datasetId, format),
    write: (datasetId, format) => ipcRenderer.invoke(IPC_CHANNELS.exportsWrite, datasetId, format),
  },
  logo: {
    listPresets: () => ipcRenderer.invoke(IPC_CHANNELS.logoListPresets),
    getManifest: () => ipcRenderer.invoke(IPC_CHANNELS.logoGetManifest),
    previewPreset: (presetId) => ipcRenderer.invoke(IPC_CHANNELS.logoPreviewPreset, presetId),
    previewCurrent: () => ipcRenderer.invoke(IPC_CHANNELS.logoPreviewCurrent),
    applyPreset: (presetId) => ipcRenderer.invoke(IPC_CHANNELS.logoApplyPreset, presetId),
    pickAndApplyCustom: () => ipcRenderer.invoke(IPC_CHANNELS.logoPickAndApplyCustom),
    reset: () => ipcRenderer.invoke(IPC_CHANNELS.logoReset),
  },
};

contextBridge.exposeInMainWorld('meadowmark', api);

declare global {
  interface Window {
    meadowmark: MeadowmarkApi;
  }
}
