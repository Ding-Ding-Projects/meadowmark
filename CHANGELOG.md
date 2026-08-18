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
