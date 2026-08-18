/**
 * The preload bridge's real shape (see packages/app/src/preload.ts), typed
 * locally rather than imported: packages/app/src is out of this package's
 * scope, its package.json points "main" at a bundled dist/main.cjs (not a
 * type-exporting entry), and its own MeadowmarkApi types loadGame/saveGame
 * against app-types.ts's intentionally loose placeholder GameState
 * (`{ [key: string]: unknown }`), not the real @meadowmark/shared
 * GameState. Declaring the bridge's shape here with `unknown` payloads and
 * validating/mapping through @meadowmark/shared's own `migrate()` on load
 * keeps this package's type-checking honest without a cross-package cast.
 */
export {};

declare global {
  interface Window {
    meadowmark: {
      window: {
        minimize(): Promise<void>;
        maximize(): Promise<void>;
        close(): Promise<void>;
      };
      loadGame(): Promise<unknown | null>;
      saveGame(state: unknown): Promise<void>;
      loadSettings(): Promise<{ values: Record<string, unknown>; provenance: Record<string, unknown>; warnings: string[] }>;
      saveSettings(settings: unknown): Promise<void>;
      settings: {
        load(): Promise<unknown>;
        set(key: string, value: unknown): Promise<unknown>;
        setMany(values: Record<string, unknown>): Promise<unknown>;
        resetToDefault(key: string): Promise<unknown>;
        resetAllToDefaults(): Promise<unknown>;
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
      exports: {
        lossReport(datasetId: 'settings' | 'save', format: string): Promise<unknown>;
        write(datasetId: 'settings' | 'save', format: string): Promise<unknown>;
      };
    };
  }
}
