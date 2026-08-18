# UI/engine/shared integration contract

## Why this exists

`@meadowmark/ui` was built in parallel with `@meadowmark/shared` (game state
types) and `@meadowmark/engine` (the three.js renderer), each in its own
lane. This package never imports `three` or `electron` directly, and it never
imports concrete types from `@meadowmark/shared` or `@meadowmark/engine`.
Instead, `packages/ui/src/contracts.ts` declares the narrow structural shape
this package reads and calls, and the real host (`packages/app`) is expected
to satisfy that shape at wiring time.

## What needs reconciling

- **`GameStateView`** (in `contracts.ts`) should become, or be satisfied by,
  the real `GameState` type exported from `@meadowmark/shared`. Field names
  here were chosen for obviousness and will likely need renaming to match
  shared's actual schema — this is a mechanical rename pass, not a redesign,
  since the shape (fields/factories/barn/orders/vehicles/town/zoo/mine/
  museum/achievements/dailies/village/offline-summary) mirrors every panel
  this package ships.
- **`RendererBridge`** should become, or be satisfied by, whatever
  `@meadowmark/engine` exposes for camera focus, entity highlighting,
  placement-mode entry/exit, and interaction enable/disable. Only
  `panels/town.ts` currently calls into it (`enterPlacementMode`,
  `exitPlacementMode`); other panels intentionally never touch the renderer
  directly per the "every action is also reachable from these panels" rule
  — the 3D canvas must never be the only route to an action, so the UI layer
  deliberately treats the renderer as a one-way notification channel it can
  drive, not something it depends on to read state.
- **`HostBridge`** should become, or be satisfied by, whatever
  `packages/app` (the Electron shell) constructs to receive `GameAction`
  dispatches. The full discriminated `GameAction` union in `contracts.ts`
  enumerates every action every panel in this package can emit — treat it as
  the authoritative list of reducer cases the host/shared state layer needs
  to handle.

## Money and time conventions assumed by this package

- All money fields (`cash`, `sellPrice`, order rewards, costs) are integer
  cents, formatted via `formatMoney()` in `dom.ts`. Confirm this matches
  shared's actual convention before wiring; if shared uses floating-point
  dollars, the fix is either a conversion at the bridge boundary or a
  `contracts.ts` field-type change plus a `formatMoney()` update — not a
  per-panel change, since every panel reads through `contracts.ts` types.
- All timestamps are epoch milliseconds (`Date.now()`-compatible); all
  durations are milliseconds, formatted via `formatDuration()`.

## Suggested integration steps

1. Replace the type-only imports in `contracts.ts` with re-exports from
   `@meadowmark/shared` and `@meadowmark/engine` where the shapes already
   match; keep `contracts.ts` as a thin re-export/adapter layer so this
   package's `import { GameStateView } from "./contracts"` call sites never
   need to change.
2. Implement a concrete `RendererBridge` in `@meadowmark/engine` and a
   concrete `HostBridge` in `packages/app`; call `mountUi(root, { state$,
   renderer, host })` from the Electron main/renderer wiring.
3. Run a manual pass through every panel's "Verification" section in this
   docs folder against the real, integrated app rather than mocks.
