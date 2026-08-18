# Platform service index

The main-process service modules listed here are implemented source, not a claim
that every feature is exposed through IPC, presented in the UI, or exercised in
a packaged application.

- [Authenticator, toy locks, and local history](./auth-locks-history.md)
- [File conversion and export](./file-conversion-exports.md)
- [Logo customization pipeline](./logo-customization.md)
- [Narration and personal vocabulary](./narration-personal-vocabulary.md)
- [Local Ollama manager](./ollama-manager.md)
- [Scheduled and external settings](./scheduled-settings.md)
- [Unsigned automatic updates](./updater.md)

At baseline `6e7760b`, the settings store is the only one of these service
families with an end-to-end main-process IPC and preload bridge. The other
families remain source modules without renderer UI/runtime proof.
