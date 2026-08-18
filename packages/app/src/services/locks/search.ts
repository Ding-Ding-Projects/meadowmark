/**
 * Plain-text search and bulk selection over a lock list.
 *
 * This is deliberately NOT the project's full anchored regex builder --
 * that is a UI-layer concern (per-surface builder component, synchronized
 * pattern/flags/mode) that belongs to whichever lane owns the lock-list
 * screen. This module supplies the plain-text default search that builder
 * sits in front of, plus small bulk-selection helpers, over the data this
 * service already produces.
 */

import type { LockSummary } from './types';

/** Case-insensitive substring match against a lock's target label and
 * element id. An empty/whitespace-only query matches everything (the
 * unfiltered list), matching how every other search bar in the app
 * treats an empty query. */
export function searchLocks(locks: readonly LockSummary[], query: string): LockSummary[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return [...locks];
  }
  return locks.filter(
    (lock) =>
      lock.target.label.toLowerCase().includes(needle) ||
      lock.target.elementId.toLowerCase().includes(needle),
  );
}

/** Splits a requested bulk-removal id list into the ones that actually
 * exist and the ones that don't, so a bulk action can report an honest
 * partial result rather than silently ignoring a stale id. */
export function partitionKnownIds(
  locks: readonly LockSummary[],
  requestedIds: readonly string[],
): { known: string[]; unknown: string[] } {
  const existing = new Set(locks.map((lock) => lock.id));
  const known: string[] = [];
  const unknown: string[] = [];
  for (const id of requestedIds) {
    (existing.has(id) ? known : unknown).push(id);
  }
  return { known, unknown };
}
