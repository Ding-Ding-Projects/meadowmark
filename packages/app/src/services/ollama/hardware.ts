/**
 * Hardware detection and per-variant fit evidence.
 *
 * This module never infers anything from a model's name. Every verdict is
 * built from: (a) real detected system facts (RAM, GPU/VRAM estimate, free
 * disk) and (b) real declared model metadata (blob size, parameter count,
 * quantization, declared context window) - or, where either side is
 * unavailable, an explicit assumption that is carried in the evidence
 * rather than silently treated as zero.
 *
 * GPU/VRAM detection on Windows is inherently approximate: many drivers
 * report a capped or otherwise unreliable AdapterRAM figure. Every GpuInfo
 * therefore carries its own `vramEstimateReliable` flag, and a verdict
 * built on an unreliable estimate is never allowed to be more confident
 * than "Runs with limits".
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CatalogTag, FitEvidence, FitVerdict, GpuInfo, HardwareSnapshot } from './types';

const execFileAsync = promisify(execFile);
const HARDWARE_QUERY_TIMEOUT_MS = 8_000;

/** A VRAM figure at or above this looks like the well-known 32-bit
 * AdapterRAM overflow/cap some Windows drivers report, not a real value. */
const SUSPICIOUS_VRAM_CAP_BYTES = 4 * 1024 ** 3 - 1;

interface RawGpuEntry {
  Name?: string;
  AdapterRAM?: number;
  DriverVersion?: string;
}

async function queryGpusWindows(): Promise<{ gpus: GpuInfo[]; warnings: string[] }> {
  const warnings: string[] = [];
  const command =
    'Get-CimInstance Win32_VideoController | ' +
    'Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress';
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { timeout: HARDWARE_QUERY_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const trimmed = stdout.trim();
    if (!trimmed) {
      warnings.push('GPU query returned no output.');
      return { gpus: [], warnings };
    }
    const parsed: unknown = JSON.parse(trimmed);
    const entries: RawGpuEntry[] = Array.isArray(parsed)
      ? (parsed as RawGpuEntry[])
      : [parsed as RawGpuEntry];
    const gpus: GpuInfo[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry.Name !== 'string' || entry.Name.length === 0) continue;
      const adapterRam = typeof entry.AdapterRAM === 'number' ? entry.AdapterRAM : undefined;
      const reliable =
        adapterRam !== undefined && adapterRam > 0 && adapterRam < SUSPICIOUS_VRAM_CAP_BYTES;
      if (adapterRam !== undefined && !reliable) {
        warnings.push(
          `Reported VRAM for "${entry.Name}" (${adapterRam} bytes) looks like a driver-capped or invalid value; treating it as unreliable.`,
        );
      }
      gpus.push({
        name: entry.Name,
        driverVersion: typeof entry.DriverVersion === 'string' ? entry.DriverVersion : undefined,
        vramBytesEstimate: adapterRam,
        vramEstimateReliable: reliable,
      });
    }
    return { gpus, warnings };
  } catch (err) {
    warnings.push(
      `Could not query GPU information: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { gpus: [], warnings };
  }
}

async function queryFreeDiskBytes(targetPath: string): Promise<{ bytes: number | null; warning: string | null }> {
  const drive = path.parse(path.resolve(targetPath)).root.replace(/\\$/, '') || 'C:';
  const command = `(Get-PSDrive -Name '${drive.replace(/:$/, '')}').Free`;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { timeout: HARDWARE_QUERY_TIMEOUT_MS, windowsHide: true, maxBuffer: 65536 },
    );
    const value = Number.parseInt(stdout.trim(), 10);
    if (!Number.isFinite(value) || value < 0) {
      return { bytes: null, warning: 'Disk-free query returned a value that could not be parsed.' };
    }
    return { bytes: value, warning: null };
  } catch (err) {
    return {
      bytes: null,
      warning: `Could not query free disk space: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Detects the current hardware snapshot. `modelsDirHint` should be the
 * directory Ollama stores its blobs in (or any path on the same volume) so
 * the free-disk figure reflects the right drive; when unknown, the OS temp
 * directory's volume is used as a reasonable default.
 */
export async function detectHardware(modelsDirHint?: string): Promise<HardwareSnapshot> {
  const warnings: string[] = [];

  const totalRamBytes = os.totalmem();
  const freeRamBytes = os.freemem();

  const { gpus, warnings: gpuWarnings } = await queryGpusWindows();
  warnings.push(...gpuWarnings);

  const diskTarget = modelsDirHint ?? os.tmpdir();
  let freeDiskBytes: number | null = null;
  try {
    await fs.access(diskTarget);
    const { bytes, warning } = await queryFreeDiskBytes(diskTarget);
    freeDiskBytes = bytes;
    if (warning) warnings.push(warning);
  } catch {
    const { bytes, warning } = await queryFreeDiskBytes(os.tmpdir());
    freeDiskBytes = bytes;
    if (warning) warnings.push(warning);
  }

  return {
    totalRamBytes,
    freeRamBytes,
    gpus,
    freeDiskBytes,
    detectedAt: new Date().toISOString(),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Fit evaluation
// ---------------------------------------------------------------------------

const BYTES_PER_GIB = 1024 ** 3;

function formatGiB(bytes: number): string {
  return `${(bytes / BYTES_PER_GIB).toFixed(1)} GiB`;
}

/** Rough context-window memory overhead estimate: a small constant per
 * token per layer scale is not knowable without the model's real config,
 * so this is deliberately a coarse per-context-length multiplier, always
 * disclosed as an assumption rather than presented as a measurement. */
function estimateContextOverheadBytes(contextLength: number): number {
  // ~128 KB per 1000 tokens of context is a conservative, deliberately
  // rough estimate for KV-cache overhead across common architectures.
  return Math.round((contextLength / 1000) * 128 * 1024);
}

/**
 * Produces a fit verdict for one catalogue tag against one hardware
 * snapshot. Every branch that lacks real metadata falls back to
 * 'unknown' (or a strictly more conservative verdict) rather than
 * guessing - and every assumption made along the way is recorded.
 */
export function evaluateFit(tag: CatalogTag, hardware: HardwareSnapshot): FitEvidence {
  const evaluatedAt = new Date().toISOString();
  const reasons: string[] = [];
  const assumptions: string[] = [];

  if (tag.sizeBytes === undefined) {
    return {
      verdict: 'unknown',
      reasons: ['No declared download/blob size is available for this tag.'],
      assumptions: [],
      evaluatedAt,
    };
  }

  const modelSizeBytes = tag.sizeBytes;
  reasons.push(`Model blob size is ${formatGiB(modelSizeBytes)}.`);

  let contextOverheadBytes = 0;
  if (tag.contextLength !== undefined) {
    contextOverheadBytes = estimateContextOverheadBytes(tag.contextLength);
    reasons.push(
      `Declared context window of ${tag.contextLength} tokens adds an estimated ${formatGiB(contextOverheadBytes)} of working memory.`,
    );
  } else {
    assumptions.push(
      'No declared context window; runtime working-memory overhead beyond the model weights was not estimated.',
    );
  }

  const requiredBytes = modelSizeBytes + contextOverheadBytes;

  // Prefer a reliable GPU/VRAM figure; otherwise fall back to system RAM,
  // since Ollama can run on CPU. Falling back to RAM is itself recorded as
  // an assumption about the execution path, not a claim about GPU fit.
  const reliableGpu = hardware.gpus.find((g) => g.vramEstimateReliable && g.vramBytesEstimate);
  let availableBytes: number;
  let usingGpu: boolean;

  if (reliableGpu?.vramBytesEstimate !== undefined) {
    availableBytes = reliableGpu.vramBytesEstimate;
    usingGpu = true;
    reasons.push(`Detected GPU "${reliableGpu.name}" reports ${formatGiB(availableBytes)} of VRAM.`);
  } else {
    availableBytes = hardware.freeRamBytes;
    usingGpu = false;
    if (hardware.gpus.length > 0) {
      assumptions.push(
        'No reliably-detected GPU VRAM figure was available; evaluated against free system RAM instead, assuming CPU or partial-offload execution.',
      );
    } else {
      assumptions.push('No GPU was detected; evaluated against free system RAM (CPU execution).');
    }
    reasons.push(`Free system RAM is ${formatGiB(availableBytes)}.`);
  }

  if (hardware.freeDiskBytes !== null && hardware.freeDiskBytes < modelSizeBytes) {
    reasons.push(
      `Free disk space (${formatGiB(hardware.freeDiskBytes)}) is less than the model's download size.`,
    );
    return { verdict: 'unlikely', reasons, assumptions, evaluatedAt };
  }
  if (hardware.freeDiskBytes === null) {
    assumptions.push('Free disk space could not be determined; disk fit was not evaluated.');
  }

  let verdict: FitVerdict;
  if (availableBytes >= requiredBytes * 1.25) {
    verdict = 'runs-well';
  } else if (availableBytes >= requiredBytes) {
    verdict = 'runs-with-limits';
  } else if (availableBytes >= requiredBytes * 0.6) {
    verdict = 'unlikely';
  } else {
    verdict = 'unlikely';
  }

  // An unreliable or assumption-heavy basis can never produce the most
  // confident verdict.
  if (verdict === 'runs-well' && (!usingGpu || assumptions.length > 0)) {
    verdict = 'runs-with-limits';
  }

  return { verdict, reasons, assumptions, evaluatedAt };
}
