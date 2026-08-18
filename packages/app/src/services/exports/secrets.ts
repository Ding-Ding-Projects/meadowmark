/**
 * Credential exclusion.
 *
 * Authenticator secrets and other credentials are excluded from every
 * ordinary export produced by this engine, in every format. The exclusion is
 * never silent: `stripSensitiveData` always returns a loss report entry for
 * every field it removed, naming the field and stating plainly that it was
 * withheld because it is a credential - never a bare omission the caller
 * could mistake for a bug.
 *
 * Two layers decide what counts as sensitive:
 *  1. Fields the caller explicitly marks `sensitive: true` (authoritative).
 *  2. A conservative key-name heuristic (password, token, secret, totp, ...)
 *     that catches a field the caller forgot to mark, as defense in depth.
 * Neither layer is a substitute for the other; both are applied.
 */
import type { ExportRow, ExportSource, JsonObject, JsonValue, LossReportEntry } from './types.js';
import { declaredSensitiveKeys, isJsonArray, isPlainObject, looksSensitiveKeyName } from './util.js';

export interface StrippedSource {
  source: ExportSource;
  removedFieldNames: string[];
  lossEntries: LossReportEntry[];
}

function isSensitiveKey(key: string, declared: Set<string>): boolean {
  return declared.has(key) || looksSensitiveKeyName(key);
}

function stripRow(row: ExportRow, declared: Set<string>, removed: Set<string>): ExportRow {
  const out: ExportRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (isSensitiveKey(key, declared)) {
      removed.add(key);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function stripValue(value: JsonValue | undefined, declared: Set<string>, removed: Set<string>): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (isJsonArray(value)) {
    return value.map((item) => stripValue(item, declared, removed) as JsonValue);
  }
  if (isPlainObject(value)) {
    const out: JsonObject = {};
    for (const [key, inner] of Object.entries(value)) {
      if (isSensitiveKey(key, declared)) {
        removed.add(key);
        continue;
      }
      out[key] = stripValue(inner, declared, removed);
    }
    return out;
  }
  return value;
}

/**
 * Returns a copy of `source` with every sensitive field removed from both
 * `rows` and `value` (at any nesting depth), plus the loss report entries
 * documenting exactly what was withheld and why.
 */
export function stripSensitiveData(source: ExportSource): StrippedSource {
  const declared = declaredSensitiveKeys(source.fields);
  const removed = new Set<string>();

  const rows = source.rows?.map((row) => stripRow(row, declared, removed));
  const value = stripValue(source.value, declared, removed);

  const removedFieldNames = Array.from(removed).sort();
  const lossEntries: LossReportEntry[] = removedFieldNames.map((field) => ({
    field,
    kind: 'sensitive-field-excluded',
    detail: `Field "${field}" is a credential/secret and was excluded from this export. It is never written to disk in an ordinary export.`,
  }));

  return {
    source: { ...source, rows, value },
    removedFieldNames,
    lossEntries,
  };
}
