# Logo customization pipeline

## Behaviour

`packages/app/src/services/logo/**` implements bounded source-byte inspection,
PNG/JPEG/SVG probing, decode limits, crop/fit/background edits, PNG output, ICO
encoding, presets, local storage, and a manager API that keeps the prior valid
selection when processing fails.

The module changes display assets only. It is not wired to IPC, preload, or an
appearance/settings UI at baseline `6e7760b`.

## Configuration

The pipeline takes a local source, edit choices, target display sizes, and a
private app-data/cache destination. Accepted formats and byte, pixel, frame,
dimension, and output bounds are code-owned rather than inferred from a file
extension.

## Failure modes

- Signature mismatch, malformed input, unsupported animation, excessive decoded
  dimensions, or conversion failure rejects the candidate.
- Failed conversion keeps the previous valid logo active.
- No current renderer consumer or packaged icon update proves that derived
  output appears anywhere in the app.

## Security considerations

Custom images are local private data. They must not be uploaded, logged,
captured, exported, placed in prompts, or committed. Display customization must
never change the app ID, executable name, installer identity, update feed, data
directory, or signing state.

## Verification

No focused committed suite, UI interaction, packaged icon inspection, or real
capture exists for logo customization at `6e7760b`. Source modules are not
runtime proof.

## Suggested articles

- [Material Design 3 token system](../design-system.md)
- [Settings](../settings.md)
- [Platform service index](./README.md)
