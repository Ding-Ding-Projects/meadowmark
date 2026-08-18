/**
 * Model catalogue: the exhaustive list of models and published tags that
 * exist to be pulled, as distinct from the locally-installed set (which
 * `models.ts` already covers via the local Ollama API alone).
 *
 * Ollama's local server does not expose a "list every model that exists"
 * endpoint - that index only exists on the public Ollama library site.
 * Populating it is therefore the one place in this subsystem that leaves
 * loopback and makes real network requests, and it does so ONLY against an
 * explicit allowlisted host over HTTPS, with every response bounded and
 * defensively parsed.
 *
 * The catalogue is intentionally exhaustive-or-honest: a refresh either
 * walks every page it can and reports `completeness: 'complete'`, or it
 * reports exactly how far it got (`'partial'`) or that it could not run at
 * all (`'unavailable'`). It never silently curates a subset and calls it
 * the catalogue.
 */

import { JsonStore } from '../../store';
import type {
  CatalogCompleteness,
  CatalogModel,
  CatalogSnapshot,
  CatalogState,
  CatalogTag,
  InstalledModel,
  MergedCatalogEntry,
} from './types';

/** The only host this module will ever contact. Requests to anything else
 * are refused before a socket is opened. */
const ALLOWED_CATALOG_HOST = 'ollama.com';
const CATALOG_ORIGIN = 'https://ollama.com';

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

/** How many library-index pages and per-model tag pages a single refresh
 * will walk before stopping and reporting 'partial'. Real, bounded limits
 * rather than an unbounded crawl of a live third-party site. */
const MAX_INDEX_PAGES = 40;
const MAX_MODELS_PER_REFRESH = 800;

const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A pluggable source for catalogue data. The default implementation below
 * scrapes the public Ollama library website's HTML, defensively, because
 * Ollama does not publish a documented JSON catalogue API at the time this
 * was written. Swapping in a real JSON-backed source (should Ollama ship
 * one) requires only providing a different `CatalogSource` - nothing else
 * in this module or its callers needs to change.
 */
export interface CatalogSource {
  /**
   * Fetches one page of the model index. Returns the models found on that
   * page (with only their name/description - tags are fetched separately),
   * whether more pages remain, and an opaque per-page revision hint.
   */
  fetchIndexPage(pageNumber: number): Promise<{
    models: Array<{ name: string; description?: string }>;
    hasMore: boolean;
    pageRevisionHint: string;
  }>;

  /** Fetches every published tag for one model. */
  fetchTags(modelName: string): Promise<CatalogTag[]>;
}

async function fetchBoundedText(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.hostname !== ALLOWED_CATALOG_HOST || parsed.protocol !== 'https:') {
    throw new Error(`Refusing to fetch catalogue data from disallowed host "${parsed.hostname}".`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(parsed, {
      signal: controller.signal,
      redirect: 'error',
      headers: { accept: 'text/html,application/json' },
    });
    if (!response.ok) {
      throw new Error(`Catalogue source returned HTTP ${response.status} for ${parsed.pathname}`);
    }
    if (!response.body) {
      return response.text();
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let out = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        reader.releaseLock();
        throw new Error(`Catalogue response exceeded ${MAX_RESPONSE_BYTES} bytes; refusing it.`);
      }
      out += decoder.decode(value, { stream: true });
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

/** Extracts distinct `/library/<name>` links from an index page's HTML. This
 * is intentionally a narrow, defensive regex rather than a full HTML
 * parser: it looks only for the exact href shape the library index uses,
 * and yields nothing (never a wrong answer) if the page's markup has
 * changed in a way this pattern no longer recognizes - a refresh that
 * finds zero models is reported honestly rather than treated as success. */
function extractLibraryNames(html: string): string[] {
  const names = new Set<string>();
  const linkPattern = /href="\/library\/([a-zA-Z0-9._-]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    const name = match[1];
    if (name) names.add(name);
  }
  return Array.from(names);
}

/** Extracts tag rows from a model's tags page. Each row is expected to
 * contain the tag name and, where present, a human-readable size (e.g.
 * "4.7GB"). Anything not matching this shape is skipped rather than
 * guessed at. */
function extractTags(modelName: string, html: string): CatalogTag[] {
  const tags: CatalogTag[] = [];
  const rowPattern = new RegExp(
    `href="/library/${escapeRegExp(modelName)}:([a-zA-Z0-9._-]+)"[^]*?(\\d+(?:\\.\\d+)?)\\s?(GB|MB)`,
    'g',
  );
  let match: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((match = rowPattern.exec(html)) !== null) {
    const tag = match[1];
    const amountText = match[2];
    const unit = match[3];
    if (!tag || !amountText || !unit) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    const amount = Number.parseFloat(amountText);
    const sizeBytes = Number.isFinite(amount)
      ? Math.round(amount * (unit === 'GB' ? 1024 ** 3 : 1024 ** 2))
      : undefined;
    tags.push({
      tag,
      fullReference: `${modelName}:${tag}`,
      sizeBytes,
    });
  }
  return tags;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class OllamaWebCatalogSource implements CatalogSource {
  async fetchIndexPage(pageNumber: number): Promise<{
    models: Array<{ name: string; description?: string }>;
    hasMore: boolean;
    pageRevisionHint: string;
  }> {
    const url = new URL('/library', CATALOG_ORIGIN);
    if (pageNumber > 1) url.searchParams.set('p', String(pageNumber));
    const html = await fetchBoundedText(url.toString());
    const names = extractLibraryNames(html);
    return {
      models: names.map((name) => ({ name })),
      // A page with zero results, or fewer than expected, is treated as
      // the end of the index rather than assumed to have more pages
      // waiting - conservative in the direction of not looping forever.
      hasMore: names.length > 0 && pageNumber < MAX_INDEX_PAGES,
      pageRevisionHint: `${html.length}:${names.length}`,
    };
  }

  async fetchTags(modelName: string): Promise<CatalogTag[]> {
    const url = new URL(`/library/${encodeURIComponent(modelName)}/tags`, CATALOG_ORIGIN);
    const html = await fetchBoundedText(url.toString());
    return extractTags(modelName, html);
  }
}

async function fnv1aHash(input: string): Promise<string> {
  // A tiny, dependency-free non-cryptographic hash: this only needs to
  // detect "did the fetched content change", not resist tampering.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export interface CatalogRefreshResult {
  snapshot: CatalogSnapshot | null;
  error: string | null;
}

/**
 * Performs a full catalogue refresh: walks every index page the source
 * offers (up to the bound above), fetches tags for every discovered
 * model (up to the bound above), and returns a snapshot describing
 * exactly how complete the result is. Never throws - a total failure is
 * returned as `{ snapshot: null, error }` so the caller can fall back to
 * whatever snapshot it already had cached.
 */
export async function refreshCatalog(source: CatalogSource): Promise<CatalogRefreshResult> {
  const notes: string[] = [];
  let completeness: CatalogCompleteness = 'complete';
  const discovered: Array<{ name: string; description?: string }> = [];
  let pageCount = 0;
  let revisionParts = '';

  try {
    let page = 1;
    for (;;) {
      const result = await source.fetchIndexPage(page);
      pageCount += 1;
      revisionParts += result.pageRevisionHint;
      discovered.push(...result.models);
      if (!result.hasMore) break;
      if (page >= MAX_INDEX_PAGES) {
        completeness = 'partial';
        notes.push(`Stopped after the configured maximum of ${MAX_INDEX_PAGES} index pages.`);
        break;
      }
      page += 1;
    }
  } catch (err) {
    return {
      snapshot: null,
      error: `Could not fetch the model catalogue index: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  if (discovered.length === 0) {
    return {
      snapshot: null,
      error: 'The catalogue source returned zero models. Treating this refresh as failed rather than caching an empty catalogue.',
    };
  }

  const byName = new Map<string, { name: string; description?: string }>();
  for (const entry of discovered) byName.set(entry.name, entry);
  const uniqueModels = Array.from(byName.values());

  const cappedModels =
    uniqueModels.length > MAX_MODELS_PER_REFRESH
      ? uniqueModels.slice(0, MAX_MODELS_PER_REFRESH)
      : uniqueModels;
  if (uniqueModels.length > MAX_MODELS_PER_REFRESH) {
    completeness = 'partial';
    notes.push(
      `Discovered ${uniqueModels.length} models; tag fetching was capped at ${MAX_MODELS_PER_REFRESH} for this refresh.`,
    );
  }

  const models: CatalogModel[] = [];
  for (const entry of cappedModels) {
    try {
      const tags = await source.fetchTags(entry.name);
      models.push({ name: entry.name, description: entry.description, tags });
      if (tags.length === 0) {
        notes.push(`No tags could be parsed for "${entry.name}".`);
      }
    } catch (err) {
      completeness = 'partial';
      notes.push(
        `Failed to fetch tags for "${entry.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const sourceRevision = await fnv1aHash(revisionParts + models.map((m) => m.name).join(','));

  const snapshot: CatalogSnapshot = {
    models,
    sourceRevision,
    fetchedAt: new Date().toISOString(),
    pageCount,
    completeness,
    notes,
  };
  return { snapshot, error: null };
}

// ---------------------------------------------------------------------------
// Persistence and merge helpers
// ---------------------------------------------------------------------------

interface CatalogStoreShape {
  snapshot: CatalogSnapshot | null;
}

export class CatalogCache {
  private readonly store: JsonStore<CatalogStoreShape>;

  constructor() {
    this.store = new JsonStore<CatalogStoreShape>({
      fileName: 'ollama-catalog-cache.json',
      schemaVersion: 1,
      defaultValue: () => ({ snapshot: null }),
    });
  }

  async load(): Promise<CatalogSnapshot | null> {
    const data = await this.store.load();
    return data.snapshot;
  }

  async save(snapshot: CatalogSnapshot): Promise<void> {
    await this.store.save({ snapshot });
  }
}

/** Builds the combined offline-aware state a UI actually renders: the last
 * verified snapshot (if any), whether it is stale, and whether the most
 * recent refresh attempt failed. */
export function buildCatalogState(
  snapshot: CatalogSnapshot | null,
  lastRefreshError: string | null,
  now: Date = new Date(),
): CatalogState {
  const stale = snapshot
    ? now.getTime() - new Date(snapshot.fetchedAt).getTime() > FRESHNESS_WINDOW_MS
    : false;
  return {
    snapshot,
    stale,
    offline: lastRefreshError !== null,
    lastRefreshError: lastRefreshError ?? undefined,
  };
}

/** Merges a catalogue snapshot with the locally-installed model set,
 * without hiding either. Every catalogue tag is present in the result;
 * `installed` says whether it happens to also be on disk right now. */
export function mergeCatalogWithInstalled(
  snapshot: CatalogSnapshot,
  installed: InstalledModel[],
): MergedCatalogEntry[] {
  const installedByRef = new Map<string, InstalledModel>();
  for (const m of installed) installedByRef.set(m.name, m);

  return snapshot.models.map((model) => ({
    model,
    tags: model.tags.map((tag) => {
      const local = installedByRef.get(tag.fullReference);
      return { tag, installed: local !== undefined, installedDetails: local };
    }),
  }));
}
