/**
 * A hand-written YAML parser and serializer implementing a documented
 * SUBSET of the format. No YAML library is bundled with this build, so
 * this module is what makes the JSON<->YAML<->TOML<->XML<->CSV adapters
 * work with zero external dependency. It is deliberately conservative:
 * anything outside the subset throws UnsupportedConstructError naming
 * exactly what was not understood, rather than guessing.
 *
 * Supported:
 *   - Block mappings (`key: value`, nested via indentation)
 *   - Block sequences (`- item`, including sequences of mappings, and
 *     the common `- key: value` / following keys aligned inline shape)
 *   - Flow mappings and sequences (`{a: 1, b: [2, 3]}`)
 *   - Plain, single-quoted ('it''s'), and double-quoted ("a\nb") scalars
 *   - The null/bool/int/float core schema for unquoted plain scalars
 *   - '#' comments (outside quotes)
 *   - A single leading `---` / trailing `...` document marker (ignored)
 *
 * Explicitly NOT supported (all throw UnsupportedConstructError):
 *   - Anchors & aliases (`&name`, `*name`) and merge keys (`<<`)
 *   - Tags (`!!str`, custom tags)
 *   - Block scalar styles (`|` literal, `>` folded)
 *   - Multiple documents in one file
 *   - Tab characters used for indentation (YAML forbids this anyway)
 *
 * Key order: preserved via normal object insertion order, EXCEPT that a
 * mapping key which is a string of decimal digits (e.g. "1", "42") is
 * reordered by the JavaScript engine ahead of non-numeric keys, per the
 * language's own object-key semantics. This is disclosed to the caller
 * as a lossiness item on any target that round-trips through this
 * parser with such keys present.
 */

import { MalformedInputError, UnsupportedConstructError } from '../errors';
import type { ResourceBudget } from '../types';
import { chargeStructuredBudget, isPlainObject, type StructuredValue } from './model';

interface Line {
  indent: number;
  text: string;
}

export function parseYaml(text: string, budget: ResourceBudget): StructuredValue {
  const lines = preprocessYaml(text);
  if (lines.length === 0) {
    return null;
  }

  // ---- flow-value parser (used for every scalar-or-collection value) ----
  function parseFlowText(s: string): StructuredValue {
    let i = 0;

    function skipWs(): void {
      while (i < s.length && /\s/.test(s[i])) i += 1;
    }

    function parseValue(topLevel: boolean): StructuredValue {
      skipWs();
      if (s[i] === '{') return parseFlowMap();
      if (s[i] === '[') return parseFlowSeq();
      if (s[i] === '"') return parseDoubleQuoted();
      if (s[i] === "'") return parseSingleQuoted();
      return parsePlainScalar(topLevel);
    }

    function parseFlowMap(): { [key: string]: StructuredValue } {
      i += 1; // '{'
      const exitDepth = budget.enterDepth();
      try {
        const obj: { [key: string]: StructuredValue } = {};
        skipWs();
        if (s[i] === '}') {
          i += 1;
          return obj;
        }
        for (;;) {
          skipWs();
          const key = parseFlowKey();
          skipWs();
          if (s[i] !== ':') {
            throw new MalformedInputError('Malformed YAML flow mapping: expected ":".');
          }
          i += 1;
          budget.countItem();
          obj[key] = parseValue(false);
          skipWs();
          if (s[i] === ',') {
            i += 1;
            continue;
          }
          if (s[i] === '}') {
            i += 1;
            break;
          }
          throw new MalformedInputError('Malformed YAML flow mapping: expected "," or "}".');
        }
        return obj;
      } finally {
        exitDepth();
      }
    }

    function parseFlowSeq(): StructuredValue[] {
      i += 1; // '['
      const exitDepth = budget.enterDepth();
      try {
        const arr: StructuredValue[] = [];
        skipWs();
        if (s[i] === ']') {
          i += 1;
          return arr;
        }
        for (;;) {
          skipWs();
          budget.countItem();
          arr.push(parseValue(false));
          skipWs();
          if (s[i] === ',') {
            i += 1;
            continue;
          }
          if (s[i] === ']') {
            i += 1;
            break;
          }
          throw new MalformedInputError('Malformed YAML flow sequence: expected "," or "]".');
        }
        return arr;
      } finally {
        exitDepth();
      }
    }

    function parseFlowKey(): string {
      if (s[i] === '"') return parseDoubleQuoted();
      if (s[i] === "'") return parseSingleQuoted();
      const value = parsePlainScalar(false);
      return typeof value === 'string' ? value : String(value ?? '');
    }

    function parseDoubleQuoted(): string {
      i += 1;
      let out = '';
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\') {
          i += 1;
          const esc = s[i];
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
            case '0':
              out += '\0';
              break;
            case 'u': {
              const hex = s.slice(i + 1, i + 5);
              out += String.fromCharCode(parseInt(hex, 16));
              i += 4;
              break;
            }
            default:
              out += esc ?? '';
          }
          i += 1;
        } else {
          out += s[i];
          i += 1;
        }
      }
      if (s[i] !== '"') {
        throw new MalformedInputError('Unterminated double-quoted YAML string.');
      }
      i += 1;
      return out;
    }

    function parseSingleQuoted(): string {
      i += 1;
      let out = '';
      let closed = false;
      while (i < s.length) {
        if (s[i] === "'") {
          if (s[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        out += s[i];
        i += 1;
      }
      if (!closed) {
        throw new MalformedInputError('Unterminated single-quoted YAML string.');
      }
      return out;
    }

    function parsePlainScalar(topLevel: boolean): StructuredValue {
      const start = i;
      if (!topLevel) {
        while (i < s.length && s[i] !== ',' && s[i] !== ']' && s[i] !== '}') i += 1;
      } else {
        i = s.length;
      }
      const raw = s.slice(start, i).trim();
      return interpretPlainScalar(raw);
    }

    const value = parseValue(true);
    skipWs();
    if (i !== s.length) {
      throw new UnsupportedConstructError(`Unexpected trailing content in YAML value: "${s.slice(i)}"`);
    }
    return value;
  }

  function interpretPlainScalar(raw: string): StructuredValue {
    if (raw === '') return null;
    if (raw[0] === '&' || raw[0] === '*') {
      throw new UnsupportedConstructError('YAML anchors and aliases (&name / *name) are not supported.');
    }
    if (raw[0] === '!') {
      throw new UnsupportedConstructError('YAML tags (e.g. "!!str") are not supported.');
    }
    if (raw === '|' || raw === '>' || raw.startsWith('| ') || raw.startsWith('> ') || raw === '|-' || raw === '>-') {
      throw new UnsupportedConstructError('YAML block scalar styles ("|" and ">") are not supported.');
    }
    if (raw === 'null' || raw === 'Null' || raw === 'NULL' || raw === '~') return null;
    if (raw === 'true' || raw === 'True' || raw === 'TRUE') return true;
    if (raw === 'false' || raw === 'False' || raw === 'FALSE') return false;
    if (/^[+-]?\d+$/.test(raw)) {
      const n = Number(raw);
      if (Number.isSafeInteger(n)) return n;
    }
    if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(raw) && /[.eE]/.test(raw)) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return raw;
  }

  // ---- block-level structure ----

  /** Bounds-checked line lookup. `noUncheckedIndexedAccess` means plain
   * `lines[idx]` is typed `Line | undefined`; every call site here has
   * already checked `idx < lines.length` via its loop/if condition, so
   * this is a real invariant, not a defensive guess — but we still throw
   * a clear error instead of a non-null assertion, in case that
   * invariant is ever violated by a future edit. */
  function lineAt(idx: number): Line {
    const line = lines[idx];
    if (line === undefined) {
      throw new MalformedInputError(`Internal error: expected a YAML line at index ${idx}.`);
    }
    return line;
  }

  function isSeqDashText(text: string): boolean {
    return text === '-' || text.startsWith('- ');
  }

  function splitMappingKey(text: string): { key: string; restText: string } | null {
    if (text.startsWith('{') || text.startsWith('[')) return null;
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (c === "'" && !inDouble) inSingle = !inSingle;
      else if (c === '"' && !inSingle) inDouble = !inDouble;
      else if (c === ':' && !inSingle && !inDouble) {
        const next = text[i + 1];
        if (next === undefined || next === ' ') {
          const keyRaw = text.slice(0, i).trim();
          const key = unquoteKeyIfQuoted(keyRaw);
          const restText = text.slice(i + 1).trim();
          return { key, restText };
        }
      }
    }
    return null;
  }

  function unquoteKeyIfQuoted(raw: string): string {
    if (raw.length >= 2 && raw[0] === '"' && raw[raw.length - 1] === '"') {
      return String(parseFlowText(raw));
    }
    if (raw.length >= 2 && raw[0] === "'" && raw[raw.length - 1] === "'") {
      return String(parseFlowText(raw));
    }
    return raw;
  }

  function stripDash(text: string): { contentText: string; contentColumn: number; dashIndent: number } {
    // Caller passes the FULL line text; contentColumn is relative to that
    // line's own indent, added to it by the caller where needed.
    const afterDash = text.slice(1);
    const spacesMatch = afterDash.match(/^ */);
    const spaces = spacesMatch !== null ? (spacesMatch[0] ?? '').length : 0;
    const contentText = afterDash.slice(spaces);
    return { contentText, contentColumn: 1 + spaces, dashIndent: 0 };
  }

  /** Parses one block node (mapping, sequence, or scalar) that starts at
   * lines[startIdx], continuing to consume sibling lines at exactly
   * `indent` until a line with lesser indent or end of input. */
  function parseBlockNode(startIdx: number, indent: number): { value: StructuredValue; nextIdx: number } {
    budget.check();
    const first = lineAt(startIdx);
    if (isSeqDashText(first.text)) {
      return parseSequence(startIdx, indent);
    }
    const split = splitMappingKey(first.text);
    if (split !== null) {
      return parseMapping(startIdx, indent);
    }
    return { value: parseFlowText(first.text), nextIdx: startIdx + 1 };
  }

  function parseSequence(startIdx: number, indent: number): { value: StructuredValue[]; nextIdx: number } {
    const exitDepth = budget.enterDepth();
    try {
      const items: StructuredValue[] = [];
      let idx = startIdx;
      while (idx < lines.length && lineAt(idx).indent === indent && isSeqDashText(lineAt(idx).text)) {
        budget.countItem();
        const line = lineAt(idx);
        const { contentText, contentColumn } = stripDash(line.text);
        const absoluteColumn = indent + contentColumn;
        if (contentText === '') {
          if (idx + 1 < lines.length && lineAt(idx + 1).indent > indent) {
            const child = parseBlockNode(idx + 1, lineAt(idx + 1).indent);
            items.push(child.value);
            idx = child.nextIdx;
          } else {
            items.push(null);
            idx += 1;
          }
          continue;
        }
        const inlineSplit = splitMappingKey(contentText);
        if (inlineSplit !== null) {
          const child = parseMappingInline(idx, absoluteColumn, inlineSplit.key, inlineSplit.restText);
          items.push(child.value);
          idx = child.nextIdx;
          continue;
        }
        if (isSeqDashText(contentText)) {
          throw new UnsupportedConstructError(
            'A sequence item immediately containing another sequence item on the same line (e.g. "- - x") is not supported; put the nested sequence on its own indented line.'
          );
        }
        items.push(parseFlowText(contentText));
        idx += 1;
      }
      return { value: items, nextIdx: idx };
    } finally {
      exitDepth();
    }
  }

  function parseMapping(startIdx: number, indent: number): { value: { [key: string]: StructuredValue }; nextIdx: number } {
    const split = splitMappingKey(lineAt(startIdx).text);
    if (split === null) {
      throw new MalformedInputError(`Expected a YAML mapping key at line with indent ${indent}.`);
    }
    return parseMappingInline(startIdx, indent, split.key, split.restText);
  }

  /** Parses a mapping whose FIRST key/value pair is already known (either
   * because it came from the real line at `startIdx`, or because it was
   * inline after a sequence dash on that same line). Subsequent keys must
   * appear on following lines at exactly `column` indent. */
  function parseMappingInline(
    startIdx: number,
    column: number,
    firstKey: string,
    firstRestText: string
  ): { value: { [key: string]: StructuredValue }; nextIdx: number } {
    const exitDepth = budget.enterDepth();
    try {
      const obj: { [key: string]: StructuredValue } = {};
      budget.countItem();
      const firstValueResult = parseMappingValue(startIdx, column, firstRestText);
      obj[firstKey] = firstValueResult.value;
      let idx = firstValueResult.nextIdx;
      while (idx < lines.length && lineAt(idx).indent === column) {
        const split = splitMappingKey(lineAt(idx).text);
        if (split === null) break;
        budget.countItem();
        const result = parseMappingValue(idx, column, split.restText);
        obj[split.key] = result.value;
        idx = result.nextIdx;
      }
      return { value: obj, nextIdx: idx };
    } finally {
      exitDepth();
    }
  }

  function parseMappingValue(curIdx: number, column: number, restText: string): { value: StructuredValue; nextIdx: number } {
    if (restText === '') {
      if (curIdx + 1 < lines.length && lineAt(curIdx + 1).indent > column) {
        return parseBlockNode(curIdx + 1, lineAt(curIdx + 1).indent);
      }
      return { value: null, nextIdx: curIdx + 1 };
    }
    return { value: parseFlowText(restText), nextIdx: curIdx + 1 };
  }

  const { value, nextIdx } = parseBlockNode(0, lineAt(0).indent);
  if (nextIdx !== lines.length) {
    throw new UnsupportedConstructError(
      'Unexpected content after the first YAML document; multiple documents in one file are not supported.'
    );
  }
  return value;
}

function stripYamlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).replace(/\s+$/, '');
    }
  }
  return line.replace(/\s+$/, '');
}

function preprocessYaml(raw: string): Line[] {
  const rawLines = raw.split(/\r\n|\n|\r/);
  const lines: Line[] = [];
  for (const rl of rawLines) {
    const stripped = stripYamlComment(rl);
    const trimmed = stripped.trim();
    if (trimmed === '' || trimmed === '---' || trimmed === '...') continue;
    const indent = stripped.length - stripped.trimStart().length;
    const indentPrefix = stripped.slice(0, indent);
    if (indentPrefix.includes('\t')) {
      throw new UnsupportedConstructError('YAML indentation must use spaces, not tabs.');
    }
    lines.push({ indent, text: trimmed });
  }
  return lines;
}

// ---- serialization -------------------------------------------------------

export function serializeYaml(value: StructuredValue, budget: ResourceBudget): string {
  chargeStructuredBudget(value, budget);
  const out: string[] = [];
  writeYamlNode(value, 0, out);
  return `${out.join('\n')}\n`;
}

function writeYamlNode(value: StructuredValue, indent: number, out: string[]): void {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push(`${pad}[]`);
      return;
    }
    for (const item of value) {
      if (Array.isArray(item) || isPlainObject(item)) {
        const isEmpty = (Array.isArray(item) && item.length === 0) || (isPlainObject(item) && Object.keys(item).length === 0);
        if (isEmpty) {
          out.push(`${pad}- ${Array.isArray(item) ? '[]' : '{}'}`);
        } else {
          out.push(`${pad}-`);
          writeYamlNode(item, indent + 1, out);
        }
      } else {
        out.push(`${pad}- ${scalarToYaml(item)}`);
      }
    }
    return;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      out.push(`${pad}{}`);
      return;
    }
    for (const [key, v] of entries) {
      const keyStr = scalarToYaml(key);
      if (Array.isArray(v) || isPlainObject(v)) {
        const isEmpty = (Array.isArray(v) && v.length === 0) || (isPlainObject(v) && Object.keys(v).length === 0);
        if (isEmpty) {
          out.push(`${pad}${keyStr}: ${Array.isArray(v) ? '[]' : '{}'}`);
        } else {
          out.push(`${pad}${keyStr}:`);
          writeYamlNode(v, indent + 1, out);
        }
      } else {
        out.push(`${pad}${keyStr}: ${scalarToYaml(v)}`);
      }
    }
    return;
  }
  out.push(`${pad}${scalarToYaml(value)}`);
}

const RESERVED_PLAIN_SCALARS = new Set(['null', 'true', 'false', '~', '']);

function looksLikeNumber(s: string): boolean {
  return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s);
}

function scalarToYaml(v: StructuredValue): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new UnsupportedConstructError('YAML cannot represent NaN or Infinity.');
    }
    return String(v);
  }
  return quoteYamlString(v);
}

function quoteYamlString(s: string): string {
  if (s === '') return "''";
  const needsQuote =
    RESERVED_PLAIN_SCALARS.has(s) ||
    looksLikeNumber(s) ||
    /[\r\n]/.test(s) ||
    /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
    /\s$/.test(s) ||
    /: (|$)/.test(s) ||
    / #/.test(s) ||
    s === '---' ||
    s === '...';
  if (!needsQuote) return s;
  if (/[\r\n\t]/.test(s)) {
    // Use double-quoted form so control characters can be escaped.
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
  return `'${s.replace(/'/g, "''")}'`;
}
