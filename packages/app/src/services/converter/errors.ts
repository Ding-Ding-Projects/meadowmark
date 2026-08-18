/**
 * Typed failure modes for the universal file converter.
 *
 * Every one of these is a *reported boundary*, never a silent fallback.
 * When a conversion throws one of these, the source file has NOT been
 * touched and no output has been written (or a partially written output
 * has already been deleted) — see output.ts for the write-side half of
 * that guarantee.
 */

/** Base class for every converter failure. `code` is a stable machine
 * identifier a caller (renderer UI) can switch on without parsing prose. */
export class ConverterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** The source bytes did not match any signature this converter knows,
 * enabled or disabled. We refuse to guess. */
export class UnknownFormatError extends ConverterError {
  constructor(message = 'The source file does not match any known format.') {
    super('unknown-format', message);
  }
}

/** The source format is known, but every adapter that could read it is
 * disabled because a required bundled dependency is missing. Carries the
 * exact dependency name so the UI can name it rather than saying "no".*/
export class UnavailableAdapterError extends ConverterError {
  readonly missingDependency: string;

  constructor(missingDependency: string, message?: string) {
    super(
      'adapter-unavailable',
      message ?? `This conversion needs "${missingDependency}", which is not bundled in this build.`
    );
    this.missingDependency = missingDependency;
  }
}

/** The source bytes matched the format's signature but could not be
 * parsed as that format (truncated, corrupted, or violates the format's
 * own structural rules). */
export class MalformedInputError extends ConverterError {
  constructor(message: string) {
    super('malformed-input', message);
  }
}

/** The source uses a real feature of its format that this bundled
 * adapter's documented subset does not implement. This is NOT the same
 * as malformed input — the file is valid, we just cannot losslessly (or
 * at all) represent the construct it uses. */
export class UnsupportedConstructError extends ConverterError {
  constructor(message: string) {
    super('unsupported-construct', message);
  }
}

/** The source is encrypted or password-protected. We never guess a
 * passphrase and never partially decode an encrypted container. */
export class EncryptedInputError extends ConverterError {
  constructor(message = 'The source is encrypted or password-protected; this converter cannot read it.') {
    super('encrypted-input', message);
  }
}

/** One of the declared ResourceLimits was hit. Carries which one, so the
 * boundary can be reported exactly rather than as a generic failure. */
export class ResourceLimitExceededError extends ConverterError {
  readonly limit: 'input-bytes' | 'output-bytes' | 'depth' | 'items' | 'cpu-time';
  readonly limitValue: number;

  constructor(limit: ResourceLimitExceededError['limit'], limitValue: number, message?: string) {
    super('resource-limit-exceeded', message ?? `Conversion stopped: exceeded its ${limit} limit (${limitValue}).`);
    this.limit = limit;
    this.limitValue = limitValue;
  }
}

/** The operation was cancelled by the caller (user pressed cancel, or the
 * queue was paused/cancelled mid-item). Not an error in the data; the
 * source is untouched and any partial output has been removed. */
export class CancelledError extends ConverterError {
  constructor(message = 'The conversion was cancelled.') {
    super('cancelled', message);
  }
}

/** The destination path already has a file and the caller did not pass
 * `confirmOverwrite: true`. We never overwrite silently. */
export class DestinationExistsError extends ConverterError {
  constructor(destinationPath: string) {
    super('destination-exists', `"${destinationPath}" already exists. Pass confirmOverwrite to replace it.`);
  }
}

/** Preflight determined the destination volume does not have enough free
 * space for the estimated output. */
export class InsufficientDiskSpaceError extends ConverterError {
  readonly requiredBytes: number;
  readonly availableBytes: number;

  constructor(requiredBytes: number, availableBytes: number) {
    super(
      'insufficient-disk-space',
      `Need approximately ${requiredBytes} bytes free but only ${availableBytes} are available at the destination.`
    );
    this.requiredBytes = requiredBytes;
    this.availableBytes = availableBytes;
  }
}
