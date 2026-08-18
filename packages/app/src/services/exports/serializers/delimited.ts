/**
 * CSV/TSV serializer, sharing one implementation parameterized by delimiter.
 * A nested value in a cell is embedded as compact JSON text, which is a real
 * loss for a spreadsheet reader (it sees text, not structure) and is always
 * reported. Null and "missing" both render as an empty cell, which loses the
 * distinction between "explicitly null" and "field absent" - reported once
 * per affected column.
 */
import type { ExportSource, ExportRow, LossReportEntry } from '../types.js';
import { collectColumns, delimitedField, fieldLabel, resolveRows, valueToCellText } from '../util.js';

export interface DelimitedSerializationResult {
  contents: string;
  lossEntries: LossReportEntry[];
}

function serializeDelimited(source: ExportSource, delimiter: string): DelimitedSerializationResult {
  const { rows, lossEntries } = resolveRows(source);
  const columns = collectColumns(rows);
  const nestedColumns = new Set<string>();
  const nullOrMissingColumns = new Set<string>();

  const lines: string[] = [];
  lines.push(columns.map((c) => delimitedField(fieldLabel(source.fields, c), delimiter)).join(delimiter));

  for (const row of rows) {
    const cells = columns.map((col) => {
      const raw = (row as ExportRow)[col];
      if (raw === undefined || raw === null) nullOrMissingColumns.add(col);
      const { text, wasNested } = valueToCellText(raw);
      if (wasNested) nestedColumns.add(col);
      return delimitedField(text, delimiter);
    });
    lines.push(cells.join(delimiter));
  }

  for (const col of nestedColumns) {
    lossEntries.push({
      field: col,
      kind: 'nested-flattened',
      detail: `Column "${col}" contains nested objects/arrays, which cannot be represented in a flat table; each cell holds compact JSON text instead.`,
    });
  }
  for (const col of nullOrMissingColumns) {
    lossEntries.push({
      field: col,
      kind: 'null-omitted',
      detail: `Column "${col}" has null or missing values in some rows; both render as an empty cell, so the distinction between "explicitly empty" and "not present" is not preserved.`,
    });
  }
  if (columns.length === 0) {
    lossEntries.push({
      kind: 'structure-not-representable',
      detail: 'No tabular rows were available to export; the file contains only a header-less empty body.',
    });
  }

  return { contents: `${lines.join('\r\n')}\r\n`, lossEntries };
}

export function serializeCsv(source: ExportSource): DelimitedSerializationResult {
  return serializeDelimited(source, ',');
}

export function serializeTsv(source: ExportSource): DelimitedSerializationResult {
  return serializeDelimited(source, '\t');
}
