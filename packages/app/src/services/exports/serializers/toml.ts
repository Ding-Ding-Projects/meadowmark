/**
 * Hand-written TOML 1.0 emitter. TOML has two real gaps versus JSON that this
 * module documents rather than papering over:
 *   - TOML has no `null`. A key whose value is null is omitted, and the
 *     omission is recorded as a loss report entry naming the field.
 *   - This emitter treats arrays as homogeneously-typed for simplicity: an
 *     array mixing types (or mixing objects with primitives) is stringified
 *     to a single JSON-text value instead, with a loss entry explaining why.
 * Nested objects become TOML tables (`[a.b]`); arrays of objects become
 * arrays of tables (`[[a.b]]`). Everything else - strings, numbers, booleans,
 * homogeneous arrays - is representable exactly.
 */
import type { ExportSource, JsonValue, LossReportEntry } from '../types.js';
import { isJsonArray, isPlainObject, isPrimitive } from '../util.js';

export interface TomlSerializationResult {
  contents: string;
  lossEntries: LossReportEntry[];
}

const BARE_KEY = /^[A-Za-z0-9_-]+$/;

function formatKey(key: string): string {
  if (BARE_KEY.test(key) && key.length > 0) return key;
  return JSON.stringify(key);
}

function formatTomlString(value: string): string {
  const escaped = value
    .replace(/\/g, '\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\n')
    .replace(/\t/g, '\t')
    .replace(/\r/g, '\r');
  return `"${escaped}"`;
}

function formatPrimitive(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  return formatTomlString(value);
}

function primitiveTypeTag(value: string | number | boolean): string {
  return typeof value;
}

function pathString(path: string[]): string {
  return path.map(formatKey).join('.');
}

function fieldPath(path: string[]): string {
  return path.join('.');
}

interface EmitContext {
  lines: string[];
  lossEntries: LossReportEntry[];
}

function emitInlineArray(
  key: string,
  path: string[],
  arr: JsonValue[],
  ctx: EmitContext,
): void {
  const fp = fieldPath([...path, key]);
  if (arr.length === 0) {
    ctx.lines.push(`${formatKey(key)} = []`);
    return;
  }
  const hasNull = arr.some((v) => v === null);
  const allPrimitive = arr.every((v) => v !== null && isPrimitive(v));
  const types = new Set(arr.filter((v) => v !== null && isPrimitive(v)).map((v) => primitiveTypeTag(v as string | number | boolean)));
  if (allPrimitive && types.size === 1 && !hasNull) {
    const items = (arr as (string | number | boolean)[]).map(formatPrimitive).join(', ');
    ctx.lines.push(`${formatKey(key)} = [${items}]`);
    return;
  }
  ctx.lossEntries.push({
    field: fp,
    kind: 'mixed-type-array-stringified',
    detail: `Array "${fp}" mixes types or contains null, which TOML arrays cannot represent uniformly; it was written as a single JSON-text string instead.`,
  });
  ctx.lines.push(`${formatKey(key)} = ${formatTomlString(JSON.stringify(arr))}`);
}

function emitTableBody(path: string[], obj: Record<string, JsonValue | undefined>, ctx: EmitContext): void {
  const nestedObjectKeys: string[] = [];
  const arrayOfObjectKeys: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value === null) {
      ctx.lossEntries.push({
        field: fieldPath([...path, key]),
        kind: 'null-omitted',
        detail: `Field "${fieldPath([...path, key])}" is null; TOML has no null value, so the key was omitted.`,
      });
      continue;
    }
    if (isPlainObject(value)) {
      nestedObjectKeys.push(key);
      continue;
    }
    if (isJsonArray(value)) {
      if (value.length > 0 && value.every((item) => isPlainObject(item))) {
        arrayOfObjectKeys.push(key);
      } else {
        emitInlineArray(key, path, value, ctx);
      }
      continue;
    }
    ctx.lines.push(`${formatKey(key)} = ${formatPrimitive(value)}`);
  }

  for (const key of nestedObjectKeys) {
    const childPath = [...path, key];
    ctx.lines.push('');
    ctx.lines.push(`[${pathString(childPath)}]`);
    emitTableBody(childPath, obj[key] as Record<string, JsonValue | undefined>, ctx);
  }

  for (const key of arrayOfObjectKeys) {
    const childPath = [...path, key];
    const items = obj[key] as Record<string, JsonValue | undefined>[];
    for (const item of items) {
      ctx.lines.push('');
      ctx.lines.push(`[[${pathString(childPath)}]]`);
      emitTableBody(childPath, item, ctx);
    }
  }
}

export function serializeToml(source: ExportSource): TomlSerializationResult {
  const ctx: EmitContext = { lines: [`# schemaVersion = ${JSON.stringify(source.schemaVersion)}`, `# name = ${JSON.stringify(source.name)}`], lossEntries: [] };
  const root: Record<string, JsonValue | undefined> = {};
  if (source.value !== undefined) root.value = source.value;
  if (source.rows !== undefined) root.rows = source.rows as JsonValue;
  emitTableBody([], root, ctx);
  return {
    contents: `${ctx.lines.join('\n')}\n`,
    lossEntries: ctx.lossEntries,
  };
}
