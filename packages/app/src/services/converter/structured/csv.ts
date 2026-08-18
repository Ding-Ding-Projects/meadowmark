/**
 * CSV/TSV parsing and serialization (RFC 4180-style quoting, with a
 * configurable delimiter so the same implementation serves both CSV and
 * TSV). Converted to/from the generic StructuredValue tree as an array
 * of flat records: the first row is the header (field names), every
 * following row becomes an object keyed by that header.
 *
 * Every cell value round-trips as a STRING. This converter never guesses
 * that a cell "looks like" a number or boolean — that guess is exactly
 * the kind of silent, ambiguous behavior this project's conversions are
 * required to avoid. A caller who wants typed values converts CSV to
 * JSON and then separately decides how to interpret each field; this
 * adapter's lossiness disclosure says as much for JSON/YAML/TOML/XML ->
 * CSV, where the reverse is true (numbers/booleans become their string
 * form and cannot be told apart from a same-looking string after import).
 */

import type { ResourceBudget } from '../types';
import { requireFlatRecordArray, type StructuredValue } from './model';

export function parseDelimited(text: string, delimiter: string, budget: ResourceBudget): StructuredValue {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAnyContentInLine = false;
  const n = text.length;
  let i = 0;

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"' && field === '') {
      inQuotes = true;
      sawAnyContentInLine = true;
      i += 1;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = '';
      sawAnyContentInLine = true;
      budget.countItem();
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += 1;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      sawAnyContentInLine = false;
      budget.countItem();
      budget.check();
      i += 1;
      continue;
    }
    field += c;
    sawAnyContentInLine = true;
    i += 1;
  }
  if (sawAnyContentInLine || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }
  const header = rows[0] as string[];
  const records: Array<{ [key: string]: StructuredValue }> = [];
  for (let r = 1; r < rows.length; r += 1) {
    budget.countItem();
    const record: { [key: string]: StructuredValue } = {};
    const dataRow = rows[r] as string[];
    for (let c = 0; c < header.length; c += 1) {
      const columnName = header[c] as string;
      record[columnName] = dataRow[c] ?? '';
    }
    records.push(record);
  }
  return records;
}

export function serializeDelimited(value: StructuredValue, delimiter: string, budget: ResourceBudget): string {
  const records = requireFlatRecordArray(value);
  const header: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    budget.countItem();
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key);
        header.push(key);
      }
    }
  }
  const lines: string[] = [header.map((h) => quoteCell(h, delimiter)).join(delimiter)];
  for (const record of records) {
    const cells = header.map((key) => {
      const v = record[key];
      const text = v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v);
      return quoteCell(text, delimiter);
    });
    lines.push(cells.join(delimiter));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function quoteCell(cell: string, delimiter: string): string {
  const needsQuote = cell.includes(delimiter) || cell.includes('"') || cell.includes('\n') || cell.includes('\r');
  if (!needsQuote) return cell;
  return `"${cell.replace(/"/g, '""')}"`;
}
