/**
 * Generated nature meshes — crops at four growth stages, trees, bushes,
 * rocks, water tiles, fences and hedges.
 */

import { box, cone, cylinder, defineAsset, getAsset, group, sphere, type MeshNode } from '../mesh-dsl.js';
import type { PaletteKey } from '../palette.js';

export type CropKind = 'wheat' | 'carrot' | 'corn' | 'berry';
export type GrowthStage = 'seed' | 'sprout' | 'growing' | 'ready';
export type TerrainKind = 'grass' | 'soil' | 'sand' | 'stone' | 'water';

const cropColor: Record<CropKind, PaletteKey> = {
  wheat: 'cropWheat',
  carrot: 'cropCarrot',
  corn: 'cropCorn',
  berry: 'cropBerry',
};

export const growthStages: GrowthStage[] = ['seed', 'sprout', 'growing', 'ready'];

function cropNode(kind: CropKind, stage: GrowthStage): MeshNode {
  const color = cropColor[kind];
  switch (stage) {
    case 'seed':
      return group([
        sphere({ radius: 0.03, widthSegments: 4, heightSegments: 3, color: 'cropSeed', transform: { translate: [0, 0.02, 0] } }),
      ]);
    case 'sprout':
      return group([
        cylinder({ radiusTop: 0.005, radiusBottom: 0.01, height: 0.08, radialSegments: 4, color: 'leaf', transform: { translate: [0, 0.04, 0] } }),
      ]);
    case 'growing':
      return group([
        cylinder({ radiusTop: 0.008, radiusBottom: 0.015, height: 0.18, radialSegments: 4, color: 'leaf', transform: { translate: [0, 0.09, 0] } }),
        sphere({ radius: 0.05, widthSegments: 5, heightSegments: 4, color, transform: { translate: [0, 0.18, 0] } }),
      ]);
    case 'ready':
      return group([
        cylinder({ radiusTop: 0.01, radiusBottom: 0.02, height: 0.28, radialSegments: 5, color: 'leaf', transform: { translate: [0, 0.14, 0] } }),
        sphere({ radius: 0.09, widthSegments: 6, heightSegments: 5, color, transform: { translate: [0, 0.3, 0] } }),
      ]);
  }
}

const cropKinds: CropKind[] = ['wheat', 'carrot', 'corn', 'berry'];
for (const kind of cropKinds) {
  for (const stage of growthStages) {
    defineAsset(`crop_${kind}_${stage}`, cropNode(kind, stage));
  }
}

const terrainColors: Record<TerrainKind, { base: PaletteKey; accent: PaletteKey }> = {
  grass: { base: 'grass', accent: 'grassDry' },
  soil: { base: 'soil', accent: 'soilDry' },
  sand: { base: 'sand', accent: 'soilDry' },
  stone: { base: 'stone', accent: 'stoneDark' },
  water: { base: 'water', accent: 'waterDeep' },
};

function terrainTileNode(kind: TerrainKind): MeshNode {
  const { base, accent } = terrainColors[kind];
  const tileHeight = kind === 'water' ? 0.025 : 0.03;
  const y = kind === 'water' ? -0.02 : 0.015;
  return group([
    box({ width: 0.98, height: tileHeight, depth: 0.98, color: base, transform: { translate: [0, y, 0] } }),
    box({ width: 0.02, height: 0.006, depth: 0.78, color: accent, transform: { translate: [-0.34, y + tileHeight / 2 + 0.003, -0.02] } }),
    box({ width: 0.02, height: 0.006, depth: 0.62, color: accent, transform: { translate: [0.24, y + tileHeight / 2 + 0.003, 0.08] } }),
  ]);
}

export function ensureTerrainAssetsRegistered(): void {
  for (const kind of Object.keys(terrainColors) as TerrainKind[]) {
    const name = `terrain_${kind}`;
    if (!getAsset(name)) defineAsset(name, terrainTileNode(kind));
  }
}
ensureTerrainAssetsRegistered();

/** Naming convention every consumer relies on. */
export function cropAssetName(kind: CropKind, stage: GrowthStage): string {
  return `crop_${kind}_${stage}`;
}

/** Empty field plot bed, rendered under every unlocked plot. */
export function ensureFieldPlotAssetRegistered(): void {
  if (getAsset('field_plot_empty')) return;
  defineAsset(
    'field_plot_empty',
    group([
      box({ width: 0.86, height: 0.035, depth: 0.86, color: 'soil', transform: { translate: [0, 0.0175, 0] } }),
      box({ width: 0.86, height: 0.04, depth: 0.08, color: 'soilDry', transform: { translate: [0, 0.04, -0.43] } }),
      box({ width: 0.86, height: 0.04, depth: 0.08, color: 'soilDry', transform: { translate: [0, 0.04, 0.43] } }),
      box({ width: 0.08, height: 0.04, depth: 0.86, color: 'soilDry', transform: { translate: [-0.43, 0.04, 0] } }),
      box({ width: 0.08, height: 0.04, depth: 0.86, color: 'soilDry', transform: { translate: [0.43, 0.04, 0] } }),
    ]),
  );
}
ensureFieldPlotAssetRegistered();

/** Trees — a few silhouettes so a forest doesn't read as one repeated stamp. */
defineAsset(
  'tree_round',
  group([
    cylinder({ radiusTop: 0.05, radiusBottom: 0.08, height: 0.5, radialSegments: 6, color: 'trunk', transform: { translate: [0, 0.25, 0] } }),
    sphere({ radius: 0.32, widthSegments: 8, heightSegments: 6, color: 'leaf', transform: { translate: [0, 0.7, 0] } }),
    sphere({ radius: 0.22, widthSegments: 7, heightSegments: 5, color: 'leafLight', transform: { translate: [0.14, 0.85, 0.08] } }),
  ]),
);

defineAsset(
  'tree_pine',
  group([
    cylinder({ radiusTop: 0.04, radiusBottom: 0.07, height: 0.35, radialSegments: 6, color: 'trunk', transform: { translate: [0, 0.18, 0] } }),
    cone({ radius: 0.28, height: 0.5, radialSegments: 8, color: 'leafDark', transform: { translate: [0, 0.6, 0] } }),
    cone({ radius: 0.2, height: 0.4, radialSegments: 8, color: 'leafDark', transform: { translate: [0, 0.9, 0] } }),
    cone({ radius: 0.12, height: 0.3, radialSegments: 8, color: 'leaf', transform: { translate: [0, 1.15, 0] } }),
  ]),
);

defineAsset(
  'tree_fruit',
  group([
    cylinder({ radiusTop: 0.04, radiusBottom: 0.07, height: 0.4, radialSegments: 6, color: 'trunk', transform: { translate: [0, 0.2, 0] } }),
    sphere({ radius: 0.28, widthSegments: 8, heightSegments: 6, color: 'leafLight', transform: { translate: [0, 0.6, 0] } }),
    ...[0.15, -0.1, 0.05].map((dx, i) =>
      sphere({
        radius: 0.035,
        widthSegments: 5,
        heightSegments: 4,
        color: 'cropCarrot',
        transform: { translate: [dx, 0.5 + i * 0.08, 0.2 - i * 0.05] },
      }),
    ),
  ]),
);

defineAsset(
  'bush',
  group([
    sphere({ radius: 0.16, widthSegments: 6, heightSegments: 5, color: 'leaf', transform: { translate: [0, 0.14, 0] } }),
    sphere({ radius: 0.12, widthSegments: 6, heightSegments: 5, color: 'leafLight', transform: { translate: [0.1, 0.2, 0.05] } }),
  ]),
);

defineAsset(
  'bush_berry',
  group([
    sphere({ radius: 0.15, widthSegments: 6, heightSegments: 5, color: 'leaf', transform: { translate: [0, 0.14, 0] } }),
    ...[0, 1, 2, 3].map((i) =>
      sphere({
        radius: 0.03,
        widthSegments: 4,
        heightSegments: 4,
        color: 'cropBerry',
        transform: { translate: [Math.cos(i) * 0.1, 0.14 + Math.sin(i) * 0.06, Math.sin(i * 2) * 0.1] },
      }),
    ),
  ]),
);

/** Rocks — irregular low-poly clusters built from a few offset boxes. */
function rockNode(scale: number): MeshNode {
  return group([
    box({ width: 0.3 * scale, height: 0.2 * scale, depth: 0.26 * scale, color: 'stone', transform: { rotate: [0, 0.4, 0.1], translate: [0, 0.1 * scale, 0] } }),
    box({ width: 0.2 * scale, height: 0.14 * scale, depth: 0.18 * scale, color: 'stoneDark', transform: { rotate: [0.2, -0.3, 0], translate: [0.1 * scale, 0.07 * scale, 0.05 * scale] } }),
  ]);
}
defineAsset('rock_small', rockNode(0.6));
defineAsset('rock_medium', rockNode(1.0));
defineAsset('rock_large', rockNode(1.6));

/** Water tile — a flat plane sitting slightly below grid level. */
defineAsset(
  'water_tile',
  box({ width: 1.0, height: 0.04, depth: 1.0, color: 'water', transform: { translate: [0, -0.02, 0] } }),
);

/**
 * Non-grass terrain overlays — thin tiles laid just above the ground plane
 * so a field, path, beach, or rocky patch reads as visually distinct from
 * the grass everywhere else, without the ground mesh itself needing to be
 * subdivided. `renderer.ts`'s syncWorld() instances one of these per
 * `GameStateView.tiles[]` entry whose terrain isn't 'grass' - the common
 * case (plain grass) needs no overlay since the ground plane is already
 * that colour.
 */
defineAsset('tile_soil', box({ width: 1.0, height: 0.03, depth: 1.0, color: 'soil', transform: { translate: [0, 0.015, 0] } }));
defineAsset('tile_water', box({ width: 1.0, height: 0.04, depth: 1.0, color: 'water', transform: { translate: [0, -0.02, 0] } }));
defineAsset('tile_sand', box({ width: 1.0, height: 0.02, depth: 1.0, color: 'sand', transform: { translate: [0, 0.01, 0] } }));
defineAsset('tile_stone', box({ width: 1.0, height: 0.02, depth: 1.0, color: 'stoneDark', transform: { translate: [0, 0.01, 0] } }));

/** Fences and hedges, sized to a 1-unit tile edge so they tile cleanly. */
defineAsset(
  'fence_post',
  group([
    cylinder({ radiusTop: 0.03, radiusBottom: 0.03, height: 0.4, radialSegments: 6, color: 'wood', transform: { translate: [0, 0.2, 0] } }),
  ]),
);

defineAsset(
  'fence_rail',
  box({ width: 1.0, height: 0.05, depth: 0.04, color: 'wood', transform: { translate: [0, 0.3, 0] } }),
);

defineAsset(
  'hedge',
  box({ width: 1.0, height: 0.4, depth: 0.3, color: 'leafDark', transform: { translate: [0, 0.2, 0] } }),
);
