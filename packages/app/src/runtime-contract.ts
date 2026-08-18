import type { AppInfo, GameState, Settings, SettingsLoadPayload } from './app-types';
import type {
  ClockStatus,
  AuthEntry,
  AuthGroup,
  BeginRegistrationFromSecretOptions,
  BeginRegistrationOptions,
  CurrentCodeResult,
  PendingRegistrationSummary,
} from './services/auth';
import type {
  ConverterCategory,
  DetectionCandidate,
  ExtractedEntry,
  RegistryEntry,
} from './services/converter';
import type {
  LogoEditParams,
  LogoManifest,
  LogoPresetSummary,
} from './services/logo';
import type { ExportFormat, ExportSource, LossReport, SerializedExport } from './services/exports';
import type {
  DiffResult,
  HistoryAvailability,
  PruneResult,
  RecordSummary,
  RetentionPolicy,
  Revision,
} from './services/history';
import type {
  LockSummary,
  LockTarget,
  NewCredential,
  UnlockDuration,
  UnlockInput,
  UnlockResult,
} from './services/locks';
import type {
  NarrationOutcome,
  NarrationRequest,
  NarratorSettings,
  NarratorStatus,
  SpeakInstruction,
  SpeakOutcome,
  VoiceDescriptor,
  VocabularyRejectionReason,
  VocabularyValidationResult,
} from './services/narrator';
import type {
  CatalogState,
  CatalogTag,
  ChatGenerationParams,
  ChatMessage,
  ChatSession,
  ChatSessionSummary,
  FitEvidence,
  HardwareSnapshot,
  InstalledModel,
  ModelCapabilities,
  OllamaDiagnosis,
  PullBatchState,
  RunningModel,
} from './services/ollama';
import type {
  EffectiveSettingsResult,
  ScheduledRule,
  SettingsKey,
  SettingsLoadResult,
  SettingsProvenance,
  SettingsValues,
} from './services/settings';
import type { UpdaterState } from './services/updater';

export type ConverterRegistryEntry = Omit<
  RegistryEntry,
  'convert' | 'extractToDirectory' | 'validateOutput'
>;

export type PublicVocabularyState =
  | { kind: 'no-file' }
  | { kind: 'active'; entryCount: number }
  | { kind: 'rejected'; reason: VocabularyRejectionReason; detail: string };

export type PublicUpdaterState =
  | Exclude<UpdaterState, { status: 'ready' }>
  | Omit<Extract<UpdaterState, { status: 'ready' }>, 'packagePath'>;

export interface SettingsServiceSnapshot {
  values: SettingsValues;
  provenance: SettingsProvenance;
  loadResult: SettingsLoadResult;
}

export interface SelectedSourceFile {
  handle: string;
  name: string;
  size: number;
}

export interface RuntimeStatusSnapshot {
  checkedAt: string;
  history: HistoryAvailability;
  secureVaultAvailable: boolean;
  updater: PublicUpdaterState;
  ollama: OllamaDiagnosis;
  narrator: NarratorStatus;
}

export interface NarratorEngineHandler {
  listVoices: () => Promise<VoiceDescriptor[]>;
  speak: (instruction: SpeakInstruction) => Promise<SpeakOutcome>;
  cancelSpeaking: () => void;
  isScreenReaderActive?: () => Promise<boolean>;
}

export interface MeadowmarkApi {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
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
  schedules: {
    list: () => Promise<readonly ScheduledRule[]>;
    replace: (rules: readonly ScheduledRule[]) => Promise<readonly ScheduledRule[]>;
    effective: (atIso?: string) => Promise<EffectiveSettingsResult>;
  };
  logo: {
    listPresets: () => Promise<readonly LogoPresetSummary[]>;
    current: () => Promise<LogoManifest | null>;
    applyPreset: (presetId: string) => Promise<LogoManifest>;
    applyCustom: (sourceBytes: Uint8Array, edits: LogoEditParams) => Promise<LogoManifest>;
    readAsset: (which: { size: number } | 'ico') => Promise<Uint8Array | null>;
    reset: () => Promise<void>;
  };
  converter: {
    listCatalog: () => Promise<readonly ConverterRegistryEntry[]>;
    listCategory: (category: ConverterCategory) => Promise<readonly ConverterRegistryEntry[]>;
    searchCatalog: (query: string, category?: ConverterCategory) => Promise<readonly ConverterRegistryEntry[]>;
    pickSource: () => Promise<SelectedSourceFile | null>;
    detect: (sourceHandle: string) => Promise<readonly DetectionCandidate[]>;
    convert: (
      sourceHandle: string,
      entryId: string,
      suggestedFileName?: string,
    ) => Promise<{ cancelled: boolean; bytesWritten?: number; fileName?: string }>;
    extract: (
      sourceHandle: string,
      entryId: string,
    ) => Promise<{ cancelled: boolean; entries?: readonly ExtractedEntry[] }>;
  };
  exports: {
    preview: (source: ExportSource, format: ExportFormat) => Promise<SerializedExport>;
    lossReport: (source: ExportSource, format: ExportFormat) => Promise<LossReport>;
    save: (
      source: ExportSource,
      format: ExportFormat,
    ) => Promise<{ cancelled: boolean; bytesWritten?: number; fileName?: string }>;
  };
  ollama: {
    diagnose: () => Promise<OllamaDiagnosis>;
    listInstalled: () => Promise<InstalledModel[]>;
    listRunning: () => Promise<RunningModel[]>;
    showCapabilities: (reference: string) => Promise<ModelCapabilities>;
    refreshCatalog: () => Promise<CatalogState>;
    catalogState: () => Promise<CatalogState>;
    detectHardware: () => Promise<HardwareSnapshot>;
    evaluateFit: (tag: CatalogTag) => Promise<FitEvidence>;
    pulls: {
      list: () => Promise<PullBatchState[]>;
      create: (references: string[], parallelism?: number) => Promise<PullBatchState>;
      run: (batchId: string) => Promise<PullBatchState>;
      cancel: (batchId: string) => Promise<void>;
    };
    chat: {
      list: () => Promise<ChatSessionSummary[]>;
      get: (sessionId: string) => Promise<ChatSession | null>;
      create: (
        model: string,
        systemPrompt: string,
        params: ChatGenerationParams,
        title?: string,
      ) => Promise<ChatSession>;
      rename: (sessionId: string, title: string) => Promise<void>;
      updateSystemPrompt: (sessionId: string, systemPrompt: string) => Promise<void>;
      updateParams: (sessionId: string, params: ChatGenerationParams) => Promise<void>;
      delete: (sessionId: string) => Promise<void>;
      send: (sessionId: string, content: string) => Promise<ChatMessage>;
      retry: (sessionId: string) => Promise<ChatMessage>;
      stop: (sessionId: string) => Promise<void>;
      exportRedacted: (sessionId: string) => Promise<string>;
    };
  };
  narrator: {
    loadSettings: () => Promise<NarratorSettings>;
    updateSettings: (settings: NarratorSettings) => Promise<void>;
    narrate: (request: NarrationRequest) => Promise<NarrationOutcome>;
    status: () => Promise<NarratorStatus>;
    registerEngine: (handler: NarratorEngineHandler) => () => void;
    vocabulary: {
      load: (sourceBytes: Uint8Array) => Promise<VocabularyValidationResult>;
      state: () => Promise<PublicVocabularyState>;
      clear: () => Promise<void>;
      resolve: (key: string, shippedText: string) => Promise<string>;
    };
  };
  authenticator: {
    vaultAvailable: () => Promise<boolean>;
    clockStatus: () => Promise<ClockStatus>;
    acknowledgeClockJump: () => Promise<void>;
    beginRegistration: (options?: BeginRegistrationOptions) => Promise<PendingRegistrationSummary>;
    beginRegistrationFromSecret: (
      options: BeginRegistrationFromSecretOptions,
    ) => Promise<PendingRegistrationSummary>;
    beginRegistrationFromUri: (uri: string) => Promise<PendingRegistrationSummary>;
    pendingRegistration: (pendingId: string) => Promise<PendingRegistrationSummary>;
    cancelRegistration: (pendingId: string) => Promise<void>;
    confirmRegistration: (pendingId: string, code: string) => Promise<AuthEntry>;
    listEntries: () => Promise<AuthEntry[]>;
    listGroups: () => Promise<AuthGroup[]>;
    renameEntry: (entryId: string, patch: { issuer?: string; account?: string }) => Promise<AuthEntry>;
    removeEntry: (entryId: string) => Promise<void>;
    createGroup: (name: string) => Promise<AuthGroup>;
    renameGroup: (groupId: string, name: string) => Promise<AuthGroup>;
    removeGroup: (groupId: string) => Promise<void>;
    currentCode: (entryId: string) => Promise<CurrentCodeResult>;
  };
  locks: {
    list: () => Promise<LockSummary[]>;
    create: (
      target: LockTarget,
      credential: NewCredential,
      unlockDuration: UnlockDuration,
    ) => Promise<LockSummary>;
    changeCredential: (lockId: string, credential: NewCredential) => Promise<LockSummary>;
    setUnlockDuration: (lockId: string, duration: UnlockDuration) => Promise<LockSummary>;
    remove: (lockId: string) => Promise<boolean>;
    attemptUnlock: (lockId: string, input: UnlockInput) => Promise<UnlockResult>;
    relock: (lockId: string) => Promise<void>;
    isUnlocked: (lockId: string) => Promise<boolean>;
  };
  history: {
    availability: () => Promise<HistoryAvailability>;
    records: () => Promise<RecordSummary[]>;
    revisions: (recordPath?: string, limit?: number) => Promise<Revision[]>;
    diff: (fromHash: string, toHash: string, recordPath?: string) => Promise<DiffResult>;
    restore: (hash: string, recordPath: string) => Promise<{ content: string }>;
    label: (hash: string, label: string) => Promise<void>;
    prune: (policy: RetentionPolicy) => Promise<PruneResult>;
    exportRedacted: (format?: 'json' | 'text') => Promise<string>;
  };
  updater: {
    state: () => Promise<PublicUpdaterState>;
    check: () => Promise<PublicUpdaterState>;
    cancel: () => Promise<void>;
    dismiss: () => Promise<void>;
    apply: () => Promise<void>;
    onStateChanged: (callback: (state: PublicUpdaterState) => void) => () => void;
  };
  status: {
    snapshot: () => Promise<RuntimeStatusSnapshot>;
    onChanged: (callback: (snapshot: RuntimeStatusSnapshot) => void) => () => void;
  };
  appInfo: () => Promise<AppInfo>;
}
