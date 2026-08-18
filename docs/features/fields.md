# Fields

## Behaviour

`panels/fields.ts` renders the plot grid, a crop picker, Plant All and
Harvest All actions, and per-plot growth-timer countdowns updated every
second. Each plot tile shows an icon and short text label reflecting its
plot state (empty, growing, ready, withered) and, while growing, a live
countdown to when it will be ready. The renderer adapter also maps every
unlocked plot to a visible field-bed mesh in the 3D world, so an empty
new game shows real plot geometry rather than a flat green plane.

Clicking an empty or withered plot plants the currently selected crop;
clicking a ready plot harvests it. Plant All and Harvest All dispatch the
bulk actions.

## Configuration

The crop picker lists the fields view's available crops, which the host is
expected to have already filtered to the player's unlocked crops.

## Failure modes

- The countdown re-render uses a one-second interval; the panel's returned
  disposer clears the interval on unmount — omitting the disposer call would
  leak a timer per panel switch.
- If the available-crops list is empty, the crop picker has nothing to
  select and planting is effectively inert. This is a data problem upstream,
  not a UI bug, but the picker does not hide itself silently — it renders
  empty and stays honest about that.

## Verification

Manual: mock a fields view with plots in each of the four states and confirm
the correct icon, short visible label, and accessible label per state, that
the countdown decreases, and that Plant All / Harvest All dispatch the
expected actions. Runtime: launch the built app, dismiss the welcome modal,
and confirm the WebGL canvas shows terrain tiles and field-bed plots.

Evidence status: the real packaged capture from commit `c328d7d` proves visible
terrain and field-bed plots only. Plant, harvest, bulk actions, timers, and
their state transitions have no packaged interaction proof at `6e7760b`.

## Security considerations

Crop availability, timing, costs, rewards, and plot ownership remain
simulation-authoritative. The UI must not turn a stale or forged view into an
accepted plant or harvest result.

## Suggested articles

- [HUD](./hud.md)
- [Offline summary](./offline-summary.md)
- [UI, engine, and shared integration](./integration-contract.md)
