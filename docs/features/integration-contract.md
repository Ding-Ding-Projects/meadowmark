# UI, engine, and shared integration contract

## Behaviour

Meadowmark separates deterministic game state (`packages/shared`), three.js
rendering (`packages/engine`), DOM presentation (`packages/ui`), adapter wiring
(`packages/renderer`), and privileged desktop operations (`packages/app`). The
renderer adapters translate shared state into engine/UI view models and route UI
actions back to the simulation or the privileged host.

The `c328d7d` packaged baseline renders terrain and field beds, but several
adapter paths still use hard-coded layouts or lack shared actions. A
type-compatible boundary is not proof that an action reaches its real
destination.

## Configuration

`mountUi` receives a state stream, renderer bridge, and host bridge. Shared
money values use the repository's integer balance conventions; time values use
the shared simulation clock. Package consumers should import public package
exports rather than private source files.

## Failure modes

- A preload value import can transitively pull Node modules into the sandbox and
  prevent `window.meadowmark` from being defined.
- The simulation lacks world positions for several objects, so adapters cannot
  faithfully render arbitrary placed layouts.
- Missing `GameAction` members make some apparent UI operations no-ops.
- A mocked bridge can pass while the real IPC/preload channel is absent or has a
  different payload shape.

## Security considerations

Only the preload bridge may cross from the renderer to privileged operations.
Expose narrow validated messages, keep `contextIsolation` and sandboxing on,
and never place filesystem, credential, network, process, or secret-handling
authority directly in renderer code.

## Verification

The emitted preload bundle is covered by `node tools/guards/no-fs-in-preload.mjs`.
The packaged capture from commit `c328d7d` proves first-paint terrain, field
beds, readable crop copy, navigation, and HUD state. It does not prove gameplay
actions, all bridge methods, service IPC, or every panel. Each new seam needs a
real packaged smoke path plus an independent assertion of the resulting state.

## Suggested articles

- [Fields](./fields.md)
- [Settings](./settings.md)
- [Platform service index](./platform-services/README.md)
## Status: wired, not finished

The three packages this article covers (`@meadowmark/ui`, `@meadowmark/engine`,
`@meadowmark/shared`) were built in parallel, each against a structural contract
in `packages/ui/src/contracts.ts` rather than against one another's real types.
That reconciliation has now happened: `packages/renderer/src/main.ts` boots the
simulation, the three.js renderer, and the DOM UI, and the four adapter modules
under `packages/renderer/src/adapters/` translate between them every tick. This
article previously described integration as future work; it is done, with
known, documented gaps rather than an unstarted plan.

## The adapter layer

| File | Direction | Job |
|---|---|---|
| `adapters/state-to-ui.ts` | `GameState` → `GameStateView` | Maps the real shared simulation state onto every `contracts.ts` view (fields, factories, barn, orders, vehicles, town, zoo, mine, museum, achievements, dailies, village, offline summary). |
| `adapters/state-to-engine.ts` | `GameState` → engine scene input | Maps placed buildings, unlocked plots, and catalog entries onto three.js meshes via `defineAsset`/`requireAsset`. |
| `adapters/ui-actions.ts` | `GameAction` → shared calls | Dispatches every UI-originated action (`applyAction`) against the real `@meadowmark/shared` functions (`plantCrop`, `harvestCrop`, `placeBuilding`, `collectZooIncome`, and so on). |
| `adapters/renderer-bridge.ts` | UI → engine | Implements `RendererBridge` (`packages/ui/src/contracts.ts`) over `RendererHandle` (`packages/engine/src/renderer.ts`) so `panels/town.ts` can enter/exit placement mode. |

Every mismatch between what the UI contract expects and what the real
`GameState`/`GameAction`/`RendererHandle` types actually offer is marked
`GAP:` at its exact call site, rather than silently faked or hidden. That
mark is the honest source of truth for what does not work yet — do not
duplicate the list here where it can drift; read the adapter files. As of
this writing there are 47 `GAP:` markers across the four adapter
files (`grep -rn "GAP:" packages/renderer/src/adapters/*.ts | wc -l`);
that count will drift as gaps close or new ones are found, so re-run the
grep rather than trusting this number long-term. The highest-impact ones, because they leave whole panels showing no
real content in the running app:

- **No museum system exists in `@meadowmark/shared` or `balance/` at all.**
  `mapMuseum()` in `state-to-ui.ts` always returns `{ exhibits: [] }`. The
  museum panel (`packages/ui/src/panels/museum.ts`) renders correctly against
  a real `MuseumView`, but the running app can never hand it one with
  content.
- **No zoo species catalog exists in `balance/`.** `mapZoo()` always returns
  `availableAnimals: []`, so the zoo panel's "assign an animal" picker has
  nothing to offer.
- **`Plot`, `FactoryInstance`, and zoo enclosures carry no world position**
  in `@meadowmark/shared`. `state-to-engine.ts` computes hard-coded grid
  layouts instead of reading a real placement, so the 3D world does not yet
  reflect wherever a player actually placed a factory or animal shed.
- **`RendererHandle` (the engine) exposes no camera/raycaster accessor.**
  `renderer-bridge.ts` can begin and cancel placement and can drop a
  building on click, but the placement ghost cannot follow the cursor, and
  `focusCameraOnEntity`/`focusCameraOnTile`/`highlightEntity` are no-ops.
- **`GameAction` has no factory-collect, animal-collect, plot-unlock,
  building-select, or building-demolish member.** `placeBuilding()` in
  `@meadowmark/shared` also ignores the rotation the UI hands it. Demolish
  and cancel-queued-factory-job are UI-reachable but no-ops against the real
  simulation until `@meadowmark/shared` grows the corresponding functions.
- **`TrainState` models three independent wagons; the UI models one vehicle
  per kind.** Only wagon 0 is surfaced through `state-to-ui.ts`.

## Money and time conventions (confirmed, not assumed)

- All money fields (`cash`, `sellPrice`, order rewards, costs) are integer
  cents, formatted via `formatMoney()` in `packages/ui/src/dom.ts`. The real
  `@meadowmark/shared` state uses this convention; no conversion layer was
  needed at the adapter boundary. **Orders and buildings never charge cash
  in the current simulation, only coins and materials** — the `cash` field
  in `contracts.ts` views is always zero for those flows, which is a
  simulation gap (see `state-to-ui.ts` for the exact `GAP:` markers), not a
  UI defect.
- All timestamps are epoch milliseconds; all durations are milliseconds,
  formatted via `formatDuration()`. Confirmed matching `@meadowmark/shared`'s
  actual `Date.now()`-based clock.

## Where the real host lives

`packages/app` is the Electron shell; `packages/renderer` is the browser-side
entry point that actually performs the integration described above. Both
compile and run. The `HostBridge` the UI dispatches into is `applyAction()`
in `adapters/ui-actions.ts`, called from `packages/renderer/src/main.ts`'s
tick loop — not, as an earlier draft of this document assumed, something
`packages/app`'s Electron main process constructs directly.

## Next steps for whoever picks this up

1. Add a museum exhibit-set/reward catalog and a zoo species catalog to
   `balance/`, and the corresponding `@meadowmark/shared` state, so
   `mapMuseum()`/`mapZoo()` have real content to map instead of returning
   empty views.
2. Give `Plot`, `FactoryInstance`, and zoo enclosures a real world position
   in `@meadowmark/shared` so `state-to-engine.ts` can stop hard-coding grid
   layouts.
3. Expose a camera/raycaster accessor from `RendererHandle` so the placement
   ghost can track the cursor.
4. Grow `GameAction` to cover factory-collect, animal-collect, plot-unlock,
   building-select, and building-demolish, and give `@meadowmark/shared`
   real functions to back them, retiring the matching `GAP:` markers one at
   a time.
