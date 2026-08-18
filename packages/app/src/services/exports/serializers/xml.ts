/**
 * Hand-written XML emitter. Objects become elements whose children are named
 * by key; arrays become repeated elements sharing the parent key's name
 * wrapped in a plural container; primitives become text content with a
 * `type` attribute so re-import can restore the original JS type. Keys that
 * are not valid XML names are sanitized, and the substitution is recorded as
 * a loss entry (the original key is preserved as an `original-name`
 * attribute, so no information is actually lost - the entry documents a
 * cosmetic rename rather than a dropped field).
 */
import type { ExportSource, JsonValue, LossReportEntry } from '../types.js';
import { escapeXmlAttr, escapeXmlText, isJsonArray, isPlainObject, sanitizeXmlName } from '../util.js';

export interface XmlSerializationResult {
  contents: string;
  lossEntries: LossReportEntry[];
}

function typeAttr(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  return typeof value;
}

function emitElement(
  tagName: string,
  value: JsonValue | undefined,
  indent: number,
  lossEntries: LossReportEntry[],
): string {
  const pad = '  '.repeat(indent);
  const { safe, changed } = sanitizeXmlName(tagName);
  if (changed) {
    lossEntries.push({
      field: tagName,
      kind: 'key-name-sanitized',
      detail: `Field name "${tagName}" is not a valid XML element name; it was written as "${safe}" with the original name preserved in an "original-name" attribute.`,
    });
  }
  const originalNameAttr = changed ? ` original-name="${escapeXmlAttr(tagName)}"` : '';

  if (value === undefined || value === null) {
    return `${pad}<${safe}${originalNameAttr} type="null"/>`;
  }
  if (isJsonArray(value)) {
    if (value.length === 0) return `${pad}<${safe}${originalNameAttr} type="array"/>`;
    const items = value
      .map((item) => emitElement('item', item, indent + 1, lossEntries))
      .join('\n');
    return `${pad}<${safe}${originalNameAttr} type="array">\n${items}\n${pad}</${safe}>`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return `${pad}<${safe}${originalNameAttr} type="object"/>`;
    const children = entries.map(([k, v]) => emitElement(k, v, indent + 1, lossEntries)).join('\n');
    return `${pad}<${safe}${originalNameAttr} type="object">\n${children}\n${pad}</${safe}>`;
  }
  const text = typeof value === 'string' ? value : String(value);
  return `${pad}<${safe}${originalNameAttr} type="${typeAttr(value)}">${escapeXmlText(text)}</${safe}>`;
}

export function serializeXml(source: ExportSource): XmlSerializationResult {
  const lossEntries: LossReportEntry[] = [];
  const { safe: rootName } = sanitizeXmlName(source.name || 'export');
  const bodyParts: string[] = [];
  if (source.value !== undefined) {
    bodyParts.push(emitElement('value', source.value, 1, lossEntries));
  }
  if (source.rows !== undefined) {
    bodyParts.push(emitElement('rows', source.rows as unknown as JsonValue, 1, lossEntries));
  }
  const body = bodyParts.join('\n');
  const contents =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<${rootName} schemaVersion="${escapeXmlAttr(source.schemaVersion)}">\n${body}\n</${rootName}>\n`;
  return { contents, lossEntries };
}
