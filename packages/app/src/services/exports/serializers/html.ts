/**
 * HTML serializer. Mirrors the Markdown serializer's structure (title,
 * sections, table of rows, or a preformatted JSON block) but renders real
 * HTML with every user-authored string escaped. Meant for viewing/printing,
 * not for re-import - HTML is a presentation format, so this is documented
 * up front as non-reimportable rather than claimed as a round-trip format.
 */
import type { ExportSource, LossReportEntry } from '../types.js';
import { collectColumns, escapeHtml, fieldLabel, resolveRows, valueToCellText } from '../util.js';

export interface HtmlSerializationResult {
  contents: string;
  lossEntries: LossReportEntry[];
}

export function serializeHtml(source: ExportSource): HtmlSerializationResult {
  const lossEntries: LossReportEntry[] = [];
  const title = escapeHtml(source.title ?? source.name);
  const body: string[] = [];

  body.push(`<h1>${title}</h1>`);
  body.push(`<p class="schema-version">Schema version: ${escapeHtml(source.schemaVersion)}</p>`);

  for (const section of source.sections ?? []) {
    body.push(`<h2>${escapeHtml(section.heading)}</h2>`);
    body.push(`<p>${escapeHtml(section.body).replace(/\n/g, '<br>')}</p>`);
  }

  const { rows, lossEntries: rowLoss } = resolveRows(source);
  lossEntries.push(...rowLoss);
  if (rows.length > 0) {
    const columns = collectColumns(rows);
    const nestedColumns = new Set<string>();
    body.push(`<h2>${escapeHtml(source.name)}</h2>`);
    body.push('<table>');
    body.push('<thead><tr>');
    body.push(columns.map((c) => `<th>${escapeHtml(fieldLabel(source.fields, c))}</th>`).join(''));
    body.push('</tr></thead>');
    body.push('<tbody>');
    for (const row of rows) {
      const cells = columns.map((col) => {
        const { text, wasNested } = valueToCellText(row[col]);
        if (wasNested) nestedColumns.add(col);
        return `<td>${escapeHtml(text)}</td>`;
      });
      body.push(`<tr>${cells.join('')}</tr>`);
    }
    body.push('</tbody>');
    body.push('</table>');
    for (const col of nestedColumns) {
      lossEntries.push({
        field: col,
        kind: 'nested-flattened',
        detail: `Column "${col}" contains nested objects/arrays; the HTML table cell holds compact JSON text instead of structured data.`,
      });
    }
  } else if (source.value !== undefined) {
    body.push(`<h2>${escapeHtml(source.name)}</h2>`);
    body.push(`<pre>${escapeHtml(JSON.stringify(source.value, null, 2))}</pre>`);
    lossEntries.push({
      kind: 'structure-not-representable',
      detail: 'Structured data was rendered inside a preformatted block for readability; this HTML export is not intended to be re-imported as structured data.',
    });
  }

  lossEntries.push({
    kind: 'structure-not-representable',
    detail: 'HTML is a presentation format: it is suitable for viewing and printing but is not re-imported by the application.',
  });

  const contents =
    '<!doctype html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    `<title>${title}</title>\n` +
    '<style>body{font-family:sans-serif;margin:2rem;}table{border-collapse:collapse;width:100%;}' +
    'th,td{border:1px solid #ccc;padding:0.4rem 0.6rem;text-align:left;}th{background:#f0f0f0;}' +
    'pre{background:#f5f5f5;padding:1rem;overflow-x:auto;}</style>\n' +
    '</head>\n' +
    `<body>\n${body.join('\n')}\n</body>\n</html>\n`;

  return { contents, lossEntries };
}
