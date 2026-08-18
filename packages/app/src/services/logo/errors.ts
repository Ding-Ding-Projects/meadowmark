/**
 * Typed failure states for logo image handling.
 *
 * Every error carries a stable `code` (safe to show or log) and a
 * human-readable `reason`. None of these ever carry the offending image
 * bytes, a file path outside the app's own storage, or anything else
 * that should not end up in a UI string. Callers must treat every one of
 * these as "reject the whole operation, apply nothing" -- see the
 * fail-closed contract documented on `decodeSourceImage` and
 * `generateLogoAssetSet`.
 */
export type LogoErrorCode =
  | 'input-too-large'
  | 'image-too-large'
  | 'malformed-image'
  | 'animated-image-unsupported'
  | 'decode-budget-exceeded'
  | 'unsupported-format'
  | 'unknown-format'
  | 'invalid-edit-parameters'
  | 'conversion-verification-failed'
  | 'unknown-preset'
  | 'storage-failure';

export class LogoProcessingError extends Error {
  readonly code: LogoErrorCode;

  constructor(code: LogoErrorCode, message: string) {
    super(message);
    this.name = 'LogoProcessingError';
    this.code = code;
  }
}

export class InputTooLargeError extends LogoProcessingError {
  constructor(message: string) {
    super('input-too-large', message);
    this.name = 'InputTooLargeError';
  }
}

export class ImageTooLargeError extends LogoProcessingError {
  constructor(message: string) {
    super('image-too-large', message);
    this.name = 'ImageTooLargeError';
  }
}

export class MalformedImageError extends LogoProcessingError {
  constructor(message: string) {
    super('malformed-image', message);
    this.name = 'MalformedImageError';
  }
}

export class AnimatedImageError extends LogoProcessingError {
  constructor(message: string) {
    super('animated-image-unsupported', message);
    this.name = 'AnimatedImageError';
  }
}

export class DecodeBudgetExceededError extends LogoProcessingError {
  constructor(message: string) {
    super('decode-budget-exceeded', message);
    this.name = 'DecodeBudgetExceededError';
  }
}

/** A recognized format this module deliberately does not decode, with why. */
export class UnsupportedFormatError extends LogoProcessingError {
  constructor(message: string) {
    super('unsupported-format', message);
    this.name = 'UnsupportedFormatError';
  }
}

/** The bytes do not match any format signature this module recognizes at all. */
export class UnknownFormatError extends LogoProcessingError {
  constructor(message: string) {
    super('unknown-format', message);
    this.name = 'UnknownFormatError';
  }
}

export class InvalidEditParametersError extends LogoProcessingError {
  constructor(message: string) {
    super('invalid-edit-parameters', message);
    this.name = 'InvalidEditParametersError';
  }
}

/**
 * Thrown when a generated variant fails post-generation verification
 * (signature check, dimension check, alpha check, or a decode
 * round-trip). The pipeline throws this instead of returning a partial
 * asset set, so the caller's prior valid logo stays active.
 */
export class ConversionVerificationError extends LogoProcessingError {
  readonly stage: string;

  constructor(stage: string, message: string) {
    super('conversion-verification-failed', message);
    this.name = 'ConversionVerificationError';
    this.stage = stage;
  }
}

export class UnknownPresetError extends LogoProcessingError {
  constructor(message: string) {
    super('unknown-preset', message);
    this.name = 'UnknownPresetError';
  }
}

export class LogoStorageError extends LogoProcessingError {
  constructor(message: string) {
    super('storage-failure', message);
    this.name = 'LogoStorageError';
  }
}
