# Fields

## Behaviour

`panels/fields.ts` renders the plot grid, a crop picker, Plant All and
Harvest All actions, and per-plot growth-timer countdowns updated every
second. Each plot tile shows an icon reflecting its plot state (empty,
growing, ready, withered) and, while growing, a live countdown to when it
will be ready.

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
the correct icon and accessible label per state, that the countdown
decreases, and that Plant All / Harvest All dispatch the expected actions.
