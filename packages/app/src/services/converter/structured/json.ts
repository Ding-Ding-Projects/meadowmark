/**
 * JSON parse/serialize. JSON.parse/JSON.stringify already fully implement
 * the format, so this module's job is bounds and error normalization:
 * catch native parse errors and re-throw as MalformedInputError, and
 * charge the resource budget over the resulting tree before returning it
 * (JSON.parse itself has no depth/item cap, so a hostile file must be
 * rejected after the fact but before it is used for anything further).
 */

import { MalformedInputError } from '../errors';
import type { ResourceBudget } from '../types';
import { chargeStructuredBudget, type StructuredValue } from './model';

export function parseJson(text: string, budget: ResourceBudget): StructuredValue {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new MalformedInputError(`Not valid JSON: ${reason}`);
  }
  const structured = value as StructuredValue;
  chargeStructuredBudget(structured, budget);
  return structured;
}

export function serializeJson(value: StructuredValue, budget: ResourceBudget, pretty = true): string {
  chargeStructuredBudget(value, budget);
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}
