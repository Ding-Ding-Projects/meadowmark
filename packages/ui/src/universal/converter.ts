export type ConverterCategory =
  | "Documents/PDF"
  | "Images"
  | "Audio"
  | "Video"
  | "Archives"
  | "Structured Data/Spreadsheets"
  | "Code/Text"
  | "Binary Encodings";

export interface ConverterAdapter {
  id: string;
  category: ConverterCategory;
  label: string;
  accepts: string[];
  outputExtension: string;
  bundled: boolean;
  enabled: boolean;
  lossiness: string;
  unavailableReason?: string;
  convert?: (input: Uint8Array) => Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function prettyJson(bytes: Uint8Array): Uint8Array {
  const value: unknown = JSON.parse(decoder.decode(bytes));
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

function textToBase64(bytes: Uint8Array): Uint8Array {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return encoder.encode(btoa(binary));
}

function base64ToText(bytes: Uint8Array): Uint8Array {
  const raw = decoder.decode(bytes).replace(/\s+/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) {
    throw new Error("The input is not valid RFC 4648 base64.");
  }
  const binary = atob(raw);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  decoder.decode(output);
  return output;
}

function normalizeText(bytes: Uint8Array): Uint8Array {
  return encoder.encode(decoder.decode(bytes).replace(/\r\n?|\n/g, "\r\n"));
}

function unavailable(
  id: string,
  category: ConverterCategory,
  label: string,
  accepts: string[],
  outputExtension: string,
  reason: string,
): ConverterAdapter {
  return { id, category, label, accepts, outputExtension, bundled: false, enabled: false, lossiness: "Unavailable", unavailableReason: reason };
}

export const CONVERTER_CATEGORIES: readonly ConverterCategory[] = [
  "Documents/PDF",
  "Images",
  "Audio",
  "Video",
  "Archives",
  "Structured Data/Spreadsheets",
  "Code/Text",
  "Binary Encodings",
];

/** The registry never enables a format just because a developer-machine tool
 * happens to be on PATH. Browser-native adapters are bundled by definition;
 * known unavailable formats remain visible with their exact boundary. */
export const CONVERTER_ADAPTERS: readonly ConverterAdapter[] = [
  unavailable("pdf-tools", "Documents/PDF", "PDF inspect, split, merge, extract, reorder, rotate, metadata", ["application/pdf"], ".pdf", "The packaged PDF worker is not exposed by the preload bridge."),
  unavailable("png-webp", "Images", "PNG to WebP", ["image/png"], ".webp", "A bounded isolated image-decoder worker is not bundled in this build."),
  unavailable("audio-wav", "Audio", "Audio to WAV", ["audio/*"], ".wav", "An offline audio adapter is not bundled in this build."),
  unavailable("video-webm", "Video", "Video to WebM", ["video/*"], ".webm", "An offline video adapter is not bundled in this build."),
  unavailable("archive-7z", "Archives", "Archive to 7z", ["application/zip"], ".7z", "The packaged 7z adapter is not exposed by the preload bridge."),
  {
    id: "json-pretty",
    category: "Structured Data/Spreadsheets",
    label: "JSON to formatted JSON",
    accepts: ["application/json", ".json"],
    outputExtension: ".formatted.json",
    bundled: true,
    enabled: true,
    lossiness: "Whitespace is normalized; all JSON values are preserved.",
    convert: prettyJson,
  },
  {
    id: "text-crlf",
    category: "Code/Text",
    label: "UTF-8 text to CRLF text",
    accepts: ["text/*", ".txt", ".md", ".csv", ".tsv"],
    outputExtension: ".crlf.txt",
    bundled: true,
    enabled: true,
    lossiness: "Line endings are normalized to CRLF; UTF-8 text content is preserved.",
    convert: normalizeText,
  },
  {
    id: "text-base64",
    category: "Binary Encodings",
    label: "Bytes to Base64 text",
    accepts: ["*/*"],
    outputExtension: ".base64.txt",
    bundled: true,
    enabled: true,
    lossiness: "Lossless RFC 4648 base64 encoding.",
    convert: textToBase64,
  },
  {
    id: "base64-text",
    category: "Binary Encodings",
    label: "Base64 text to UTF-8 text",
    accepts: ["text/plain", ".txt"],
    outputExtension: ".decoded.txt",
    bundled: true,
    enabled: true,
    lossiness: "Lossless when the decoded payload is valid UTF-8.",
    convert: base64ToText,
  },
];

export interface ConversionQueueItem {
  id: string;
  file: File;
  adapterId: string;
  state: "queued" | "running" | "converted" | "failed" | "cancelled";
  error?: string;
}

export async function convertQueueItem(item: ConversionQueueItem, signal: AbortSignal): Promise<Blob> {
  const adapter = CONVERTER_ADAPTERS.find((candidate) => candidate.id === item.adapterId);
  if (!adapter?.enabled || !adapter.convert) throw new Error(adapter?.unavailableReason ?? "Adapter unavailable.");
  if (item.file.size > 32 * 1024 * 1024) throw new Error("This local adapter accepts files up to 32 MiB.");
  if (signal.aborted) throw new DOMException("Conversion cancelled.", "AbortError");
  const input = new Uint8Array(await item.file.arrayBuffer());
  if (signal.aborted) throw new DOMException("Conversion cancelled.", "AbortError");
  const output = adapter.convert(input);
  if (output.byteLength === 0 && input.byteLength > 0) throw new Error("The adapter produced an empty output and the result was rejected.");
  return new Blob([new Uint8Array(output).buffer], { type: "application/octet-stream" });
}
