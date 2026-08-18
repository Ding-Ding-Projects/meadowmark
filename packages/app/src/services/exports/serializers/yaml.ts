/**
 * Hand-written YAML 1.1 block-style emitter. No dependency - this covers
 * exactly the subset of YAML needed to losslessly represent a JsonValue:
 * mappings, sequences, strings (plain or double-quoted when quoting is
 * required), numbers, booleans, and null. Because every JSON value has a
 * direct YAML equivalent, this format is lossless (aside from credential
 * exclusion, applied upstream).
 */
import type { ExportSource, JsonValue, LossReportEntry } from '../types.js';
import { isJsonArray, isPlainObject } from '../util.js';

export interface YamlSerializationResult {
  contents: string;
  lossEntries: LossReportEntry[];
}

const PLAIN_SCALAR_SAFE = /^[A-Za-z0-9 ]+$/;
const RESERVED_WORDS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~']);
const LOOKS_LIKE_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function quoteYamlString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

function scalarToYaml(value: string): string {
  if (value.length === 0) return '""';
  const trimmedDiffers = value.trim() !== value;
  if (
    trimmedDiffers ||
    RESERVED_WORDS.has(value.toLowerCase()) ||
    LOOKS_LIKE_NUMBER.test(value) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(value) ||
    value.includes(': ') ||
    value.endsWith(':') ||
    value.includes(' #') ||
    !PLAIN_SCALAR_SAFE.test(value)
  ) {
    return quoteYamlString(value);
  }
  return value;
}

function primitiveToYaml(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  return scalarToYaml(value);
}

function emitNode(value: JsonValue | undefined, indent: number): string {
  const pad = '  '.repeat(indent);
  if (value === undefined || value === null) return 'null';
  if (isJsonArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((item) => {
        if (isPlainObject(item) || isJsonArray(item)) {
          const inner = emitNode(item, indent + 1);
          return `${pad}- ${inner.trimStart()}`;
        }
        return `${pad}- ${emitNode(item, indent + 1)}`;
      })
      .join('\n');
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, v]) => {
        const keyYaml = scalarToYaml(key);
        if (isPlainObject(v) || isJsonArray(v)) {
          const inner = emitNode(v, indent + 1);
          const isEmpty = inner === '{}' || inner === '[]';
          return isEmpty ? `${pad}${keyYaml}: ${inner}` : `${pad}${keyYaml}:\n${inner}`;
        }
        return `${pad}${keyYaml}: ${emitNode(v, indent + 1)}`;
      })
      .join('\n');
  }
  return primitiveToYaml(value);
}

export function serializeYaml(source: ExportSource): YamlSerializationResult {
  const header = [`# schemaVersion: ${source.schemaVersion}`, `# name: ${source.name}`].join('\n');
  const envelope: JsonValue = {
    ...(source.value !== undefined ? { value: source.value } : {}),
    ...(source.rows !== undefined ? { rows: source.rows as JsonValue } : {}),
  };
  const body = emitNode(envelope, 0);
  return {
    contents: `${header}\n${body}\n`,
    lossEntries: [],
  };
}
