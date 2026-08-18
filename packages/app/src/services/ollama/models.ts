/**
 * Installed/running model queries and mutations against the local Ollama
 * API: list, show (capability metadata), delete, copy.
 *
 * Every response is validated field by field rather than trusted as-is -
 * an unexpected shape produces an OllamaClientError('bad-payload') from
 * loopback-client rather than a silent `undefined` propagating into a UI.
 */

import { LoopbackClient } from './loopback-client';
import type { InstalledModel, ModelCapabilities, ModelDetails, RunningModel } from './types';

const MAX_LIST_ENTRIES = 2000;

interface RawModelEntry {
  name?: unknown;
  model?: unknown;
  digest?: unknown;
  size?: unknown;
  modified_at?: unknown;
  expires_at?: unknown;
  size_vram?: unknown;
  details?: {
    format?: unknown;
    family?: unknown;
    families?: unknown;
    parameter_size?: unknown;
    quantization_level?: unknown;
  };
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function tagFromName(name: string): string {
  const idx = name.lastIndexOf(':');
  return idx >= 0 ? name.slice(idx + 1) : 'latest';
}

function parseDetails(raw: RawModelEntry['details']): ModelDetails {
  if (!raw || typeof raw !== 'object') return {};
  const families = Array.isArray(raw.families)
    ? raw.families.filter((f): f is string => typeof f === 'string')
    : undefined;
  return {
    format: typeof raw.format === 'string' ? raw.format : undefined,
    family: typeof raw.family === 'string' ? raw.family : undefined,
    families,
    parameterSize: typeof raw.parameter_size === 'string' ? raw.parameter_size : undefined,
    quantizationLevel:
      typeof raw.quantization_level === 'string' ? raw.quantization_level : undefined,
  };
}

function parseInstalled(raw: RawModelEntry): InstalledModel | null {
  const name = asString(raw.name ?? raw.model);
  if (!name) return null;
  return {
    name,
    tag: tagFromName(name),
    digest: asString(raw.digest),
    sizeBytes: asNumber(raw.size),
    modifiedAt: asString(raw.modified_at, new Date(0).toISOString()),
    details: parseDetails(raw.details),
  };
}

export async function listInstalledModels(client: LoopbackClient): Promise<InstalledModel[]> {
  const body = await client.requestJson<{ models?: unknown }>('GET', '/api/tags');
  const rawList = Array.isArray(body.models) ? body.models : [];
  const out: InstalledModel[] = [];
  for (const entry of rawList.slice(0, MAX_LIST_ENTRIES)) {
    const parsed = parseInstalled(entry as RawModelEntry);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function listRunningModels(client: LoopbackClient): Promise<RunningModel[]> {
  const body = await client.requestJson<{ models?: unknown }>('GET', '/api/ps');
  const rawList = Array.isArray(body.models) ? body.models : [];
  const out: RunningModel[] = [];
  for (const entry of rawList.slice(0, MAX_LIST_ENTRIES)) {
    const raw = entry as RawModelEntry;
    const base = parseInstalled(raw);
    if (!base) continue;
    out.push({
      ...base,
      expiresAt: asString(raw.expires_at, new Date(0).toISOString()),
      vramBytes: typeof raw.size_vram === 'number' ? raw.size_vram : undefined,
    });
  }
  return out;
}

interface ShowResponse {
  capabilities?: unknown;
  model_info?: Record<string, unknown>;
  details?: RawModelEntry['details'];
}

/** Reports a model's real capabilities as declared by the server. Never
 * infers vision/tools/etc. support from a model's name. */
export async function showModelCapabilities(
  client: LoopbackClient,
  name: string,
): Promise<ModelCapabilities> {
  const body = await client.requestJson<ShowResponse>('POST', '/api/show', { model: name });
  const reportedByServer = Array.isArray(body.capabilities);
  const capabilities = reportedByServer
    ? (body.capabilities as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];

  const modelInfo = body.model_info ?? {};
  let contextLength: number | undefined;
  let parameterCount: number | undefined;
  for (const [key, value] of Object.entries(modelInfo)) {
    if (typeof value !== 'number') continue;
    if (key.endsWith('.context_length') && contextLength === undefined) {
      contextLength = value;
    }
    if (key === 'general.parameter_count' && parameterCount === undefined) {
      parameterCount = value;
    }
  }

  const details = parseDetails(body.details);

  return {
    name,
    capabilities,
    contextLength,
    parameterCount,
    quantizationLevel: details.quantizationLevel,
    families: details.families,
    reportedByServer,
  };
}

export async function deleteModel(client: LoopbackClient, name: string): Promise<void> {
  await client.requestJson('DELETE', '/api/delete', { model: name });
}

export async function copyModel(
  client: LoopbackClient,
  source: string,
  destination: string,
): Promise<void> {
  await client.requestJson('POST', '/api/copy', { source, destination });
}
