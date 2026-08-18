/**
 * A hand-written TOML parser and serializer implementing a documented
 * SUBSET of the format. No TOML library is bundled; this is what makes
 * the JSON<->YAML<->TOML<->XML<->CSV adapters work with zero external
 * dependency.
 *
 * Supported:
 *   - `key = value` pairs, including dotted keys (`a.b.c = 1`)
 *   - `[table]` and `[table.sub]` headers
 *   - `[[array.of.tables]]` headers
 *   - Basic strings ("...", with \n \t \r \" \\ \uXXXX escapes) and
 *     literal strings ('...', no escapes)
 *   - Integers and floats, including underscore digit separators (1_000)
 *   - Booleans (`true` / `false`, lowercase only, per spec)
 *   - Inline arrays (`[1, 2, 3]`) and inline tables (`{ a = 1, b = 2 }`),
 *     both permitted to span multiple lines (slightly more lenient than
 *     the spec, which requires inline tables on one line)
 *   - '#' comments outside strings
 *
 * Explicitly NOT supported (all throw UnsupportedConstructError):
 *   - Multi-line basic/literal strings (`"""..."""`, `'''...'''`)
 *   - Native date/time values (RFC 3339 offset dates, local dates/times) —
 *     there is no lossless StructuredValue representation for them here
 *   - Table redefinition / the finer points of TOML's key-conflict rules
 *     beyond "you cannot assign through a key that is already a scalar"
 *
 * Because JSON/YAML have no table-vs-inline-value distinction, converting
 * INTO TOML from another format requires every value that is an array to
 * be either all-scalar (written as an inline array) or all-object
 * (written as an array of tables) — a genuinely mixed array throws
 * UnsupportedConstructError, since TOML's array-of-tables syntax cannot
 * represent it.
 */

import { MalformedInputError, UnsupportedConstructError } from '../errors';
import type { ResourceBudget } from '../types';
import { chargeStructuredBudget, isPlainObject, type StructuredValue } from './model';

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseToml(text: string, budget: ResourceBudget): StructuredValue {
  const logicalLines = mergeContinuations(splitAndStripComments(text));
  const root: { [key: string]: StructuredValue } = {};
  let currentTable: { [key: string]: StructuredValue } = root;

  for (const line of logicalLines) {
    budget.check();
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const arrayTableMatch = trimmed.match(/^\[\[(.+)\]\]$/);
    if (arrayTableMatch) {
      const path = splitDottedPath(arrayTableMatch[1] as string);
      currentTable = enterArrayOfTables(root, path, budget);
      continue;
    }

    const tableMatch = trimmed.match(/^\[(.+)\]$/);
    if (tableMatch) {
      const path = splitDottedPath(tableMatch[1] as string);
      currentTable = enterTable(root, path, budget);
      continue;
    }

    const eq = findTopLevelEquals(trimmed);
    if (eq === -1) {
      throw new MalformedInputError(`Malformed TOML line (expected "key = value"): "${trimmed}"`);
    }
    const keyPart = trimmed.slice(0, eq).trim();
    const valuePart = trimmed.slice(eq + 1).trim();
    const path = splitDottedPath(keyPart);
    const value = parseTomlValue(valuePart, budget);
    budget.countItem();
    assignPath(currentTable, path, value);
  }

  return root;
}

function splitAndStripComments(text: string): string[] {
  return text.split(/\r\n|\n|\r/).map(stripTomlComment);
}

function stripTomlComment(line: string): string {
  let inBasic = false;
  let inLiteral = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"' && !inLiteral) {
      if (line[i - 1] !== '\\' || isEvenBackslashRun(line, i)) inBasic = !inBasic;
    } else if (c === "'" && !inBasic) {
      inLiteral = !inLiteral;
    } else if (c === '#' && !inBasic && !inLiteral) {
      return line.slice(0, i).replace(/\s+$/, '');
    }
  }
  return line.replace(/\s+$/, '');
}

function isEvenBackslashRun(line: string, quoteIndex: number): boolean {
  let count = 0;
  let i = quoteIndex - 1;
  while (i >= 0 && line[i] === '\\') {
    count += 1;
    i -= 1;
  }
  return count % 2 === 0;
}

/** TOML lets an inline array/table value continue onto following lines.
 * We merge lines whenever open [ / { brackets outstrip closes, respecting
 * quotes, until the brackets balance. */
function mergeContinuations(lines: string[]): string[] {
  const out: string[] = [];
  let pending: string | null = null;
  let depth = 0;
  for (const rawLine of lines) {
    const line = pending === null ? rawLine : `${pending} ${rawLine}`;
    depth = bracketDepth(line);
    if (depth > 0) {
      pending = line;
      continue;
    }
    if (depth < 0) {
      throw new MalformedInputError('Unbalanced "]" or "}" in TOML source.');
    }
    out.push(line);
    pending = null;
  }
  if (pending !== null) {
    throw new MalformedInputError('Unterminated inline array or table at end of TOML source.');
  }
  return out;
}

function bracketDepth(line: string): number {
  let depth = 0;
  let inBasic = false;
  let inLiteral = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"' && !inLiteral && isEvenBackslashRun(line, i)) inBasic = !inBasic;
    else if (c === "'" && !inBasic) inLiteral = !inLiteral;
    else if (!inBasic && !inLiteral) {
      if (c === '[' || c === '{') depth += 1;
      else if (c === ']' || c === '}') depth -= 1;
    }
  }
  return depth;
}

function findTopLevelEquals(line: string): number {
  let inBasic = false;
  let inLiteral = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"' && !inLiteral && isEvenBackslashRun(line, i)) inBasic = !inBasic;
    else if (c === "'" && !inBasic) inLiteral = !inLiteral;
    else if (c === '=' && !inBasic && !inLiteral) return i;
  }
  return -1;
}

function splitDottedPath(raw: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inBasic = false;
  let inLiteral = false;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (c === '"' && !inLiteral) {
      inBasic = !inBasic;
      current += c;
    } else if (c === "'" && !inBasic) {
      inLiteral = !inLiteral;
      current += c;
    } else if (c === '.' && !inBasic && !inLiteral) {
      parts.push(unquoteTomlKey(current.trim()));
      current = '';
    } else {
      current += c;
    }
  }
  parts.push(unquoteTomlKey(current.trim()));
  return parts;
}

function unquoteTomlKey(raw: string): string {
  if (raw.length >= 2 && raw[0] === '"' && raw[raw.length - 1] === '"') {
    return parseBasicString(raw);
  }
  if (raw.length >= 2 && raw[0] === "'" && raw[raw.length - 1] === "'") {
    return raw.slice(1, -1);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw new MalformedInputError(`Invalid TOML bare key: "${raw}"`);
  }
  return raw;
}

function assignPath(table: { [key: string]: StructuredValue }, path: readonly string[], value: StructuredValue): void {
  if (path.length === 0) {
    throw new MalformedInputError('TOML key path cannot be empty.');
  }
  let node = table;
  const intermediateKeys = path.slice(0, -1);
  for (let i = 0; i < intermediateKeys.length; i += 1) {
    const key = intermediateKeys[i] as string;
    const existing = node[key];
    if (existing === undefined) {
      const created: { [key: string]: StructuredValue } = {};
      node[key] = created;
      node = created;
    } else if (isPlainObject(existing)) {
      node = existing as { [key: string]: StructuredValue };
    } else {
      throw new MalformedInputError(`TOML key "${path.slice(0, i + 1).join('.')}" is already a value, not a table.`);
    }
  }
  const finalKey = path[path.length - 1] as string;
  if (Object.prototype.hasOwnProperty.call(node, finalKey)) {
    throw new MalformedInputError(`TOML key "${path.join('.')}" is defined more than once.`);
  }
  node[finalKey] = value;
}

function enterTable(root: { [key: string]: StructuredValue }, path: readonly string[], budget: ResourceBudget): { [key: string]: StructuredValue } {
  let node = root;
  const exitDepth = budget.enterDepth();
  try {
    for (const key of path) {
      budget.countItem();
      const existing = node[key];
      if (existing === undefined) {
        const created: { [key: string]: StructuredValue } = {};
        node[key] = created;
        node = created;
      } else if (isPlainObject(existing)) {
        node = existing as { [key: string]: StructuredValue };
      } else if (Array.isArray(existing) && existing.length > 0) {
        const lastEntry = existing[existing.length - 1];
        if (lastEntry !== undefined && isPlainObject(lastEntry)) {
          node = lastEntry as { [key: string]: StructuredValue };
        } else {
          throw new MalformedInputError(`TOML table "${path.join('.')}" conflicts with an existing non-table value.`);
        }
      } else {
        throw new MalformedInputError(`TOML table "${path.join('.')}" conflicts with an existing non-table value.`);
      }
    }
    return node;
  } finally {
    exitDepth();
  }
}

function enterArrayOfTables(root: { [key: string]: StructuredValue }, path: readonly string[], budget: ResourceBudget): { [key: string]: StructuredValue } {
  if (path.length === 0) {
    throw new MalformedInputError('TOML array-of-tables path cannot be empty.');
  }
  const parentPath = path.slice(0, -1);
  const leafKey = path[path.length - 1] as string;
  const parent = parentPath.length === 0 ? root : enterTable(root, parentPath, budget);
  const existing = parent[leafKey];
  const newEntry: { [key: string]: StructuredValue } = {};
  budget.countItem();
  if (existing === undefined) {
    parent[leafKey] = [newEntry];
  } else if (Array.isArray(existing)) {
    (existing as StructuredValue[]).push(newEntry);
  } else {
    throw new MalformedInputError(`TOML array-of-tables "${path.join('.')}" conflicts with an existing non-array value.`);
  }
  return newEntry;
}

function parseTomlValue(s: string, budget: ResourceBudget): StructuredValue {
  let i = 0;
  const trimmed = s.trim();
  const src = trimmed;

  function skipWs(): void {
    while (i < src.length && /[ \t]/.test(src[i])) i += 1;
  }

  function parseValue(): StructuredValue {
    skipWs();
    if (src[i] === '[') return parseArray();
    if (src[i] === '{') return parseInlineTable();
    if (src[i] === '"') return parseBasicStringAt();
    if (src[i] === "'") return parseLiteralStringAt();
    return parseBareScalar();
  }

  function parseArray(): StructuredValue[] {
    i += 1;
    const exitDepth = budget.enterDepth();
    try {
      const arr: StructuredValue[] = [];
      skipWs();
      if (src[i] === ']') {
        i += 1;
        return arr;
      }
      for (;;) {
        skipWs();
        budget.countItem();
        arr.push(parseValue());
        skipWs();
        if (src[i] === ',') {
          i += 1;
          continue;
        }
        if (src[i] === ']') {
          i += 1;
          break;
        }
        throw new MalformedInputError('Malformed TOML array: expected "," or "]".');
      }
      return arr;
    } finally {
      exitDepth();
    }
  }

  function parseInlineTable(): { [key: string]: StructuredValue } {
    i += 1;
    const exitDepth = budget.enterDepth();
    try {
      const obj: { [key: string]: StructuredValue } = {};
      skipWs();
      if (src[i] === '}') {
        i += 1;
        return obj;
      }
      for (;;) {
        skipWs();
        const keyStart = i;
        while (i < src.length && src[i] !== '=' && src[i] !== '}') i += 1;
        const key = unquoteTomlKey(src.slice(keyStart, i).trim());
        if (src[i] !== '=') throw new MalformedInputError('Malformed TOML inline table: expected "=".');
        i += 1;
        budget.countItem();
        obj[key] = parseValue();
        skipWs();
        if (src[i] === ',') {
          i += 1;
          continue;
        }
        if (src[i] === '}') {
          i += 1;
          break;
        }
        throw new MalformedInputError('Malformed TOML inline table: expected "," or "}".');
      }
      return obj;
    } finally {
      exitDepth();
    }
  }

  function parseBasicStringAt(): string {
    const rest = src.slice(i);
    const consumed = readQuotedSpan(rest, '"');
    const value = parseBasicString(rest.slice(0, consumed));
    i += consumed;
    return value;
  }

  function parseLiteralStringAt(): string {
    const rest = src.slice(i);
    const consumed = readQuotedSpan(rest, "'");
    const value = rest.slice(1, consumed - 1);
    i += consumed;
    return value;
  }

  function parseBareScalar(): StructuredValue {
    const start = i;
    while (i < src.length && src[i] !== ',' && src[i] !== ']' && src[i] !== '}') i += 1;
    const raw = src.slice(start, i).trim();
    return interpretTomlBareValue(raw);
  }

  const value = parseValue();
  skipWs();
  if (i !== src.length) {
    throw new UnsupportedConstructError(`Unexpected trailing content in TOML value: "${src.slice(i)}"`);
  }
  return value;
}

function readQuotedSpan(s: string, quoteChar: string): number {
  let i = 1;
  while (i < s.length) {
    if (s[i] === '\\' && quoteChar === '"') {
      i += 2;
      continue;
    }
    if (s[i] === quoteChar) {
      return i + 1;
    }
    i += 1;
  }
  throw new MalformedInputError('Unterminated TOML string.');
}

function parseBasicString(quoted: string): string {
  if (quoted.length < 2 || quoted[0] !== '"' || quoted[quoted.length - 1] !== '"') {
    throw new MalformedInputError('Malformed TOML basic string.');
  }
  const inner = quoted.slice(1, -1);
  let out = '';
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === '\\') {
      i += 1;
      const esc = inner[i];
      switch (esc) {
        case 'n':
          out += '\n';
          break;
        case 't':
          out += '\t';
          break;
        case 'r':
          out += '\r';
          break;
        case '"':
          out += '"';
          break;
        case '\\':
          out += '\\';
          break;
        case 'u': {
          const hex = inner.slice(i + 1, i + 5);
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
          break;
        }
        case 'U': {
          const hex = inner.slice(i + 1, i + 9);
          out += String.fromCodePoint(parseInt(hex, 16));
          i += 8;
          break;
        }
        default:
          out += esc ?? '';
      }
    } else {
      out += inner[i];
    }
  }
  return out;
}

const TOML_DATETIME_LIKE = /^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}:\d{2}|$)/;

function interpretTomlBareValue(raw: string): StructuredValue {
  if (raw === '') {
    throw new MalformedInputError('Empty TOML value.');
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (TOML_DATETIME_LIKE.test(raw) || /^\d{2}:\d{2}:\d{2}/.test(raw)) {
    throw new UnsupportedConstructError('TOML native date/time values are not supported by this converter.');
  }
  const withoutUnderscores = raw.replace(/(?<=\d)_(?=\d)/g, '');
  if (/^[+-]?(0x[0-9A-Fa-f]+|0o[0-7]+|0b[01]+)$/.test(withoutUnderscores)) {
    const n = Number(withoutUnderscores);
    if (Number.isSafeInteger(n)) return n;
  }
  if (/^[+-]?\d+$/.test(withoutUnderscores)) {
    const n = Number(withoutUnderscores);
    if (Number.isSafeInteger(n)) return n;
  }
  if (/^[+-]?(\d+\.\d+([eE][+-]?\d+)?|\d+[eE][+-]?\d+|inf|nan)$/.test(withoutUnderscores)) {
    if (withoutUnderscores.endsWith('inf') || withoutUnderscores.endsWith('nan')) {
      throw new UnsupportedConstructError('TOML "inf"/"nan" float values are not supported.');
    }
    const n = Number(withoutUnderscores);
    if (Number.isFinite(n)) return n;
  }
  throw new MalformedInputError(`Unrecognized TOML value: "${raw}"`);
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeToml(value: StructuredValue, budget: ResourceBudget): string {
  if (!isPlainObject(value)) {
    throw new UnsupportedConstructError('TOML documents must have an object (table) at the top level.');
  }
  chargeStructuredBudget(value, budget);
  const out: string[] = [];
  writeTomlTable(value, [], out);
  return `${out.join('\n')}\n`.replace(/\n{3,}/g, '\n\n');
}

function writeTomlTable(obj: { readonly [key: string]: StructuredValue }, path: readonly string[], out: string[]): void {
  const scalarEntries: Array<[string, StructuredValue]> = [];
  const tableEntries: Array<[string, { readonly [key: string]: StructuredValue }]> = [];
  const arrayOfTableEntries: Array<[string, StructuredValue[]]> = [];

  for (const [key, v] of Object.entries(obj)) {
    if (isPlainObject(v)) {
      tableEntries.push([key, v]);
    } else if (Array.isArray(v) && v.length > 0 && v.every((item) => isPlainObject(item))) {
      arrayOfTableEntries.push([key, v]);
    } else if (Array.isArray(v) && v.some((item) => isPlainObject(item) || Array.isArray(item))) {
      // Mixed array containing at least one object among non-object
      // items cannot be represented as either an inline array (which
      // would need to hold a table, invalid at top level of the array
      // syntax we emit) or an array of tables (which requires every
      // element to be a table).
      if (!v.every((item) => Array.isArray(item))) {
        throw new UnsupportedConstructError(
          `TOML cannot represent the array at "${[...path, key].join('.')}": it mixes tables with non-table values.`
        );
      }
      scalarEntries.push([key, v]);
    } else {
      scalarEntries.push([key, v]);
    }
  }

  if (path.length > 0 && (scalarEntries.length > 0 || (tableEntries.length === 0 && arrayOfTableEntries.length === 0))) {
    out.push(`[${path.map(tomlKeyOut).join('.')}]`);
  }
  for (const [key, v] of scalarEntries) {
    out.push(`${tomlKeyOut(key)} = ${tomlValueOut(v)}`);
  }
  for (const [key, v] of tableEntries) {
    out.push('');
    writeTomlTable(v, [...path, key], out);
  }
  for (const [key, arrayValue] of arrayOfTableEntries) {
    for (const entry of arrayValue) {
      out.push('');
      out.push(`[[${[...path, key].map(tomlKeyOut).join('.')}]]`);
      const nested = entry as { readonly [key: string]: StructuredValue };
      const scalarsOnly: string[] = [];
      const remaining: { [k: string]: StructuredValue } = {};
      for (const [k, nv] of Object.entries(nested)) {
        const isNestedTableLike = isPlainObject(nv) || (Array.isArray(nv) && nv.some(isPlainObject));
        if (isNestedTableLike) {
          remaining[k] = nv;
        } else {
          scalarsOnly.push(`${tomlKeyOut(k)} = ${tomlValueOut(nv)}`);
        }
      }
      out.push(...scalarsOnly);
      if (Object.keys(remaining).length > 0) {
        writeTomlTable(remaining, [...path, key], out);
      }
    }
  }
}

function tomlKeyOut(key: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(key)) return key;
  return `"${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function tomlValueOut(v: StructuredValue): string {
  if (v === null) {
    throw new UnsupportedConstructError('TOML has no representation for null; omit the key or give it a value.');
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new UnsupportedConstructError('TOML cannot represent NaN or Infinity.');
    }
    return String(v);
  }
  if (typeof v === 'string') return tomlStringOut(v);
  if (Array.isArray(v)) {
    return `[${v.map((item) => tomlValueOut(item)).join(', ')}]`;
  }
  const entries = Object.entries(v);
  return `{ ${entries.map(([k, ev]) => `${tomlKeyOut(k)} = ${tomlValueOut(ev)}`).join(', ')} }`;
}

function tomlStringOut(s: string): string {
  let out = '"';
  for (const ch of s) {
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else out += ch;
  }
  return `${out}"`;
}
