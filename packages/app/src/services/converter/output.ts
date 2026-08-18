/**
 * Writes one conversion's output to disk. Every write goes through
 * atomic-write.ts (unique temp name, retry on Windows sharing
 * violations), and NEVER overwrites an existing destination unless the
 * caller explicitly passes confirmOverwrite: true — mirroring the
 * project-wide "never overwrite without the caller confirming" rule.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../../atomic-write';
import { DestinationExistsError } from './errors';

export interface WriteConversionOutputOptions {
  destinationPath: string;
  data: Uint8Array;
  confirmOverwrite?: boolean;
}

export async function writeConversionOutput(opts: WriteConversionOutputOptions): Promise<void> {
  if (!opts.confirmOverwrite && (await pathExists(opts.destinationPath))) {
    throw new DestinationExistsError(opts.destinationPath);
  }
  await fsp.mkdir(path.dirname(opts.destinationPath), { recursive: true });
  const buffer = Buffer.from(opts.data.buffer, opts.data.byteOffset, opts.data.byteLength);
  await atomicWriteFile(opts.destinationPath, buffer);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}
