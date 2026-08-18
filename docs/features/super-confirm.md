# Destructive-action confirmation

## Behaviour

`packages/ui/src/confirm/super-confirm.ts` implements the mandatory gate for
any irreversible action (currently wired to Town → Demolish). It is built
entirely in this app's own DOM, not a separate window or hosted page.

The gate:

1. Names the exact action and the exact affected data via i18n keys with
   variables (for example the specific building being demolished).
2. Requires two independently operated key controls to both be held before
   the confirmation slider is enabled at all.
3. Once both keys are held, a full-range slider must be dragged to 100 —
   partial progress does not count, and moving it back below 100 after
   reaching it re-arms the requirement.
4. A progress bar fills alongside the slider, with a completion flash
   animation once it reaches the end.
5. Only then does the Confirm action button become enabled; the underlying
   destructive dispatch fires only from that explicit final click, never
   automatically at 100%.
6. An always-visible emergency-exit button and Escape both cancel instantly
   from any state, and focus always returns to the control that opened the
   gate.

## Configuration

None; every call site supplies its own action/detail copy keys and variables.

## Failure modes

- If a caller forgets to route a destructive action through this gate and
  dispatches directly, there is no automatic enforcement inside this package
  — this is a call-site discipline requirement, documented here and in the
  Town panel doc as the canonical example to copy.
- The slider re-arms (`completed = false`) if dragged back below 100 after
  reaching it, which means a user cannot "bank" a completed gate and confirm
  later after the slider visually regressed — this is intentional.

## Verification

Manual: attempt to move the slider before either key is held (disabled);
hold one key only (still disabled); hold both, slide to 100 (Confirm
enables); slide back below 100 (Confirm disables again); confirm Escape and
the emergency-exit button both cancel and return focus to the originating
control at every stage.

Evidence status: this is a prescribed manual procedure; the gate has no
recorded packaged interaction or capture at `6e7760b`.

## Security considerations

This is a confirmation barrier, not authorization. The privileged operation
must still validate target identity, current state, and permissions immediately
before acting. The gate must never receive or reveal stored credentials.

## Suggested articles

- [Town](./town.md)
- [Notifications](./notifications.md)
- [Authenticator, toy locks, and local history](./platform-services/auth-locks-history.md)
