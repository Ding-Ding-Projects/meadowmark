/**
 * A hand-written XML parser and serializer implementing a documented
 * SUBSET of the format, mapped to/from the generic StructuredValue tree
 * used by every structured-data adapter.
 *
 * XML <-> JSON-shaped tree convention (this converter's own, since no
 * single standard exists):
 *   - The document becomes a single-key object: { "<rootTag>": ... }.
 *   - An element with attributes and/or text becomes an object whose
 *     attribute keys are prefixed with "@" (e.g. `id="5"` -> "@id": "5")
 *     and whose text content (when the element has no child elements)
 *     is under the key "#text".
 *   - An element with no attributes and only text content collapses to
 *     a plain string.
 *   - Repeated child tags under the same parent become a JSON array.
 *
 * Supported: elements, attributes, nested elements, self-closing tags,
 * the five predefined entities (&amp; &lt; &gt; &quot; &apos;) and
 * numeric character references (&#NNN; &#xHHHH;), comments (ignored),
 * CDATA sections (treated as literal text), and the XML declaration
 * (ignored on read, always emitted as UTF-8 on write).
 *
 * Explicitly NOT supported (all throw UnsupportedConstructError):
 *   - DOCTYPE declarations of any kind. This is a deliberate security
 *     boundary, not just a scope cut: a DTD internal subset can define
 *     custom entities, and an XML parser that expands those (directly or
 *     via nested entity definitions — the "billion laughs" attack) can
 *     be made to consume unbounded memory from a tiny input file. By
 *     refusing DOCTYPE outright we never process ENTITY declarations at
 *     all, so there is nothing for such an attack to exploit here.
 *   - Custom/undeclared named entities (since there is no DTD to resolve
 *     them against)
 *   - Genuine mixed content — an element containing BOTH non-whitespace
 *     text AND child elements — because the object model above has no
 *     way to preserve their relative order
 *   - XML namespace resolution (a "ns:tag" name is kept as a literal
 *     string tag name, not resolved against its namespace URI)
 */

import { MalformedInputError, UnsupportedConstructError } from '../errors';
import type { ResourceBudget } from '../types';
import { chargeStructuredBudget, isPlainObject, type StructuredValue } from './model';

interface XmlElementNode {
  kind: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
interface XmlTextNode {
  kind: 'text';
  text: string;
}
type XmlNode = XmlElementNode | XmlTextNode;

const NAME_CHARS = /[^\s/>]/;

export function parseXml(text: string, budget: ResourceBudget): StructuredValue {
  let i = 0;

  function skipWsAndMisc(): void {
    for (;;) {
      while (i < text.length && /\s/.test(text.charAt(i))) i += 1;
      if (text.startsWith('<!--', i)) {
        const end = text.indexOf('-->', i);
        if (end === -1) throw new MalformedInputError('Unterminated XML comment.');
        i = end + 3;
        continue;
      }
      if (text.startsWith('<?', i)) {
        const end = text.indexOf('?>', i);
        if (end === -1) throw new MalformedInputError('Unterminated XML processing instruction.');
        i = end + 2;
        continue;
      }
      if (text.startsWith('<!DOCTYPE', i) || text.startsWith('<!doctype', i)) {
        throw new UnsupportedConstructError(
          'XML DOCTYPE declarations are not supported (this also closes off DTD-based entity-expansion attacks).'
        );
      }
      break;
    }
  }

  function parseElement(): XmlElementNode {
    budget.check();
    if (text[i] !== '<') {
      throw new MalformedInputError(`Expected "<" at position ${i}.`);
    }
    i += 1;
    const tagStart = i;
    while (i < text.length && NAME_CHARS.test(text.charAt(i))) i += 1;
    const tag = text.slice(tagStart, i);
    if (tag === '') throw new MalformedInputError('Empty XML element name.');

    const attrs: Record<string, string> = {};
    for (;;) {
      while (i < text.length && /\s/.test(text.charAt(i))) i += 1;
      if (text.startsWith('/>', i)) {
        i += 2;
        return { kind: 'element', tag, attrs, children: [] };
      }
      if (text[i] === '>') {
        i += 1;
        break;
      }
      const nameStart = i;
      while (i < text.length && text.charAt(i) !== '=' && !/\s/.test(text.charAt(i)) && text.charAt(i) !== '>' && text.charAt(i) !== '/') i += 1;
      const attrName = text.slice(nameStart, i);
      if (attrName === '') throw new MalformedInputError(`Malformed attribute near position ${i} in <${tag}>.`);
      while (i < text.length && /\s/.test(text.charAt(i))) i += 1;
      if (text[i] !== '=') throw new MalformedInputError(`Expected "=" after attribute "${attrName}" in <${tag}>.`);
      i += 1;
      while (i < text.length && /\s/.test(text.charAt(i))) i += 1;
      const quote = text[i];
      if (quote !== '"' && quote !== "'") {
        throw new MalformedInputError(`Attribute value for "${attrName}" in <${tag}> must be quoted.`);
      }
      i += 1;
      const valueStart = i;
      const end = text.indexOf(quote, i);
      if (end === -1) throw new MalformedInputError(`Unterminated attribute value for "${attrName}" in <${tag}>.`);
      const rawValue = text.slice(valueStart, end);
      i = end + 1;
      budget.countItem();
      attrs[attrName] = unescapeXmlEntities(rawValue);
    }

    const children: XmlNode[] = [];
    const exitDepth = budget.enterDepth();
    try {
      for (;;) {
        if (text.startsWith('</', i)) {
          i += 2;
          const closeStart = i;
          while (i < text.length && NAME_CHARS.test(text.charAt(i))) i += 1;
          const closeTag = text.slice(closeStart, i);
          while (i < text.length && /\s/.test(text.charAt(i))) i += 1;
          if (text[i] !== '>') throw new MalformedInputError(`Malformed closing tag for <${tag}>.`);
          i += 1;
          if (closeTag !== tag) {
            throw new MalformedInputError(`Mismatched XML tags: <${tag}> closed by </${closeTag}>.`);
          }
          break;
        }
        if (text.startsWith('<!--', i)) {
          const end = text.indexOf('-->', i);
          if (end === -1) throw new MalformedInputError('Unterminated XML comment.');
          i = end + 3;
          continue;
        }
        if (text.startsWith('<![CDATA[', i)) {
          const end = text.indexOf(']]>', i);
          if (end === -1) throw new MalformedInputError('Unterminated CDATA section.');
          budget.countItem();
          children.push({ kind: 'text', text: text.slice(i + 9, end) });
          i = end + 3;
          continue;
        }
        if (text.startsWith('<?', i)) {
          const end = text.indexOf('?>', i);
          if (end === -1) throw new MalformedInputError('Unterminated XML processing instruction.');
          i = end + 2;
          continue;
        }
        if (text[i] === '<') {
          budget.countItem();
          children.push(parseElement());
          continue;
        }
        if (i >= text.length) {
          throw new MalformedInputError(`Unterminated XML element <${tag}>: reached end of input before its closing tag.`);
        }
        const textStart = i;
        while (i < text.length && text[i] !== '<') i += 1;
        budget.countItem();
        children.push({ kind: 'text', text: unescapeXmlEntities(text.slice(textStart, i)) });
      }
      return { kind: 'element', tag, attrs, children };
    } finally {
      exitDepth();
    }
  }

  skipWsAndMisc();
  const root = parseElement();
  return { [root.tag]: elementToStructured(root, budget) };
}

function elementToStructured(el: XmlElementNode, budget: ResourceBudget): StructuredValue {
  budget.check();
  const childElements = el.children.filter((c): c is XmlElementNode => c.kind === 'element');
  const textNodes = el.children.filter((c): c is XmlTextNode => c.kind === 'text');
  const joinedText = textNodes.map((t) => t.text).join('');
  const nonWhitespaceText = joinedText.trim();
  const hasAttrs = Object.keys(el.attrs).length > 0;

  if (childElements.length > 0 && nonWhitespaceText !== '') {
    throw new UnsupportedConstructError(
      `XML element <${el.tag}> mixes text with child elements ("mixed content"), which this converter's structured model cannot represent.`
    );
  }

  if (childElements.length === 0) {
    if (!hasAttrs) {
      return joinedText;
    }
    const obj: Record<string, StructuredValue> = {};
    for (const [k, v] of Object.entries(el.attrs)) {
      budget.countItem();
      obj[`@${k}`] = v;
    }
    if (joinedText !== '') obj['#text'] = joinedText;
    return obj;
  }

  const obj: Record<string, StructuredValue> = {};
  const exitDepth = budget.enterDepth();
  try {
    for (const [k, v] of Object.entries(el.attrs)) {
      budget.countItem();
      obj[`@${k}`] = v;
    }
    for (const child of childElements) {
      budget.countItem();
      const childValue = elementToStructured(child, budget);
      const existing = obj[child.tag];
      if (existing === undefined) {
        obj[child.tag] = childValue;
      } else if (Array.isArray(existing)) {
        (existing as StructuredValue[]).push(childValue);
      } else {
        obj[child.tag] = [existing, childValue];
      }
    }
  } finally {
    exitDepth();
  }
  return obj;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unescapeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9A-Fa-f]+|#\d+|[A-Za-z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const codePoint = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        throw new MalformedInputError(`Invalid XML numeric character reference: "${match}".`);
      }
      return String.fromCodePoint(codePoint);
    }
    const resolved = NAMED_ENTITIES[body];
    if (resolved === undefined) {
      throw new UnsupportedConstructError(
        `XML entity "${match}" is not one of the five predefined entities; custom entities require a DTD, which is not supported.`
      );
    }
    return resolved;
  });
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const XML_NAME_PATTERN = /^[A-Za-z_][\w.\-:]*$/;

export function serializeXml(value: StructuredValue, budget: ResourceBudget): string {
  chargeStructuredBudget(value, budget);
  let rootTag: string;
  let rootValue: StructuredValue;
  const rootEntries = isPlainObject(value) ? Object.entries(value) : [];
  if (rootEntries.length === 1) {
    const [onlyKey, onlyValue] = rootEntries[0] as [string, StructuredValue];
    rootTag = onlyKey;
    rootValue = onlyValue;
  } else {
    rootTag = 'root';
    rootValue = value;
  }
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  writeXmlElement(rootTag, rootValue, 0, out);
  return `${out.join('\n')}\n`;
}

function writeXmlElement(tag: string, value: StructuredValue, indent: number, out: string[]): void {
  if (!XML_NAME_PATTERN.test(tag)) {
    throw new UnsupportedConstructError(`"${tag}" is not a valid XML element name.`);
  }
  const pad = '  '.repeat(indent);

  if (isPlainObject(value)) {
    const attrs: Array<[string, string]> = [];
    const children: Array<[string, StructuredValue]> = [];
    let text: string | undefined;
    for (const [key, entryValue] of Object.entries(value)) {
      if (key.startsWith('@')) {
        attrs.push([key.slice(1), scalarToXmlText(entryValue, key)]);
      } else if (key === '#text') {
        text = scalarToXmlText(entryValue, key);
      } else {
        children.push([key, entryValue]);
      }
    }
    const attrStr = attrs.map(([k, v]) => ` ${k}="${escapeXmlAttr(v)}"`).join('');
    if (children.length === 0 && text === undefined) {
      out.push(`${pad}<${tag}${attrStr} />`);
      return;
    }
    if (children.length === 0) {
      out.push(`${pad}<${tag}${attrStr}>${escapeXmlText(text ?? '')}</${tag}>`);
      return;
    }
    out.push(`${pad}<${tag}${attrStr}>`);
    for (const [childKey, childValue] of children) {
      if (Array.isArray(childValue)) {
        for (const item of childValue) writeXmlElement(childKey, item, indent + 1, out);
      } else {
        writeXmlElement(childKey, childValue, indent + 1, out);
      }
    }
    out.push(`${pad}</${tag}>`);
    return;
  }

  if (Array.isArray(value)) {
    throw new UnsupportedConstructError(
      `Cannot represent a bare array as the content of <${tag}> directly; it must be a value under an object key.`
    );
  }

  const text = scalarToXmlText(value, tag);
  if (text === '') {
    out.push(`${pad}<${tag} />`);
  } else {
    out.push(`${pad}<${tag}>${escapeXmlText(text)}</${tag}>`);
  }
}

function scalarToXmlText(v: StructuredValue, context: string): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new UnsupportedConstructError('XML text content cannot represent NaN or Infinity.');
    }
    return String(v);
  }
  throw new UnsupportedConstructError(`"${context}" cannot be used as XML text/attribute content; it is a nested object or array.`);
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXmlAttr(s: string): string {
  return escapeXmlText(s).replace(/"/g, '&quot;');
}
