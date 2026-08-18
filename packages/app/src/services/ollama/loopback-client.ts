/**
 * A small HTTP client restricted, by construction, to Ollama's local
 * loopback API. Every other module in this subsystem that needs to talk to
 * the Ollama server goes through this file rather than calling fetch
 * directly, so the loopback restriction and the payload bounds are
 * enforced in exactly one place.
 *
 * Ollama's default local server listens on 127.0.0.1:11434. This client
 * never resolves a hostname and never follows a redirect to a non-loopback
 * host: the base URL is validated once at construction, and every request
 * is issued against that exact validated origin.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';

/** Hosts considered loopback for the purposes of this client. IPv6 loopback
 * is included because Ollama can be configured to bind there. */
const ALLOWED_LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

const DEFAULT_TIMEOUT_MS = 10_000;
/** Hard ceiling on a single non-streaming response body. Well above any
 * legitimate metadata payload (tag lists, model show, catalogue index),
 * far below what a malformed or hostile response could otherwise force us
 * to buffer. */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
/** Streamed responses (pull progress, chat/generate tokens) are read line
 * by line; this bounds a single NDJSON line rather than the whole stream,
 * since a legitimate stream can run for a long time. */
const MAX_STREAM_LINE_BYTES = 1024 * 1024;

export class OllamaClientError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'unreachable' | 'http-error' | 'bad-payload' | 'aborted',
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'OllamaClientError';
  }
}

function assertLoopback(url: URL): void {
  if (!ALLOWED_LOOPBACK_HOSTS.has(url.hostname)) {
    throw new OllamaClientError(
      `Refusing to contact non-loopback host "${url.hostname}". The Ollama suite manager ` +
        'only ever talks to the local Ollama server.',
      'bad-payload',
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OllamaClientError(`Unsupported protocol "${url.protocol}".`, 'bad-payload');
  }
}

export interface LoopbackClientOptions {
  /** Defaults to Ollama's standard local address. Overridable only for a
   * user-configured non-default port on the SAME machine; the value is
   * still validated as loopback below. */
  baseUrl?: string;
  timeoutMs?: number;
}

export class LoopbackClient {
  readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: LoopbackClientOptions = {}) {
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const parsed = new URL(baseUrl);
    assertLoopback(parsed);
    this.baseUrl = parsed.origin;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private resolve(path: string): URL {
    const url = new URL(path, this.baseUrl);
    assertLoopback(url);
    return url;
  }

  /** Issues a request and returns the parsed JSON body, bounded and
   * validated. Throws OllamaClientError on any failure - callers never see
   * a raw fetch/network exception type. */
  async requestJson<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const text = await this.requestText(method, path, body, signal);
    if (text.length === 0) {
      // Some endpoints (e.g. delete) legitimately return an empty body.
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new OllamaClientError(
        `The Ollama server returned a response that was not valid JSON for ${method} ${path}.`,
        'bad-payload',
      );
    }
  }

  private async requestText(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const url = this.resolve(path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const externalAbort = () => controller.abort();
    signal?.addEventListener('abort', externalAbort);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        redirect: 'error',
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (signal?.aborted) {
        throw new OllamaClientError('Request cancelled.', 'aborted');
      }
      if (controller.signal.aborted) {
        throw new OllamaClientError(
          `Timed out waiting for the Ollama server (${this.timeoutMs}ms) at ${url.pathname}.`,
          'timeout',
        );
      }
      throw new OllamaClientError(
        `Could not reach the Ollama server at ${this.baseUrl}. It may not be running.`,
        'unreachable',
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', externalAbort);
    }

    const rawText = await readBoundedText(response, MAX_RESPONSE_BYTES);

    if (!response.ok) {
      throw new OllamaClientError(
        `Ollama server returned HTTP ${response.status} for ${method} ${path}: ${truncate(rawText, 500)}`,
        'http-error',
        response.status,
      );
    }
    return rawText;
  }

  /**
   * Issues a request whose response body is newline-delimited JSON
   * (pull/generate/chat progress) and invokes `onLine` for each parsed
   * object as it arrives. Malformed lines are skipped and counted, never
   * thrown for individually - a single corrupt progress line must not
   * abort an otherwise-healthy download.
   */
  async requestStream<T>(
    method: 'POST',
    path: string,
    body: unknown,
    onLine: (value: T) => void,
    signal?: AbortSignal,
  ): Promise<{ skippedLines: number }> {
    const url = this.resolve(path);
    const controller = new AbortController();
    const externalAbort = () => controller.abort();
    signal?.addEventListener('abort', externalAbort);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (signal?.aborted) {
        throw new OllamaClientError('Request cancelled.', 'aborted');
      }
      throw new OllamaClientError(
        `Could not reach the Ollama server at ${this.baseUrl}.`,
        'unreachable',
      );
    } finally {
      signal?.removeEventListener('abort', externalAbort);
    }

    if (!response.ok) {
      const errText = await readBoundedText(response, MAX_RESPONSE_BYTES);
      throw new OllamaClientError(
        `Ollama server returned HTTP ${response.status}: ${truncate(errText, 500)}`,
        'http-error',
        response.status,
      );
    }
    if (!response.body) {
      throw new OllamaClientError('The server response had no readable body.', 'bad-payload');
    }

    let skippedLines = 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          if (trimmed.length > MAX_STREAM_LINE_BYTES) {
            skippedLines += 1;
            continue;
          }
          let parsedLine: T;
          try {
            parsedLine = JSON.parse(trimmed) as T;
          } catch {
            // Malformed line only: skip it and keep reading the stream.
            skippedLines += 1;
            continue;
          }
          // A deliberate throw from onLine (e.g. the caller surfacing a
          // server-reported error embedded in an otherwise well-formed
          // line) is a real failure and must propagate, not be counted as
          // a skipped line.
          onLine(parsedLine);
        }
      }
    } finally {
      reader.releaseLock();
    }
    return { skippedLines };
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return response.text();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new OllamaClientError(
          `Response exceeded the ${maxBytes}-byte bound for a non-streaming call.`,
          'bad-payload',
        );
      }
      out += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return out;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

export { DEFAULT_BASE_URL };
