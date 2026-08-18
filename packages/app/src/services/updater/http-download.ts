import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';
import { MAX_REDIRECTS, REQUEST_TIMEOUT_MS } from './feed-config.js';

/**
 * Small, dependency-free HTTPS(-only) fetch/download helper.
 *
 * This is the ONE place in the whole application permitted to make a
 * network request, and it is scoped narrowly: it fetches whatever URL
 * it is given, follows a bounded number of redirects, enforces a
 * per-request timeout, and enforces a byte ceiling on the response body
 * so a misbehaving or hostile server cannot exhaust memory. It never
 * sends credentials, cookies, or any header beyond a plain `GET` and a
 * `User-Agent` naming the app and its current version - nothing here
 * ever contacts anything other than the configured update feed host.
 *
 * Plain `http://` is refused except against `localhost` / `127.0.0.1` /
 * `::1`, which exists solely so the feed can be exercised against a
 * local development server; every real feed must be `https://`.
 */

export class DownloadOfflineError extends Error {}
export class DownloadHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
export class DownloadTooLargeError extends Error {}
export class DownloadInsecureUrlError extends Error {}

export interface DownloadOptions {
  readonly maxBytes: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (bytesDownloaded: number, totalBytes: number | null) => void;
  readonly userAgent: string;
}

export interface DownloadResult {
  readonly body: Buffer;
  readonly finalUrl: string;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function assertSecureUrl(url: URL): void {
  if (url.protocol === 'https:') {
    return;
  }
  if (url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname)) {
    return;
  }
  throw new DownloadInsecureUrlError(
    `refusing non-HTTPS URL "${url.toString()}" (plain HTTP is only permitted against localhost for development)`,
  );
}

/** Fetches a URL's body into memory, following redirects, enforcing HTTPS and a byte ceiling. */
export function fetchBody(rawUrl: string, options: DownloadOptions): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    let redirectsRemaining = MAX_REDIRECTS;
    let currentUrl = rawUrl;

    const attempt = (): void => {
      let url: URL;
      try {
        url = new URL(currentUrl);
      } catch (error) {
        reject(new DownloadInsecureUrlError(`malformed update feed URL "${currentUrl}": ${String(error)}`));
        return;
      }

      try {
        assertSecureUrl(url);
      } catch (error) {
        reject(error as Error);
        return;
      }

      const transport = url.protocol === 'https:' ? https : http;
      const request = transport.get(
        url,
        {
          headers: { 'User-Agent': options.userAgent, Accept: '*/*' },
          timeout: REQUEST_TIMEOUT_MS,
          signal: options.signal,
        },
        (response) => {
          const statusCode = response.statusCode ?? 0;

          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            response.resume();
            if (redirectsRemaining <= 0) {
              reject(new DownloadHttpError(`too many redirects fetching "${rawUrl}"`, statusCode));
              return;
            }
            redirectsRemaining -= 1;
            currentUrl = new URL(response.headers.location, url).toString();
            attempt();
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            response.resume();
            reject(new DownloadHttpError(`update feed returned HTTP ${statusCode} for "${currentUrl}"`, statusCode));
            return;
          }

          const contentLengthHeader = response.headers['content-length'];
          const totalBytes = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null;
          if (totalBytes !== null && totalBytes > options.maxBytes) {
            response.destroy();
            reject(
              new DownloadTooLargeError(
                `update feed declared ${totalBytes} bytes for "${currentUrl}", exceeding the ${options.maxBytes} byte ceiling`,
              ),
            );
            return;
          }

          const chunks: Buffer[] = [];
          let received = 0;

          response.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (received > options.maxBytes) {
              response.destroy();
              reject(
                new DownloadTooLargeError(
                  `response body for "${currentUrl}" exceeded the ${options.maxBytes} byte ceiling`,
                ),
              );
              return;
            }
            chunks.push(chunk);
            options.onProgress?.(received, totalBytes);
          });

          response.on('end', () => {
            resolve({ body: Buffer.concat(chunks), finalUrl: currentUrl });
          });

          response.on('error', (error) => {
            reject(wrapAsOfflineIfNetworkError(error, currentUrl));
          });
        },
      );

      request.on('timeout', () => {
        request.destroy(new DownloadOfflineError(`request to "${currentUrl}" timed out after ${REQUEST_TIMEOUT_MS}ms`));
      });

      request.on('error', (error) => {
        reject(wrapAsOfflineIfNetworkError(error, currentUrl));
      });
    };

    attempt();
  });
}

const NETWORK_ERROR_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

function wrapAsOfflineIfNetworkError(error: unknown, url: string): Error {
  if (error instanceof DownloadOfflineError) {
    return error;
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code && NETWORK_ERROR_CODES.has(code)) {
    return new DownloadOfflineError(`could not reach "${url}": ${code}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}
