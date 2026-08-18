/**
 * The generic intermediate value tree every structured-data adapter
 * (JSON/YAML/TOML/XML/CSV/TSV) parses into and serializes from. Routing
 * every pair of formats through one shared tree means N formats need only
 * N parsers + N serializers instead of N^2 direct converters, and it is
 * what lets the registry (adapters/structured-data.ts) generate every
 * pairwise combination mechanically.
 */

import type { ResourceBudget } from '../types';
import { UnsupportedConstructError } from '../errors';

export type StructuredValue =
  | string
  | number
  | boolean
  | null
  | StructuredValue[]
  | { readonly [key: string]: StructuredValue };

export function isPlainObject(v: StructuredValue): v is { readonly [key: string]: StructuredValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Walks the whole tree once purely to charge the resource budget for
 * depth and item count before serialization/parsing does real work, so a
 * hostile deeply-nested or huge-fanout tree is rejected up front rather
 * than partway through writing output. */
export function chargeStructuredBudget(value: StructuredValue, budget: ResourceBudget): void {
  budget.check();
  if (Array.isArray(value)) {
    const exitDepth = budget.enterDepth();
    try {
      for (const item of value) {
        budget.countItem();
        chargeStructuredBudget(item, budget);
      }
    } finally {
      exitDepth();
    }
  } else if (isPlainObject(value)) {
    const exitDepth = budget.enterDepth();
    try {
      for (const entryValue of Object.values(value)) {
        budget.countItem();
        chargeStructuredBudget(entryValue, budget);
      }
    } finally {
      exitDepth();
    }
  }
}

/** A CSV/TSV row-set can only represent an array of flat records (no
 * nested objects/arrays inside a cell). Every writer that targets
 * CSV/TSV calls this first and reports the exact unsupported shape
 * rather than silently flattening or stringifying nested data. */
export function requireFlatRecordArray(value: StructuredValue): ReadonlyArray<{ readonly [key: string]: StructuredValue }> {
  if (!Array.isArray(value)) {
    throw new UnsupportedConstructError(
      'CSV/TSV can only represent a top-level array of flat records (rows); the source is not an array.'
    );
  }
  for (const row of value) {
    if (!isPlainObject(row)) {
      throw new UnsupportedConstructError('CSV/TSV requires every array element to be an object (a row of named fields).');
    }
    for (const [key, cell] of Object.entries(row)) {
      if (Array.isArray(cell) || isPlainObject(cell)) {
        throw new UnsupportedConstructError(
          `CSV/TSV cannot represent the nested value at field "${key}"; every field must be a string, number, boolean, or null.`
        );
      }
    }
  }
  return value as ReadonlyArray<{ readonly [key: string]: StructuredValue }>;
}
