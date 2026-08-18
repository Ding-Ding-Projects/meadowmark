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
