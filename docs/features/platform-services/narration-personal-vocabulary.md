# Narration and personal vocabulary

## Behaviour

`packages/app/src/services/narrator/**` implements narrator settings, separate
English and Cantonese voice selection, rate and pitch, a serialized controller,
and a strict bounded personal-vocabulary JSON parser/validator/loader. The
controller contracts support late voice enumeration and status reporting.

At `6e7760b`, the service is not exposed through IPC or preload and there is no
renderer settings surface or packaged narration evidence.

## Configuration

Narration defaults off. Callers select narrated language, stable voice IDs,
rate, pitch, and cooldown behavior. Vocabulary input uses a versioned bounded
schema with duplicate-key, unsafe-key, size, depth, count, and length checks.

## Failure modes

- Missing speech synthesis or a missing chosen voice requires an explicit
  unavailable/fallback state.
- Invalid vocabulary input must not partially apply.
- A corrupt or unsupported cache must fail to shipped wording.
- No current caller enumerates platform voices or sends app events to the
  controller.

## Security considerations

Vocabulary parsing and replacement are local-only. The source path, payload,
derived mappings, and cache content must not enter logs, telemetry, analytics,
exports, history, prompts, captures, repositories, or public records. Commands,
URLs, identifiers, file paths, and external factual records must remain exact.

## Verification

No focused committed suite, voice-enumeration proof, IPC interaction, packaged
speech run, or capture is recorded at `6e7760b`. The current evidence is source
presence and earlier compilation only.

## Suggested articles

- [Internationalisation and funny levels](../i18n.md)
- [Settings](../settings.md)
- [Platform service index](./README.md)
