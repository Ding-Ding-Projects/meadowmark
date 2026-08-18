# Changelog

All notable changes to Meadowmark are documented in this file.

## [0.1.0] - Unreleased

### Added

- Initial repository scaffolding: npm workspaces for `packages/shared`,
  `packages/engine`, `packages/ui`, and `packages/app`.
- Electron main process (`packages/app`): frameless window with a custom
  title bar, single-instance lock, IPC-backed save/settings stores, and a
  typed `contextBridge` preload API.
- Windows-safe atomic file writes (`packages/app/src/atomic-write.ts`),
  retrying transient rename failures caused by antivirus/indexer/sync
  software rather than losing player data.
- Base strict TypeScript configuration (`tsconfig.base.json`).
- Committed tooling: the release line counter
  (`tools/line-count/count.mjs`), the feature-completeness inventory
  (`docs/inventory/inventory.json` + `tools/inventory/check.mjs`), and the
  atomic-write guard (`tools/guards/no-bare-rename.mjs`).
- Unsigned Squirrel.Windows packaging via `electron-builder.yml`, plus
  one-click `build.bat` / `build-installer.bat` /
  `download-dependencies.bat` scripts.
- `.github/workflows/release.yml`: builds, packages, and publishes a
  Squirrel.Windows installer release on every push to `main`, with no
  test/lint gate (a deliberate project decision) and no code signing (a
  permanent project decision).
- Settings service wiring: the Electron main process now backs settings IPC
  with the validated versioned settings service, the preload exposes service
  load/set/reset operations, and the settings UI hydrates and saves overlapping
  appearance/general values through that bridge while preserving the browser
  localStorage fallback.
- Local version history wiring: the Electron main process now records a
  snapshot into an isolated git-backed history repository after every game
  save and every settings write, exposed through preload as
  `window.meadowmark.history`, with a new "History" tab in Settings that
  lists, searches, labels, restores, and exports recorded revisions. See
  `docs/features/history.md`.
- Export engine wiring: the Electron main process now serializes the
  settings document and the farm save into any of the ten formats the
  export engine supports, always computing and showing a loss report
  before writing, and writes through the native save dialog and the app's
  atomic-write path. Exposed through preload as `window.meadowmark.exports`,
  with a new "Export" tab in Settings. See `docs/features/exports.md`.
- App-logo customization wiring: the Electron main process now runs the
  decode/edit/convert/verify/persist pipeline for shipped presets and PNG
  uploads picked through the native file dialog, exposed through preload
  as `window.meadowmark.logo`, with a new "Logo" tab in Settings showing
  live previews and a reset action. See
  `docs/features/app-logo-customization.md`.

### Fixed

- Render terrain tiles from the engine's `state.tiles` feed and field-bed
  meshes for every unlocked plot, so the default world no longer appears as
  only a flat green plane.
- Replace internal missing-key text in the crop picker with a readable
  fallback, including `Wheat`.
- Improve navigation-rail contrast, offset the HUD below the custom title
  bar, and replace placeholder field-plot squares with labelled empty plots.
