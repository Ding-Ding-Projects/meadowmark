# Delivery vehicles (train, helicopter, ship)

## Behaviour

`panels/train.ts`, `panels/helicopter.ts`, and `panels/ship.ts` are thin,
independently documented and independently reachable wrappers around
`panels/vehicle-shared.ts`, which does the actual rendering: cargo slots
(showing what is requested versus what is loaded), a live status line
covering all five vehicle states, and a Dispatch or Collect action depending
on state.

Sharing the renderer means a fix to timer formatting, cargo-slot layout, or
status copy applies identically to all three vehicles instead of risking
three slightly different implementations of the same defect.

## Configuration

None; entirely driven by each vehicle's own view.

## Failure modes

- Status text for the departed/returning states formats the remaining time
  from the returns-at timestamp; if the host clock and the game-state clock
  disagree meaningfully, the countdown can show a stale or negative-looking
  duration for one tick before the next state push corrects it.

## Verification

Manual: mock one view per state value for each of the three vehicle kinds
and confirm the status text, cargo rendering, and action button (Dispatch,
Collect, or none) match the state.

Evidence status: this is a prescribed manual procedure; no packaged train,
helicopter, or ship interaction/capture is recorded at `6e7760b`.

## Security considerations

Dispatch and collect controls submit typed actions only. The simulation must
revalidate capacity, cargo, time, cost, and readiness so a stale view cannot
grant goods or consume resources incorrectly.

## Suggested articles

- [Orders](./orders.md)
- [Barn](./barn.md)
- [UI, engine, and shared integration](./integration-contract.md)
