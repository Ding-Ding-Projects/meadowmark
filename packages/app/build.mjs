// Builds the Electron main process and preload bridge as standalone CommonJS
// bundles. Electron's main process and preload scripts are still loaded as
// CJS, so this deliberately does not follow the ESM-everywhere convention
// used elsewhere in the workspace.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
};

async function main() {
  await build({
    ...shared,
    entryPoints: [path.join(here, 'src/main.ts')],
    outfile: path.join(here, 'dist/main.cjs'),
  });

  await build({
    ...shared,
    entryPoints: [path.join(here, 'src/preload.ts')],
    outfile: path.join(here, 'dist/preload.cjs'),
  });
}

main().catch((err) => {
  console.error('[app] build failed:', err);
  process.exitCode = 1;
});
