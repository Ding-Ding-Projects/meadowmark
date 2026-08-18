# Authenticator, toy locks, and local history

## Behaviour

`packages/app/src/services/auth/**` implements local RFC 4226/6238-style OTP
primitives, `otpauth://` parsing, in-process QR encoding, entry storage, clock
status, and a public `AuthService`. `services/locks/**` implements per-target
password or TOTP toy locks, lockout timing, recovery information, searchable
records, and an optional challenge ladder. `services/history/**` implements an
isolated local Git history store with snapshot, revision, diff, restore,
retention, pruning, and redacted export APIs.

These are source modules at baseline `6e7760b`. They are not registered in
`ipc.ts`, exposed by `preload.ts`, or represented by a proved renderer surface.

## Configuration

Callers supply OTP parameters, lock target and unlock duration, credential-vault
ports, the app-data location, and history retention/export choices. The lock
subsystem stores only its registry and skip-budget state through the app's JSON
store; credential verification remains behind the supplied authenticator port.

## Failure modes

- A missing credential-vault implementation makes authenticator operations
  unavailable.
- Clock skew can make otherwise correct OTP values unacceptable.
- Local history reports Git availability separately; no UI currently exposes
  that status or recovery route.
- Source-level APIs do not make mutation history automatic. Callers must record
  snapshots after successful writes.

## Security considerations

OTP secrets, passwords, QR payloads, and usable codes must never enter JSON
settings, Git history, logs, captures, exports, source, or public records. Toy
locks are explicitly a user-experience speed bump, not encryption or protection
from another person with machine access. History belongs inside stable app data,
never inside a player-managed folder.

## Verification

No focused committed suite, packaged interaction, or capture is recorded for
these modules at `6e7760b`. The evidence is limited to source presence and prior
workspace compilation. Runtime registration, vault behavior, QR scanning,
locking, recovery, history commits, and restore remain unverified.

## Suggested articles

- [Settings](../settings.md)
- [Destructive-action confirmation](../super-confirm.md)
- [Platform service index](./README.md)
