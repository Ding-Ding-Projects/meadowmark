/**
 * Bounds-checked byte access.
 *
 * With `noUncheckedIndexedAccess` enabled project-wide, bracket indexing
 * into a Buffer/Uint8Array types as `number | undefined`. That is exactly
 * right for this module: every byte offset here is computed from
 * attacker-controlled (or at least untrusted) file contents, and an
 * out-of-range read must become a loud, typed decode failure rather than
 * a silent `NaN` that corrupts pixels or, worse, an out-of-bounds read
 * that some runtime clamps back to `undefined` without telling anyone.
 */
export function byteAt(buf: Uint8Array, index: number): number {
  const value = buf[index];
  if (value === undefined) {
    throw new RangeError(`byte index ${index} out of range (buffer length ${buf.length})`);
  }
  return value;
}
