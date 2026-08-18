/**
 * 7z archive support.
 *
 * This app ships no bundled LZMA2/LZMA/PPMd/BZip2 compression backend, so a
 * genuine 7z archive cannot be produced without either a new dependency or a
 * hand-written codec implementation - neither of which this module does.
 * Rather than silently falling back to a ZIP and calling it "7z", or
 * claiming success, `create7zArchive` always reports the honest unavailable
 * state, naming exactly what is missing. Callers should offer the ZIP writer
 * (zip.ts) as the working archive path and surface this reason to the user
 * when they ask for 7z specifically.
 *
 * The full 7z option surface is still declared here (SevenZipOptions in
 * types.ts covers method, level, dictionary/word/solid-block size, solid
 * mode, multithreading, split volumes, and AES-256 with encrypted headers)
 * so a caller's settings UI can present every real 7z choice even while the
 * feature is unavailable, and so a future bundled backend can be wired in
 * without changing the UI-facing contract.
 */
import type { SevenZipOptions, SevenZipUnavailableResult } from './types.js';

export const DEFAULT_SEVEN_ZIP_OPTIONS: SevenZipOptions = {
  method: 'lzma2',
  level: 'normal',
  solid: true,
  multithreaded: true,
};

/**
 * Always returns an explicit unavailable result. Never throws and never
 * pretends to succeed: a caller that ignores the `available: false` flag and
 * tries to use the result as archive bytes will fail loudly rather than
 * silently producing a corrupt or fake file.
 */
export function create7zArchive(options: SevenZipOptions = DEFAULT_SEVEN_ZIP_OPTIONS): SevenZipUnavailableResult {
  return {
    available: false,
    reason:
      'No bundled 7z backend is available in this application. LZMA2, LZMA, PPMd, and BZip2 compression require a codec this app does not ship. Use the ZIP archive export instead.',
    requestedOptions: options,
  };
}
