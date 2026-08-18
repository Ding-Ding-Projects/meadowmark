/**
 * Small shared helpers used by every serializer: type guards, JSON-value
 * introspection, and escaping routines for the text formats we hand-write.
 * No dependencies - every routine here is a few lines of plain TypeScript.
 */
import type { ExportField, ExportRow, ExportSource, JsonObject, JsonValue, LossReportEntry } from './types.js';

export function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonArray(value: unknown): value is JsonValue[] {
  return Array.isArray(value);
}

export function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Returns the sensitive field key set declared explicitly by the caller. */
export function declaredSensitiveKeys(fields: ExportField[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const f of fields ?? []) {
    if (f.sensitive) out.add(f.key);
  }
  return out;
}

/**
 * Heuristic defense-in-depth: key names that look like a credential even when
 * the caller did not explicitly mark the field sensitive. This never replaces
 * explicit marking - it only adds a second, conservative net so a mistakenly
 * unmarked secret is still excluded rather than silently written to disk.
 */
const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|api[-_]?key|private[-_]?key|totp|otp[-_]?seed|credential|auth[-_]?code|recovery[-_]?code)/i;

export function looksSensitiveKeyName(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function fieldLabel(fields: ExportField[] | undefined, key: string): string {
  return fields?.find((f) => f.key === key)?.label ?? key;
}

/** Deterministic column order: keys as first seen across rows, in row order. */
export function collectColumns(rows: ExportRow[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }
  }
  return order;
}

/** Compact, deterministic JSON used to embed a nested value inside a single table cell. */
export function compactJson(value: JsonValue | undefined): string {
  if (value === undefined) return '';
  return JSON.stringify(value);
}

export function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n');
}

export function escapeXmlAttr(text: string): string {
  return escapeXmlText(text).replace(/"/g, '&quot;');
}

/** Sanitizes an arbitrary string into a valid XML element/attribute name (NCName-ish). */
export function sanitizeXmlName(name: string): { safe: string; changed: boolean } {
  let safe = name.replace(/[^A-Za-z0-9_.-]/g, '_');
  if (safe.length === 0 || /^[0-9.-]/.test(safe)) {
    safe = `_${safe}`;
  }
  return { safe, changed: safe !== name };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes a string for use inside a Markdown table cell (pipes and newlines break table syntax). */
export function escapeMarkdownCell(text: string): string {
  return text.replace(/\|/g, '\|').replace(/\r?\n/g, '<br>');
}

/** RFC 4180-ish quoting for a CSV/TSV field. */
export function delimitedField(text: string, delimiter: string): string {
  const needsQuoting = text.includes(delimiter) || text.includes('"') || text.includes('\n') || text.includes('\r');
  if (!needsQuoting) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function valueToCellText(value: JsonValue | undefined): { text: string; wasNested: boolean } {
  if (value === undefined || value === null) return { text: '', wasNested: false };
  if (isPrimitive(value)) return { text: String(value), wasNested: false };
  return { text: compactJson(value), wasNested: true };
}

/**
 * Attempts to derive tabular rows from an arbitrary JsonValue. Succeeds
 * losslessly only when the value is an array of flat (non-nested) objects.
 * Any other shape either wraps the whole value as a single describable row
 * (with an explicit loss entry) or fails outright for values that cannot be
 * represented as rows at all (a bare primitive, for instance).
 */
export function deriveRowsFromValue(
  value: JsonValue | undefined,
): { rows: ExportRow[]; lossEntries: LossReportEntry[] } {
  const lossEntries: LossReportEntry[] = [];
  if (value === undefined) {
    return { rows: [], lossEntries };
  }
  if (isJsonArray(value) && value.every((item) => isPlainObject(item))) {
    return { rows: value as ExportRow[], lossEntries };
  }
  if (isPlainObject(value)) {
    lossEntries.push({
      kind: 'structure-not-representable',
      detail:
        'Source data was a single structured object rather than a list of records; it was wrapped as one row.',
    });
    return { rows: [value as ExportRow], lossEntries };
  }
  lossEntries.push({
    kind: 'structure-not-representable',
    detail: 'Source data has no tabular shape (not an object or a list of objects); no rows could be derived.',
  });
  return { rows: [], lossEntries };
}

/** Resolves the row set a tabular serializer should use, preferring explicit `rows` over derived ones. */
export function resolveRows(source: ExportSource): { rows: ExportRow[]; lossEntries: LossReportEntry[] } {
  if (source.rows) return { rows: source.rows, lossEntries: [] };
  return deriveRowsFromValue(source.value);
}
