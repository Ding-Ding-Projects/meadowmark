# Meadowmark — handoff

Written 2026-08-18 against `main` at `c0822d3`. Every figure here was measured, not
remembered. Where something is unverified, it says so.

## Read this first: the app now draws a basic world, but it is still not a finished game

**The built application, launched and captured, now renders terrain tiles and visible
field-bed plots in the WebGL world after the welcome modal is dismissed.** That fixes
the earlier "flat green plane" first-paint failure. It still should not be described
as a playable game: the world is sparse, many systems are unwired, and most gameplay
surfaces beyond first paint remain unverified.

What a capture of the running build actually shows:

- **The 3D world renders baseline terrain and field beds.** The engine now consumes
  `state.tiles` and instantiates terrain meshes, and the renderer adapter adds
  field-bed meshes for every unlocked plot.
- **The navigation rail is legible enough to read and click.** Its selected and idle
  states now use Material surface/container roles with visible selected contrast.
- **The crop picker no longer leaks an internal missing-key marker.** A missing `Wheat`
  key falls back to the readable label `Wheat`.
- **Field plots render readable empty-state labels** in the DOM and visible beds in the
  3D world.
- **The HUD is offset below the custom title bar** rather than clipped by it.

Put together, a person opening this build sees a real but sparse terrain grid with
empty field plots, readable chrome, HUD stats, and the fields panel. **Do not describe
this as a playable game yet.** It boots, holds real state, renders DOM, and renders
baseline WebGL world geometry — that is what is established.

## What actually exists

A Windows Electron desktop application in TypeScript, structured as five workspace
packages, plus a published documentation and landing site.

| Package | State | Notes |
|---|---|---|
| `packages/shared` | Compiles, runs | The whole game simulation, headless and deterministic. The most trustworthy thing in the repo. |
| `packages/engine` | Compiles, renders baseline world | three.js scene, generated meshes, terrain tiles, field-bed meshes, orbit camera. |
| `packages/ui` | Compiles, renders | Material 3 DOM layer, HUD and 14 panels. Visibly renders in the built app. |
| `packages/app` | Compiles, runs | Electron main, preload bridge, ten local subsystems. |
| `packages/renderer` | Compiles, boots | The entry point and the three adapters joining the above. |

Site: <https://ding-ding-projects.github.io/meadowmark/> — live, HTTP 200.

**45,478 lines across 288 files** (project total, `node tools/line-count/count.mjs`).

## What is verified, and by what

| Claim | How it was checked |
|---|---|
| All five packages compile | `npx tsc --noEmit` per package, 0 errors each |
| Offline progress is chunk-invariant | `node packages/shared/dist/determinism-check.js` — one 30-day tick equals 43,200 one-minute ticks, byte-identical. The comparator was watched failing first. |
| Balance data is coherent | Validator: no orphan unlocks, no chain cycles, no unreachable goods |
| The app boots and the bridge works | Launched on an off-screen desktop, window captured, real state on screen |
| The baseline 3D world renders | Built app launched on an off-screen desktop; welcome modal dismissed; captured WebGL surface shows terrain tiles and field-bed plots |
| Preload is sandbox-clean | `node tools/guards/no-fs-in-preload.mjs` — emitted bundle requires only `electron` |
| No bare `fs.rename` | `node tools/guards/no-bare-rename.mjs` |
| Installer packages and is unsigned | Local package; `Get-AuthenticodeSignature` reports `NotSigned`, no signer |
| Release assets exist | Latest `v0.1.0-15`; assets attached with nonzero sizes |

## What is NOT verified

- **That the game is playable.** Nothing has been played. No action has been clicked.
- **That rich placed-world content is complete.** Baseline terrain and field beds render;
  factories, roads, animal sheds, museum content, and many placement-driven objects are
  still limited by the adapter gaps below.
- **That the installer produces a working install.** It has never been installed and
  launched. Only the development build has been launched.
- **Any performance claim.** No frame budget, draw-call or instance count has been
  measured.
- **Anything about UI behaviour beyond first paint.** No panel interaction, no
  keyboard path, no screen reader, no narrow layout has been exercised.

## There is no test suite

This is deliberate and it is a standing project decision, not an oversight: **the
release workflow runs no tests and no lint.** There is also, separately, no test
suite in the repository to run. The only executable checks are:

| Command | What it proves |
|---|---|
| `node packages/shared/dist/determinism-check.js` | Offline progress is chunk-invariant |
| `node tools/guards/no-bare-rename.mjs` | Saves cannot bypass the atomic-write helper |
| `node tools/guards/no-fs-in-preload.mjs` | The sandboxed preload stays loadable |
| `node tools/inventory/check.mjs` | No "done" inventory row points at a missing file |
| `node tools/inventory/negative-regression.mjs` | The inventory check actually goes red |
| `node tools/line-count/count.mjs` | The line table the release publishes |

A consequence worth stating: a release can ship from a commit whose behaviour nobody
checked, and several have.

## Published baseline

- Latest release **`v0.1.0-15`**, non-draft, assets attached with nonzero sizes.
- Earlier verified in detail: `v0.1.0-9`, targeting `5520efe`, carrying
  `Meadowmark-Setup-0.1.0.exe` (135,820,288 bytes), `meadowmark-0.1.0-full.nupkg`
  (135,106,135 bytes) and `RELEASES` (81 bytes).
- Releases before this fix installed an application whose first-paint world rendered as
  a flat green plane. Rebuild and release from this fix before claiming a published
  installer contains the terrain/field-bed repair.
- Installers are permanently unsigned. Windows shows an unknown-publisher warning.
  Code signing is prohibited for this project and must never be added.

## Completeness inventory

`docs/inventory/inventory.json` holds 28 hand-written rows for canonical product
surfaces. Almost every row still reads `missing`, which is accurate. The ten
subsystems under `packages/app/src/services/**` implement much of the machinery behind
several of those rows, but **none is wired to IPC, to the preload bridge, or to any UI
surface** — so no row was promoted to `done`. They are libraries with no callers.

## Known defects and gaps

Highest first.

1. Ten service subsystems are **unwired**.
2. **Adapter gaps, all marked `GAP:` in `packages/renderer/src/adapters/`:** the
   simulation carries no world position for factories, animal sheds or plots, so the
   renderer uses hard-coded layouts; no terrain or weather system exists; no museum
   system or zoo species catalog exists anywhere; `TrainState` has three wagons but the
   UI models one vehicle per kind, so only wagon 0 is surfaced; `GameAction` has no
   factory-collect, animal-collect, plot-unlock or building-select member; the
   simulation has no way to cancel a queued factory job or demolish a placed building,
   so both are no-ops; `placeBuilding()` ignores the requested rotation.
3. **Placement ghost cannot follow the cursor** — the engine exposes no camera or
   raycaster accessor to compute a hovered ground tile.
4. Documented UI follow-ups: museum donate control, settings search index is
   hand-maintained rather than derived, toast corner has no persisted setting.
5. Site: long-form docs prose does not vary with the funny level; horizontal tab
    docking uses native scroll rather than an overflow popover.

## Things that bit us, so they do not bite again

- **A green build proves a file was produced, never that anything runs it.** The
  installer packaged cleanly for several releases while the renderer entry point did
  not exist at all.
- **A test with an injected host proves the screen and nothing about the wiring.** The
  renderer type-checked and bundled perfectly while `window.meadowmark` was undefined,
  because one value import dragged `node:fs` into a sandboxed preload. Grep the
  *emitted* bundle, not the source.
- **An escaping layer ate one backslash from every pair** in three files. Four failures
  were loud; five compiled perfectly and did nothing — `.replace(/\n/g, '\n')` replaces
  a newline with a newline. `scan_escapes` style checks catch all three shapes.
- **A comment asserting a guarantee is worth nothing until something checks it.** The
  packaging config promised three signing fields were pinned; one was not a real option
  and another was in the wrong place, so the schema validator rejected the file and
  packaging never ran.
- **Parallel agents over one checkout collide.** Files left in the primary checkout by
  one lane were committed by accident, and another lane observed its direct edits
  silently reverted. Each lane must work only in its own worktree.

## Next owner: start here

1. Rebuild and ship a release from the terrain/field-bed fix before claiming the
   published installer contains it.
2. Drive one actual player action from the built app (for example, plant and harvest a
   crop) and capture the world/panel state after the interaction.
3. Then wire one service subsystem end to end — IPC, preload, UI — and promote exactly
   one inventory row to `done`, so the pattern exists for the other nine.
4. Only then consider whether anything here is worth calling a playable release.
