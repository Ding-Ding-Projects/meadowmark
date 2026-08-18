/**
 * Standard CRC-32 (IEEE 802.3, polynomial 0xEDB88320), implemented from
 * scratch so PNG chunk integrity can be verified without pulling in an
 * image library. This is the exact table-driven algorithm the PNG
 * specification (Annex D) defines for its chunk CRCs.
 */

let table: Uint32Array | undefined;

function getTable(): Uint32Array {
  if (table) return table;
  const generated = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    generated[n] = c >>> 0;
  }
  table = generated;
  return generated;
}

/** Computes the CRC-32 of a byte range, PNG-style (final XOR with 0xFFFFFFFF). */
export function crc32(data: Uint8Array, start = 0, end: number = data.length): number {
  const t = getTable();
  let crc = 0xffffffff;
  for (let i = start; i < end; i += 1) {
    const byte = data[i];
    if (byte === undefined) {
      throw new RangeError(`crc32: index ${i} out of range (length ${data.length})`);
    }
    crc = (t[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
