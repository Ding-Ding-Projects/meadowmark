/**
 * Renderer-local structural mirror of the preload API. Payloads that belong
 * to the app package remain unknown here; consumers validate/map them at the
 * boundary instead of importing another workspace package's internals.
 */
export {};

type AsyncMethod = (...args: never[]) => Promise<unknown>;
type OptionalNamespace = Record<string, AsyncMethod | OptionalNamespace | undefined>;

declare global {
  interface Window {
    meadowmark: {
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
        onMaximizedChanged?: (callback: (isMaximized: boolean) => void) => () => void;
      };
      loadGame: () => Promise<unknown | null>;
      saveGame: (state: unknown) => Promise<void>;
      loadSettings: () => Promise<{ values: Record<string, unknown>; provenance: Record<string, unknown>; warnings: string[] }>;
      saveSettings: (settings: unknown) => Promise<void>;
      settings?: {
        load?: () => Promise<unknown>;
        set?: (key: string, value: unknown) => Promise<unknown>;
        setMany?: (values: Record<string, unknown>) => Promise<unknown>;
        resetToDefault?: (key: string) => Promise<unknown>;
        resetAllToDefaults?: () => Promise<unknown>;
      };
      appInfo(): Promise<{ name: string; version: string; platform: string; isDev: boolean }>;
      history: {
        init(): Promise<{ available: boolean; reason?: string; gitVersion?: string }>;
        listRevisions(options?: { recordPath?: string; limit?: number }): Promise<unknown[]>;
        listRecords(): Promise<unknown[]>;
        diffRevisions(fromHash: string, toHash: string, recordPath?: string): Promise<unknown>;
        restoreRevision(hash: string, recordPath: string): Promise<{ content: string; commit: unknown }>;
        labelRevision(hash: string, label: string): Promise<void>;
        prune(policy: { keepLatest?: number; keepSince?: Date; neverPruneLabeled?: boolean }): Promise<unknown>;
        exportHistory(options?: { redactPaths?: string[]; format?: 'json' | 'text' }): Promise<string>;
      };
<<<<<<< HEAD
      schedules?: { list?: () => Promise<readonly unknown[]>; replace?: (rules: readonly unknown[]) => Promise<readonly unknown[]>; effective?: (atIso?: string) => Promise<unknown> };
      logo?: { listPresets?: () => Promise<readonly unknown[]>; current?: () => Promise<unknown | null>; applyPreset?: (presetId: string) => Promise<unknown>; applyCustom?: (sourceBytes: Uint8Array, edits: unknown) => Promise<unknown>; readAsset?: (which: { size: number } | "ico") => Promise<Uint8Array | null>; reset?: () => Promise<void> };
      converter?: { listCatalog?: () => Promise<readonly unknown[]>; listCategory?: (category: string) => Promise<readonly unknown[]>; searchCatalog?: (query: string, category?: string) => Promise<readonly unknown[]>; pickSource?: () => Promise<{ handle: string; name: string; size: number } | null>; detect?: (sourceHandle: string) => Promise<readonly unknown[]>; convert?: (sourceHandle: string, entryId: string, suggestedFileName?: string) => Promise<unknown>; extract?: (sourceHandle: string, entryId: string) => Promise<unknown> };
      exports?: { preview?: (source: unknown, format: string) => Promise<unknown>; lossReport?: (source: unknown, format: string) => Promise<unknown>; save?: (source: unknown, format: string) => Promise<unknown> };
      ollama?: OptionalNamespace;
      narrator?: OptionalNamespace;
      authenticator?: OptionalNamespace;
      locks?: OptionalNamespace;
      history?: OptionalNamespace;
      updater?: { state?: () => Promise<unknown>; check?: () => Promise<unknown>; cancel?: () => Promise<void>; dismiss?: () => Promise<void>; apply?: () => Promise<void>; onStateChanged?: (callback: (state: unknown) => void) => () => void };
      status?: { snapshot?: () => Promise<unknown>; onChanged?: (callback: (snapshot: unknown) => void) => () => void };
      appInfo: () => Promise<{ name: string; version: string; platform: string; isDev: boolean }>;
=======
      exports: {
        lossReport(datasetId: 'settings' | 'save', format: string): Promise<unknown>;
        write(datasetId: 'settings' | 'save', format: string): Promise<unknown>;
      };
>>>>>>> worktree-wf_53ab3037-0c3-5
    };
  }
}
