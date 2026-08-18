/**
 * SQL serializer. Emits a `CREATE TABLE IF NOT EXISTS` statement with a
 * per-column type inferred from the values actually observed (INTEGER, REAL,
 * BOOLEAN, or TEXT; a column that mixes types falls back to TEXT, which is
 * reported), followed by one `INSERT INTO` statement per row. Nested values
 * are embedded as a JSON text literal, same as the delimited formats, and
 * reported the same way. Standard SQL string-literal escaping (doubled
 * single quotes) is used throughout; no dialect-specific extensions.
 */
import type { ExportSource, ExportRow, JsonValue, LossReportEntry } from '../types.js';
import { collectColumns, fieldLabel, isPrimitive, resolveRows } from '../util.js';

export interface SqlSerializationResult {
  contents: string;
  lossEntries: LossReportEntry[];
}

type ColumnType = 'INTEGER' | 'REAL' | 'BOOLEAN' | 'TEXT';

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

function inferColumnType(rows: ExportRow[], column: string): { type: ColumnType; mixed: boolean } {
  let sawInt = false;
  let sawFloat = false;
  let sawBool = false;
  let sawString = false;
  let sawOther = false;
  for (const row of rows) {
    const value = row[column];
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') sawBool = true;
    else if (typeof value === 'number') {
      if (Number.isInteger(value)) sawInt = true;
      else sawFloat = true;
    } else if (typeof value === 'string') sawString = true;
    else sawOther = true;
  }
  const distinctKinds = [sawInt || sawFloat, sawBool, sawString, sawOther].filter(Boolean).length;
  if (sawOther || distinctKinds > 1) return { type: 'TEXT', mixed: distinctKinds > 1 || sawOther };
  if (sawFloat) return { type: 'REAL', mixed: false };
  if (sawInt) return { type: 'INTEGER', mixed: false };
  if (sawBool) return { type: 'BOOLEAN', mixed: false };
  return { type: 'TEXT', mixed: false };
}

function valueToSqlLiteral(
  value: JsonValue | undefined,
  column: string,
  columnType: ColumnType,
  lossEntries: LossReportEntry[],
  nestedColumns: Set<string>,
): string {
  if (value === undefined || value === null) return 'NULL';
  if (isPrimitive(value)) {
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    return quoteLiteral(value);
  }
  nestedColumns.add(column);
  return quoteLiteral(JSON.stringify(value));
}

export function serializeSql(source: ExportSource): SqlSerializationResult {
  const { rows, lossEntries } = resolveRows(source);
  const tableName = quoteIdentifier(source.name || 'export');
  const columns = collectColumns(rows);

  if (columns.length === 0) {
    return {
      contents: `-- schemaVersion: ${source.schemaVersion}\n-- No tabular rows were available to export.\n`,
      lossEntries: [
        ...lossEntries,
        {
          kind: 'structure-not-representable',
          detail: 'No tabular rows were available to export; no CREATE TABLE or INSERT statements were generated.',
        },
      ],
    };
  }

  const columnTypes = new Map<string, ColumnType>();
  const nestedColumns = new Set<string>();
  for (const col of columns) {
    const { type, mixed } = inferColumnType(rows, col);
    columnTypes.set(col, type);
    if (mixed) {
      lossEntries.push({
        field: col,
        kind: 'type-coerced-to-string',
        detail: `Column "${col}" mixes value types across rows; it was declared TEXT and every value coerced to a string literal.`,
      });
    }
  }

  const lines: string[] = [`-- schemaVersion: ${source.schemaVersion}`, `-- name: ${source.name}`, ''];
  lines.push(`CREATE TABLE IF NOT EXISTS ${tableName} (`);
  lines.push(
    columns
      .map((col) => `  ${quoteIdentifier(fieldLabel(source.fields, col))} ${columnTypes.get(col)}`)
      .join(',\n'),
  );
  lines.push(');');
  lines.push('');

  for (const row of rows) {
    const columnList = columns.map((c) => quoteIdentifier(fieldLabel(source.fields, c))).join(', ');
    const valueList = columns
      .map((col) => valueToSqlLiteral(row[col], col, columnTypes.get(col) ?? 'TEXT', lossEntries, nestedColumns))
      .join(', ');
    lines.push(`INSERT INTO ${tableName} (${columnList}) VALUES (${valueList});`);
  }

  for (const col of nestedColumns) {
    lossEntries.push({
      field: col,
      kind: 'nested-flattened',
      detail: `Column "${col}" contains nested objects/arrays; the SQL literal holds compact JSON text instead of a structured value.`,
    });
  }

  return { contents: `${lines.join('\n')}\n`, lossEntries };
}
