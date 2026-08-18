/**
 * Persisted, NON-secret metadata for authenticator entries and groups:
 * id, issuer, account name, OTP parameters, ordering, and group
 * membership. The actual TOTP/HOTP secret never appears here — see
 * vault.ts, which stores it separately, encrypted, keyed by the same
 * entry id this store uses.
 */

import { JsonStore } from '../../store.js';
import { DEFAULT_OTP_ALGORITHM, DEFAULT_OTP_DIGITS, DEFAULT_OTP_PERIOD_SECONDS } from './otp.js';
import type { OtpAlgorithm } from './otp.js';

export const AUTH_ENTRIES_SCHEMA_VERSION = 1;

export interface AuthGroup {
  id: string;
  name: string;
  order: number;
}

export interface AuthEntry {
  id: string;
  issuer: string;
  account: string;
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
  order: number;
  groupId: string | null;
  /** ISO-8601 timestamp of when this entry was created (pairing
   * confirmed), for display and for sorting when order ties. */
  createdAt: string;
}

export interface AuthEntriesFile {
  entries: AuthEntry[];
  groups: AuthGroup[];
}

function defaultAuthEntriesFile(): AuthEntriesFile {
  return { entries: [], groups: [] };
}

/**
 * Wraps a JsonStore<AuthEntriesFile> with the small amount of domain
 * logic (ordering, id lookup) the authenticator service needs, so
 * auth-service.ts can work in terms of "the entry list" rather than
 * raw file I/O.
 */
export class AuthEntriesStore {
  private readonly jsonStore: JsonStore<AuthEntriesFile>;

  constructor() {
    this.jsonStore = new JsonStore<AuthEntriesFile>({
      fileName: 'auth/entries.json',
      schemaVersion: AUTH_ENTRIES_SCHEMA_VERSION,
      defaultValue: defaultAuthEntriesFile,
    });
  }

  async load(): Promise<AuthEntriesFile> {
    return this.jsonStore.load();
  }

  async save(file: AuthEntriesFile): Promise<void> {
    await this.jsonStore.save(file);
  }

  async listEntries(): Promise<AuthEntry[]> {
    const file = await this.load();
    return [...file.entries].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  }

  async listGroups(): Promise<AuthGroup[]> {
    const file = await this.load();
    return [...file.groups].sort((a, b) => a.order - b.order);
  }

  async addEntry(entry: AuthEntry): Promise<void> {
    const file = await this.load();
    file.entries.push(entry);
    await this.save(file);
  }

  async removeEntry(entryId: string): Promise<boolean> {
    const file = await this.load();
    const before = file.entries.length;
    file.entries = file.entries.filter((e) => e.id !== entryId);
    if (file.entries.length === before) {
      return false;
    }
    await this.save(file);
    return true;
  }

  async updateEntry(
    entryId: string,
    patch: Partial<Pick<AuthEntry, 'issuer' | 'account' | 'order' | 'groupId'>>,
  ): Promise<AuthEntry | null> {
    const file = await this.load();
    const entry = file.entries.find((e) => e.id === entryId);
    if (!entry) {
      return null;
    }
    Object.assign(entry, patch);
    await this.save(file);
    return entry;
  }

  /** Replaces the full ordering of entries to match `orderedIds`
   * exactly. Ids not present in `orderedIds` keep their existing order
   * value and are placed after the reordered ones, so a caller that only
   * knows about a filtered subset of entries can never silently drop the
   * rest. */
  async reorderEntries(orderedIds: readonly string[]): Promise<void> {
    const file = await this.load();
    const indexOf = new Map(orderedIds.map((id, i) => [id, i]));
    let nextOrder = orderedIds.length;
    for (const entry of file.entries) {
      const explicitIndex = indexOf.get(entry.id);
      entry.order = explicitIndex ?? nextOrder++;
    }
    await this.save(file);
  }

  async addGroup(group: AuthGroup): Promise<void> {
    const file = await this.load();
    file.groups.push(group);
    await this.save(file);
  }

  async renameGroup(groupId: string, name: string): Promise<AuthGroup | null> {
    const file = await this.load();
    const group = file.groups.find((g) => g.id === groupId);
    if (!group) {
      return null;
    }
    group.name = name;
    await this.save(file);
    return group;
  }

  /** Removes a group and un-assigns every entry that belonged to it
   * (rather than deleting those entries — a deleted group must never
   * silently delete authenticator entries along with it). */
  async removeGroup(groupId: string): Promise<boolean> {
    const file = await this.load();
    const before = file.groups.length;
    file.groups = file.groups.filter((g) => g.id !== groupId);
    if (file.groups.length === before) {
      return false;
    }
    for (const entry of file.entries) {
      if (entry.groupId === groupId) {
        entry.groupId = null;
      }
    }
    await this.save(file);
    return true;
  }

  async reorderGroups(orderedIds: readonly string[]): Promise<void> {
    const file = await this.load();
    const indexOf = new Map(orderedIds.map((id, i) => [id, i]));
    let nextOrder = orderedIds.length;
    for (const group of file.groups) {
      const explicitIndex = indexOf.get(group.id);
      group.order = explicitIndex ?? nextOrder++;
    }
    await this.save(file);
  }
}

export const DEFAULT_ENTRY_OTP_PARAMS = {
  algorithm: DEFAULT_OTP_ALGORITHM,
  digits: DEFAULT_OTP_DIGITS,
  period: DEFAULT_OTP_PERIOD_SECONDS,
};
