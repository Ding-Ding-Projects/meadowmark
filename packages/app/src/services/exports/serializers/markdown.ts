/**
 * Markdown serializer. Prose-oriented: renders `title` and `sections`
 * verbatim (Markdown body text is passed through, so the caller's own
 * Markdown formatting survives), and renders `rows` as a Markdown table.
 * A Markdown table is a flat grid exactly like CSV, so the same nested-cell
 * loss applies; JSON structure passed only via `value` (no rows/sections) is
 * rendered inside a fenced code block, which is visually useful but not
 * meant to be re-imported as structured data.
 */
import type { ExportSource, LossReportEntry } from '../types.js';
import { collectColumns, escapeMarkdownCell, fieldLabel, resolveRows, valueToCellText } from '../util.js';

export interface MarkdownSerializationResult {
  contents: string;
  lossEntries: LossReportEntry[];
}

export function serializeMarkdown(source: ExportSource): MarkdownSerializationResult {
  const lossEntries: LossReportEntry[] = [];
  const parts: string[] = [];

  parts.push(`# ${source.title ?? source.name}`);
  parts.push('');
  parts.push(`_Schema version: ${source.schemaVersion}_`);
  parts.push('');

  for (const section of source.sections ?? []) {
    parts.push(`## ${section.heading}`);
    parts.push('');
    parts.push(section.body);
    parts.push('');
  }

  const { rows, lossEntries: rowLoss } = resolveRows(source);
  lossEntries.push(...rowLoss);
  if (rows.length > 0) {
    const columns = collectColumns(rows);
    const nestedColumns = new Set<string>();
    parts.push(`## ${source.name}`);
    parts.push('');
    parts.push(`| ${columns.map((c) => fieldLabel(source.fields, c)).join(' | ')} |`);
    parts.push(`| ${columns.map(() => '---').join(' | ')} |`);
    for (const row of rows) {
      const cells = columns.map((col) => {
        const { text, wasNested } = valueToCellText(row[col]);
        if (wasNested) nestedColumns.add(col);
        return escapeMarkdownCell(text);
      });
      parts.push(`| ${cells.join(' | ')} |`);
    }
    parts.push('');
    for (const col of nestedColumns) {
      lossEntries.push({
        field: col,
        kind: 'nested-flattened',
        detail: `Column "${col}" contains nested objects/arrays; the Markdown table cell holds compact JSON text instead of structured data.`,
      });
    }
  } else if (source.value !== undefined) {
    parts.push(`## ${source.name}`);
    parts.push('');
    parts.push('```json');
    parts.push(JSON.stringify(source.value, null, 2));
    parts.push('```');
    parts.push('');
    lossEntries.push({
      kind: 'structure-not-representable',
      detail: 'Structured data was rendered inside a fenced JSON code block for readability; Markdown itself has no native structured-data syntax to re-import from.',
    });
  }

  return { contents: `${parts.join('\n').replace(/\n+$/, '')}\n`, lossEntries };
}
