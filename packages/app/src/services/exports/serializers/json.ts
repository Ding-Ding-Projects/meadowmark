/**
 * JSON serializer. Lossless for any JsonValue: every field, nesting level,
 * and primitive type round-trips exactly through JSON.parse/JSON.stringify.
 * The only loss possible here is credential exclusion, applied upstream.
 */
import type { ExportSource, JsonValue, LossReportEntry } from '../types.js';

export interface JsonSerializationResult {
  contents: string;
  lossEntries: LossReportEntry[];
}

export function serializeJson(source: ExportSource): JsonSerializationResult {
  const envelope: JsonValue = {
    schemaVersion: source.schemaVersion,
    name: source.name,
    ...(source.value !== undefined ? { value: source.value } : {}),
    ...(source.rows !== undefined ? { rows: source.rows as JsonValue } : {}),
  };
  return {
    contents: `${JSON.stringify(envelope, null, 2)}\n`,
    lossEntries: [],
  };
}
