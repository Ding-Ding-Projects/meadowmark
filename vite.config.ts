/**
 * Builds packages/renderer's index.html (the real app shell: 3D canvas +
 * DOM overlay root + custom title bar) into packages/ui/dist/, which is
 * exactly where packages/app/src/main.ts's `loadFile()` call already
 * expects to find it, and exactly what electron-builder.yml's `files`
 * list already packages. Nothing in either of those had to change.
 *
 * `base: './'` is required: an absolute base ('/') resolves against
 * file:// with no server behind it, which is the classic way an Electron
 * renderer loads to a blank page with every asset 404ing in the console.
 */

import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('./packages/renderer', import.meta.url));
const outDir = fileURLToPath(new URL('./packages/ui/dist', import.meta.url));

export default defineConfig({
  root: rootDir,
  base: './',
  build: {
    outDir,
    emptyOutDir: true,
    // No CDN, no remote fonts, no network requests of any kind - bundle
    // absolutely everything into the output so the app works with the
    // network unplugged.
    assetsInlineLimit: 100_000,
  },
  server: {
    strictPort: true,
  },
});
