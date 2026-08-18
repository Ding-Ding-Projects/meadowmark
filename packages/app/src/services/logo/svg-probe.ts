/**
 * Bounded SVG header probe.
 *
 * This module does NOT parse or rasterize SVG. It never runs a real XML
 * parser, never resolves an external entity or `<use>`/`xlink:href`
 * reference, and never expands anything -- all of which are classic SVG
 * attack surfaces (XXE, entity-expansion "billion laughs" bombs, remote
 * resource fetches). It only regex-scans a bounded prefix of the file to
 * extract a rough size for identification/bounds purposes and to flag
 * red flags worth naming explicitly in an "unsupported" message.
 */
import { SVG_PROBE_MAX_BYTES } from './bounds';

export interface SvgProbeResult {
  readonly width?: number;
  readonly height?: number;
  readonly hasExternalEntity: boolean;
  readonly hasScript: boolean;
}

function parseLength(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /^(\d+(?:\.\d+)?)/.exec(value.trim());
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Extracts a best-effort width/height from an SVG's opening tag and
 * flags whether the bounded prefix contains an entity declaration or
 * inline script -- either of which is reason enough to keep SVG sources
 * fully unsupported regardless of how well-formed the rest looks.
 */
export function probeSvg(buf: Buffer): SvgProbeResult {
  const prefix = buf.subarray(0, Math.min(buf.length, SVG_PROBE_MAX_BYTES)).toString('utf8');

  const hasExternalEntity = /<!ENTITY/i.test(prefix) || /<!DOCTYPE[^>]*SYSTEM/i.test(prefix);
  const hasScript = /<script[\s>]/i.test(prefix);

  const svgTagMatch = /<svg\b[^>]*>/i.exec(prefix);
  const svgTag = svgTagMatch?.[0] ?? '';

  const widthMatch = /\bwidth\s*=\s*"([^"]*)"/i.exec(svgTag);
  const heightMatch = /\bheight\s*=\s*"([^"]*)"/i.exec(svgTag);
  let width = parseLength(widthMatch?.[1]);
  let height = parseLength(heightMatch?.[1]);

  if (width === undefined || height === undefined) {
    const viewBoxMatch = /\bviewBox\s*=\s*"([^"]*)"/i.exec(svgTag);
    const parts = viewBoxMatch?.[1]?.trim().split(/[\s,]+/).map(Number);
    if (parts && parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      width ??= parts[2];
      height ??= parts[3];
    }
  }

  return { width, height, hasExternalEntity, hasScript };
}
