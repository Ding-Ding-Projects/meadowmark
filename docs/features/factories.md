# Factories

## Behaviour

`panels/factories.ts` renders one card per factory instance with its
production-queue slots. An empty slot opens a recipe picker (the shared
filterable menu) showing every available recipe with its ingredient
requirements and current barn stock inline; recipes missing ingredients are
shown but disabled with an explicit reason.

A filled slot shows its remaining time, or, critically, an honest
"queue paused: barn full" state when a completed batch could not be
delivered to the barn. This is a deliberate contract: output is never
silently dropped, and the paused state offers a shortcut to the barn.

## Configuration

None beyond the game-state-driven recipe list.

## Failure modes

- The paused-by-full-barn flag must be kept accurate by the state layer; the
  UI trusts it completely and has no independent way to detect a stalled
  queue.
- The recipe-availability check is computed client-side from the barn
  snapshot passed in — a barn snapshot that is stale relative to the actual
  dispatch could let the user attempt to queue a recipe that no longer has
  stock. The host's action handler is expected to reject or no-op such a
  dispatch rather than silently going negative on stock.

## Verification

Manual: mock a factory with an empty slot (opens picker, disables
under-stocked recipes with a reason), a running slot (timer counts down),
and a paused-by-full-barn slot (shows the paused message, not a silently
vanished timer).

Evidence status: this is a prescribed manual procedure; no packaged factory
interaction or capture is recorded at `6e7760b`.

## Security considerations

Recipe eligibility, stock consumption, queue timing, and collection rewards
must be enforced by the simulation. Disabled controls and displayed costs are
not an authorization boundary.

## Suggested articles

- [Barn](./barn.md)
- [Orders](./orders.md)
- [UI, engine, and shared integration](./integration-contract.md)
