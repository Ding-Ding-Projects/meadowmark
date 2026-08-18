/**
 * Persists a generated logo asset set to the app's own private data
 * directory, and nowhere else. This module never touches the network,
 * never touches the app's stable identity, and never leaves the
 * previously-applied logo unusable if a write fails partway through.
 *
 * Identity boundary: `userDataDir` is the caller's Electron
 * `app.getPath('userData')` (already namespaced by the app's own fixed
 * `DATA_DIR_NAME`, per `identity.ts` -- that namespacing is main.ts's
 * job, done once at startup, not this module's). This module only ever
 * appends a `logo` subdirectory beneath whatever it is given. It never
 * reads, writes, or derives `APP_ID`, `DATA_DIR_NAME`, or any other
 * identity constant: a custom logo changes what is drawn on screen and
 * nothing about where the app's data lives or how it is addressed.
 *
 * Atomicity across a whole asset set: `atomicWriteFile` makes each
 * individual file write crash-safe, but a logo selection is many files
 * (several PNG sizes plus one .ico) that must all apply together or not
 * at all. To get that without a filesystem transaction, new asset files
 * are written into a fresh, uniquely-named subdirectory first; only
 * after every one of those writes has succeeded does the manifest --
 * the single file that says "this is the current logo" -- get
 * atomically rewritten to point at it. If anything fails while writing
 * the new subdirectory's files, the manifest is never touched, so the
 * previously active logo (whatever its manifest still points at) stays
 * active. The now-orphaned partial subdirectory is then removed on a
 * best-effort basis.
 */
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile, atomicWriteJson } from '../../atomic-write';
import { LogoStorageError } from './errors';
import type { LogoAssetSet, LogoManifest, LogoSelection } from './types';

const MANIFEST_SCHEMA_VERSION = 1 as const;
const MANIFEST_FILE_NAME = 'manifest.json';
const ICO_FILE_NAME = 'logo.ico';

function logoRootDir(userDataDir: string): string {
  return path.join(userDataDir, 'logo');
}

function manifestPath(userDataDir: string): string {
  return path.join(logoRootDir(userDataDir), MANIFEST_FILE_NAME);
}

function variantFileName(size: number): string {
  return `logo-${size}.png`;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function newAssetDirName(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(6).toString('hex');
  return `assets-${timestamp}-${random}`;
}

/**
 * Reads the current logo manifest, or `null` if none has ever been
 * written (a fresh install, or after `clearLogoSelection`). A corrupt or
 * unreadable manifest fails closed to `null` rather than throwing --
 * "no custom logo is currently recorded" is always a safe state for the
 * caller to fall back to its own compiled-in default from.
 */
export async function readLogoManifest(userDataDir: string): Promise<LogoManifest | null> {
  try {
    const raw = await fs.readFile(manifestPath(userDataDir), 'utf8');
    const parsed = JSON.parse(raw) as Partial<LogoManifest>;
    if (parsed.schemaVersion !== MANIFEST_SCHEMA_VERSION) return null;
    if (!parsed.selection || !parsed.assetDir || !Array.isArray(parsed.variantFiles) || !parsed.icoFileName) {
      return null;
    }
    return parsed as LogoManifest;
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: unknown }).code : undefined;
    if (code === 'ENOENT') return null;
    // Any other read/parse failure (corrupt JSON, permissions, ...) is
    // treated the same way: fail closed to "nothing recorded" rather
    // than surfacing a crash for a file this module fully owns.
    return null;
  }
}

/**
 * Writes a freshly generated asset set into a new, uniquely-named asset
 * subdirectory, then atomically commits the manifest to point at it.
 * The previous asset directory (if any) is removed only after the new
 * manifest write has succeeded, and removal failures are logged as
 * non-fatal: an orphaned old asset directory costs disk space, never
 * correctness.
 */
export async function persistLogoAssetSet(
  userDataDir: string,
  assetSet: LogoAssetSet,
  selection: LogoSelection,
): Promise<LogoManifest> {
  const previousManifest = await readLogoManifest(userDataDir);

  const assetDirName = newAssetDirName();
  const assetDirPath = path.join(logoRootDir(userDataDir), assetDirName);

  try {
    await ensureDir(assetDirPath);

    for (const variant of assetSet.variants) {
      await atomicWriteFile(path.join(assetDirPath, variantFileName(variant.size)), variant.png);
    }
    await atomicWriteFile(path.join(assetDirPath, ICO_FILE_NAME), assetSet.ico);

    const manifest: LogoManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      selection,
      sourceWidth: assetSet.sourceWidth,
      sourceHeight: assetSet.sourceHeight,
      generatedAt: assetSet.generatedAt,
      assetDir: assetDirName,
      variantFiles: assetSet.variants.map((v) => ({ size: v.size, fileName: variantFileName(v.size) })),
      icoFileName: ICO_FILE_NAME,
    };

    // This is the single commit point: once this write lands, the new
    // logo is the active one. Everything before it can fail freely
    // without affecting what is currently applied.
    await atomicWriteJson(manifestPath(userDataDir), manifest);

    if (previousManifest && previousManifest.assetDir !== assetDirName) {
      await removeAssetDirBestEffort(userDataDir, previousManifest.assetDir);
    }

    return manifest;
  } catch (err) {
    await removeAssetDirBestEffort(userDataDir, assetDirName);
    const message = err instanceof Error ? err.message : String(err);
    throw new LogoStorageError(`Failed to save the new logo; the previous logo remains active. ${message}`);
  }
}

async function removeAssetDirBestEffort(userDataDir: string, assetDirName: string): Promise<void> {
  try {
    await fs.rm(path.join(logoRootDir(userDataDir), assetDirName), { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only. Leaving an orphaned directory behind is
    // a (bounded, rare) waste of disk space, never a correctness or
    // security problem, so a cleanup failure is not escalated.
  }
}

/** Reads one asset file (a PNG variant or the .ico) referenced by a manifest. */
export async function readLogoAsset(
  userDataDir: string,
  manifest: LogoManifest,
  which: { readonly size: number } | 'ico',
): Promise<Buffer> {
  const fileName =
    which === 'ico'
      ? manifest.icoFileName
      : manifest.variantFiles.find((v) => v.size === which.size)?.fileName;
  if (!fileName) {
    throw new LogoStorageError(`Manifest has no asset for the requested size.`);
  }
  const filePath = path.join(logoRootDir(userDataDir), manifest.assetDir, fileName);
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LogoStorageError(`Failed to read stored logo asset: ${message}`);
  }
}

/**
 * Clears the current logo selection: removes the manifest (so
 * `readLogoManifest` again returns `null`, meaning "use the shipped
 * default") and best-effort purges every asset subdirectory under the
 * logo storage root, including any orphaned ones a prior failed write
 * left behind.
 */
export async function clearLogoSelection(userDataDir: string): Promise<void> {
  const root = logoRootDir(userDataDir);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: unknown }).code : undefined;
    if (code === 'ENOENT') return; // Nothing to clear.
    const message = err instanceof Error ? err.message : String(err);
    throw new LogoStorageError(`Failed to list logo storage directory: ${message}`);
  }

  for (const entry of entries) {
    await fs.rm(path.join(root, entry), { recursive: true, force: true }).catch(() => {
      // Best-effort: a single stubborn file/directory should not block
      // clearing the rest, and clearing is itself best-effort cleanup.
    });
  }
}
