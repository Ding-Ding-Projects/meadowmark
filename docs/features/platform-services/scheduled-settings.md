# Scheduled and external settings

## Behaviour

The base `SettingsStore` under `packages/app/src/services/settings/**` is wired
through main-process IPC, preload, and the settings UI for overlapping
appearance/general values. The same directory also implements versioned
scheduled-rule validation, local-time matching, deterministic precedence,
effective-value calculation, and provenance without overwriting base settings.

External HTTPS and Home Assistant source execution is not implemented in the
baseline resolver; `resolveLocalOnlyScheduledSource` exposes the local-only
boundary explicitly.

## Configuration

Rules carry stable IDs, labels, enabled state, optional dates, time windows,
weekday recurrence, priority, setting overrides, and source descriptors.
Evaluation uses caller-supplied current local time and base settings.

## Failure modes

- Invalid partial dates/times, empty weekday selections, unknown settings, or
  unsupported source descriptors are rejected by validation.
- External API and Home Assistant rules cannot be resolved by the current
  local-only source implementation.
- The renderer settings surface does not yet expose a schedule editor or live
  watcher.

## Security considerations

Any future external resolver must validate HTTPS origins, reject credentials in
URLs and unsafe redirects, prevent SSRF/file access, bound response size and
timeouts, keep tokens in the operating-system credential vault, and prevent
older responses from overwriting newer settings. No token belongs in schedules,
exports, renderer bundles, logs, captures, or Git history.

## Verification

Source wiring establishes base settings IPC at `6e7760b`. The `c328d7d`
packaged capture proves application launch and first paint only; it does not
prove settings-service hydration or persistence. Scheduled rule evaluation,
external sources, editor behavior, timezone/DST boundaries, and packaged
interaction have no recorded focused suite or capture at `6e7760b`.

## Suggested articles

- [Settings](../settings.md)
- [Internationalisation and funny levels](../i18n.md)
- [Platform service index](./README.md)
