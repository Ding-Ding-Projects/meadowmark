import { createHash } from 'node:crypto';

/**
 * Lowercase hex SHA1 of a buffer, matching the hash format published in
 * a Squirrel.Windows `RELEASES` file. SHA1 is not a strong integrity
 * primitive against a deliberate adversary who can also rewrite the
 * `RELEASES` line pointing at it, but it is what the Squirrel.Windows
 * feed format publishes; the real integrity boundary here is HTTPS
 * transport, which this module's exclusive use of `fetchBody` provides.
 */
export function sha1Hex(data: Buffer): string {
  return createHash('sha1').update(data).digest('hex');
}

/** A `.nupkg` package is a ZIP archive; a real one always starts with the ZIP local-file-header magic bytes. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** True when `data` begins with the ZIP local-file-header signature, i.e. looks like a real `.nupkg`. */
export function looksLikeZipArchive(data: Buffer): boolean {
  return data.length >= ZIP_MAGIC.length && data.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC);
}
