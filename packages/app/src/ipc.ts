/**
 * Main-process IPC handlers. Must match preload.ts's `window.meadowmark`
 * surface channel-for-channel: preload is the only thing allowed to call
 * these, and it only exposes what's registered here.
 */

import path from 'node:path';
import { BrowserWindow, app, ipcMain } from 'electron';
import { JsonStore, dataDir } from './store';
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
import {
  HistoryStore,
  defaultHistoryRepoDir,
  type CommitResult,
  type DiffResult,
  type ExportOptions,
  type HistoryAvailability,
  type PruneResult,
  type RecordSummary,
  type RetentionPolicy,
  type Revision,
} from './services/history';

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

let historyStore: HistoryStore | null = null;

function getHistoryStore(): HistoryStore {
  if (!historyStore) {
    historyStore = new HistoryStore(defaultHistoryRepoDir(dataDir()));
  }
  return historyStore;
}

/** Records a snapshot without ever throwing or blocking the caller -- see
 * services/history/index.ts's wiring note. Failures are swallowed here on
 * purpose: history is a convenience layered on top of the real save/settings
 * write, never a gate on it. */
async function recordHistorySnapshot(
  recordPath: string,
  content: string,
  message: string,
  action: string,
): Promise<CommitResult | null> {
  try {
    return await getHistoryStore().commitSnapshot({ recordPath, content, message, action });
  } catch {
    return null;
  }
}

function describeChangedSettingsKeys(before: Record<string, unknown> | null, after: Record<string, unknown>): string {
  if (!before) return 'Changed settings';
  const changedKeys = Object.keys(after).filter((key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]));
  if (changedKeys.length === 0) return 'Changed settings';
  return `Changed settings: ${changedKeys.join(', ')}`;
}

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
    const farmName = typeof state.farmName === 'string' ? (state.farmName as string) : null;
    await recordHistorySnapshot(
      'saves/save.json',
      JSON.stringify(state, null, 2),
      farmName ? `Saved ${farmName}` : 'Saved the farm',
      'save',
    );
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
      const before = store.getBase() as unknown as Record<string, unknown>;
      await store.set(key, value);
      await recordSettingsHistorySnapshot(store, before);
      return settingsSnapshot();
    },
  );

  ipcMain.handle(IPC_CHANNELS.settingsServiceSetMany, async (_event, values: Partial<SettingsValues>) => {
    const store = await getSettingsStore();
    const before = store.getBase() as unknown as Record<string, unknown>;
    await store.setMany(values);
    await recordSettingsHistorySnapshot(store, before);
    return settingsSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.settingsServiceResetToDefault, async (_event, key: SettingsKey) => {
    const store = await getSettingsStore();
    const before = store.getBase() as unknown as Record<string, unknown>;
    await store.resetToDefault(key);
    await recordSettingsHistorySnapshot(store, before);
    return settingsSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.settingsServiceResetAllToDefaults, async () => {
    const store = await getSettingsStore();
    const before = store.getBase() as unknown as Record<string, unknown>;
    await store.resetAllToDefaults();
    await recordSettingsHistorySnapshot(store, before);
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

  ipcMain.handle(IPC_CHANNELS.historyInit, async (): Promise<HistoryAvailability> => {
    return getHistoryStore().init();
  });

  ipcMain.handle(
    IPC_CHANNELS.historyListRevisions,
    async (_event, options: { recordPath?: string; limit?: number } = {}): Promise<Revision[]> => {
      return getHistoryStore().listRevisions(options);
    },
  );

  ipcMain.handle(IPC_CHANNELS.historyListRecords, async (): Promise<RecordSummary[]> => {
    return getHistoryStore().listRecords();
  });

  ipcMain.handle(
    IPC_CHANNELS.historyDiffRevisions,
    async (_event, fromHash: string, toHash: string, recordPath?: string): Promise<DiffResult> => {
      return getHistoryStore().diffRevisions(fromHash, toHash, recordPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.historyRestoreRevision,
    async (_event, hash: string, recordPath: string): Promise<{ content: string; commit: CommitResult }> => {
      const result = await getHistoryStore().restoreRevision(hash, recordPath);
      await applyRestoredRecord(recordPath, result.content);
      return result;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.historyLabelRevision,
    async (_event, hash: string, label: string): Promise<void> => {
      await getHistoryStore().labelRevision(hash, label);
    },
  );

  ipcMain.handle(IPC_CHANNELS.historyPrune, async (_event, policy: RetentionPolicy): Promise<PruneResult> => {
    return getHistoryStore().prune(policy);
  });

  ipcMain.handle(IPC_CHANNELS.historyExport, async (_event, options: ExportOptions = {}): Promise<string> => {
    return getHistoryStore().exportHistory(options);
  });
}

/** Applies a restored history record back to the live file it came from.
 * The history store only knows about its own isolated repository, never
 * about where the record actually lives in the app (see restoreRevision's
 * doc comment), so this is the one place that closes that loop. Unknown
 * record paths (anything the UI restores that this main process does not
 * itself own) are left alone -- restoring their content back into the
 * history repository, which restoreRevision already did, is still useful
 * on its own as a labeled revision even without a live location to write
 * to here. */
async function applyRestoredRecord(recordPath: string, content: string): Promise<void> {
  try {
    if (recordPath === 'settings.json') {
      const store = await getSettingsStore();
      const parsed = JSON.parse(content) as Settings;
      const { values } = sanitizePartialSettings(parsed);
      await store.setMany(values);
    } else if (recordPath === 'saves/save.json') {
      const parsed = JSON.parse(content) as GameState;
      await gameStore.save(parsed);
    }
  } catch {
    // A restore that cannot be parsed back into a live record still left
    // the content recovered in the history repository itself; report
    // nothing further here rather than failing the whole restore action.
  }
}

/** Diffs the settings store's own before/after to name the changed keys in
 * the history commit message, then records the snapshot. Swallows failure --
 * see recordHistorySnapshot's doc comment. */
async function recordSettingsHistorySnapshot(store: SettingsStore, before: Record<string, unknown>): Promise<void> {
  const after = store.getBase() as unknown as Record<string, unknown>;
  const message = describeChangedSettingsKeys(before, after);
  await recordHistorySnapshot('settings.json', JSON.stringify(after, null, 2), message, 'settings');
}
