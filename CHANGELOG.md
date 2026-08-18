# Changelog

This file records the published Meadowmark release history. Each entry links to
the commit targeted by that release. The release workflow publishes a new
monotonic build tag for successful pushes; tag numbers are therefore not a
promise that every integer exists.

## [v0.1.0-21] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-21) ·
[commit `6e7760b`](https://github.com/Ding-Ding-Projects/meadowmark/commit/6e7760b993ad07356efe4b641220578b267fe807)

- Published the first release after packaged terrain and field-bed rendering
  evidence opened the release hold.
- Contains the settings-service IPC bridge and terrain/field-bed first-paint
  repair. The repository's only packaged capture was recorded from the earlier
  `c328d7d` artifact and is baseline evidence, not a complete surface matrix.
- Shipped unsigned `Setup.exe`, the full `.nupkg`, and `RELEASES`. GitHub
  Actions ran no tests or lint by standing project policy.

## [v0.1.0-16] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-16) ·
[commit `47cd372`](https://github.com/Ding-Ding-Projects/meadowmark/commit/47cd372ec8866bf605d7d470c6a5a972dc7af3cb)

- Added an evidence-first handoff that described the then-visible flat world,
  unreadable navigation, untranslated crop key, and clipped HUD instead of
  presenting successful compilation as runtime success.

## [v0.1.0-15] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-15) ·
[commit `c0822d3`](https://github.com/Ding-Ding-Projects/meadowmark/commit/c0822d363f72b245f6d40998d922227896391e7e)

- Integrated strict-TypeScript repairs across the ten main-process service
  source families. Source compilation did not establish IPC, UI, or packaged
  interaction for those services.

## [v0.1.0-14] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-14) ·
[commit `621427c`](https://github.com/Ding-Ding-Projects/meadowmark/commit/621427cc27e6742fec59a4c394814255962d38e0)

- Repaired the sandboxed preload bridge and added a guard that rejects Node
  filesystem code in the emitted preload bundle.

## [v0.1.0-13] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-13) ·
[commit `258f3fe`](https://github.com/Ding-Ding-Projects/meadowmark/commit/258f3fe736a240926c69b69ed530a148ace269c4)

- Integrated the Material Design 3 design layer and missing navigation shell.

## [v0.1.0-11] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-11) ·
[commit `33d9757`](https://github.com/Ding-Ding-Projects/meadowmark/commit/33d9757ec1c7b51293fe95b55bc0e53494ed8811)

- Added `.js` extensions to shared-package ESM imports so emitted modules load
  in Node rather than merely satisfying TypeScript.

## [v0.1.0-10] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-10) ·
[commit `cd25337`](https://github.com/Ding-Ding-Projects/meadowmark/commit/cd2533721a5ff17ef6b50a668ab5a19b926141e1)

- Added a real Open Graph image, data-driven download state, and site-wide
  appearance editing to the documentation site.

## [v0.1.0-9] - 2026-08-18

[Release](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-9) ·
[commit `5520efe`](https://github.com/Ding-Ding-Projects/meadowmark/commit/5520efe7bf2c71af9272f96e4e1895a44b8aa9b0)

- Corrected the electron-builder signing configuration and locally verified
  that the generated setup executable reported `NotSigned`.

## Foundational 0.1.0 work

The initial code line was assembled before the monotonic release records above:

- [`278f191`](https://github.com/Ding-Ding-Projects/meadowmark/commit/278f1919346f1db69681344c6e45acd767d06ed4)
  created the npm workspace foundation.
- [`148c7bb`](https://github.com/Ding-Ding-Projects/meadowmark/commit/148c7bb53565173ce41d2a56ee538605a0e9bd0e)
  integrated the shared deterministic simulation.
- [`9bce227`](https://github.com/Ding-Ding-Projects/meadowmark/commit/9bce2274c958ad98d9d2454af4a7b662be292b10)
  integrated the generated three.js rendering engine.
- [`52cda70`](https://github.com/Ding-Ding-Projects/meadowmark/commit/52cda70b62c3ddda0324d5eb2f5157326bbea60f)
  integrated the DOM interface and its feature articles.
- [`eb8fff3`](https://github.com/Ding-Ding-Projects/meadowmark/commit/eb8fff3ba1353a5709c05de326ab521d246a9cb6)
  integrated the ten local main-process service source families.
