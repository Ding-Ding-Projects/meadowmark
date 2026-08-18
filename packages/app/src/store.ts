/**
 * A small JSON store used for save games, settings, and other main-process
 * owned records. Reads are tolerant (a missing or corrupt file returns the
 * caller's default rather than throwing); writes are atomic via
 * atomic-write.ts.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { atomicWriteJson } from './atomic-write';
import { DATA_DIR_NAME } from './identity';

/** Resolves the Meadowmark application-data directory, independent of any
 * user-chosen display name (see identity.ts). Creates it if missing. */
export function dataDir(): string {
  // app.getPath('userData') is already product-name-scoped by Electron
  // (normally <appData>/<productName>); we pin our own DATA_DIR_NAME
  // beside it instead of trusting that resolution, so a productName
  // change in packaging config can never silently move user data.
  const appDataRoot = path.dirname(app.getPath('userData'));
  return path.join(appDataRoot, DATA_DIR_NAME);
}

export interface StoreEnvelope<T> {
  schemaVersion: number;
  data: T;
}

export interface JsonStoreOptions<T> {
  /** File name, relative to dataDir(), e.g. "settings.json". */
  fileName: string;
  /** Current schema version this build understands. */
  schemaVersion: number;
  /** Value returned when the file is missing, corrupt, or an
   * unrecognized/future schema version is encountered. */
  defaultValue: () => T;
  /** Optional migration from an older schema version to the current one.
   * Given the raw parsed envelope, return an up-to-date value, or `null`
   * to fall back to defaultValue(). */
  migrate?: (envelope: StoreEnvelope<unknown>) => T | null;
}

export class JsonStore<T> {
  private readonly filePath: string;

  constructor(private readonly options: JsonStoreOptions<T>) {
    this.filePath = path.join(dataDir(), options.fileName);
  }

  async load(): Promise<T> {
    let raw: string;

    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch {
      // Missing file (first run, or the user deleted it) is a normal
      // outcome, not an error: start from the default.
      return this.options.defaultValue();
    }

    let parsed: StoreEnvelope<unknown>;
    try {
      parsed = JSON.parse(raw) as StoreEnvelope<unknown>;
    } catch {
      // Corrupt JSON (e.g. an interrupted write on an older build that
      // predates atomic-write, or a hand-edited file). Never throw at the
      // caller for this; degrade to the default rather than crash a save
      // load.
      return this.options.defaultValue();
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.schemaVersion !== 'number'
    ) {
      return this.options.defaultValue();
    }

    if (parsed.schemaVersion === this.options.schemaVersion) {
      return parsed.data as T;
    }

    if (this.options.migrate) {
      const migrated = this.options.migrate(parsed);
      if (migrated !== null) {
        return migrated;
      }
    }

    return this.options.defaultValue();
  }

  async save(value: T): Promise<void> {
    const envelope: StoreEnvelope<T> = {
      schemaVersion: this.options.schemaVersion,
      data: value,
    };
    await atomicWriteJson(this.filePath, envelope);
  }

  get path(): string {
    return this.filePath;
  }
}
