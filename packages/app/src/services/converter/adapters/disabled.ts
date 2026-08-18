/**
 * Every conversion this catalog recognises but does NOT offer, because a
 * required dependency is not bundled inside the installed application.
 *
 * These entries exist so the converter UI can say "we know what a PNG
 * is, and we know you might want it as a JPEG, but this build cannot do
 * that" instead of pretending the format does not exist. Every entry
 * here has `bundled: false`, no `convert`/`extractToDirectory` function
 * at all (so it is structurally impossible to invoke), and an
 * `unavailableReason` naming the exact missing dependency. If a future
 * build bundles a real codec/parser for one of these, its entry should
 * move out of this file into a real adapter module.
 */

import { KNOWN_FORMATS, isStructuralTextFormat } from '../signatures';
import { DEFAULT_ARCHIVE_LIMITS, type ConverterCategory, type FormatId, type RegistryEntry } from '../types';

function disabledEntry(
  id: string,
  category: ConverterCategory,
  sourceFormat: FormatId,
  targetFormat: FormatId,
  unavailableReason: string,
  metadataBehavior: string
): RegistryEntry {
  return {
    id,
    category,
    sourceFormat,
    targetFormat,
    sourceSignatures: [],
    bundled: false,
    packagedArtifactProof: `Not bundled: ${unavailableReason}`,
    unavailableReason,
    metadataBehavior,
    lossiness: 'lossy',
    lossDisclosure: [{ aspect: 'Unavailable', detail: 'This conversion cannot run in this build; see unavailableReason.' }],
    // Limits are declared for documentation/UI display even though this
    // adapter can never actually run (no convert/extractToDirectory is
    // attached), so a future implementation has a documented starting
    // point rather than inventing limits from scratch.
    limits: DEFAULT_ARCHIVE_LIMITS,
    sandboxBoundary: 'N/A — this adapter is disabled and cannot execute.',
    userFacingName: `${sourceFormat.label} to ${targetFormat.label}`,
    kind: 'byte-to-byte',
    // Deliberately no `convert`, no `extractToDirectory`, no
    // `validateOutput`: bundled === false means there is nothing here
    // that could be called even by a bug in the caller.
  };
}

function imageAudioVideoPairs(category: 'images' | 'audio' | 'video', dependencyName: string): RegistryEntry[] {
  const formats = KNOWN_FORMATS.filter((f) => f.category === category && !isStructuralTextFormat(f.formatId));
  const entries: RegistryEntry[] = [];
  for (const source of formats) {
    for (const target of formats) {
      if (source.formatId === target.formatId) continue;
      entries.push(
        disabledEntry(
          `${source.formatId}-to-${target.formatId}`,
          category,
          { id: source.formatId, label: source.label },
          { id: target.formatId, label: target.label },
          `${dependencyName} is not bundled in this build.`,
          `Would decode ${source.label} and re-encode it as ${target.label}, but no bundled codec is present.`
        )
      );
    }
  }
  return entries;
}

function documentsPdfEntries(): RegistryEntry[] {
  const reasonPdf = 'A bundled PDF parsing/rendering library (e.g. pdf.js) is not present in this build.';
  const reasonDocx = 'A bundled Office Open XML (WordprocessingML) document reader is not present in this build.';
  const reasonXlsx =
    'A bundled Office Open XML (SpreadsheetML) spreadsheet reader is not present in this build. (This build\'s ZIP and XML adapters can inspect the raw parts of an .xlsx file, but do not interpret spreadsheet-specific structures such as the shared-strings table or cell references.)';
  const reasonPptx = 'A bundled Office Open XML (PresentationML) presentation reader is not present in this build.';
  const reasonRtf = 'A bundled Rich Text Format (RTF) parser is not present in this build.';
  const pdf: FormatId = { id: 'pdf', label: 'PDF document' };
  const docx: FormatId = { id: 'docx', label: 'Word document (.docx)' };
  const xlsx: FormatId = { id: 'xlsx', label: 'Excel workbook (.xlsx)' };
  const pptx: FormatId = { id: 'pptx', label: 'PowerPoint presentation (.pptx)' };
  const rtf: FormatId = { id: 'rtf', label: 'Rich Text Format document' };
  const plainText: FormatId = { id: 'plain-text', label: 'Plain text' };
  const html: FormatId = { id: 'html', label: 'HTML' };
  const csv: FormatId = { id: 'csv', label: 'CSV' };
  const jsonFmt: FormatId = { id: 'json', label: 'JSON' };
  const pngImages: FormatId = { id: 'png', label: 'PNG images (one per page)' };

  return [
    disabledEntry('pdf-to-plain-text', 'documents-pdf', pdf, plainText, reasonPdf, 'Would extract the text content of every page.'),
    disabledEntry('pdf-to-png', 'documents-pdf', pdf, pngImages, reasonPdf, 'Would rasterize every page to a PNG image.'),
    disabledEntry('docx-to-plain-text', 'documents-pdf', docx, plainText, reasonDocx, 'Would extract the document\'s text content.'),
    disabledEntry('docx-to-html', 'documents-pdf', docx, html, reasonDocx, 'Would convert the document body to HTML.'),
    disabledEntry('docx-to-pdf', 'documents-pdf', docx, pdf, reasonDocx, 'Would render the document to a PDF.'),
    disabledEntry('xlsx-to-csv', 'documents-pdf', xlsx, csv, reasonXlsx, 'Would export the first worksheet as CSV.'),
    disabledEntry('xlsx-to-json', 'documents-pdf', xlsx, jsonFmt, reasonXlsx, 'Would export every worksheet as a JSON array of row objects.'),
    disabledEntry('pptx-to-pdf', 'documents-pdf', pptx, pdf, reasonPptx, 'Would render every slide to a PDF page.'),
    disabledEntry('rtf-to-plain-text', 'documents-pdf', rtf, plainText, reasonRtf, 'Would extract the document\'s text content.'),
  ];
}

function otherArchiveEntries(): RegistryEntry[] {
  const reason7z = 'A bundled 7-Zip (LZMA/LZMA2) decoder is not present in this build.';
  const reasonRar = 'A bundled RAR decoder is not present in this build (RAR is a proprietary format with no permissively-licensed pure-JavaScript decoder to bundle).';
  const reasonBzip2 = 'A bundled BZip2 codec is not present in this build (Node\'s builtin zlib module does not implement BZip2).';
  const reasonXz = 'A bundled XZ/LZMA2 codec is not present in this build (Node\'s builtin zlib module does not implement XZ).';
  const reasonTar = 'A bundled TAR archive reader is not present in this build (only ZIP and GZIP are implemented).';
  const reasonSqlite = 'A bundled SQLite database reader is not present in this build.';

  const sevenZ: FormatId = { id: '7z', label: '7-Zip archive' };
  const rar: FormatId = { id: 'rar', label: 'RAR archive' };
  const bzip2: FormatId = { id: 'bzip2', label: 'BZip2 compressed data' };
  const xz: FormatId = { id: 'xz', label: 'XZ compressed data' };
  const tar: FormatId = { id: 'tar', label: 'TAR archive' };
  const rawBytes: FormatId = { id: 'raw-bytes', label: 'Raw bytes' };
  const directoryTree: FormatId = { id: 'directory-tree', label: 'Extracted files' };
  const sqlite: FormatId = { id: 'sqlite3', label: 'SQLite database' };
  const jsonFmt: FormatId = { id: 'json', label: 'JSON' };

  return [
    disabledEntry('7z-extract', 'archives', sevenZ, directoryTree, reason7z, 'Would extract every entry to a destination directory.'),
    disabledEntry('rar-extract', 'archives', rar, directoryTree, reasonRar, 'Would extract every entry to a destination directory.'),
    disabledEntry('bzip2-to-raw-bytes', 'archives', bzip2, rawBytes, reasonBzip2, 'Would decompress a BZip2 stream.'),
    disabledEntry('raw-bytes-to-bzip2', 'archives', rawBytes, bzip2, reasonBzip2, 'Would compress a file as BZip2.'),
    disabledEntry('xz-to-raw-bytes', 'archives', xz, rawBytes, reasonXz, 'Would decompress an XZ stream.'),
    disabledEntry('raw-bytes-to-xz', 'archives', rawBytes, xz, reasonXz, 'Would compress a file as XZ.'),
    disabledEntry('tar-extract', 'archives', tar, directoryTree, reasonTar, 'Would extract every entry to a destination directory.'),
    disabledEntry('sqlite3-to-json', 'structured-data', sqlite, jsonFmt, reasonSqlite, 'Would export every table as a JSON array of row objects.'),
  ];
}

export function buildDisabledEntries(): RegistryEntry[] {
  return [
    ...documentsPdfEntries(),
    ...imageAudioVideoPairs('images', 'A bundled image codec (e.g. a PNG/JPEG/GIF/WebP/TIFF encoder-decoder)'),
    ...imageAudioVideoPairs('audio', 'A bundled audio codec/transcoder (e.g. an MP3/FLAC/Ogg/WAV encoder-decoder)'),
    ...imageAudioVideoPairs('video', 'A bundled video codec/transcoder (e.g. ffmpeg or an equivalent)'),
    ...otherArchiveEntries(),
  ];
}
