/**
 * Minimal placeholder shapes for the data the main process persists.
 *
 * These are intentionally loose (`Record<string, unknown>`-ish) rather than
 * the real game/settings schema: the real domain types belong to
 * @meadowmark/shared, which is owned by a different lane. Once that package
 * exports real GameState/Settings types, main.ts/ipc.ts/preload.ts should
 * import those instead of these placeholders.
 */

export interface GameState {
  [key: string]: unknown;
}

export interface Settings {
  [key: string]: unknown;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  isDev: boolean;
}
