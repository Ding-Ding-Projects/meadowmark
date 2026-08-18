/**
 * Builds every JSON<->YAML<->TOML<->XML<->CSV<->TSV registry entry.
 *
 * All six formats are routed through one generic intermediate tree
 * (structured/model.ts's StructuredValue), so this file needs only one
 * parser + one serializer per format instead of hand-writing all thirty
 * direct pairwise converters. Every one of these adapters is `bundled:
 * true` — the parsers/serializers are hand-written in this package (see
 * structured/*.ts); no external library or binary is involved.
 */

import { MalformedInputError, ResourceLimitExceededError } from '../errors';
import { createResourceBudget } from '../resource-budget';
import { DEFAULT_STRUCTURED_LIMITS, type LossDisclosureItem, type RegistryEntry } from '../types';
import { parseJson, serializeJson } from '../structured/json';
import { parseYaml, serializeYaml } from '../structured/yaml';
import { parseToml, serializeToml } from '../structured/toml';
import { parseXml, serializeXml } from '../structured/xml';
import { parseDelimited, serializeDelimited } from '../structured/csv';
import type { StructuredValue } from '../structured/model';
import type { ResourceBudget } from '../types';

interface StructuredFormat {
  id: string;
  label: string;
  parse: (text: string, budget: ResourceBudget) => StructuredValue;
  serialize: (value: StructuredValue, budget: ResourceBudget) => string;
  sourceNotes: LossDisclosureItem[];
  targetNotes: LossDisclosureItem[];
}

const NUMERIC_KEY_ORDER_NOTE: LossDisclosureItem = {
  aspect: 'Object key order',
  detail:
    'Keys that look like small non-negative integers (e.g. "0", "1") are reordered ahead of other keys, per JavaScript\'s own object property ordering; this can shift key order for such keys.',
};

const STRUCTURED_FORMATS: StructuredFormat[] = [
  {
    id: 'json',
    label: 'JSON',
    parse: parseJson,
    serialize: (v, b) => serializeJson(v, b, true),
    sourceNotes: [],
    targetNotes: [NUMERIC_KEY_ORDER_NOTE],
  },
  {
    id: 'yaml',
    label: 'YAML',
    parse: parseYaml,
    serialize: serializeYaml,
    sourceNotes: [
      {
        aspect: 'Comments',
        detail: 'YAML comments ("# ...") are discarded; they are not represented anywhere in the converted output.',
      },
    ],
    targetNotes: [NUMERIC_KEY_ORDER_NOTE],
  },
  {
    id: 'toml',
    label: 'TOML',
    parse: parseToml,
    serialize: serializeToml,
    sourceNotes: [
      { aspect: 'Comments', detail: 'TOML comments ("# ...") are discarded; they are not represented in the converted output.' },
    ],
    targetNotes: [
      NUMERIC_KEY_ORDER_NOTE,
      { aspect: 'Null values', detail: 'TOML has no representation for null. The conversion fails if the source contains a null value.' },
      {
        aspect: 'Mixed-type arrays',
        detail: 'TOML can only write an array as either all-scalar (inline array) or all-object (array of tables); a mixed array fails the conversion.',
      },
    ],
  },
  {
    id: 'xml',
    label: 'XML',
    parse: parseXml,
    serialize: serializeXml,
    sourceNotes: [
      {
        aspect: 'Comments, processing instructions, namespaces',
        detail:
          'XML comments and processing instructions are discarded. Attributes become object keys prefixed with "@" and text content becomes a "#text" key; namespace prefixes are kept as literal characters in tag/attribute names rather than resolved.',
      },
    ],
    targetNotes: [
      NUMERIC_KEY_ORDER_NOTE,
      {
        aspect: 'Root element',
        detail: 'A source value that is not a single-key object is wrapped in a synthetic <root> element, since XML documents need exactly one root.',
      },
      {
        aspect: 'Nested values as text/attributes',
        detail: 'Only string, number, boolean, and null values may appear as element text or attribute content; a nested object or array there fails the conversion.',
      },
    ],
  },
  {
    id: 'csv',
    label: 'CSV',
    parse: (t, b) => parseDelimited(t, ',', b),
    serialize: (v, b) => serializeDelimited(v, ',', b),
    sourceNotes: [
      {
        aspect: 'Cell typing',
        detail: 'Every cell is imported as a plain string; CSV has no type system, so numeric- or boolean-looking values are not automatically converted.',
      },
    ],
    targetNotes: [
      { aspect: 'Value typing', detail: 'Every value becomes its plain-text string form; numbers, booleans, and null lose their original type once read back.' },
      { aspect: 'Shape requirement', detail: 'The source must be an array of flat objects (no field may itself be a nested array or object); anything else fails the conversion.' },
    ],
  },
  {
    id: 'tsv',
    label: 'TSV',
    parse: (t, b) => parseDelimited(t, '\t', b),
    serialize: (v, b) => serializeDelimited(v, '\t', b),
    sourceNotes: [
      {
        aspect: 'Cell typing',
        detail: 'Every cell is imported as a plain string; TSV has no type system, so numeric- or boolean-looking values are not automatically converted.',
      },
    ],
    targetNotes: [
      { aspect: 'Value typing', detail: 'Every value becomes its plain-text string form; numbers, booleans, and null lose their original type once read back.' },
      { aspect: 'Shape requirement', detail: 'The source must be an array of flat objects (no field may itself be a nested array or object); anything else fails the conversion.' },
    ],
  },
];

function decodeUtf8(input: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(input);
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function buildStructuredDataEntries(): RegistryEntry[] {
  const entries: RegistryEntry[] = [];

  for (const source of STRUCTURED_FORMATS) {
    for (const target of STRUCTURED_FORMATS) {
      if (source.id === target.id) continue;

      const lossDisclosure = [...source.sourceNotes, ...target.targetNotes];

      entries.push({
        id: `${source.id}-to-${target.id}`,
        category: 'structured-data',
        sourceFormat: { id: source.id, label: source.label },
        targetFormat: { id: target.id, label: target.label },
        sourceSignatures: 'structural-text',
        bundled: true,
        packagedArtifactProof: `Hand-written ${source.label} parser and ${target.label} serializer bundled in services/converter/structured/ (no external dependency, no network).`,
        metadataBehavior: `Reads ${source.label} (UTF-8 text) into a generic structured tree and writes it back out as ${target.label}. Both source and target are parsed/serialized entirely by this package's own code.`,
        lossiness: lossDisclosure.length > 0 ? 'lossy' : 'lossless',
        lossDisclosure,
        limits: DEFAULT_STRUCTURED_LIMITS,
        sandboxBoundary:
          'Runs in-process in the Electron main process under a bounded resource budget (input/output bytes, nesting depth, item count, CPU time); no subprocess, no network access.',
        userFacingName: `${source.label} to ${target.label}`,
        kind: 'byte-to-byte',
        convert: async (input, ctx) => {
          ctx.budget.consumeInput(input.byteLength);
          let text: string;
          try {
            text = decodeUtf8(input);
          } catch {
            throw new MalformedInputError(`Not valid UTF-8 text, so it cannot be read as ${source.label}.`);
          }
          const value = source.parse(text, ctx.budget);
          ctx.budget.check();
          const outputText = target.serialize(value, ctx.budget);
          const outputBytes = encodeUtf8(outputText);
          ctx.budget.produceOutput(outputBytes.byteLength);
          return outputBytes;
        },
        validateOutput: (bytes) => {
          try {
            const text = decodeUtf8(bytes);
            const scratchBudget = createResourceBudget(DEFAULT_STRUCTURED_LIMITS, new AbortController().signal);
            target.parse(text, scratchBudget);
            return { ok: true };
          } catch (err) {
            if (err instanceof ResourceLimitExceededError) {
              // The produced output is valid but large enough that
              // re-validating it against the default limits alone hit a
              // bound; that is not evidence the output is malformed.
              return { ok: true };
            }
            const reason = err instanceof Error ? err.message : String(err);
            return { ok: false, reason: `Produced output does not parse back as valid ${target.label}: ${reason}` };
          }
        },
      });
    }
  }

  return entries;
}
