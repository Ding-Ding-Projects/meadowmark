# Security policy

## Supported versions

Meadowmark is early-stage software. Security fixes target the latest published
release and the current `main` branch. Older releases may not receive fixes.

## Reporting a vulnerability

Use GitHub's private vulnerability-reporting feature for this repository when
available. If that surface is unavailable, open a minimal issue that says a
private report is needed; do not include exploit details, secrets, credentials,
personal data, or private machine paths in a public issue.

Include the affected version or commit, the impacted component, reproduction
conditions, and the practical impact. The maintainers will verify the report
before publishing details.

## Project security boundaries

- Meadowmark is local-first and does not require an account for gameplay.
- Windows installers and update packages are permanently unsigned. Windows may
  show an unknown-publisher or SmartScreen warning. The project uses published
  hashes and HTTPS transport, but does not claim code-signature authenticity.
- Sensitive values must not enter source, logs, captures, exports, release
  notes, issues, or Git history.
- Main-process services do not become renderer-accessible merely because source
  modules exist. Each exposed operation requires a narrow validated IPC and
  preload contract.

Public security documentation is not proof that every planned security feature
is already wired. Current implementation and verification state is recorded in
[`HANDOFF.md`](./HANDOFF.md) and the
[feature documentation](./docs/features/README.md).
