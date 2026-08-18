/**
 * Health/status probing for the local Ollama server.
 *
 * This is the single source of truth for the distinction the rest of the
 * subsystem must never blur: missing vs. stopped vs. unhealthy vs. healthy.
 * No caller anywhere in this subsystem may render a generic spinner or a
 * fake success in place of one of these states.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { LoopbackClient, OllamaClientError } from './loopback-client';
import type { OllamaConnectionState, OllamaDiagnosis } from './types';

/** Well-known install locations to check when the server is unreachable, so
 * we can distinguish "not installed" from "installed but not running".
 * Detection here is advisory only for the diagnosis message; it never
 * causes a network call or a process launch. */
function candidateInstallPaths(): string[] {
  const paths: string[] = [];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    paths.push(path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'));
    paths.push(path.join(localAppData, 'Programs', 'Ollama', 'app.exe'));
  }
  const programFiles = process.env['ProgramFiles'];
  if (programFiles) {
    paths.push(path.join(programFiles, 'Ollama', 'ollama.exe'));
  }
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  if (programFilesX86) {
    paths.push(path.join(programFilesX86, 'Ollama', 'ollama.exe'));
  }
  return paths;
}

async function anyPathExists(paths: string[]): Promise<boolean> {
  for (const p of paths) {
    try {
      await fs.access(p);
      return true;
    } catch {
      // Not found at this candidate; keep looking.
    }
  }
  return false;
}

interface VersionResponse {
  version?: unknown;
}

/**
 * Probes the local Ollama server and returns a definitive diagnosis. Never
 * throws: every failure path is captured into the returned diagnosis so
 * callers can render it directly.
 */
export async function diagnoseConnection(client: LoopbackClient): Promise<OllamaDiagnosis> {
  const checkedAt = new Date().toISOString();
  const baseUrl = client.baseUrl;

  try {
    const body = await client.requestJson<VersionResponse>('GET', '/api/version');
    const version = typeof body.version === 'string' ? body.version : undefined;
    return {
      state: 'healthy',
      detail: version
        ? `Ollama server responded to a version probe (v${version}).`
        : 'Ollama server responded to a version probe, though it did not report a version string.',
      checkedAt,
      serverVersion: version,
      baseUrl,
    };
  } catch (err) {
    return diagnoseFromError(err, checkedAt, baseUrl);
  }
}

async function diagnoseFromError(
  err: unknown,
  checkedAt: string,
  baseUrl: string,
): Promise<OllamaDiagnosis> {
  const base: Omit<OllamaDiagnosis, 'state' | 'detail'> = { checkedAt, baseUrl };

  if (!(err instanceof OllamaClientError)) {
    return {
      ...base,
      state: 'unhealthy',
      detail: `An unexpected error occurred while probing the Ollama server: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  if (err.kind === 'unreachable') {
    const installed = await anyPathExists(candidateInstallPaths());
    if (installed) {
      return {
        ...base,
        state: 'service-stopped',
        detail: `An Ollama installation was found on this machine, but no server is answering at ${baseUrl}. Start Ollama and try again.`,
      };
    }
    return {
      ...base,
      state: 'ollama-missing',
      detail:
        'No Ollama server responded at the local address, and no known Ollama installation was found on this machine. Install Ollama to use this feature.',
    };
  }

  if (err.kind === 'timeout') {
    return {
      ...base,
      state: 'unhealthy',
      detail: `The Ollama server at ${baseUrl} did not respond in time. It may be overloaded or stuck.`,
    };
  }

  if (err.kind === 'http-error') {
    return {
      ...base,
      state: 'unhealthy',
      detail: `The Ollama server at ${baseUrl} responded with an error (HTTP ${err.statusCode ?? '?'}): ${err.message}`,
    };
  }

  if (err.kind === 'bad-payload') {
    return {
      ...base,
      state: 'unhealthy',
      detail: `The Ollama server at ${baseUrl} responded, but with a payload this app does not trust: ${err.message}`,
    };
  }

  return {
    ...base,
    state: 'unhealthy',
    detail: err.message,
  };
}

export type { OllamaConnectionState };
