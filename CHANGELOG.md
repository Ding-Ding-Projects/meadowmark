# Changelog

This file records the published Meadowmark release history. Each entry links to
the commit targeted by that release. The release workflow publishes a new
monotonic build tag for successful pushes; tag numbers are therefore not a
promise that every integer exists.
All notable changes to Meadowmark are documented in this file. Every entry
carries the commit SHA that made the change; a SHA is only listed here after
`git cat-file -e <sha>` confirms it exists in this repository.

## [v0.1.0-22] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-22) ·
[commit `dd2a44f`](https://github.com/Ding-Ding-Projects/meadowmark/commit/dd2a44fa5264656a62802af04cac3bd192668b9d)

- Initial repository scaffolding: npm workspaces for `packages/shared`,
  `packages/engine`, `packages/ui`, and `packages/app`
  (`278f191`, `06c3ec8`).
- Electron main process (`packages/app`): frameless window with a custom
  title bar, single-instance lock, IPC-backed save/settings stores, and a
  typed `contextBridge` preload API (`06c3ec8`).
- Windows-safe atomic file writes (`packages/app/src/atomic-write.ts`),
  retrying transient rename failures caused by antivirus/indexer/sync
  software rather than losing player data (`06c3ec8`).
- Base strict TypeScript configuration (`tsconfig.base.json`) (`278f191`).
- Committed tooling: the release line counter
  (`tools/line-count/count.mjs`), the feature-completeness inventory
  (`docs/inventory/inventory.json` + `tools/inventory/check.mjs`), and the
  atomic-write guard (`tools/guards/no-bare-rename.mjs`) (`cd0fb7e`).
- Unsigned Squirrel.Windows packaging via `electron-builder.yml`, plus
  one-click `build.bat` / `build-installer.bat` /
  `download-dependencies.bat` scripts (`6c6609a`).
- `.github/workflows/release.yml`: builds, packages, and publishes a
  Squirrel.Windows installer release on every push to `main`, with no
  test/lint gate (a deliberate project decision) and no code signing (a
  permanent project decision) (`6c6609a`, later `.github/workflows/release.yml`
  updates in `0086033`).
- The whole headless simulation in `packages/shared`: core types, RNG, time,
  economy, barn, fields, animals (`31e91bc`); factories, orders, train,
  helicopter, ship, town, expansions (`6e5f60e`); zoo, mine, boosters,
  achievements, dailies, village (`a83809b`); tick/offline-resume, the save
  schema, the public API, and balance data (`790ceac`).
- The generative three.js engine: mesh DSL, palette, buildings, nature,
  props, characters (`6784536`).
- The Material 3 DOM UI layer: HUD and all fourteen game panels (`22d5b80`),
  the remaining M3 components, notifications, the destructive-action
  super-confirm gate, context menus, and the command palette (`1d55009`).
- The `@meadowmark/renderer` package: the Vite-built entry point and the
  four adapter modules (`state-to-ui`, `state-to-engine`, `ui-actions`,
  `renderer-bridge`) that join `shared`, `engine`, and `ui` into one running
  app, dispatching every UI-originated action against the real simulation
  and mapping real `GameState` onto both the DOM views and the three.js
  scene (`a033fa7` through `5063deb`, integrated in `e1c1fbe`).
- The documentation and landing site at `site/`: shared design system,
  chrome, and interactive framework (`43c0b55`); the landing page, settings
  page, and changelog viewer (`eec0e71`); a documentation index plus an
  article for every game system (`b8f4d09`); GitHub Pages publishing on
  every push, no build step (`0a132b9`).
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
- Corrected renderer-to-engine and renderer-to-interface state mappings and
  aligned the bridge declarations used by the published desktop build.
- Restored generated nature content and expanded the interface content and
  token definitions used by the packaged first-paint surface.
- Shipped unsigned `Setup.exe`, the full `.nupkg`, and `RELEASES`. GitHub
  Actions ran no tests or lint by standing project policy.
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
  localStorage fallback (`2289505`, merged in `661180f`).

## [v0.1.0-21] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-21) ·
[commit `6e7760b`](https://github.com/Ding-Ding-Projects/meadowmark/commit/6e7760b993ad07356efe4b641220578b267fe807)

- Published the first release after packaged terrain and field-bed rendering
  evidence opened the release hold.
- Contains the settings-service IPC bridge and terrain/field-bed first-paint
  repair. At publication, its only packaged capture came from the earlier
  `c328d7d` artifact and was baseline evidence, not a complete surface matrix.
- Shipped unsigned `Setup.exe`, the full `.nupkg`, and `RELEASES`. GitHub
  Actions ran no tests or lint by standing project policy.

## [v0.1.0-16] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-16) ·
[commit `47cd372`](https://github.com/Ding-Ding-Projects/meadowmark/commit/47cd372ec8866bf605d7d470c6a5a972dc7af3cb)

- Added an evidence-first handoff that described the then-visible flat world,
  unreadable navigation, untranslated crop key, and clipped HUD instead of
  presenting successful compilation as runtime success.

## [v0.1.0-15] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-15) ·
[commit `c0822d3`](https://github.com/Ding-Ding-Projects/meadowmark/commit/c0822d363f72b245f6d40998d922227896391e7e)

- Integrated strict-TypeScript repairs across the ten main-process service
  source families. Source compilation did not establish IPC, UI, or packaged
  interaction for those services.

## [v0.1.0-14] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-14) ·
[commit `621427c`](https://github.com/Ding-Ding-Projects/meadowmark/commit/621427cc27e6742fec59a4c394814255962d38e0)

- Repaired the sandboxed preload bridge and added a guard that rejects Node
  filesystem code in the emitted preload bundle.

## [v0.1.0-13] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-13) ·
[commit `258f3fe`](https://github.com/Ding-Ding-Projects/meadowmark/commit/258f3fe736a240926c69b69ed530a148ace269c4)

- Integrated the Material Design 3 design layer and missing navigation shell.

## [v0.1.0-11] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-11) ·
[commit `33d9757`](https://github.com/Ding-Ding-Projects/meadowmark/commit/33d9757ec1c7b51293fe95b55bc0e53494ed8811)

- Added `.js` extensions to shared-package ESM imports so emitted modules load
  in Node rather than merely satisfying TypeScript.

## [v0.1.0-10] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-10) ·
[commit `cd25337`](https://github.com/Ding-Ding-Projects/meadowmark/commit/cd2533721a5ff17ef6b50a668ab5a19b926141e1)

- Added a real Open Graph image, data-driven download state, and site-wide
  appearance editing to the documentation site.

## [v0.1.0-9] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-9) ·
[commit `5520efe`](https://github.com/Ding-Ding-Projects/meadowmark/commit/5520efe7bf2c71af9272f96e4e1895a44b8aa9b0)

- Corrected the electron-builder signing configuration and locally verified
  that the generated setup executable reported `NotSigned`.

## Foundational 0.1.0 work

The initial code line was assembled before the monotonic release records above:

- [`278f191`](https://github.com/Ding-Ding-Projects/meadowmark/commit/278f1919346f1db69681344c6e45acd767d06ed4)
  created the npm workspace foundation.
- [`148c7bb`](https://github.com/Ding-Ding-Projects/meadowmark/commit/148c7bb53565173ce41d2a56ee538605a0e9bd0e)
  integrated the shared deterministic simulation.
- [`9bce227`](https://github.com/Ding-Ding-Projects/meadowmark/commit/9bce2274c958ad98d9d2454af4a7b662be292b10)
  integrated the generated three.js rendering engine.
- [`52cda70`](https://github.com/Ding-Ding-Projects/meadowmark/commit/52cda70b62c3ddda0324d5eb2f5157326bbea60f)
  integrated the DOM interface and its feature articles.
- [`eb8fff3`](https://github.com/Ding-Ding-Projects/meadowmark/commit/eb8fff3ba1353a5709c05de326ab521d246a9cb6)
  integrated the ten local main-process service source families.
- Route every xp-granting action through `addXp` so leveling up actually
  happens (`96df298`).
- Fix all `noUncheckedIndexedAccess` compiler errors surfaced across
  `packages/shared` (35 sites, `918eeee`) and `packages/ui` (9 sites,
  `6b75c71`).
- Fix the preload sandbox: a value import of `ipc.ts` from `preload.ts` was
  dragging `node:fs` into the sandboxed preload bundle and silently killing
  `window.meadowmark`; channel names now come from the leaf
  `ipc-channels.ts` module instead (`753c1df`).
- Fix 36 strict-TypeScript errors in `packages/app/src/services/` left by a
  parallel-agent merge (`29eb8cd`).
- Make offline catch-up truly chunk-invariant at all four call sites, so one
  30-day tick equals 43,200 one-minute ticks, byte-identical (`fc1f4dc`).
- Give every `packages/shared` relative import the `.js` extension Node ESM
  requires (`33d9757`).
- Restore backslashes an earlier file-transport step had eaten from three
  files, where the mangled escapes compiled cleanly and silently did nothing
  (`c1f0344`).
- Render terrain tiles from the engine's `state.tiles` feed and field-bed
  meshes for every unlocked plot, so the default world no longer appears as
  a flat green plane with nothing to draw (`3ef8994`, `266f106`).
- Replace internal missing-key text in the crop picker with a readable
  fallback, including `Wheat` (`266f106`).
- Improve navigation-rail contrast, offset the HUD below the custom title
  bar, and replace placeholder field-plot squares with labelled empty plots
  (`3ef8994`, `661180f`).
- Disable Windows executable signing across the Squirrel packaging path,
  including the fields the schema validator had been silently rejecting
  (`c830d14`, `c328d7d`).
- Validate and harden installer digest verification for the release
  workflow (`37f97b0`, `c99e18c`).
- Stop pretending the UI and renderer packages' two independent
  `window.meadowmark` type declarations are structurally the same type;
  the cast now goes through `unknown` with a comment explaining why, rather
  than asserting an overlap TypeScript cannot actually prove (`dd2a44f`).

### Documentation

- Write the initial design document before building anything
  (`85f483e`).
- Write README, sanitized AGENTS conventions, and start this changelog at
  0.1.0 (`2dc7275`).
- Rewrite `HANDOFF.md` and `docs/features/integration-contract.md` to
  describe integration as done-with-known-gaps rather than future work, once
  `packages/renderer`'s adapters actually existed (`aa3680f`, folded into
  `0086033`).
- Correct the integration-contract article's `GAP:` marker count from an
  approximate "roughly 30" to the exact, re-derivable count of 47
  (`grep -rn "GAP:" packages/renderer/src/adapters/*.ts | wc -l`), verified
  against the current adapter source rather than carried forward from an
  earlier pass (this documentation lane).

## Known gaps not yet reflected in a release

These are real, current gaps — not resolved by any commit above. See
`HANDOFF.md` and `docs/features/integration-contract.md` for the complete,
authoritative list; do not duplicate it here where it can drift.

- The ten local subsystems under `packages/app/src/services/**` are
  implemented but unwired to IPC, the preload bridge, or any UI surface.
- No museum system or zoo species catalog exists anywhere in `@meadowmark/shared`
  or `balance/`.
- `Plot`, `FactoryInstance`, and zoo enclosures carry no world position in
  the simulation, so the 3D world uses hard-coded layouts rather than real
  placement.
- The placement ghost cannot follow the cursor; the engine exposes no
  camera/raycaster accessor.
- `site/data/release.json` still holds `published: false` — no verified
  GitHub Release with a real installer asset has been wired to the site's
  download button, so it correctly renders a disabled state. Screenshot
  placeholders on the site are real placeholders, not real captures.
