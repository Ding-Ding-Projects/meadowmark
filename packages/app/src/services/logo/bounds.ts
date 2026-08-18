/**
 * Hard resource bounds for logo image handling.
 *
 * Every value here exists to reject a hostile or malformed image BEFORE
 * it can spend unbounded CPU, memory, or disk on this process. A user
 * picking a custom logo hands us an arbitrary file; nothing about that
 * file's claimed dimensions, chunk lengths, or compressed size may be
 * trusted until it has been checked against these ceilings.
 */

/** Largest source file this module will even attempt to read (bytes). */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20 MiB

/** Largest single dimension (width or height) accepted for a source image. */
export const MAX_DIMENSION = 8192;

/** Largest total pixel count accepted for a source image (~16 MP). */
export const MAX_PIXELS = 16_000_000;

/** Largest decoded RGBA8 buffer this module will allocate (bytes). */
export const MAX_DECODED_RGBA_BYTES = MAX_PIXELS * 4;

/**
 * Static images only: any PNG carrying an `acTL` chunk (APNG animation)
 * is rejected outright rather than decoding only its first frame, so a
 * "decoded" image never silently drops animation the user might have
 * expected to be preserved.
 */
export const MAX_FRAMES = 1;

/** Wall-clock budget (ms) for the pixel-reconstruction loop of a single decode. */
export const DECODE_TIME_BUDGET_MS = 4000;

/** How often (in scanlines) the decode loop checks its time budget. */
export const DECODE_TIME_CHECK_INTERVAL_ROWS = 64;

/** Upper bound on how many output size/format variants one pipeline run may produce. */
export const MAX_OUTPUT_VARIANTS = 16;

/** Upper bound on entries packed into a single .ico container. */
export const MAX_ICO_ENTRIES = 8;

/** Only the first N bytes of an uploaded SVG are inspected for header probing. */
export const SVG_PROBE_MAX_BYTES = 65536;

/** Bound on how many JPEG marker segments the header probe will walk. */
export const JPEG_PROBE_MAX_SEGMENTS = 256;

/** Only the first N bytes of any upload are sniffed to determine its format. */
export const FORMAT_SNIFF_BYTES = 64;
