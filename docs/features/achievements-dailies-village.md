# Achievements, dailies, and the local-only village

## Behaviour

- Achievements (`panels/achievements.ts`): tiered progress bars per
  achievement, a Claim button enabled only once the current tier's goal is
  met and not yet claimed.
- Dailies (`panels/dailies.ts`): the 5 daily tasks with progress, a Claim
  action per completed-and-unclaimed task, and a streak counter with its own
  claim action.
- Village (`panels/village.ts`): a local neighbour list.

## The village is entirely local — this is load-bearing, not decoration

The village view's local-only flag is typed as the literal `true` — there is
no code path that can represent a networked village in this contract. The
panel renders an unmissable notice, non-dismissible, styled with a lock icon,
stating in both English and Cantonese, at every funny level, that the board
is generated entirely on-device, nobody else is playing, and nothing leaves
the machine. This is a project-wide requirement, not a village-specific
choice.

## Failure modes

- Achievement tiers render as a row of equal-width segments regardless of how
  large each tier's goal is relative to the others. If the design calls for a
  single continuous progress bar across all tiers, that is a follow-up
  visual change, not a data contract change.

## Verification

Manual: mock achievements with a claimable and a not-yet-complete tier;
dailies with claimed, unclaimed, and incomplete tasks and a streak; village
with zero and several neighbours, confirming the local-only notice always
renders regardless of neighbour count.
