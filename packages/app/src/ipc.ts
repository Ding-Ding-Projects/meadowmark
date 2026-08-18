<<<<<<< HEAD
/** Main-process IPC ownership and validation boundary. */
import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { AppInfo, GameState, Settings, SettingsLoadPayload } from './app-types';
import { SHIPPED_DISPLAY_NAME } from './identity';
import { IPC_CHANNELS } from './ipc-channels';
import type { AppRuntime } from './runtime-services';
import { SETTINGS_KEYS, sanitizePartialSettings, type ScheduledRule, type SettingsKey, type SettingsValues } from './services/settings';
import type { ExportFormat, ExportSource } from './services/exports';
import type { ConverterCategory } from './services/converter';
import type { LogoEditParams } from './services/logo';
import type { BeginRegistrationFromSecretOptions, BeginRegistrationOptions } from './services/auth';
import type { LockTarget, NewCredential, UnlockDuration, UnlockInput } from './services/locks';
import type { RetentionPolicy } from './services/history';
import type { NarrationRequest, NarratorSettings } from './services/narrator';
import type { CatalogTag, ChatGenerationParams } from './services/ollama';
=======
/**
 * Main-process IPC handlers. Must match preload.ts's `window.meadowmark`
 * surface channel-for-channel: preload is the only thing allowed to call
 * these, and it only exposes what's registered here.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { BrowserWindow, app, dialog, ipcMain } from 'electron';
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
import {
  computeLossReport,
  extensionForFormat,
  suggestExportFileName,
  writeExportFile,
  type ExportFormat,
  type ExportSource,
  type ExportWriteResult,
  type LossReport,
} from './services/exports';
import {
  applyCustomSelection,
  applyPresetSelection,
  encodePng,
  getCurrentLogoManifest,
  getPresetImage,
  listLogoPresets,
  readLogoAsset,
  resetLogoToShippedDefault,
  type LogoManifest,
  type LogoPresetSummary,
} from './services/logo';

/** The datasets this build knows how to turn into an ExportSource. Every
 * user-owned record the app persists should eventually get an entry here;
 * this starts with the two records the app already owns end to end. */
export type ExportDatasetId = 'settings' | 'save';
>>>>>>> worktree-wf_53ab3037-0c3-5

export { IPC_CHANNELS };

const MAX_TEXT = 64 * 1024;
const MAX_BINARY = 16 * 1024 * 1024;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;

function requireWindow(event: IpcMainInvokeEvent, getWindow: () => BrowserWindow | null): BrowserWindow {
  const window = getWindow();
  if (
    !window ||
    window.isDestroyed() ||
    event.sender.id !== window.webContents.id ||
    event.senderFrame !== window.webContents.mainFrame
  ) {
    throw new Error('Rejected IPC from an unowned renderer.');
  }
  return window;
}

function text(value: unknown, label: string, max = MAX_TEXT): string {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid ${label}.`);
  return value;
}

function id(value: unknown, label: string): string {
  const candidate = text(value, label, 256);
  if (!IDENTIFIER_RE.test(candidate)) throw new Error(`Invalid ${label}.`);
  return candidate;
}

function object<T>(value: unknown, label: string, maxBytes = MAX_BINARY): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`Invalid ${label}.`);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes) throw new Error(`${label} exceeds the IPC size limit.`);
  return value as T;
}

function bytes(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength > MAX_BINARY) throw new Error(`Invalid ${label}.`);
  return value;
}

function settingsKey(value: unknown): SettingsKey {
  if (typeof value !== 'string' || !(SETTINGS_KEYS as readonly string[]).includes(value)) throw new Error('Invalid settings key.');
  return value as SettingsKey;
}

function trustedSurfaceId(event: IpcMainInvokeEvent): string {
  return `${event.sender.id}:${event.frameId}`;
}

export function registerIpcHandlers(runtime: AppRuntime, getWindow: () => BrowserWindow | null): () => void {
  const channels: string[] = [];
  const handle = <TArgs extends unknown[], TResult>(channel: string, fn: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult | Promise<TResult>): void => {
    channels.push(channel);
    ipcMain.handle(channel, (event, ...args) => {
      requireWindow(event, getWindow);
      runtime.assertActive();
      const result = fn(event, ...(args as TArgs));
      return result instanceof Promise ? runtime.trackOperation(result) : result;
    });
  };

  handle(IPC_CHANNELS.windowMinimize, () => getWindow()?.minimize());
  handle(IPC_CHANNELS.windowMaximize, () => {
    const window = getWindow();
    if (!window) return;
    if (window.isMaximized()) window.unmaximize(); else window.maximize();
  });
  handle(IPC_CHANNELS.windowClose, () => getWindow()?.close());
  handle(IPC_CHANNELS.loadGame, () => runtime.loadGame());
  handle(IPC_CHANNELS.saveGame, (_event, state: GameState) => runtime.saveGame(object<GameState>(state, 'game state')));
  handle(IPC_CHANNELS.loadSettings, (): SettingsLoadPayload => {
    const snapshot = runtime.settingsSnapshot();
    return { values: snapshot.values as unknown as Settings, provenance: snapshot.provenance, warnings: snapshot.loadResult.warnings };
  });
  handle(IPC_CHANNELS.saveSettings, (_event, value: Settings) => {
    const sanitized = sanitizePartialSettings(object(value, 'settings'));
    if (sanitized.warnings.length) throw new Error(sanitized.warnings.join(' '));
    return runtime.setSettings(sanitized.values).then(() => undefined);
  });
  handle(IPC_CHANNELS.settingsServiceLoad, () => runtime.settingsSnapshot());
  handle(IPC_CHANNELS.settingsServiceSet, (_event, key: unknown, value: unknown) => runtime.setSetting(settingsKey(key), value as never));
  handle(IPC_CHANNELS.settingsServiceSetMany, (_event, value: Partial<SettingsValues>) => {
    const sanitized = sanitizePartialSettings(object(value, 'settings'));
    if (sanitized.warnings.length) throw new Error(sanitized.warnings.join(' '));
    return runtime.setSettings(sanitized.values);
  });
  handle(IPC_CHANNELS.settingsServiceResetToDefault, (_event, key: unknown) => runtime.resetSetting(settingsKey(key)));
  handle(IPC_CHANNELS.settingsServiceResetAllToDefaults, () => runtime.resetSettings());

  handle(IPC_CHANNELS.schedulesList, () => runtime.listSchedules());
  handle(IPC_CHANNELS.schedulesReplace, (_event, rules: ScheduledRule[]) => {
    if (!Array.isArray(rules) || rules.length > 500) throw new Error('Invalid scheduled rules.');
    return runtime.replaceSchedules(rules.map((rule) => object<ScheduledRule>(rule, 'scheduled rule', 128 * 1024)));
  });
  handle(IPC_CHANNELS.schedulesEffective, (_event, iso?: unknown) => {
    const at = iso === undefined ? new Date() : new Date(text(iso, 'date', 64));
    if (Number.isNaN(at.getTime())) throw new Error('Invalid effective-settings date.');
    return runtime.effectiveSettings(at);
  });

  handle(IPC_CHANNELS.logoListPresets, () => runtime.api.logo.listPresets());
  handle(IPC_CHANNELS.logoCurrent, () => runtime.api.logo.current());
  handle(IPC_CHANNELS.logoApplyPreset, (_event, presetId: unknown) => runtime.api.logo.applyPreset(id(presetId, 'preset id')));
  handle(IPC_CHANNELS.logoApplyCustom, (_event, source: unknown, edits: LogoEditParams) => runtime.api.logo.applyCustom(bytes(source, 'logo bytes'), object(edits, 'logo edits', 16 * 1024)));
  handle(IPC_CHANNELS.logoReadAsset, (_event, which: { size: number } | 'ico') => runtime.api.logo.readAsset(which));
  handle(IPC_CHANNELS.logoReset, () => runtime.api.logo.reset());

  handle(IPC_CHANNELS.converterListCatalog, () => runtime.api.converter.listCatalog());
  handle(IPC_CHANNELS.converterListCategory, (_event, category: ConverterCategory) => runtime.api.converter.listCategory(category));
  handle(IPC_CHANNELS.converterSearchCatalog, (_event, query: unknown, category?: ConverterCategory) => runtime.api.converter.searchCatalog(text(query, 'query', 1_024), category));
  handle(IPC_CHANNELS.converterPickSource, (event) => runtime.pickConverterSource(requireWindow(event, getWindow)));
  handle(IPC_CHANNELS.converterDetect, (_event, handle: unknown) => runtime.detectSelectedSource(id(handle, 'source handle')));
  handle(IPC_CHANNELS.converterConvert, (event, handle: unknown, entry: unknown, suggested?: unknown) => runtime.convertSelectedSource(requireWindow(event, getWindow), id(handle, 'source handle'), id(entry, 'converter id'), suggested === undefined ? undefined : text(suggested, 'suggested name', 180)));
  handle(IPC_CHANNELS.converterExtract, (event, handle: unknown, entry: unknown) => runtime.extractSelectedSource(requireWindow(event, getWindow), id(handle, 'source handle'), id(entry, 'converter id')));

  handle(IPC_CHANNELS.exportsPreview, (_event, source: ExportSource, format: ExportFormat) => runtime.exportPreview(object(source, 'export source'), format));
  handle(IPC_CHANNELS.exportsLossReport, (_event, source: ExportSource, format: ExportFormat) => runtime.exportLossReport(object(source, 'export source'), format));
  handle(IPC_CHANNELS.exportsSave, (event, source: ExportSource, format: ExportFormat) => runtime.saveExport(requireWindow(event, getWindow), object(source, 'export source'), format));

  handle(IPC_CHANNELS.ollamaDiagnose, () => runtime.api.ollama.diagnose());
  handle(IPC_CHANNELS.ollamaListInstalled, () => runtime.api.ollama.listInstalled());
  handle(IPC_CHANNELS.ollamaListRunning, () => runtime.api.ollama.listRunning());
  handle(IPC_CHANNELS.ollamaShowCapabilities, (_event, reference: unknown) => runtime.api.ollama.showCapabilities(id(reference, 'model reference')));
  handle(IPC_CHANNELS.ollamaRefreshCatalog, () => runtime.api.ollama.refreshCatalog());
  handle(IPC_CHANNELS.ollamaCatalogState, () => runtime.api.ollama.catalogState());
  handle(IPC_CHANNELS.ollamaDetectHardware, () => runtime.api.ollama.detectHardware());
  handle(IPC_CHANNELS.ollamaEvaluateFit, (_event, tag: CatalogTag) => runtime.api.ollama.evaluateFit(object(tag, 'catalog tag', 128 * 1024)));
  handle(IPC_CHANNELS.ollamaPullList, () => runtime.pulls.listBatches());
  handle(IPC_CHANNELS.ollamaPullCreate, (_event, references: unknown, parallelism?: unknown) => {
    if (!Array.isArray(references) || references.length > 128) throw new Error('Invalid model references.');
    return runtime.pulls.createBatch(references.map((item) => id(item, 'model reference')), typeof parallelism === 'number' ? parallelism : undefined);
  });
  handle(IPC_CHANNELS.ollamaPullRun, (_event, batch: unknown) => runtime.pulls.run(id(batch, 'batch id'), runtime.ollamaClient));
  handle(IPC_CHANNELS.ollamaPullCancel, (_event, batch: unknown) => runtime.pulls.cancelBatch(id(batch, 'batch id')));
  handle(IPC_CHANNELS.ollamaChatList, () => runtime.chat.listSessions());
  handle(IPC_CHANNELS.ollamaChatGet, (_event, session: unknown) => runtime.chat.getSession(id(session, 'session id')));
  handle(IPC_CHANNELS.ollamaChatCreate, (_event, model: unknown, prompt: unknown, params: ChatGenerationParams, title?: unknown) => runtime.chat.createSession(id(model, 'model reference'), text(prompt, 'system prompt'), object(params, 'generation parameters', 16 * 1024), title === undefined ? undefined : text(title, 'title', 200)));
  handle(IPC_CHANNELS.ollamaChatRename, (_event, session: unknown, title: unknown) => runtime.chat.renameSession(id(session, 'session id'), text(title, 'title', 200)));
  handle(IPC_CHANNELS.ollamaChatUpdateSystemPrompt, (_event, session: unknown, prompt: unknown) => runtime.chat.updateSystemPrompt(id(session, 'session id'), text(prompt, 'system prompt')));
  handle(IPC_CHANNELS.ollamaChatUpdateParams, (_event, session: unknown, params: ChatGenerationParams) => runtime.chat.updateParams(id(session, 'session id'), object(params, 'generation parameters', 16 * 1024)));
  handle(IPC_CHANNELS.ollamaChatDelete, (_event, session: unknown) => runtime.chat.deleteSession(id(session, 'session id')));
  handle(IPC_CHANNELS.ollamaChatSend, (_event, session: unknown, content: unknown) => runtime.chat.sendMessage(id(session, 'session id'), runtime.ollamaClient, text(content, 'message')));
  handle(IPC_CHANNELS.ollamaChatRetry, (_event, session: unknown) => runtime.chat.retryLast(id(session, 'session id'), runtime.ollamaClient));
  handle(IPC_CHANNELS.ollamaChatStop, (_event, session: unknown) => runtime.chat.stop(id(session, 'session id')));
  handle(IPC_CHANNELS.ollamaChatExportRedacted, (_event, session: unknown) => runtime.chat.exportSessionRedacted(id(session, 'session id')));

  handle(IPC_CHANNELS.narratorLoadSettings, () => runtime.api.narrator.loadSettings());
  handle(IPC_CHANNELS.narratorUpdateSettings, (_event, value: NarratorSettings) => runtime.api.narrator.updateSettings(object(value, 'narrator settings', 128 * 1024)));
  handle(IPC_CHANNELS.narratorNarrate, (_event, request: NarrationRequest) => runtime.api.narrator.narrate(object(request, 'narration request', 128 * 1024)));
  handle(IPC_CHANNELS.narratorStatus, () => runtime.api.narrator.status());
  handle(IPC_CHANNELS.vocabularyLoad, (_event, source: unknown) => runtime.api.narrator.vocabularyLoad(bytes(source, 'vocabulary bytes')));
  handle(IPC_CHANNELS.vocabularyState, () => runtime.api.narrator.vocabularyState());
  handle(IPC_CHANNELS.vocabularyClear, () => runtime.api.narrator.vocabularyClear());
  handle(IPC_CHANNELS.vocabularyResolve, (_event, key: unknown, shippedText: unknown) => runtime.api.narrator.vocabularyResolve(text(key, 'vocabulary key', 200), text(shippedText, 'shipped text', 8_192)));

  handle(IPC_CHANNELS.authVaultAvailable, () => runtime.auth.isVaultAvailable());
  handle(IPC_CHANNELS.authClockStatus, () => runtime.auth.getClockStatus());
  handle(IPC_CHANNELS.authAcknowledgeClockJump, () => runtime.auth.acknowledgeClockJump());
  handle(IPC_CHANNELS.authBeginRegistration, (_event, options?: BeginRegistrationOptions) => runtime.auth.beginRegistration(options === undefined ? undefined : object(options, 'registration options', 16 * 1024)));
  handle(IPC_CHANNELS.authBeginRegistrationFromSecret, (_event, options: BeginRegistrationFromSecretOptions) => runtime.auth.beginRegistrationFromSecret(object(options, 'registration options', 16 * 1024)));
  handle(IPC_CHANNELS.authBeginRegistrationFromUri, (_event, uri: unknown) => runtime.auth.beginRegistrationFromUri(text(uri, 'otpauth URI', 8_192)));
  handle(IPC_CHANNELS.authPendingRegistration, (_event, pending: unknown) => runtime.auth.getPendingRegistration(id(pending, 'pending registration id')));
  handle(IPC_CHANNELS.authCancelRegistration, (_event, pending: unknown) => runtime.auth.cancelRegistration(id(pending, 'pending registration id')));
  handle(IPC_CHANNELS.authConfirmRegistration, (_event, pending: unknown, code: unknown) => runtime.auth.confirmRegistration(id(pending, 'pending registration id'), text(code, 'code', 16)));
  handle(IPC_CHANNELS.authListEntries, () => runtime.auth.listEntries());
  handle(IPC_CHANNELS.authListGroups, () => runtime.auth.listGroups());
  handle(IPC_CHANNELS.authRenameEntry, (_event, entry: unknown, patch: { issuer?: string; account?: string }) => runtime.auth.renameEntry(id(entry, 'entry id'), object(patch, 'entry patch', 8_192)));
  handle(IPC_CHANNELS.authRemoveEntry, (_event, entry: unknown) => runtime.auth.removeEntry(id(entry, 'entry id')));
  handle(IPC_CHANNELS.authCreateGroup, (_event, name: unknown) => runtime.auth.createGroup(text(name, 'group name', 200)));
  handle(IPC_CHANNELS.authRenameGroup, (_event, group: unknown, name: unknown) => runtime.auth.renameGroup(id(group, 'group id'), text(name, 'group name', 200)));
  handle(IPC_CHANNELS.authRemoveGroup, (_event, group: unknown) => runtime.auth.removeGroup(id(group, 'group id')));
  handle(IPC_CHANNELS.authCurrentCode, (_event, entry: unknown) => runtime.auth.getCurrentCode(id(entry, 'entry id')));

  handle(IPC_CHANNELS.locksList, () => runtime.locks.listLocks());
  handle(IPC_CHANNELS.locksCreate, (_event, target: LockTarget, credential: NewCredential, duration: UnlockDuration) => runtime.locks.createLock(object(target, 'lock target', 16 * 1024), object(credential, 'lock credential', 16 * 1024), object(duration, 'unlock duration', 4 * 1024)));
  handle(IPC_CHANNELS.locksChangeCredential, (_event, lock: unknown, credential: NewCredential) => runtime.locks.changeCredential(id(lock, 'lock id'), object(credential, 'lock credential', 16 * 1024)));
  handle(IPC_CHANNELS.locksSetUnlockDuration, (_event, lock: unknown, duration: UnlockDuration) => runtime.locks.setUnlockDuration(id(lock, 'lock id'), object(duration, 'unlock duration', 4 * 1024)));
  handle(IPC_CHANNELS.locksRemove, (_event, lock: unknown) => runtime.locks.removeLock(id(lock, 'lock id')));
  handle(IPC_CHANNELS.locksAttemptUnlock, (event, lock: unknown, input: UnlockInput) => runtime.locks.attemptUnlock(id(lock, 'lock id'), object(input, 'unlock input', 16 * 1024), trustedSurfaceId(event)));
  handle(IPC_CHANNELS.locksRelock, (_event, lock: unknown) => runtime.locks.relock(id(lock, 'lock id')));
  handle(IPC_CHANNELS.locksIsUnlocked, (event, lock: unknown) => runtime.locks.isUnlocked(id(lock, 'lock id'), trustedSurfaceId(event)));

  handle(IPC_CHANNELS.historyAvailability, () => runtime.api.history.availability());
  handle(IPC_CHANNELS.historyRecords, () => runtime.history.listRecords());
  handle(IPC_CHANNELS.historyRevisions, (_event, recordPath?: unknown, limit?: unknown) => runtime.history.listRevisions({ recordPath: recordPath === undefined ? undefined : text(recordPath, 'record path', 512), limit: typeof limit === 'number' ? Math.max(1, Math.min(1_000, Math.floor(limit))) : undefined }));
  handle(IPC_CHANNELS.historyDiff, (_event, from: unknown, to: unknown, recordPath?: unknown) => runtime.history.diffRevisions(id(from, 'revision hash'), id(to, 'revision hash'), recordPath === undefined ? undefined : text(recordPath, 'record path', 512)));
  handle(IPC_CHANNELS.historyRestore, (_event, hash: unknown, recordPath: unknown) => runtime.history.restoreRevision(id(hash, 'revision hash'), text(recordPath, 'record path', 512)).then(({ content }) => ({ content })));
  handle(IPC_CHANNELS.historyLabel, (_event, hash: unknown, label: unknown) => runtime.history.labelRevision(id(hash, 'revision hash'), text(label, 'history label', 200)));
  handle(IPC_CHANNELS.historyPrune, (_event, policy: RetentionPolicy) => runtime.api.history.prune(object(policy, 'retention policy', 8_192)));
  handle(IPC_CHANNELS.historyExportRedacted, async (_event, format?: unknown) => {
    const selectedFormat = format === 'text' ? 'text' : 'json';
    const redactPaths = selectedFormat === 'json'
      ? (await runtime.history.listRecords()).map((record) => record.recordPath)
      : undefined;
    return runtime.history.exportHistory({ format: selectedFormat, redactPaths });
  });

  handle(IPC_CHANNELS.updaterState, () => runtime.publicUpdaterState());
  handle(IPC_CHANNELS.updaterCheck, async () => runtime.publicUpdaterState(await runtime.updater.check()));
  handle(IPC_CHANNELS.updaterCancel, () => runtime.updater.cancel());
  handle(IPC_CHANNELS.updaterDismiss, () => runtime.updater.dismiss());
  handle(IPC_CHANNELS.updaterApply, () => runtime.updater.applyUpdate());
  handle(IPC_CHANNELS.runtimeStatus, () => runtime.runtimeStatus());
  handle(IPC_CHANNELS.appInfo, (): AppInfo => ({ name: SHIPPED_DISPLAY_NAME, version: app.getVersion(), platform: process.platform, isDev: Boolean(process.env.MEADOWMARK_DEV) }));

  const narratorResponse = (event: Electron.IpcMainEvent, requestId: unknown, ok: unknown, value: unknown): void => {
    const window = getWindow();
    if (
      !window ||
      event.sender.id !== window.webContents.id ||
      event.senderFrame !== window.webContents.mainFrame
    ) return;
    runtime.narratorEngine.resolveResponse(id(requestId, 'narrator request id'), ok === true, value);
  };
  ipcMain.on(IPC_CHANNELS.narratorEngineRespond, narratorResponse);

  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
    ipcMain.removeListener(IPC_CHANNELS.narratorEngineRespond, narratorResponse);
  };
}
<<<<<<< HEAD
=======

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

  ipcMain.handle(
    IPC_CHANNELS.exportsLossReport,
    async (_event, datasetId: ExportDatasetId, format: ExportFormat): Promise<LossReport> => {
      const source = await buildExportSource(datasetId);
      return computeLossReport(source, format);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.exportsWrite,
    async (
      _event,
      datasetId: ExportDatasetId,
      format: ExportFormat,
    ): Promise<ExportWriteResult | { canceled: true }> => {
      const source = await buildExportSource(datasetId);
      const defaultPath = suggestExportFileName(source, format);
      const filters = [{ name: format.toUpperCase(), extensions: [extensionForFormat(format)] }];
      const win = getMainWindow();
      const result = win
        ? await dialog.showSaveDialog(win, { defaultPath, filters })
        : await dialog.showSaveDialog({ defaultPath, filters });
      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }
      const written = await writeExportFile(source, format, result.filePath);
      await recordHistorySnapshot(
        `exports/${datasetId}`,
        written.serialized.contents,
        `Exported ${datasetId} as ${format}`,
        'export',
      );
      return written;
    },
  );

  ipcMain.handle(IPC_CHANNELS.logoListPresets, (): readonly LogoPresetSummary[] => {
    return listLogoPresets();
  });

  ipcMain.handle(IPC_CHANNELS.logoGetManifest, async (): Promise<LogoManifest | null> => {
    return getCurrentLogoManifest(logoUserDataDir());
  });

  ipcMain.handle(IPC_CHANNELS.logoPreviewPreset, (_event, presetId: string): string => {
    return pngDataUrl(encodePng(getPresetImage(presetId)));
  });

  ipcMain.handle(IPC_CHANNELS.logoPreviewCurrent, async (): Promise<string | null> => {
    const dir = logoUserDataDir();
    const manifest = await getCurrentLogoManifest(dir);
    if (!manifest) return null;
    const [firstVariant, ...restVariants] = manifest.variantFiles;
    if (!firstVariant) return null;
    const largest = restVariants.reduce((best, v) => (v.size > best.size ? v : best), firstVariant);
    const png = await readLogoAsset(dir, manifest, { size: largest.size });
    return pngDataUrl(png);
  });

  ipcMain.handle(IPC_CHANNELS.logoApplyPreset, async (_event, presetId: string): Promise<LogoManifest> => {
    const manifest = await applyPresetSelection(logoUserDataDir(), presetId);
    await recordHistorySnapshot('logo/manifest.json', JSON.stringify(manifest, null, 2), `Set logo to preset "${presetId}"`, 'logo');
    return manifest;
  });

  ipcMain.handle(
    IPC_CHANNELS.logoPickAndApplyCustom,
    async (): Promise<LogoManifest | { canceled: true }> => {
      const win = getMainWindow();
      const openOptions: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [{ name: 'PNG image', extensions: ['png'] }],
      };
      const picked = win ? await dialog.showOpenDialog(win, openOptions) : await dialog.showOpenDialog(openOptions);
      if (picked.canceled || picked.filePaths.length === 0) {
        return { canceled: true };
      }
      const filePath = picked.filePaths[0];
      if (!filePath) return { canceled: true };
      const bytes = await fs.readFile(filePath);
      const manifest = await applyCustomSelection(logoUserDataDir(), bytes, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, a: 0 },
      });
      await recordHistorySnapshot('logo/manifest.json', JSON.stringify(manifest, null, 2), 'Set logo to a custom upload', 'logo');
      return manifest;
    },
  );

  ipcMain.handle(IPC_CHANNELS.logoReset, async (): Promise<void> => {
    await resetLogoToShippedDefault(logoUserDataDir());
    await recordHistorySnapshot('logo/manifest.json', 'null', 'Reset logo to the shipped default', 'logo');
  });
}

function logoUserDataDir(): string {
  return app.getPath('userData');
}

function pngDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** Builds the generic ExportSource for one of the app's known datasets,
 * straight from the live store each dataset already owns. Both stores hold
 * intentionally loose placeholder shapes (see app-types.ts) rather than the
 * real domain schema from @meadowmark/shared, so the cast to ExportSource's
 * JsonValue is the same boundary loosening ipc.ts already does elsewhere in
 * this file when handing the placeholder types to a typed subsystem. */
async function buildExportSource(datasetId: ExportDatasetId): Promise<ExportSource> {
  if (datasetId === 'settings') {
    const store = await getSettingsStore();
    const values = store.getBase() as unknown as Record<string, unknown>;
    return {
      name: 'meadowmark-settings',
      schemaVersion: '1',
      title: 'Meadowmark settings',
      value: values as unknown as ExportSource['value'],
    };
  }
  const state = await gameStore.load();
  return {
    name: 'meadowmark-save',
    schemaVersion: '1',
    title: 'Meadowmark save',
    value: (state ?? {}) as unknown as ExportSource['value'],
  };
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
>>>>>>> worktree-wf_53ab3037-0c3-5
