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
      loadSettings(): Promise<unknown>;
      saveSettings(settings: unknown): Promise<void>;
      appInfo(): Promise<{ name: string; version: string; platform: string; isDev: boolean }>;
    };
  }
}
