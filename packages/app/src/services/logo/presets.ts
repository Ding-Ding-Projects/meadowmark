/**
 * Shipped app-logo presets.
 *
 * Rendered procedurally at a fixed canonical resolution (no binary
 * asset files to keep in sync with this lane), using nothing but plain
 * per-pixel drawing on an RGBA8 buffer. Every preset is deterministic:
 * calling `renderPreset(id)` twice produces byte-identical output.
 */
import { createImage } from './image-ops';
import { UnknownPresetError } from './errors';
import type { LogoPresetSummary, RGBA8Image, RGBAColor } from './types';

export const PRESET_CANVAS_SIZE = 512;

function setPixel(image: RGBA8Image, x: number, y: number, color: RGBAColor): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const idx = (y * image.width + x) * 4;
  image.data[idx] = color.r;
  image.data[idx + 1] = color.g;
  image.data[idx + 2] = color.b;
  image.data[idx + 3] = color.a;
}

function fillCircle(image: RGBA8Image, cx: number, cy: number, radius: number, color: RGBAColor): void {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(image.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(image.height - 1, Math.ceil(cy + radius));
  const r2 = radius * radius;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      if (dx * dx + dy * dy <= r2) setPixel(image, x, y, color);
    }
  }
}

function fillRect(image: RGBA8Image, x0: number, y0: number, width: number, height: number, color: RGBAColor): void {
  const minX = Math.max(0, Math.floor(x0));
  const minY = Math.max(0, Math.floor(y0));
  const maxX = Math.min(image.width, Math.ceil(x0 + width));
  const maxY = Math.min(image.height, Math.ceil(y0 + height));
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) setPixel(image, x, y, color);
  }
}

/** Fills a triangle using a straightforward barycentric-coordinate scan. */
function fillTriangle(
  image: RGBA8Image,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  color: RGBAColor,
): void {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(image.width - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(image.height - 1, Math.ceil(Math.max(ay, by, cy)));

  const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (denom === 0) return;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom;
      const w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom;
      const w3 = 1 - w1 - w2;
      if (w1 >= 0 && w2 >= 0 && w3 >= 0) setPixel(image, x, y, color);
    }
  }
}

const PRESET_IDS = ['harvest-circle', 'barn-mark', 'sprout-diamond'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const PRESET_SUMMARIES: readonly LogoPresetSummary[] = [
  {
    id: 'harvest-circle',
    label: 'Harvest Circle',
    description: 'A warm gold sun over a green horizon band.',
  },
  {
    id: 'barn-mark',
    label: 'Barn Mark',
    description: 'A simple red barn silhouette with a cream door.',
  },
  {
    id: 'sprout-diamond',
    label: 'Sprout Diamond',
    description: 'A leaf-green diamond with a lighter sprout accent.',
  },
];

function renderHarvestCircle(): RGBA8Image {
  const size = PRESET_CANVAS_SIZE;
  const image = createImage(size, size);
  const gold: RGBAColor = { r: 232, g: 168, b: 64, a: 255 };
  const green: RGBAColor = { r: 74, g: 124, b: 62, a: 255 };
  fillCircle(image, size / 2, size / 2, size * 0.42, gold);
  fillRect(image, 0, size * 0.68, size, size * 0.32, green);
  return image;
}

function renderBarnMark(): RGBA8Image {
  const size = PRESET_CANVAS_SIZE;
  const image = createImage(size, size);
  const red: RGBAColor = { r: 176, g: 60, b: 48, a: 255 };
  const darkRed: RGBAColor = { r: 128, g: 40, b: 32, a: 255 };
  const cream: RGBAColor = { r: 244, g: 232, b: 208, a: 255 };

  const bodyTop = size * 0.42;
  const bodyHeight = size * 0.44;
  fillRect(image, size * 0.14, bodyTop, size * 0.72, bodyHeight, red);
  fillTriangle(image, size * 0.1, bodyTop, size * 0.5, size * 0.1, size * 0.9, bodyTop, darkRed);
  const doorWidth = size * 0.16;
  fillRect(image, size / 2 - doorWidth / 2, bodyTop + bodyHeight - size * 0.24, doorWidth, size * 0.24, cream);
  return image;
}

function renderSproutDiamond(): RGBA8Image {
  const size = PRESET_CANVAS_SIZE;
  const image = createImage(size, size);
  const leaf: RGBAColor = { r: 62, g: 126, b: 74, a: 255 };
  const lightLeaf: RGBAColor = { r: 142, g: 196, b: 108, a: 255 };
  const cx = size / 2;
  const cy = size / 2;
  const half = size * 0.4;
  fillTriangle(image, cx, cy - half, cx + half, cy, cx, cy + half, leaf);
  fillTriangle(image, cx, cy - half, cx - half, cy, cx, cy + half, leaf);
  fillTriangle(image, cx, cy - half * 0.55, cx + half * 0.55, cy, cx, cy + half * 0.55, lightLeaf);
  fillTriangle(image, cx, cy - half * 0.55, cx - half * 0.55, cy, cx, cy + half * 0.55, lightLeaf);
  return image;
}

const RENDERERS: Record<PresetId, () => RGBA8Image> = {
  'harvest-circle': renderHarvestCircle,
  'barn-mark': renderBarnMark,
  'sprout-diamond': renderSproutDiamond,
};

export function listPresetSummaries(): readonly LogoPresetSummary[] {
  return PRESET_SUMMARIES;
}

/** Renders a shipped preset by id at the canonical canvas size (512x512). */
export function renderPreset(id: string): RGBA8Image {
  const renderer = RENDERERS[id as PresetId];
  if (!renderer) {
    throw new UnknownPresetError(`Unknown logo preset id "${id}".`);
  }
  return renderer();
}
