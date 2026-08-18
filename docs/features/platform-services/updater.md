# Unsigned automatic updates

## Behaviour

`packages/app/src/services/updater/**` implements Squirrel `RELEASES` parsing,
semantic version selection, bounded HTTPS download, SHA-1 package validation as
required by Squirrel metadata, pending-install state, scheduled checks, and an
`UpdaterService` state machine with check, download, dismiss, and apply actions.

The updater is not constructed by `main.ts`, registered in `ipc.ts`, exposed by
`preload.ts`, or rendered in the UI at baseline `6e7760b`.

## Configuration

Callers provide the real HTTPS feed URL, current version, staging location,
background interval, and unsaved-work-safe restart action. The committed source
contains a placeholder feed constant and explicit unsigned-update warning.

## Failure modes

- Missing feed configuration prevents an honest update check.
- Offline, insecure URL, HTTP failure, oversized metadata/package, invalid
  release index, hash mismatch, corrupt archive, cancellation, and pending
  install recovery are distinct states.
- Without main-process and renderer wiring, startup/background checks and the
  ready-to-restart banner do not run.

## Security considerations

Code signing is permanently prohibited. Updates rely on HTTPS transport,
Squirrel metadata, bounded downloads, and package hashes; the UI must never
claim signature authenticity. Feed credentials must not enter renderer code,
source, release assets, logs, or captures. Restart requires explicit player
action and must preserve unsaved work.

## Verification

Published release assets prove that Squirrel setup, full package, and
`RELEASES` files exist for `v0.1.0-21`. They do not prove this updater service
consumes the feed. No focused updater suite, install-from-update interaction,
rollback exercise, IPC/UI path, or packaged capture is recorded at `6e7760b`.

## Suggested articles

- [Settings](../settings.md)
- [Notifications](../notifications.md)
- [Platform service index](./README.md)
