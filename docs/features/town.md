# Town

## Behaviour

`panels/town.ts` renders the building catalogue with cost and a Place action
that calls the renderer bridge's placement-mode entry point, handing the 3D
layer a placement callback that dispatches a place action on success.
Selecting a placed building shows its info card with a Demolish action.

Demolish is never a direct dispatch — it opens the shared destructive
super-confirm gate, naming the exact building and stating that removal is
permanent, and only fires the demolish dispatch if the two-key-plus-full-
slider gate completes.

## Configuration

None; entirely driven by the town view plus the injected renderer bridge.

## Failure modes

- If the renderer bridge's cancel callback is never invoked by the 3D layer
  when placement is aborted (for example, Escape in the 3D view), the UI has
  no way to know placement mode ended — this is an integration contract the
  engine lane must honour.
- Demolish's cancel path is a no-op by design; nothing needs to happen on
  cancel beyond closing the gate.

## Verification

Manual: mock a catalogue, confirm Place calls the placement entry point with
the right building id and that the placement callback dispatches the place
action; mock a selected building, confirm Demolish opens the super-confirm
gate and that the demolish action only fires after both keys are held and
the slider reaches full.
