/**
 * Minimal version comparison for Squirrel/NuGet-style version strings
 * (`major.minor.patch` or `major.minor.patch.build`, all numeric). This
 * intentionally does not implement full semver (no pre-release or build
 * metadata suffixes) because Squirrel.Windows package file names never
 * carry them - a fuller parser would accept input the feed format
 * cannot actually produce and create a false sense of generality.
 */

/**
 * Parses a version string into an array of non-negative integer
 * components. Throws if any component is not a plain non-negative
 * integer, so a malformed version fails loudly instead of comparing as
 * if it were `0`.
 */
export function parseVersionComponents(version: string): number[] {
  const parts = version.split('.');
  if (parts.length === 0) {
    throw new Error(`empty version string`);
  }
  return parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      throw new Error(`version component "${part}" in "${version}" is not a non-negative integer`);
    }
    return Number.parseInt(part, 10);
  });
}

/**
 * Compares two version strings. Returns a negative number if `a < b`,
 * zero if equal, positive if `a > b`. Missing trailing components are
 * treated as `0`, so `1.2` equals `1.2.0`.
 */
export function compareVersions(a: string, b: string): number {
  const aParts = parseVersionComponents(a);
  const bParts = parseVersionComponents(b);
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i += 1) {
    const aValue = aParts[i] ?? 0;
    const bValue = bParts[i] ?? 0;
    if (aValue !== bValue) {
      return aValue - bValue;
    }
  }
  return 0;
}

/** True when `candidate` is a strictly newer version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}
