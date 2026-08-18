/**
 * Public API surface of the built-in authenticator (TOTP) service.
 * Everything the rest of the app (IPC handlers, orchestration) needs is
 * re-exported from here; internal modules (base32, otp, otpauth-uri,
 * qrcode, vault, entries-store, clock-monitor) are implementation
 * details reached only through AuthService.
 */

export { AuthService, AuthServiceUnavailableError, PendingRegistrationNotFoundError, PairingNotConfirmedError } from './auth-service.js';
export type {
  PendingRegistrationSummary,
  BeginRegistrationOptions,
  BeginRegistrationFromSecretOptions,
  CurrentCodeResult,
} from './auth-service.js';

export type { AuthEntry, AuthGroup } from './entries-store.js';

export type { OtpAlgorithm, OtpParams } from './otp.js';
export { MIN_OTP_DIGITS, MAX_OTP_DIGITS, DEFAULT_OTP_PARAMS, OtpValidationError } from './otp.js';

export { OtpAuthUriError } from './otpauth-uri.js';
export { QrEncodingError } from './qrcode.js';
export { VaultUnavailableError, VaultCorruptError, isVaultAvailable } from './vault.js';
export type { ClockStatus } from './clock-monitor.js';
