import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import type { GameState } from './app-types';
import { JsonStore, dataDir } from './store';
import {
  AuthService,
  type BeginRegistrationFromSecretOptions,
  type BeginRegistrationOptions,
} from './services/auth';
import {
  convertFile,
  detectSourceFile,
  extractArchive,
  getConverterRegistry,
  listEntriesForCategory,
  searchRegistry,
  type ConverterCategory,
} from './services/converter';
import {
  computeLossReport,
  serializeExport,
  suggestExportFileName,
  writeExportFile,
  type ExportFormat,
  type ExportSource,
} from './services/exports';
import { HistoryStore, defaultHistoryRepoDir, type HistoryAvailability, type RetentionPolicy } from './services/history';
import { createLocksSubsystem, type NewCredential, type TotpVerifier } from './services/locks';
import {
  NarratorController,
  NarratorSettingsStore,
  PersonalVocabularyLoader,
  resolveVocabularyText,
  type NarrationRequest,
  type NarratorEnginePort,
  type NarratorSettings,
  type SpeakInstruction,
  type SpeakOutcome,
  type VoiceDescriptor,
} from './services/narrator';
import {
  buildCatalogState,
  CatalogCache,
  ChatManager,
  diagnoseConnection,
  detectHardware,
  evaluateFit,
  listInstalledModels,
  listRunningModels,
  LoopbackClient,
  OllamaWebCatalogSource,
  PullQueueManager,
  refreshCatalog,
  showModelCapabilities,
  type CatalogTag,
  type ChatGenerationParams,
} from './services/ollama';
import {
  computeEffectiveSettings,
  SettingsStore,
  validateScheduledRule,
  type ScheduledRule,
  type SettingsKey,
  type SettingsLoadResult,
  type SettingsValues,
} from './services/settings';
import { UpdaterService } from './services/updater';
import {
  applyCustomSelection,
  applyPresetSelection,
  getCurrentLogoManifest,
  listLogoPresets,
  readLogoAsset,
  resetLogoToShippedDefault,
  type LogoEditParams,
} from './services/logo';
import type {
  ConverterRegistryEntry,
  PublicUpdaterState,
  PublicVocabularyState,
  RuntimeStatusSnapshot,
  SelectedSourceFile,
  SettingsServiceSnapshot,
} from './runtime-contract';

const MAX_SELECTED_FILES = 32;
const SELECTED_FILE_TTL_MS = 30 * 60 * 1_000;
const MAX_EXPORT_SOURCE_BYTES = 8 * 1024 * 1024;
const SCHEDULES_SCHEMA_VERSION = 1;

interface SelectedFileRecord extends SelectedSourceFile {
  path: string;
  selectedAt: number;
}

interface ScheduleDocument {
  rules: ScheduledRule[];
}

interface PendingNarratorRequest {
  kind: Exclude<NarratorRequestKind, 'cancel'>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

type NarratorRequestKind = 'listVoices' | 'speak' | 'cancel' | 'screenReader';

export interface NarratorEngineMessage {
  id: string;
  kind: NarratorRequestKind;
  payload?: SpeakInstruction;
}

/**
 * Main-process-owned request/response bridge for Web Speech. The renderer
 * receives only bounded narration instructions; it never receives file,
 * network, vault, or process capabilities.
 */
export class RendererNarratorEnginePort implements NarratorEnginePort {
  private sender: ((message: NarratorEngineMessage) => void) | null = null;
  private readonly pending = new Map<string, PendingNarratorRequest>();

  setSender(sender: ((message: NarratorEngineMessage) => void) | null): void {
    this.sender = sender;
    if (!sender) this.rejectAll(new Error('The narrator renderer is unavailable.'));
  }

  async listVoices(): Promise<VoiceDescriptor[]> {
    return this.request<VoiceDescriptor[]>('listVoices');
  }

  async speak(instruction: SpeakInstruction): Promise<SpeakOutcome> {
    return this.request<SpeakOutcome>('speak', instruction);
  }

  cancelSpeaking(): void {
    this.sender?.({ id: randomUUID(), kind: 'cancel' });
  }

  async isScreenReaderActive(): Promise<boolean> {
    return this.request<boolean>('screenReader').catch(() => false);
  }

  resolveResponse(id: string, ok: boolean, value: unknown): void {
    const request = this.pending.get(id);
    if (!request) return;
    clearTimeout(request.timer);
    this.pending.delete(id);
    if (ok) {
      try {
        request.resolve(this.validateResponse(request.kind, value));
      } catch (error) {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    else request.reject(new Error(typeof value === 'string' ? value : 'Narrator engine request failed.'));
  }

  dispose(): void {
    this.sender = null;
    this.rejectAll(new Error('The narrator bridge is shutting down.'));
  }

  private request<T>(kind: Exclude<NarratorRequestKind, 'cancel'>, payload?: SpeakInstruction): Promise<T> {
    if (!this.sender) return Promise.reject(new Error('The narrator renderer is unavailable.'));
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Narrator engine request "${kind}" timed out.`));
      }, 15_000);
      timer.unref?.();
      this.pending.set(id, { kind, resolve: (value) => resolve(value as T), reject, timer });
      this.sender?.({ id, kind, payload });
    });
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }

  private validateResponse(kind: Exclude<NarratorRequestKind, 'cancel'>, value: unknown): unknown {
    if (kind === 'screenReader') {
      if (typeof value !== 'boolean') throw new Error('Narrator engine returned an invalid screen-reader state.');
      return value;
    }
    if (kind === 'listVoices') {
      if (!Array.isArray(value) || value.length > 256) throw new Error('Narrator engine returned an invalid voice list.');
      return value.map((candidate) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
          throw new Error('Narrator engine returned an invalid voice descriptor.');
        }
        const voice = candidate as Partial<VoiceDescriptor>;
        if (
          typeof voice.id !== 'string' || voice.id.length === 0 || voice.id.length > 512 ||
          typeof voice.name !== 'string' || voice.name.length > 256 ||
          typeof voice.lang !== 'string' || voice.lang.length > 64 ||
          typeof voice.localService !== 'boolean'
        ) throw new Error('Narrator engine returned an invalid voice descriptor.');
        return { id: voice.id, name: voice.name, lang: voice.lang, localService: voice.localService };
      });
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Narrator engine returned an invalid speech result.');
    }
    const outcome = value as Partial<SpeakOutcome> & Record<string, unknown>;
    if (!['completed', 'voice-not-installed', 'no-voice-for-language', 'error'].includes(String(outcome.kind))) {
      throw new Error('Narrator engine returned an unknown speech result.');
    }
    for (const field of ['usedVoiceId', 'usedVoiceName', 'fellBackToVoiceId', 'message']) {
      const fieldValue = outcome[field];
      if (fieldValue !== undefined && fieldValue !== null && (typeof fieldValue !== 'string' || fieldValue.length > 1_024)) {
        throw new Error('Narrator engine returned an oversized speech result.');
      }
    }
    return value;
  }
}

export class AppRuntime {
  readonly auth = new AuthService();
  readonly history = new HistoryStore(defaultHistoryRepoDir(dataDir()));
  readonly ollamaClient = new LoopbackClient();
  readonly pulls = new PullQueueManager();
  readonly chat = new ChatManager();
  readonly catalogCache = new CatalogCache();
  readonly updater = new UpdaterService({ stagingDir: path.join(dataDir(), 'updates') });
  readonly narratorEngine = new RendererNarratorEnginePort();
  readonly vocabulary = new PersonalVocabularyLoader();
  readonly locks = createLocksSubsystem({ totp: this.createTotpVerifier() }).locks;

  private readonly gameStore = new JsonStore<GameState | null>({
    fileName: 'save.json',
    schemaVersion: 1,
    defaultValue: () => null,
  });
  private readonly schedulesStore = new JsonStore<ScheduleDocument>({
    fileName: 'scheduled-settings.json',
    schemaVersion: SCHEDULES_SCHEMA_VERSION,
    defaultValue: () => ({ rules: [] }),
  });
  private readonly settingsStore = new SettingsStore(path.join(dataDir(), 'settings.json'));
  private readonly narrator = new NarratorController({
    engine: this.narratorEngine,
    settingsStore: new NarratorSettingsStore(),
  });
  private readonly selectedFiles = new Map<string, SelectedFileRecord>();
  private settingsLoadResult: SettingsLoadResult = { fileExisted: false, warnings: [] };
  private historyAvailability: HistoryAvailability = {
    available: false,
    reason: 'History has not initialized yet.',
  };
  private catalogLastError: string | null = null;
  private disposed = false;
  private readonly activeOperations = new Set<Promise<unknown>>();

  async initialize(): Promise<void> {
    this.settingsLoadResult = await this.settingsStore.load();
    await this.narrator.loadSettings();
    this.historyAvailability = await this.history.init();
    await this.updater.checkPendingInstallOnStartup().catch(() => null);
    this.updater.startBackgroundSchedule();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.updater.stopBackgroundSchedule();
    this.updater.cancel();
    this.narratorEngine.cancelSpeaking();
    this.narratorEngine.dispose();
    this.auth.dispose();
    const teardown = (async (): Promise<void> => {
      const [batches, sessions] = await Promise.all([
        this.pulls.listBatches().catch(() => []),
        this.chat.listSessions().catch(() => []),
      ]);
      for (const batch of batches) this.pulls.cancelBatch(batch.id);
      for (const session of sessions) this.chat.stop(session.id);
      await Promise.allSettled([
        this.updater.stopAndWaitUntilIdle(),
        ...this.activeOperations,
      ]);
    })();
    await Promise.race([
      teardown,
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5_000);
        timer.unref?.();
      }),
    ]);
    this.selectedFiles.clear();
  }

  assertActive(): void {
    if (this.disposed) throw new Error('The application runtime is shutting down.');
  }

  trackOperation<T>(operation: Promise<T>): Promise<T> {
    this.assertActive();
    this.activeOperations.add(operation);
    void operation.finally(() => this.activeOperations.delete(operation)).catch(() => undefined);
    return operation;
  }

  async loadGame(): Promise<GameState | null> {
    return this.gameStore.load();
  }

  async saveGame(state: GameState): Promise<void> {
    await this.gameStore.save(state);
    await this.recordHistory('save.json', state, 'Saved game state', 'settings-change');
  }

  settingsSnapshot(): SettingsServiceSnapshot {
    return {
      values: this.settingsStore.getBase(),
      provenance: this.settingsStore.getBaseProvenance(),
      loadResult: this.settingsLoadResult,
    };
  }

  async setSetting<K extends SettingsKey>(key: K, value: SettingsValues[K]): Promise<SettingsServiceSnapshot> {
    await this.settingsStore.set(key, value);
    await this.recordSettingsHistory(`Changed setting "${key}"`);
    return this.settingsSnapshot();
  }

  async setSettings(values: Partial<SettingsValues>): Promise<SettingsServiceSnapshot> {
    await this.settingsStore.setMany(values);
    await this.recordSettingsHistory('Changed settings');
    return this.settingsSnapshot();
  }

  async resetSetting(key: SettingsKey): Promise<SettingsServiceSnapshot> {
    await this.settingsStore.resetToDefault(key);
    await this.recordSettingsHistory(`Reset setting "${key}"`);
    return this.settingsSnapshot();
  }

  async resetSettings(): Promise<SettingsServiceSnapshot> {
    await this.settingsStore.resetAllToDefaults();
    await this.recordSettingsHistory('Reset all settings');
    return this.settingsSnapshot();
  }

  async listSchedules(): Promise<readonly ScheduledRule[]> {
    return (await this.schedulesStore.load()).rules;
  }

  async replaceSchedules(rules: readonly ScheduledRule[]): Promise<readonly ScheduledRule[]> {
    for (const rule of rules) {
      const result = validateScheduledRule(rule);
      if (!result.valid) throw new Error(`Invalid scheduled rule: ${result.errors.join(' ')}`);
    }
    const copied = rules.map((rule) => structuredClone(rule));
    await this.schedulesStore.save({ rules: copied });
    await this.recordHistory('scheduled-settings.json', { rules: copied }, 'Changed scheduled settings', 'settings-change');
    return copied;
  }

  async effectiveSettings(at: Date): Promise<ReturnType<typeof computeEffectiveSettings>> {
    return computeEffectiveSettings(this.settingsStore.getBase(), await this.listSchedules(), at);
  }

  async pickConverterSource(window: BrowserWindow): Promise<SelectedSourceFile | null> {
    const result = await dialog.showOpenDialog(window, { properties: ['openFile'] });
    if (result.canceled || result.filePaths.length !== 1) return null;
    const sourcePath = result.filePaths[0];
    if (!sourcePath) return null;
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile()) throw new Error('The selected source is not a regular file.');
    const record: SelectedFileRecord = {
      handle: randomUUID(),
      name: path.basename(sourcePath),
      size: stat.size,
      path: sourcePath,
      selectedAt: Date.now(),
    };
    this.selectedFiles.set(record.handle, record);
    this.pruneSelectedFiles();
    return { handle: record.handle, name: record.name, size: record.size };
  }

  async detectSelectedSource(handle: string) {
    return detectSourceFile(this.requireSelectedFile(handle).path);
  }

  async convertSelectedSource(window: BrowserWindow, handle: string, entryId: string, suggestedName?: string) {
    const source = this.requireSelectedFile(handle);
    const safeSuggested = this.safeFileName(suggestedName ?? path.parse(source.name).name);
    const result = await dialog.showSaveDialog(window, { defaultPath: safeSuggested });
    if (result.canceled || !result.filePath) return { cancelled: true } as const;
    const converted = await convertFile(source.path, entryId, result.filePath);
    return { cancelled: false, bytesWritten: converted.bytesWritten, fileName: path.basename(result.filePath) } as const;
  }

  async extractSelectedSource(window: BrowserWindow, handle: string, entryId: string) {
    const source = this.requireSelectedFile(handle);
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || result.filePaths.length !== 1) return { cancelled: true } as const;
    const destinationDir = result.filePaths[0];
    if (!destinationDir) return { cancelled: true } as const;
    const extracted = await extractArchive(source.path, entryId, destinationDir);
    return { cancelled: false, entries: extracted.entries } as const;
  }

  exportPreview(source: ExportSource, format: ExportFormat) {
    this.assertBoundedExport(source);
    return serializeExport(source, format);
  }

  exportLossReport(source: ExportSource, format: ExportFormat) {
    this.assertBoundedExport(source);
    return computeLossReport(source, format);
  }

  async saveExport(window: BrowserWindow, source: ExportSource, format: ExportFormat) {
    this.assertBoundedExport(source);
    const result = await dialog.showSaveDialog(window, { defaultPath: suggestExportFileName(source, format) });
    if (result.canceled || !result.filePath) return { cancelled: true } as const;
    const written = await writeExportFile(source, format, result.filePath);
    return { cancelled: false, bytesWritten: written.bytesWritten, fileName: path.basename(result.filePath) } as const;
  }

  async refreshCatalog() {
    try {
      const refreshed = await refreshCatalog(new OllamaWebCatalogSource());
      if (refreshed.snapshot) await this.catalogCache.save(refreshed.snapshot);
      this.catalogLastError = refreshed.error;
      return buildCatalogState(refreshed.snapshot ?? await this.catalogCache.load(), refreshed.error);
    } catch (error) {
      this.catalogLastError = error instanceof Error ? error.message : String(error);
      return buildCatalogState(await this.catalogCache.load(), this.catalogLastError);
    }
  }

  async catalogState() {
    return buildCatalogState(await this.catalogCache.load(), this.catalogLastError);
  }

  async runtimeStatus(): Promise<RuntimeStatusSnapshot> {
    return {
      checkedAt: new Date().toISOString(),
      history: this.historyAvailability,
      secureVaultAvailable: this.auth.isVaultAvailable(),
      updater: this.publicUpdaterState(this.updater.getState()),
      ollama: await diagnoseConnection(this.ollamaClient),
      narrator: await this.narrator.getStatus(),
    };
  }

  readonly api = {
    logo: {
      listPresets: () => listLogoPresets(),
      current: () => getCurrentLogoManifest(dataDir()),
      applyPreset: (presetId: string) => applyPresetSelection(dataDir(), presetId),
      applyCustom: (bytes: Uint8Array, edits: LogoEditParams) => applyCustomSelection(dataDir(), Buffer.from(bytes), edits),
      readAsset: async (which: { size: number } | 'ico') => {
        const manifest = await getCurrentLogoManifest(dataDir());
        if (!manifest) return null;
        return new Uint8Array(await readLogoAsset(dataDir(), manifest, which));
      },
      reset: () => resetLogoToShippedDefault(dataDir()),
    },
    converter: {
      listCatalog: () => getConverterRegistry().map((entry) => this.publicConverterEntry(entry)),
      listCategory: (category: ConverterCategory) => listEntriesForCategory(category).map((entry) => this.publicConverterEntry(entry)),
      searchCatalog: (query: string, category?: ConverterCategory) => {
        const results = searchRegistry(query);
        return (category ? results.filter((entry) => entry.category === category) : results)
          .map((entry) => this.publicConverterEntry(entry));
      },
    },
    ollama: {
      diagnose: () => diagnoseConnection(this.ollamaClient),
      listInstalled: () => listInstalledModels(this.ollamaClient),
      listRunning: () => listRunningModels(this.ollamaClient),
      showCapabilities: (reference: string) => showModelCapabilities(this.ollamaClient, reference),
      detectHardware: () => detectHardware(),
      evaluateFit: async (tag: CatalogTag) => evaluateFit(tag, await detectHardware()),
      refreshCatalog: () => this.refreshCatalog(),
      catalogState: () => this.catalogState(),
    },
    narrator: {
      loadSettings: () => this.narrator.loadSettings(),
      updateSettings: (settings: NarratorSettings) => this.narrator.updateSettings(settings),
      narrate: (request: NarrationRequest) => this.narrator.narrate(request),
      status: () => this.narrator.getStatus(),
      vocabularyLoad: (bytes: Uint8Array) => this.vocabulary.loadFromSource(Buffer.from(bytes)),
      vocabularyState: async (): Promise<PublicVocabularyState> => {
        const state = await this.vocabulary.getState();
        return state.kind === 'active' ? { kind: 'active', entryCount: state.entryCount } : state;
      },
      vocabularyClear: () => this.vocabulary.clear(),
      vocabularyResolve: async (key: string, shippedText: string) =>
        resolveVocabularyText(await this.vocabulary.getActiveVocabulary(), key, shippedText),
    },
    auth: {
      begin: (options?: BeginRegistrationOptions) => this.auth.beginRegistration(options),
      beginSecret: (options: BeginRegistrationFromSecretOptions) => this.auth.beginRegistrationFromSecret(options),
    },
    history: {
      availability: () => this.historyAvailability,
      prune: (policy: RetentionPolicy) => this.history.prune(policy),
    },
  };

  private createTotpVerifier(): TotpVerifier {
    return {
      entryExists: async (entryId) => (await this.auth.listEntries()).some((entry) => entry.id === entryId),
      verifyCode: async (entryId, code) => {
        return this.auth.verifyCode(entryId, code);
      },
    };
  }

  private requireSelectedFile(handle: string): SelectedFileRecord {
    const record = this.selectedFiles.get(handle);
    if (!record || Date.now() - record.selectedAt > SELECTED_FILE_TTL_MS) {
      this.selectedFiles.delete(handle);
      throw new Error('That selected-file handle is missing or expired. Choose the file again.');
    }
    return record;
  }

  private pruneSelectedFiles(): void {
    const ordered = [...this.selectedFiles.values()].sort((a, b) => a.selectedAt - b.selectedAt);
    const now = Date.now();
    for (const record of ordered) {
      if (now - record.selectedAt > SELECTED_FILE_TTL_MS || this.selectedFiles.size > MAX_SELECTED_FILES) {
        this.selectedFiles.delete(record.handle);
      }
    }
  }

  private safeFileName(value: string): string {
    const safe = path.basename(value).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim();
    return safe.slice(0, 180) || 'converted-output';
  }

  private assertBoundedExport(source: ExportSource): void {
    const bytes = Buffer.byteLength(JSON.stringify(source), 'utf8');
    if (bytes > MAX_EXPORT_SOURCE_BYTES) {
      throw new Error(`Export source is ${bytes} bytes, over the ${MAX_EXPORT_SOURCE_BYTES}-byte IPC limit.`);
    }
  }

  private async recordSettingsHistory(message: string): Promise<void> {
    await this.recordHistory('settings.json', this.settingsStore.getBase(), message, 'settings-change');
  }

  private async recordHistory(
    recordPath: string,
    value: unknown,
    message: string,
    action: 'settings-change',
  ): Promise<void> {
    await this.history.commitSnapshot({
      recordPath,
      content: `${JSON.stringify(value, null, 2)}\n`,
      message,
      action,
    });
  }

  publicUpdaterState(state = this.updater.getState()): PublicUpdaterState {
    if (state.status !== 'ready') return state;
    const { packagePath: _packagePath, ...publicState } = state;
    return publicState;
  }

  private publicConverterEntry(entry: ReturnType<typeof getConverterRegistry>[number]): ConverterRegistryEntry {
    const { convert: _convert, extractToDirectory: _extract, validateOutput: _validate, ...publicEntry } = entry;
    return publicEntry;
  }
}
