import type { ReleaseEntry } from './types.js';
import { compareVersions } from './semver.js';

/**
 * Parser for the Squirrel.Windows `RELEASES` feed file.
 *
 * Each non-blank line has the shape:
 *
 *   <SHA1HEX> <filename> <sizeBytes>
 *
 * for example:
 *
 *   3a1e...c9  meadowmark-1.2.3-full.nupkg  48213112
 *
 * This parser is intentionally strict. A malformed line anywhere in the
 * file fails the whole parse (`invalid-feed-metadata`) rather than
 * silently skipping the bad line and possibly missing a real update, or
 * worse, picking an unintended package.
 */

const LINE_PATTERN = /^([0-9a-fA-F]{40})\s+(\S+)\s+(\d+)\s*$/;
const FILENAME_VERSION_PATTERN = /-(\d+(?:\.\d+){1,3})(-delta)?\.nupkg$/i;

export class ReleasesParseError extends Error {}

/**
 * Parses raw `RELEASES` file text into a list of entries. Throws
 * {@link ReleasesParseError} on any structural problem: empty content,
 * a line that does not match the expected format, or a package file
 * name that does not carry a recognizable version.
 */
export function parseReleasesFile(text: string): ReleaseEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new ReleasesParseError('RELEASES file was empty');
  }

  return lines.map((line) => {
    const match = LINE_PATTERN.exec(line);
    if (!match) {
      throw new ReleasesParseError(`RELEASES line did not match "<sha1> <filename> <size>": "${line}"`);
    }
    const [, sha1, filename, sizeText] = match;
    if (sha1 === undefined || filename === undefined || sizeText === undefined) {
      // LINE_PATTERN has exactly three mandatory (non-optional) capture
      // groups, so a successful match always populates all three; this is
      // unreachable in practice, but a malformed RELEASES line is exactly
      // the case this parser exists to reject cleanly rather than crash on.
      throw new ReleasesParseError(`RELEASES line did not match "<sha1> <filename> <size>": "${line}"`);
    }
    const versionMatch = FILENAME_VERSION_PATTERN.exec(filename);
    if (!versionMatch || versionMatch[1] === undefined) {
      throw new ReleasesParseError(`package file name "${filename}" does not carry a recognizable version`);
    }
    const sizeBytes = Number.parseInt(sizeText, 10);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new ReleasesParseError(`package file name "${filename}" declared a non-positive size`);
    }
    return {
      sha1: sha1.toLowerCase(),
      filename,
      sizeBytes,
      version: versionMatch[1],
      isDelta: Boolean(versionMatch[2]),
    };
  });
}

/**
 * Picks the entry to install: the highest-versioned *full* package
 * entry. Delta packages are ignored, since correctly applying a delta
 * requires the exact prior package as a base and this service does not
 * track that lineage. Returns null when there are no full-package
 * entries at all, which the caller treats as invalid feed metadata.
 */
export function selectLatestFullRelease(entries: readonly ReleaseEntry[]): ReleaseEntry | null {
  let best: ReleaseEntry | null = null;
  for (const entry of entries) {
    if (entry.isDelta) {
      continue;
    }
    if (best === null || compareVersions(entry.version, best.version) > 0) {
      best = entry;
    }
  }
  return best;
}
