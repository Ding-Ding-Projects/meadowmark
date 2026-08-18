/** Sandboxed preload bridge. Value imports stay limited to Electron and the leaf channel table. */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc-channels';
import type { MeadowmarkApi, NarratorEngineHandler, PublicUpdaterState, RuntimeStatusSnapshot } from './runtime-contract';
import type { GameState, Settings } from './app-types';

export type { MeadowmarkApi } from './runtime-contract';

interface NarratorEngineMessage {
  id: string;
  kind: 'listVoices' | 'speak' | 'cancel' | 'screenReader';
  payload?: unknown;
}

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>;

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T): void => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

let removeNarratorEngineListener: (() => void) | null = null;

function registerNarratorEngine(handler: NarratorEngineHandler): () => void {
  removeNarratorEngineListener?.();
  const listener = async (_event: Electron.IpcRendererEvent, message: NarratorEngineMessage): Promise<void> => {
    if (!message || typeof message.id !== 'string' || message.id.length > 256) return;
    try {
      let value: unknown;
      switch (message.kind) {
        case 'listVoices': value = await handler.listVoices(); break;
        case 'speak': value = await handler.speak(message.payload as Parameters<NarratorEngineHandler['speak']>[0]); break;
        case 'screenReader': value = handler.isScreenReaderActive ? await handler.isScreenReaderActive() : false; break;
        case 'cancel': handler.cancelSpeaking(); return;
        default: return;
      }
      ipcRenderer.send(IPC_CHANNELS.narratorEngineRespond, message.id, true, value);
    } catch (error) {
      ipcRenderer.send(IPC_CHANNELS.narratorEngineRespond, message.id, false, error instanceof Error ? error.message : 'Narrator engine request failed.');
    }
  };
  ipcRenderer.on(IPC_CHANNELS.narratorEngineRequest, listener);
  removeNarratorEngineListener = () => {
    ipcRenderer.removeListener(IPC_CHANNELS.narratorEngineRequest, listener);
    removeNarratorEngineListener = null;
  };
  return removeNarratorEngineListener;
}

const api: MeadowmarkApi = {
  window: {
    minimize: () => invoke(IPC_CHANNELS.windowMinimize),
    maximize: () => invoke(IPC_CHANNELS.windowMaximize),
    close: () => invoke(IPC_CHANNELS.windowClose),
    onMaximizedChanged: (callback) => subscribe(IPC_CHANNELS.windowMaximizedChanged, callback),
  },
  loadGame: () => invoke(IPC_CHANNELS.loadGame),
  saveGame: (state: GameState) => invoke(IPC_CHANNELS.saveGame, state),
  loadSettings: () => invoke(IPC_CHANNELS.loadSettings),
  saveSettings: (settings: Settings) => invoke(IPC_CHANNELS.saveSettings, settings),
  settings: {
    load: () => invoke(IPC_CHANNELS.settingsServiceLoad),
    set: (key, value) => invoke(IPC_CHANNELS.settingsServiceSet, key, value),
    setMany: (values) => invoke(IPC_CHANNELS.settingsServiceSetMany, values),
    resetToDefault: (key) => invoke(IPC_CHANNELS.settingsServiceResetToDefault, key),
    resetAllToDefaults: () => invoke(IPC_CHANNELS.settingsServiceResetAllToDefaults),
  },
  schedules: {
    list: () => invoke(IPC_CHANNELS.schedulesList),
    replace: (rules) => invoke(IPC_CHANNELS.schedulesReplace, rules),
    effective: (atIso) => invoke(IPC_CHANNELS.schedulesEffective, atIso),
  },
  logo: {
    listPresets: () => invoke(IPC_CHANNELS.logoListPresets),
    current: () => invoke(IPC_CHANNELS.logoCurrent),
    applyPreset: (presetId) => invoke(IPC_CHANNELS.logoApplyPreset, presetId),
    applyCustom: (sourceBytes, edits) => invoke(IPC_CHANNELS.logoApplyCustom, sourceBytes, edits),
    readAsset: (which) => invoke(IPC_CHANNELS.logoReadAsset, which),
    reset: () => invoke(IPC_CHANNELS.logoReset),
  },
  converter: {
    listCatalog: () => invoke(IPC_CHANNELS.converterListCatalog),
    listCategory: (category) => invoke(IPC_CHANNELS.converterListCategory, category),
    searchCatalog: (query, category) => invoke(IPC_CHANNELS.converterSearchCatalog, query, category),
    pickSource: () => invoke(IPC_CHANNELS.converterPickSource),
    detect: (sourceHandle) => invoke(IPC_CHANNELS.converterDetect, sourceHandle),
    convert: (sourceHandle, entryId, suggestedFileName) => invoke(IPC_CHANNELS.converterConvert, sourceHandle, entryId, suggestedFileName),
    extract: (sourceHandle, entryId) => invoke(IPC_CHANNELS.converterExtract, sourceHandle, entryId),
  },
  exports: {
    preview: (source, format) => invoke(IPC_CHANNELS.exportsPreview, source, format),
    lossReport: (source, format) => invoke(IPC_CHANNELS.exportsLossReport, source, format),
    save: (source, format) => invoke(IPC_CHANNELS.exportsSave, source, format),
  },
  ollama: {
    diagnose: () => invoke(IPC_CHANNELS.ollamaDiagnose),
    listInstalled: () => invoke(IPC_CHANNELS.ollamaListInstalled),
    listRunning: () => invoke(IPC_CHANNELS.ollamaListRunning),
    showCapabilities: (reference) => invoke(IPC_CHANNELS.ollamaShowCapabilities, reference),
    refreshCatalog: () => invoke(IPC_CHANNELS.ollamaRefreshCatalog),
    catalogState: () => invoke(IPC_CHANNELS.ollamaCatalogState),
    detectHardware: () => invoke(IPC_CHANNELS.ollamaDetectHardware),
    evaluateFit: (tag) => invoke(IPC_CHANNELS.ollamaEvaluateFit, tag),
    pulls: {
      list: () => invoke(IPC_CHANNELS.ollamaPullList),
      create: (references, parallelism) => invoke(IPC_CHANNELS.ollamaPullCreate, references, parallelism),
      run: (batchId) => invoke(IPC_CHANNELS.ollamaPullRun, batchId),
      cancel: (batchId) => invoke(IPC_CHANNELS.ollamaPullCancel, batchId),
    },
    chat: {
      list: () => invoke(IPC_CHANNELS.ollamaChatList),
      get: (sessionId) => invoke(IPC_CHANNELS.ollamaChatGet, sessionId),
      create: (model, systemPrompt, params, title) => invoke(IPC_CHANNELS.ollamaChatCreate, model, systemPrompt, params, title),
      rename: (sessionId, title) => invoke(IPC_CHANNELS.ollamaChatRename, sessionId, title),
      updateSystemPrompt: (sessionId, systemPrompt) => invoke(IPC_CHANNELS.ollamaChatUpdateSystemPrompt, sessionId, systemPrompt),
      updateParams: (sessionId, params) => invoke(IPC_CHANNELS.ollamaChatUpdateParams, sessionId, params),
      delete: (sessionId) => invoke(IPC_CHANNELS.ollamaChatDelete, sessionId),
      send: (sessionId, content) => invoke(IPC_CHANNELS.ollamaChatSend, sessionId, content),
      retry: (sessionId) => invoke(IPC_CHANNELS.ollamaChatRetry, sessionId),
      stop: (sessionId) => invoke(IPC_CHANNELS.ollamaChatStop, sessionId),
      exportRedacted: (sessionId) => invoke(IPC_CHANNELS.ollamaChatExportRedacted, sessionId),
    },
  },
  narrator: {
    loadSettings: () => invoke(IPC_CHANNELS.narratorLoadSettings),
    updateSettings: (settings) => invoke(IPC_CHANNELS.narratorUpdateSettings, settings),
    narrate: (request) => invoke(IPC_CHANNELS.narratorNarrate, request),
    status: () => invoke(IPC_CHANNELS.narratorStatus),
    registerEngine: registerNarratorEngine,
    vocabulary: {
      load: (sourceBytes) => invoke(IPC_CHANNELS.vocabularyLoad, sourceBytes),
      state: () => invoke(IPC_CHANNELS.vocabularyState),
      clear: () => invoke(IPC_CHANNELS.vocabularyClear),
      resolve: (key, shippedText) => invoke(IPC_CHANNELS.vocabularyResolve, key, shippedText),
    },
  },
  authenticator: {
    vaultAvailable: () => invoke(IPC_CHANNELS.authVaultAvailable),
    clockStatus: () => invoke(IPC_CHANNELS.authClockStatus),
    acknowledgeClockJump: () => invoke(IPC_CHANNELS.authAcknowledgeClockJump),
    beginRegistration: (options) => invoke(IPC_CHANNELS.authBeginRegistration, options),
    beginRegistrationFromSecret: (options) => invoke(IPC_CHANNELS.authBeginRegistrationFromSecret, options),
    beginRegistrationFromUri: (uri) => invoke(IPC_CHANNELS.authBeginRegistrationFromUri, uri),
    pendingRegistration: (pendingId) => invoke(IPC_CHANNELS.authPendingRegistration, pendingId),
    cancelRegistration: (pendingId) => invoke(IPC_CHANNELS.authCancelRegistration, pendingId),
    confirmRegistration: (pendingId, code) => invoke(IPC_CHANNELS.authConfirmRegistration, pendingId, code),
    listEntries: () => invoke(IPC_CHANNELS.authListEntries),
    listGroups: () => invoke(IPC_CHANNELS.authListGroups),
    renameEntry: (entryId, patch) => invoke(IPC_CHANNELS.authRenameEntry, entryId, patch),
    removeEntry: (entryId) => invoke(IPC_CHANNELS.authRemoveEntry, entryId),
    createGroup: (name) => invoke(IPC_CHANNELS.authCreateGroup, name),
    renameGroup: (groupId, name) => invoke(IPC_CHANNELS.authRenameGroup, groupId, name),
    removeGroup: (groupId) => invoke(IPC_CHANNELS.authRemoveGroup, groupId),
    currentCode: (entryId) => invoke(IPC_CHANNELS.authCurrentCode, entryId),
  },
  locks: {
    list: () => invoke(IPC_CHANNELS.locksList),
    create: (target, credential, duration) => invoke(IPC_CHANNELS.locksCreate, target, credential, duration),
    changeCredential: (lockId, credential) => invoke(IPC_CHANNELS.locksChangeCredential, lockId, credential),
    setUnlockDuration: (lockId, duration) => invoke(IPC_CHANNELS.locksSetUnlockDuration, lockId, duration),
    remove: (lockId) => invoke(IPC_CHANNELS.locksRemove, lockId),
    attemptUnlock: (lockId, input) => invoke(IPC_CHANNELS.locksAttemptUnlock, lockId, input),
    relock: (lockId) => invoke(IPC_CHANNELS.locksRelock, lockId),
    isUnlocked: (lockId) => invoke(IPC_CHANNELS.locksIsUnlocked, lockId),
  },
  history: {
    availability: () => invoke(IPC_CHANNELS.historyAvailability),
    records: () => invoke(IPC_CHANNELS.historyRecords),
    revisions: (recordPath, limit) => invoke(IPC_CHANNELS.historyRevisions, recordPath, limit),
    diff: (fromHash, toHash, recordPath) => invoke(IPC_CHANNELS.historyDiff, fromHash, toHash, recordPath),
    restore: (hash, recordPath) => invoke(IPC_CHANNELS.historyRestore, hash, recordPath),
    label: (hash, label) => invoke(IPC_CHANNELS.historyLabel, hash, label),
    prune: (policy) => invoke(IPC_CHANNELS.historyPrune, policy),
    exportRedacted: (format) => invoke(IPC_CHANNELS.historyExportRedacted, format),
  },
  updater: {
    state: () => invoke(IPC_CHANNELS.updaterState),
    check: () => invoke(IPC_CHANNELS.updaterCheck),
    cancel: () => invoke(IPC_CHANNELS.updaterCancel),
    dismiss: () => invoke(IPC_CHANNELS.updaterDismiss),
    apply: () => invoke(IPC_CHANNELS.updaterApply),
    onStateChanged: (callback: (state: PublicUpdaterState) => void) => subscribe(IPC_CHANNELS.updaterStateChanged, callback),
  },
  status: {
    snapshot: () => invoke(IPC_CHANNELS.runtimeStatus),
    onChanged: (callback: (status: RuntimeStatusSnapshot) => void) => subscribe(IPC_CHANNELS.runtimeStatusChanged, callback),
  },
  appInfo: () => invoke(IPC_CHANNELS.appInfo),
};

contextBridge.exposeInMainWorld('meadowmark', api);

declare global {
  interface Window { meadowmark: MeadowmarkApi; }
}
