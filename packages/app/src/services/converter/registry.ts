/**
 * The assembled adapter catalog. This is the single source of truth the
 * rest of the converter (and the eventual UI) queries: every category,
 * every enabled adapter, and every known-but-disabled one.
 */

import { buildStructuredDataEntries } from './adapters/structured-data';
import { buildLineEndingEntries, buildTextEncodingEntries } from './adapters/text-encoding';
import { buildBinaryEncodingEntries } from './adapters/binary-encodings';
import { buildArchiveEntries } from './adapters/archives';
import { buildDisabledEntries } from './adapters/disabled';
import { CONVERTER_CATEGORIES, type ConverterCategory, type RegistryEntry } from './types';

let cachedRegistry: RegistryEntry[] | null = null;

function buildRegistry(): RegistryEntry[] {
  const entries = [
    ...buildStructuredDataEntries(),
    ...buildTextEncodingEntries(),
    ...buildLineEndingEntries(),
    ...buildBinaryEncodingEntries(),
    ...buildArchiveEntries(),
    ...buildDisabledEntries(),
  ];

  // Fail-closed self-check: catches a bug in one of the adapter builders
  // (a duplicate id, or a `bundled` flag that disagrees with whether a
  // convert function is actually attached) at startup rather than
  // letting an inconsistent catalog reach the UI.
  const seenIds = new Set<string>();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      throw new Error(`Converter registry: duplicate entry id "${entry.id}".`);
    }
    seenIds.add(entry.id);

    if (entry.bundled) {
      if (entry.kind === 'byte-to-byte' && entry.convert === undefined) {
        throw new Error(`Converter registry: "${entry.id}" is bundled but has no convert function.`);
      }
      if (entry.kind === 'extract-to-directory' && entry.extractToDirectory === undefined) {
        throw new Error(`Converter registry: "${entry.id}" is bundled but has no extractToDirectory function.`);
      }
    } else {
      if (entry.convert !== undefined || entry.extractToDirectory !== undefined) {
        throw new Error(`Converter registry: "${entry.id}" is bundled: false but has a convert/extractToDirectory function attached.`);
      }
      if (!entry.unavailableReason) {
        throw new Error(`Converter registry: "${entry.id}" is bundled: false but has no unavailableReason.`);
      }
    }
    if (entry.lossiness === 'lossy' && entry.lossDisclosure.length === 0) {
      throw new Error(`Converter registry: "${entry.id}" is marked lossy but has an empty lossDisclosure.`);
    }
  }

  return entries;
}

export function getConverterRegistry(): readonly RegistryEntry[] {
  if (cachedRegistry === null) {
    cachedRegistry = buildRegistry();
  }
  return cachedRegistry;
}

export function listCategories(): readonly ConverterCategory[] {
  return CONVERTER_CATEGORIES;
}

export function listEntriesForCategory(category: ConverterCategory): RegistryEntry[] {
  return getConverterRegistry().filter((e) => e.category === category);
}

export function findEntry(id: string): RegistryEntry | undefined {
  return getConverterRegistry().find((e) => e.id === id);
}

/** Every adapter (enabled or disabled) whose source format matches
 * `sourceFormatId`, so a caller can show both what it CAN convert to and
 * what it knows about but cannot. */
export function getTargetsForSource(sourceFormatId: string): RegistryEntry[] {
  return getConverterRegistry().filter((e) => e.sourceFormat.id === sourceFormatId);
}

/** Only the adapters that can actually run right now. */
export function getEnabledTargetsForSource(sourceFormatId: string): RegistryEntry[] {
  return getTargetsForSource(sourceFormatId).filter((e) => e.bundled);
}

export function searchRegistry(query: string): RegistryEntry[] {
  const q = query.trim().toLowerCase();
  const all = getConverterRegistry();
  if (q === '') return [...all];
  return all.filter(
    (e) =>
      e.userFacingName.toLowerCase().includes(q) ||
      e.sourceFormat.label.toLowerCase().includes(q) ||
      e.targetFormat.label.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q)
  );
}
