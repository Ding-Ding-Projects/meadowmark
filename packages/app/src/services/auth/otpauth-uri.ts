/**
 * otpauth:// URI parsing and building, following the de facto Key URI
 * Format every real-world authenticator app and issuer uses:
 *
 *   otpauth://TYPE/LABEL?PARAMETERS
 *
 * TYPE is "totp" or "hotp". LABEL is "[issuer:]accountname", both halves
 * percent-encoded. PARAMETERS carries secret (required, base32),
 * issuer, algorithm, digits, period (totp only), and counter (hotp
 * only).
 *
 * Every parameter an incoming URI actually carries is honored exactly as
 * given, never silently overwritten with this project's defaults —
 * building a QR from a URI (or accepting a pasted one) has to reproduce
 * exactly what the issuer intended, not this app's opinion of what a
 * typical issuer intends.
 */

import { base32Decode, base32Encode, Base32DecodeError } from './base32.js';
import {
  DEFAULT_OTP_ALGORITHM,
  DEFAULT_OTP_DIGITS,
  DEFAULT_OTP_PERIOD_SECONDS,
  OTP_ALGORITHMS,
  validateOtpParams,
  type OtpAlgorithm,
  type OtpParams,
} from './otp.js';

export class OtpAuthUriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpAuthUriError';
  }
}

export type OtpType = 'totp' | 'hotp';

export interface ParsedOtpAuthUri {
  type: OtpType;
  /** The issuer portion of the label, or from the `issuer` query
   * parameter when the label carries none. Empty string when neither is
   * present — callers should treat that as "unknown issuer" rather than
   * inventing one. */
  issuer: string;
  /** The account-name portion of the label, always present (a URI with
   * no label content is not a valid otpauth:// URI). */
  account: string;
  secret: Buffer;
  algorithm: OtpAlgorithm;
  digits: number;
  /** Present only for `type === 'totp'`. */
  period?: number;
  /** Present only for `type === 'hotp'`: the initial counter value. */
  counter?: bigint;
}

export interface BuildOtpAuthUriOptions {
  type: OtpType;
  issuer: string;
  account: string;
  secret: Buffer;
  algorithm: OtpAlgorithm;
  digits: number;
  period?: number;
  counter?: bigint;
}

/**
 * Parses an otpauth:// URI. Throws OtpAuthUriError with a specific reason
 * for anything malformed, unsupported, or missing its required secret —
 * never silently substitutes a default for something the URI failed to
 * supply validly.
 */
export function parseOtpAuthUri(uriText: string): ParsedOtpAuthUri {
  const trimmed = uriText.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new OtpAuthUriError('Not a valid URI.');
  }

  if (url.protocol !== 'otpauth:') {
    throw new OtpAuthUriError(`Expected an "otpauth://" URI, got scheme ${JSON.stringify(url.protocol)}.`);
  }

  // In an otpauth:// URI, "totp" / "hotp" is the URL host (the part
  // between "//" and the next "/"), and the label is the path.
  const type = url.hostname.toLowerCase();
  if (type !== 'totp' && type !== 'hotp') {
    throw new OtpAuthUriError(`Unsupported otpauth type: ${JSON.stringify(url.hostname)}. Expected "totp" or "hotp".`);
  }

  // url.pathname is percent-decoded already by the URL parser, with a
  // leading '/'.
  const label = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (label.length === 0) {
    throw new OtpAuthUriError('URI has an empty label (no account name).');
  }

  let labelIssuer = '';
  let account = label;
  const colonIndex = label.indexOf(':');
  if (colonIndex >= 0) {
    labelIssuer = label.slice(0, colonIndex).trim();
    account = label.slice(colonIndex + 1).trim();
  }

  const params = url.searchParams;

  const secretText = params.get('secret');
  if (!secretText) {
    throw new OtpAuthUriError('URI is missing the required "secret" parameter.');
  }
  let secret: Buffer;
  try {
    secret = base32Decode(secretText);
  } catch (err) {
    const reason = err instanceof Base32DecodeError ? err.message : String(err);
    throw new OtpAuthUriError(`Invalid "secret" parameter: ${reason}`);
  }
  if (secret.length === 0) {
    throw new OtpAuthUriError('Decoded secret is empty.');
  }

  const queryIssuer = params.get('issuer')?.trim() ?? '';
  // Per the Key URI Format spec, when both the label and the query carry
  // an issuer and they disagree, this is technically malformed — but
  // real-world issuers get this wrong constantly. Prefer the query
  // parameter (it is the more explicit, less ambiguous of the two) and
  // fall back to the label's issuer only when the query omits it.
  const issuer = queryIssuer || labelIssuer;

  const algorithmText = params.get('algorithm')?.trim().toUpperCase();
  const algorithm: OtpAlgorithm = algorithmText
    ? assertSupportedAlgorithm(algorithmText)
    : DEFAULT_OTP_ALGORITHM;

  const digits = params.has('digits')
    ? parsePositiveInt(params.get('digits'), 'digits')
    : DEFAULT_OTP_DIGITS;

  let period: number | undefined;
  let counter: bigint | undefined;

  if (type === 'totp') {
    period = params.has('period')
      ? parsePositiveInt(params.get('period'), 'period')
      : DEFAULT_OTP_PERIOD_SECONDS;
  } else {
    const counterText = params.get('counter');
    if (!counterText) {
      throw new OtpAuthUriError('hotp URI is missing the required "counter" parameter.');
    }
    try {
      counter = BigInt(counterText);
    } catch {
      throw new OtpAuthUriError(`Invalid "counter" parameter: ${JSON.stringify(counterText)}.`);
    }
    if (counter < 0n) {
      throw new OtpAuthUriError('"counter" parameter must not be negative.');
    }
  }

  const otpParams: OtpParams = { algorithm, digits, period: period ?? DEFAULT_OTP_PERIOD_SECONDS };
  validateOtpParams(otpParams);

  const result: ParsedOtpAuthUri = {
    type,
    issuer,
    account,
    secret,
    algorithm,
    digits,
  };
  if (type === 'totp') {
    result.period = period;
  } else {
    result.counter = counter;
  }
  return result;
}

function assertSupportedAlgorithm(text: string): OtpAlgorithm {
  if ((OTP_ALGORITHMS as readonly string[]).includes(text)) {
    return text as OtpAlgorithm;
  }
  throw new OtpAuthUriError(
    `Unsupported "algorithm" parameter: ${JSON.stringify(text)}. Supported: ${OTP_ALGORITHMS.join(', ')}.`,
  );
}

function parsePositiveInt(text: string | null, fieldName: string): number {
  if (text === null || !/^\d+$/.test(text)) {
    throw new OtpAuthUriError(`Invalid "${fieldName}" parameter: ${JSON.stringify(text)}.`);
  }
  const value = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new OtpAuthUriError(`"${fieldName}" parameter must be a positive integer, got ${JSON.stringify(text)}.`);
  }
  return value;
}

/**
 * Builds an otpauth:// URI from explicit parameters. Used both to hand a
 * freshly generated secret to the QR renderer, and to reproduce a
 * parsed URI byte-for-byte-equivalent (modulo parameter ordering) for
 * re-display.
 */
export function buildOtpAuthUri(options: BuildOtpAuthUriOptions): string {
  validateOtpParams({
    algorithm: options.algorithm,
    digits: options.digits,
    period: options.period ?? DEFAULT_OTP_PERIOD_SECONDS,
  });

  const label = options.issuer
    ? `${encodeURIComponent(options.issuer)}:${encodeURIComponent(options.account)}`
    : encodeURIComponent(options.account);

  const query = new URLSearchParams();
  query.set('secret', base32Encode(options.secret));
  if (options.issuer) {
    query.set('issuer', options.issuer);
  }
  query.set('algorithm', options.algorithm);
  query.set('digits', String(options.digits));

  if (options.type === 'totp') {
    query.set('period', String(options.period ?? DEFAULT_OTP_PERIOD_SECONDS));
  } else {
    if (options.counter === undefined) {
      throw new OtpAuthUriError('hotp URIs require a counter.');
    }
    query.set('counter', options.counter.toString(10));
  }

  // URLSearchParams.toString() percent-encodes spaces as '+', which is
  // valid application/x-www-form-urlencoded but looks wrong pasted
  // elsewhere; otpauth consumers universally accept %20 too, so prefer
  // it for a URI a human might read.
  const queryString = query.toString().replace(/\+/g, '%20');

  return `otpauth://${options.type}/${label}?${queryString}`;
}
