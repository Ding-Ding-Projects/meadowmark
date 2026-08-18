# Zoo, mine, and museum

## Behaviour

- Zoo (`panels/zoo.ts`): a grid of enclosures. An empty enclosure opens a
  filterable menu of available animals to assign; a ready enclosure (past its
  ready-at time) collects on click; a growing enclosure shows a live
  countdown.
- Mine (`panels/mine.ts`): a dig grid sized by the reported grid width,
  rendering hidden, revealed, obstacle, and find tiles with distinct icons,
  the energy cost per dig, and the currently equipped tool. Only hidden and
  obstacle tiles are clickable; revealed and find tiles are already resolved
  and disabled.
- Museum (`panels/museum.ts`): one card per exhibit set, showing its
  donation slots (filled or empty), completion state, and reward.

## Configuration

None; entirely state-driven.

## Failure modes

- The mine grid's energy cost is display-only; the panel does not block a
  dig when the player is out of energy — that gate belongs to the host's
  reducer, which is expected to reject or no-op the dispatch and surface a
  notification rather than the mine panel guessing at energy rules it does
  not own.
- The museum panel currently has no donate interaction wired (no artifact
  inventory or picker was in scope for this pass) — donating is defined in
  the shared action contract but no UI control calls it yet. Flagged as a
  follow-up once the artifact-inventory surface exists.

## Verification

Manual: mock each view's states (empty, assigned, and ready enclosure; each
mine tile state; complete and incomplete exhibit) and confirm rendering and
dispatches.

Evidence status: this is a prescribed manual procedure; no packaged zoo, mine,
or museum interaction/capture is recorded at `6e7760b`, and museum donation has
no UI action.

## Security considerations

Energy, readiness, rewards, enclosure assignment, and collection completion are
simulation-authoritative. The UI must not grant resources from a stale state or
invent an unavailable museum donation action.

## Suggested articles

- [Town](./town.md)
- [Barn](./barn.md)
- [UI, engine, and shared integration](./integration-contract.md)
