/**
 * A strict, bounded, hand-rolled JSON parser.
 *
 * `JSON.parse` is not enough for this feature by itself, for one specific
 * reason: on a duplicate object key, `JSON.parse` silently keeps the LAST
 * value and discards the rest before a reviver ever sees the object, so
 * there is no way to detect "this file had a duplicate key" from its
 * output. The personal-vocabulary loader must reject a file with a
 * duplicate key outright rather than silently pick one of the two
 * conflicting values, so this module parses the JSON itself, tracking
 * object keys as it goes and throwing the moment a repeat appears.
 *
 * It also enforces a maximum nesting depth WHILE parsing (so a
 * pathologically deep payload is rejected before it can exhaust the call
 * stack, rather than after), and never uses `eval` or any dynamic code
 * execution — every value is built by hand from the token stream.
 *
 * Scope is intentionally narrow: this parser exists to validate the one
 * schema this module cares about (see vocabulary-types.ts), not to be a
 * general-purpose JSON library. It supports the full JSON grammar
 * (objects, arrays, strings, numbers, booleans, null) so a well-formed
 * file of unexpected shape is rejected by the SCHEMA validator with a
 * precise reason, rather than by this parser failing to read it at all.
 */

export type StrictJsonRejectionKind = 'invalid-json' | 'nesting-too-deep' | 'duplicate-key';

export class StrictJsonError extends Error {
  readonly kind: StrictJsonRejectionKind;

  constructor(kind: StrictJsonRejectionKind, message: string) {
    super(message);
    this.name = 'StrictJsonError';
    this.kind = kind;
  }
}

export interface StrictJsonLimits {
  /** Maximum nesting depth of objects/arrays. The outermost object is
   * depth 1. */
  maxDepth: number;
}

/** Parses `text` as JSON under the bounds above. Throws StrictJsonError
 * (never JSON.parse's SyntaxError) on any problem, including ordinary
 * malformed JSON, so callers only need to catch one error type. */
export function parseStrictJson(text: string, limits: StrictJsonLimits): unknown {
  const parser = new Parser(text, limits);
  const value = parser.parseValue(1);
  parser.skipWhitespace();
  if (!parser.atEnd()) {
    throw new StrictJsonError('invalid-json', 'Unexpected trailing content after JSON value.');
  }
  return value;
}

class Parser {
  private index = 0;

  constructor(
    private readonly text: string,
    private readonly limits: StrictJsonLimits,
  ) {}

  atEnd(): boolean {
    return this.index >= this.text.length;
  }

  skipWhitespace(): void {
    while (this.index < this.text.length) {
      const ch = this.text[this.index];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.index += 1;
      } else {
        break;
      }
    }
  }

  private peek(): string {
    if (this.index >= this.text.length) {
      throw new StrictJsonError('invalid-json', 'Unexpected end of JSON input.');
    }
    return this.text[this.index] as string;
  }

  private expect(ch: string): void {
    if (this.peek() !== ch) {
      throw new StrictJsonError('invalid-json', `Expected "${ch}" at position ${this.index}.`);
    }
    this.index += 1;
  }

  parseValue(depth: number): unknown {
    if (depth > this.limits.maxDepth) {
      throw new StrictJsonError(
        'nesting-too-deep',
        `JSON nesting exceeds the maximum allowed depth of ${this.limits.maxDepth}.`,
      );
    }

    this.skipWhitespace();
    const ch = this.peek();

    if (ch === '{') {
      return this.parseObject(depth);
    }
    if (ch === '[') {
      return this.parseArray(depth);
    }
    if (ch === '"') {
      return this.parseString();
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      return this.parseNumber();
    }
    if (this.text.startsWith('true', this.index)) {
      this.index += 4;
      return true;
    }
    if (this.text.startsWith('false', this.index)) {
      this.index += 5;
      return false;
    }
    if (this.text.startsWith('null', this.index)) {
      this.index += 4;
      return null;
    }

    throw new StrictJsonError('invalid-json', `Unexpected character at position ${this.index}.`);
  }

  private parseObject(depth: number): Record<string, unknown> {
    this.expect('{');
    // A plain object literal is safe here: every key is checked against
    // UNSAFE_KEYS by the schema validator immediately after parsing, and
    // this parser rejects a REPEATED key outright rather than letting a
    // later assignment overwrite an earlier one.
    const result: Record<string, unknown> = {};
    const seenKeys = new Set<string>();

    this.skipWhitespace();
    if (this.peek() === '}') {
      this.index += 1;
      return result;
    }

    for (;;) {
      this.skipWhitespace();
      if (this.peek() !== '"') {
        throw new StrictJsonError('invalid-json', `Expected an object key at position ${this.index}.`);
      }
      const key = this.parseString();

      if (seenKeys.has(key)) {
        // Deliberately does not include the key's text in the error: this
        // parser is used to validate user-supplied vocabulary content, and
        // that content must never be echoed into an error message that a
        // caller might log, export, or otherwise persist outside the
        // validated cache.
        throw new StrictJsonError('duplicate-key', `Duplicate object key at position ${this.index}.`);
      }
      seenKeys.add(key);

      this.skipWhitespace();
      this.expect(':');
      const value = this.parseValue(depth + 1);
      result[key] = value;

      this.skipWhitespace();
      const next = this.peek();
      if (next === ',') {
        this.index += 1;
        continue;
      }
      if (next === '}') {
        this.index += 1;
        break;
      }
      throw new StrictJsonError('invalid-json', `Expected "," or "}" at position ${this.index}.`);
    }

    return result;
  }

  private parseArray(depth: number): unknown[] {
    this.expect('[');
    const result: unknown[] = [];

    this.skipWhitespace();
    if (this.peek() === ']') {
      this.index += 1;
      return result;
    }

    for (;;) {
      const value = this.parseValue(depth + 1);
      result.push(value);

      this.skipWhitespace();
      const next = this.peek();
      if (next === ',') {
        this.index += 1;
        continue;
      }
      if (next === ']') {
        this.index += 1;
        break;
      }
      throw new StrictJsonError('invalid-json', `Expected "," or "]" at position ${this.index}.`);
    }

    return result;
  }

  private parseString(): string {
    this.expect('"');
    let out = '';

    for (;;) {
      if (this.index >= this.text.length) {
        throw new StrictJsonError('invalid-json', 'Unterminated string.');
      }
      const ch = this.text[this.index] as string;

      if (ch === '"') {
        this.index += 1;
        return out;
      }

      if (ch === '\\') {
        this.index += 1;
        if (this.index >= this.text.length) {
          throw new StrictJsonError('invalid-json', 'Unterminated escape sequence.');
        }
        const escape = this.text[this.index] as string;
        switch (escape) {
          case '"':
            out += '"';
            break;
          case '\\':
            out += '\\';
            break;
          case '/':
            out += '/';
            break;
          case 'b':
            out += '\b';
            break;
          case 'f':
            out += '\f';
            break;
          case 'n':
            out += '\n';
            break;
          case 'r':
            out += '\r';
            break;
          case 't':
            out += '\t';
            break;
          case 'u': {
            const hex = this.text.slice(this.index + 1, this.index + 5);
            if (hex.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
              throw new StrictJsonError('invalid-json', 'Invalid \\u escape sequence.');
            }
            out += String.fromCharCode(parseInt(hex, 16));
            this.index += 4;
            break;
          }
          default:
            throw new StrictJsonError('invalid-json', `Invalid escape character "\\${escape}".`);
        }
        this.index += 1;
        continue;
      }

      // Bare control characters are not valid inside a JSON string.
      if (ch.charCodeAt(0) < 0x20) {
        throw new StrictJsonError('invalid-json', 'Unescaped control character in string.');
      }

      out += ch;
      this.index += 1;
    }
  }

  private parseNumber(): number {
    const start = this.index;
    if (this.text[this.index] === '-') {
      this.index += 1;
    }
    if (!this.isDigit(this.text[this.index])) {
      throw new StrictJsonError('invalid-json', `Invalid number at position ${start}.`);
    }
    if (this.text[this.index] === '0') {
      this.index += 1;
    } else {
      while (this.isDigit(this.text[this.index])) {
        this.index += 1;
      }
    }
    if (this.text[this.index] === '.') {
      this.index += 1;
      if (!this.isDigit(this.text[this.index])) {
        throw new StrictJsonError('invalid-json', `Invalid number at position ${start}.`);
      }
      while (this.isDigit(this.text[this.index])) {
        this.index += 1;
      }
    }
    if (this.text[this.index] === 'e' || this.text[this.index] === 'E') {
      this.index += 1;
      const sign = this.text[this.index];
      if (sign === '+' || sign === '-') {
        this.index += 1;
      }
      if (!this.isDigit(this.text[this.index])) {
        throw new StrictJsonError('invalid-json', `Invalid number at position ${start}.`);
      }
      while (this.isDigit(this.text[this.index])) {
        this.index += 1;
      }
    }

    const raw = this.text.slice(start, this.index);
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new StrictJsonError('invalid-json', `Number out of range at position ${start}.`);
    }
    return value;
  }

  private isDigit(ch: string | undefined): boolean {
    return ch !== undefined && ch >= '0' && ch <= '9';
  }
}
