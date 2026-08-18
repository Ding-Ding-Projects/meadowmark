# Contributing to Meadowmark

Thank you for helping Meadowmark grow. The project is a Windows-only,
strict-TypeScript monorepo. Contributions must keep the game free of purchases,
subscriptions, premium currency, advertising, and paywalls.

## Start here

1. Read [`AGENTS.md`](./AGENTS.md) and the relevant article in
   [`docs/features`](./docs/features/README.md).
2. Run `download-dependencies.bat /s` from the repository root.
3. Build with `build.bat /s`.
4. Keep changes inside the owning workspace under `packages/`; do not import
   another package's private modules.
5. Run the focused local checks relevant to the change. GitHub Actions builds,
   packages, and publishes; it deliberately runs no tests or lint.

## Pull requests

- Explain the behavior changed, the failure mode addressed, and the local
  verification actually performed.
- Do not claim UI or runtime proof from a source review, type-check, or package
  inventory. Link real built-artifact evidence when the change has a surface.
- Keep public writing in ordinary technical language.
- Never include secrets, credentials, private paths, dependency directories,
  caches, or generated build output.
- Preserve the permanent no-signing policy. Unsigned Windows artifacts are an
  intentional project boundary.

## Commit messages

Use a concise English subject. In the body, describe the same factual change in
English and playful Hong Kong-style Cantonese. Humor may roast the code or the
situation, never a person, and it must not hide what changed.

## Reporting a problem

Use the repository's [issue tracker](https://github.com/Ding-Ding-Projects/meadowmark/issues).
Include the Meadowmark version, Windows version, exact steps, expected result,
actual result, and any non-sensitive logs. See [`SECURITY.md`](./SECURITY.md)
for security reports.
