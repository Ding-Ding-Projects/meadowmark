/**
 * JSONL / NDJSON serializer. One JSON object per line, newline-delimited.
 * Uses the source's `rows` when present; otherwise derives rows from `value`
 * (see util.deriveRowsFromValue), reporting any structural loss that entails.
 * A header comment line is not standard NDJSON, so schema/version metadata is
 * instead documented in the accompanying SerializedExport rather than in the
 * file body - this keeps every line a valid, independently-parseable record.
 */
import type { ExportSource, LossReportEntry } from '../types.js';
import { resolveRows } from '../util.js';

export interface JsonlSerializationResult {
  contents: string;
  lossEntries: LossReportEntry[];
}

export function serializeJsonl(source: ExportSource): JsonlSerializationResult {
  const { rows, lossEntries } = resolveRows(source);
  const lines = rows.map((row) => JSON.stringify(row));
  return {
    contents: lines.length > 0 ? `${lines.join('\n')}\n` : '',
    lossEntries,
  };
}
