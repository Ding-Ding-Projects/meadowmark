/**
 * Generated flora meshes — botanical variety on top of nature.ts's basic
 * trees/bushes/rocks. Every name in this file is namespaced under
 * `flora_` so it can never collide with nature.ts (or any other lane)
 * registering its own asset names into the shared mesh-dsl registry.
 *
 * Instances of a given asset name all share one baked BufferGeometry (see
 * instancing.ts's InstancedMesh pools — a pool only varies position,
 * yaw and uniform scale per instance, never per-instance geometry or
 * colour). So "seeded jitter so a forest of the same species still
 * varies" is applied here, at authoring time: every asset's internal
 * cluster of leaves/blooms/branches is scattered by a small deterministic
 * PRNG seeded from the asset's own name, rather than hand-placed at fixed
 * offsets. The result is exactly reproducible on every rebuild (same name
 * in, same geometry out — nothing here ever calls Math.random()) while a
 * whole species still reads as a family of similar-but-not-identical
 * individuals across its small/medium/large variants and across the
 * neighbouring undergrowth clumps that use the same technique.
 */

import { box, cone, cylinder, defineAsset, group, sphere, type MeshNode } from '../mesh-dsl.js';
import type { PaletteKey } from '../palette.js';

// ---------------------------------------------------------------------------
// Deterministic PRNG — no Math.random() anywhere in this file.
// ---------------------------------------------------------------------------

/** FNV-1a style string hash, used only to turn an asset name into a PRNG seed. */
function hashSeed(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A PRNG seeded purely from `name`, stable across rebuilds. */
function rngFor(name: string): () => number {
  return mulberry32(hashSeed(name));
}

function rand(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

// ---------------------------------------------------------------------------
// Small shared shape helpers
// ---------------------------------------------------------------------------

/**
 * A branch/frond/vine pivoted at `origin`, extending `length` along the
 * pivot's local up (`direction: 'up'`) or down (`direction: 'down'`) axis
 * before the outer group's rotation carries it outward. Used for willow
 * fronds, palm stalks, bare tree branches, trellis vines and ivy tendrils —
 * anything that has to hang or radiate from a single attachment point
 * rather than sit centred on its own origin the way every other primitive
 * does.
 */
function branchFrom(
  origin: [number, number, number],
  length: number,
  radiusTop: number,
  radiusBottom: number,
  color: PaletteKey,
  tiltX: number,
  yawY: number,
  direction: 'up' | 'down' = 'up',
): MeshNode {
  const half = direction === 'up' ? length / 2 : -length / 2;
  return group(
    [
      cylinder({
        radiusTop,
        radiusBottom,
        height: length,
        radialSegments: 4,
        color,
        transform: { translate: [0, half, 0] },
      }),
    ],
    { rotate: [tiltX, yawY, 0], translate: origin },
  );
}

/** A flat frond blade pivoted at `origin`, extending along local +Z. */
function bladeFrom(
  origin: [number, number, number],
  length: number,
  width: number,
  thickness: number,
  color: PaletteKey,
  tiltX: number,
  yawY: number,
): MeshNode {
  return group(
    [
      box({
        width,
        height: thickness,
        depth: length,
        color,
        transform: { translate: [0, 0, length / 2] },
      }),
    ],
    { rotate: [tiltX, yawY, 0], translate: origin },
  );
}

type SizeVariant = readonly [suffix: string, scale: number];

const SIZES_3: SizeVariant[] = [
  ['small', 0.72],
  ['medium', 1.0],
  ['large', 1.3],
];
const SIZES_2: SizeVariant[] = [
  ['small', 0.8],
  ['large', 1.25],
];
const SIZES_SAPLING: SizeVariant[] = [
  ['young', 0.42],
  ['tall', 0.68],
];

/** Register every size variant of a species under `flora_<species>_<suffix>`. */
function defineSpecies(
  species: string,
  sizes: SizeVariant[],
  build: (scale: number, rng: () => number) => MeshNode,
): void {
  for (const [suffix, scale] of sizes) {
    const name = `flora_${species}_${suffix}`;
    defineAsset(name, build(scale, rngFor(name)));
  }
}

// ---------------------------------------------------------------------------
// Trees — eleven species-ish shapes, each with two or three size variants.
// ---------------------------------------------------------------------------

/** Broad oak: thick trunk, wide lumpy rounded canopy. */
function oakNode(scale: number, rng: () => number): MeshNode {
  const trunkH = 0.4 * scale;
  const trunkR = 0.075 * scale;
  const canopyY = trunkH + 0.2 * scale;
  const puffCount = 5;
  const puffs: MeshNode[] = [];
  for (let i = 0; i < puffCount; i++) {
    const angle = (i / puffCount) * Math.PI * 2 + rand(rng, -0.3, 0.3);
    const r = 0.17 * scale + rand(rng, -0.03, 0.03);
    const dy = rand(rng, -0.05, 0.09) * scale;
    const puffColor: PaletteKey = i % 2 === 0 ? 'leaf' : 'leafLight';
    puffs.push(
      sphere({
        radius: 0.19 * scale + rand(rng, -0.02, 0.02),
        widthSegments: 7,
        heightSegments: 5,
        color: puffColor,
        transform: { translate: [Math.cos(angle) * r, canopyY + dy, Math.sin(angle) * r] },
      }),
    );
  }
  return group([
    cylinder({ radiusTop: trunkR * 0.75, radiusBottom: trunkR, height: trunkH, radialSegments: 7, color: 'trunk', transform: { translate: [0, trunkH / 2, 0] } }),
    sphere({ radius: 0.26 * scale, widthSegments: 8, heightSegments: 6, color: 'leaf', transform: { translate: [0, canopyY, 0] } }),
    ...puffs,
  ]);
}

/** Tall poplar: slender trunk, narrow columnar stack of foliage. */
function poplarNode(scale: number, rng: () => number): MeshNode {
  const trunkH = 0.58 * scale;
  const trunkR = 0.045 * scale;
  const layers = 4;
  const puffs: MeshNode[] = [];
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const y = trunkH + t * 0.55 * scale;
    const r = Math.max(0.05, (0.13 - t * 0.05) * scale + rand(rng, -0.012, 0.012));
    const color: PaletteKey = i % 2 === 0 ? 'leaf' : 'leafLight';
    puffs.push(
      sphere({
        radius: r,
        widthSegments: 6,
        heightSegments: 5,
        color,
        transform: { translate: [rand(rng, -0.02, 0.02) * scale, y, rand(rng, -0.02, 0.02) * scale] },
      }),
    );
  }
  return group([
    cylinder({ radiusTop: trunkR * 0.8, radiusBottom: trunkR, height: trunkH, radialSegments: 6, color: 'trunk', transform: { translate: [0, trunkH / 2, 0] } }),
    ...puffs,
  ]);
}

/** Pine: two broad stacked needle cones over a short trunk. */
function pineNode(scale: number, rng: () => number): MeshNode {
  const trunkH = 0.28 * scale;
  const trunkR = 0.05 * scale;
  const jitter = () => rand(rng, -0.015, 0.015) * scale;
  return group([
    cylinder({ radiusTop: trunkR * 0.85, radiusBottom: trunkR, height: trunkH, radialSegments: 6, color: 'trunk', transform: { translate: [0, trunkH / 2, 0] } }),
    cone({ radius: 0.3 * scale + jitter(), height: 0.5 * scale, radialSegments: 8, color: 'leafDark', transform: { translate: [0, trunkH + 0.24 * scale, 0] } }),
    cone({ radius: 0.2 * scale + jitter(), height: 0.38 * scale, radialSegments: 8, color: 'leaf', transform: { translate: [0, trunkH + 0.56 * scale, 0] } }),
  ]);
}

/** Spruce: taller, narrower and darker than the pine — three tight tiers. */
function spruceNode(scale: number, rng: () => number): MeshNode {
  const trunkH = 0.32 * scale;
  const trunkR = 0.045 * scale;
  const jitter = () => rand(rng, -0.01, 0.01) * scale;
  return group([
    cylinder({ radiusTop: trunkR * 0.85, radiusBottom: trunkR, height: trunkH, radialSegments: 6, color: 'trunk', transform: { translate: [0, trunkH / 2, 0] } }),
    cone({ radius: 0.22 * scale + jitter(), height: 0.4 * scale, radialSegments: 8, color: 'leafDark', transform: { translate: [0, trunkH + 0.2 * scale, 0] } }),
    cone({ radius: 0.16 * scale + jitter(), height: 0.36 * scale, radialSegments: 8, color: 'leafDark', transform: { translate: [0, trunkH + 0.48 * scale, 0] } }),
    cone({ radius: 0.1 * scale + jitter(), height: 0.3 * scale, radialSegments: 8, color: 'leafDark', transform: { translate: [0, trunkH + 0.72 * scale, 0] } }),
  ]);
}

/** Willow: short trunk, flattened dome canopy, many drooping fronds. */
function willowNode(scale: number, rng: () => number): MeshNode {
  const trunkH = 0.36 * scale;
  const trunkR = 0.06 * scale;
  const canopyY = trunkH + 0.16 * scale;
  const domeRadius = 0.28 * scale;
  const frondCount = 9;
  const fronds: MeshNode[] = [];
  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2 + rand(rng, -0.2, 0.2);
    const len = 0.3 * scale + rand(rng, -0.05, 0.05);
    const startR = domeRadius * 0.8;
    const origin: [number, number, number] = [Math.cos(angle) * startR, canopyY + 0.02 * scale, Math.sin(angle) * startR];
    fronds.push(branchFrom(origin, len, 0.004 * scale, 0.013 * scale, 'leaf', rand(rng, 1.15, 1.4), angle, 'down'));
  }
  return group([
    cylinder({ radiusTop: trunkR * 0.75, radiusBottom: trunkR, height: trunkH, radialSegments: 7, color: 'trunk', transform: { translate: [0, trunkH / 2, 0] } }),
    sphere({ radius: domeRadius, widthSegments: 8, heightSegments: 5, color: 'leafLight', transform: { translate: [0, canopyY, 0], scale: [1.1, 0.6, 1.1] } }),
    ...fronds,
  ]);
}

/** Birch: slender pale trunk with dark bark streaks, light narrow canopy. */
function birchNode(scale: number, rng: () => number): MeshNode {
  const trunkH = 0.5 * scale;
  const trunkR = 0.04 * scale;
  const streaks: MeshNode[] = [];
  const streakCount = 4;
  for (let i = 0; i < streakCount; i++) {
    const y = rand(rng, 0.08, Math.max(0.09, trunkH - 0.04));
    streaks.push(
      box({
        width: 0.03 * scale,
        height: 0.02 * scale,
        depth: 0.005 * scale,
        color: 'woodDark',
        transform: { translate: [rand(rng, -0.01, 0.01) * scale, y, trunkR * 0.95], rotate: [0, rand(rng, -0.3, 0.3), 0] },
      }),
    );
  }
  return group([
    cylinder({ radiusTop: trunkR * 0.7, radiusBottom: trunkR, height: trunkH, radialSegments: 7, color: 'wallCream', transform: { translate: [0, trunkH / 2, 0] } }),
    ...streaks,
    sphere({ radius: 0.2 * scale, widthSegments: 7, heightSegments: 5, color: 'leafLight', transform: { translate: [0, trunkH + 0.16 * scale, 0] } }),
    sphere({ radius: 0.15 * scale, widthSegments: 7, heightSegments: 5, color: 'leaf', transform: { translate: [0.08 * scale, trunkH + 0.32 * scale, 0.06 * scale] } }),
  ]);
}

/** Palm: slim leaning trunk, a starburst crown of flat drooping fronds. */
function palmNode(scale: number, rng: () => number): MeshNode {
  const trunkH = 0.62 * scale;
  const trunkR = 0.035 * scale;
  const lean = rand(rng, 0.02, 0.09);
  const crownY = trunkH;
  const frondCount = 7;
  const fronds: MeshNode[] = [];
  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2 + rand(rng, -0.15, 0.15);
    const len = 0.32 * scale + rand(rng, -0.03, 0.04);
    fronds.push(
      bladeFrom(
        [Math.sin(lean) * trunkH, crownY, 0],
        len,
        0.05 * scale,
        0.01 * scale,
        'leaf',
        rand(rng, 1.1, 1.35),
        angle,
      ),
    );
  }
  const coconuts: MeshNode[] = [0, 1, 2].map((i) =>
    sphere({
      radius: 0.03 * scale,
      widthSegments: 5,
      heightSegments: 4,
      color: 'cropCoffeeBean',
      transform: { translate: [Math.sin(lean) * trunkH + Math.cos(i * 2.1) * 0.04 * scale, crownY - 0.03 * scale, Math.sin(i * 2.1) * 0.04 * scale] },
    }),
  );
  return group([
    cylinder({
      radiusTop: trunkR * 0.7,
      radiusBottom: trunkR,
      height: trunkH,
      radialSegments: 6,
      color: 'wood',
      transform: { translate: [Math.sin(lean) * trunkH * 0.5, trunkH / 2, 0], rotate: [0, 0, lean] },
    }),
    ...fronds,
    ...coconuts,
  ]);
}

/** Fruit tree in blossom: pale canopy dotted with small pink/white blooms. */
function fruitBlossomNode(scale: number, rng: () => number): MeshNode {
  const trunkH = 0.38 * scale;
  const trunkR = 0.05 * scale;
  const canopyY = trunkH + 0.22 * scale;
  const bloomCount = 10;
  const blooms: MeshNode[] = [];
  for (let i = 0; i < bloomCount; i++) {
    const angle = (i / bloomCount) * Math.PI * 2 + rand(rng, -0.4, 0.4);
    const r = rand(rng, 0.12, 0.24) * scale;
    const y = canopyY + rand(rng, -0.1, 0.14) * scale;
    const bloomColor: PaletteKey = i % 3 === 0 ? 'wallWhite' : 'cropStrawberry';
    blooms.push(
      sphere({
        radius: 0.025 * scale + rand(rng, 0, 0.01) * scale,
        widthSegments: 5,
        heightSegments: 4,
        color: bloomColor,
        transform: { translate: [Math.cos(angle) * r, y, Math.sin(angle) * r] },
      }),
    );
  }
  return group([
    cylinder({ radiusTop: trunkR * 0.75, radiusBottom: trunkR, height: trunkH, radialSegments: 6, color: 'trunk', transform: { translate: [0, trunkH / 2, 0] } }),
    sphere({ radius: 0.26 * scale, widthSegments: 8, heightSegments: 6, color: 'leafLight', transform: { translate: [0, canopyY, 0] } }),
    ...blooms,
  ]);
}

/** Fruit tree laden with fruit: darker canopy, many hanging fruits. */
function fruitLadenNode(scale: number, rng: () => number): MeshNode {
  const trunkH = 0.4 * scale;
  const trunkR = 0.05 * scale;
  const canopyY = trunkH + 0.22 * scale;
  const fruitCount = 8;
  const fruits: MeshNode[] = [];
  for (let i = 0; i < fruitCount; i++) {
    const angle = (i / fruitCount) * Math.PI * 2 + rand(rng, -0.35, 0.35);
    const r = rand(rng, 0.14, 0.24) * scale;
    const y = canopyY + rand(rng, -0.14, 0.06) * scale;
    const fruitColor: PaletteKey = i % 2 === 0 ? 'cropTomato' : 'cropCarrot';
    fruits.push(
      sphere({
        radius: 0.035 * scale + rand(rng, 0, 0.01) * scale,
        widthSegments: 5,
        heightSegments: 4,
        color: fruitColor,
        transform: { translate: [Math.cos(angle) * r, y, Math.sin(angle) * r] },
      }),
    );
  }
  return group([
    cylinder({ radiusTop: trunkR * 0.75, radiusBottom: trunkR, height: trunkH, radialSegments: 6, color: 'trunk', transform: { translate: [0, trunkH / 2, 0] } }),
    sphere({ radius: 0.27 * scale, widthSegments: 8, heightSegments: 6, color: 'leaf', transform: { translate: [0, canopyY, 0] } }),
    ...fruits,
  ]);
}

/** Dead / bare tree: gnarled trunk with sparse bare branches, no foliage. */
function deadTreeNode(scale: number, rng: () => number): MeshNode {
  const trunkH = 0.55 * scale;
  const trunkR = 0.05 * scale;
  const branchCount = 6;
  const branches: MeshNode[] = [];
  for (let i = 0; i < branchCount; i++) {
    const t = rand(rng, 0.35, 0.95);
    const y = t * trunkH;
    const angle = (i / branchCount) * Math.PI * 2 + rand(rng, -0.3, 0.3);
    const len = rand(rng, 0.14, 0.26) * scale;
    const origin: [number, number, number] = [Math.cos(angle) * trunkR, y, Math.sin(angle) * trunkR];
    branches.push(branchFrom(origin, len, 0.006 * scale, 0.016 * scale, 'woodDark', rand(rng, 0.5, 1.0), angle, 'up'));
  }
  return group([
    cylinder({ radiusTop: trunkR * 0.55, radiusBottom: trunkR, height: trunkH, radialSegments: 6, color: 'woodDark', transform: { translate: [0, trunkH / 2, 0], rotate: [0, 0, 0.05] } }),
    ...branches,
  ]);
}

/** Young sapling: thin whip of a trunk with a small tuft of leaves. */
function saplingNode(scale: number, rng: () => number): MeshNode {
  const trunkH = 0.24 * scale;
  const trunkR = 0.018 * scale;
  return group([
    cylinder({ radiusTop: trunkR * 0.7, radiusBottom: trunkR, height: trunkH, radialSegments: 5, color: 'trunk', transform: { translate: [0, trunkH / 2, 0], rotate: [rand(rng, -0.05, 0.05), 0, rand(rng, -0.05, 0.05)] } }),
    sphere({ radius: 0.08 * scale, widthSegments: 6, heightSegments: 5, color: 'leafLight', transform: { translate: [0, trunkH + 0.05 * scale, 0] } }),
    sphere({ radius: 0.055 * scale, widthSegments: 5, heightSegments: 4, color: 'leaf', transform: { translate: [0.03 * scale, trunkH - 0.02 * scale, 0.02 * scale] } }),
  ]);
}

defineSpecies('tree_oak', SIZES_3, oakNode);
defineSpecies('tree_poplar', SIZES_3, poplarNode);
defineSpecies('tree_pine', SIZES_3, pineNode);
defineSpecies('tree_spruce', SIZES_3, spruceNode);
defineSpecies('tree_willow', SIZES_3, willowNode);
defineSpecies('tree_birch', SIZES_3, birchNode);
defineSpecies('tree_palm', SIZES_3, palmNode);
defineSpecies('tree_fruit_blossom', SIZES_3, fruitBlossomNode);
defineSpecies('tree_fruit_laden', SIZES_3, fruitLadenNode);
defineSpecies('tree_dead', SIZES_2, deadTreeNode);
defineSpecies('tree_sapling', SIZES_SAPLING, saplingNode);

// ---------------------------------------------------------------------------
// Undergrowth
// ---------------------------------------------------------------------------

defineAsset(
  'flora_bush_round',
  (() => {
    const rng = rngFor('flora_bush_round');
    return group([
      sphere({ radius: 0.15, widthSegments: 6, heightSegments: 5, color: 'leaf', transform: { translate: [0, 0.13, 0] } }),
      sphere({ radius: 0.11 + rand(rng, -0.01, 0.01), widthSegments: 6, heightSegments: 5, color: 'leafLight', transform: { translate: [0.09, 0.18, 0.05] } }),
      sphere({ radius: 0.09 + rand(rng, -0.01, 0.01), widthSegments: 6, heightSegments: 5, color: 'leaf', transform: { translate: [-0.08, 0.15, -0.04] } }),
    ]);
  })(),
);

defineAsset(
  'flora_bush_low',
  group([
    sphere({ radius: 0.14, widthSegments: 7, heightSegments: 4, color: 'leafDark', transform: { translate: [0, 0.07, 0], scale: [1.3, 0.55, 1.3] } }),
    sphere({ radius: 0.09, widthSegments: 6, heightSegments: 4, color: 'leaf', transform: { translate: [0.08, 0.09, 0.03], scale: [1.1, 0.6, 1.1] } }),
  ]),
);

defineAsset(
  'flora_bush_bramble',
  (() => {
    const rng = rngFor('flora_bush_bramble');
    const spikes: MeshNode[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + rand(rng, -0.2, 0.2);
      const r = rand(rng, 0.06, 0.13);
      spikes.push(
        cone({
          radius: 0.03,
          height: rand(rng, 0.1, 0.18),
          radialSegments: 5,
          color: 'leafDark',
          transform: { translate: [Math.cos(angle) * r, 0.08, Math.sin(angle) * r], rotate: [rand(rng, -0.3, 0.3), 0, rand(rng, -0.3, 0.3)] },
        }),
      );
    }
    return group([
      sphere({ radius: 0.1, widthSegments: 6, heightSegments: 4, color: 'leaf', transform: { translate: [0, 0.08, 0] } }),
      ...spikes,
    ]);
  })(),
);

defineAsset(
  'flora_bush_berry',
  (() => {
    const rng = rngFor('flora_bush_berry');
    const berries: MeshNode[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + rand(rng, -0.3, 0.3);
      const r = rand(rng, 0.08, 0.13);
      berries.push(
        sphere({
          radius: 0.025 + rand(rng, 0, 0.01),
          widthSegments: 4,
          heightSegments: 4,
          color: 'cropBerry',
          transform: { translate: [Math.cos(angle) * r, 0.13 + rand(rng, -0.03, 0.05), Math.sin(angle) * r] },
        }),
      );
    }
    return group([
      sphere({ radius: 0.15, widthSegments: 6, heightSegments: 5, color: 'leaf', transform: { translate: [0, 0.14, 0] } }),
      ...berries,
    ]);
  })(),
);

defineAsset(
  'flora_fern',
  (() => {
    const rng = rngFor('flora_fern');
    const fronds: MeshNode[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + rand(rng, -0.15, 0.15);
      const len = rand(rng, 0.14, 0.2);
      fronds.push(bladeFrom([0, 0.02, 0], len, 0.03, 0.006, i % 2 === 0 ? 'leaf' : 'leafDark', rand(rng, 1.05, 1.3), angle));
    }
    return group(fronds);
  })(),
);

defineAsset(
  'flora_reeds',
  (() => {
    const rng = rngFor('flora_reeds');
    const stalks: MeshNode[] = [];
    for (let i = 0; i < 5; i++) {
      const h = rand(rng, 0.26, 0.4);
      stalks.push(
        cylinder({
          radiusTop: 0.004,
          radiusBottom: 0.01,
          height: h,
          radialSegments: 4,
          color: i % 2 === 0 ? 'leaf' : 'leafDark',
          transform: { translate: [rand(rng, -0.08, 0.08), h / 2, rand(rng, -0.08, 0.08)], rotate: [rand(rng, -0.08, 0.08), 0, rand(rng, -0.08, 0.08)] },
        }),
      );
    }
    return group(stalks);
  })(),
);

defineAsset(
  'flora_cattails',
  (() => {
    const rng = rngFor('flora_cattails');
    const stalks: MeshNode[] = [];
    for (let i = 0; i < 3; i++) {
      const h = rand(rng, 0.32, 0.44);
      const x = rand(rng, -0.06, 0.06);
      const z = rand(rng, -0.06, 0.06);
      stalks.push(
        cylinder({ radiusTop: 0.004, radiusBottom: 0.008, height: h, radialSegments: 4, color: 'leaf', transform: { translate: [x, h / 2, z] } }),
        cylinder({ radiusTop: 0.014, radiusBottom: 0.016, height: 0.09, radialSegments: 6, color: 'woodDark', transform: { translate: [x, h - 0.02, z] } }),
      );
    }
    return group(stalks);
  })(),
);

function grassTuftNode(seedName: string): MeshNode {
  const rng = rngFor(seedName);
  const blades: MeshNode[] = [];
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + rand(rng, -0.25, 0.25);
    const h = rand(rng, 0.1, 0.18);
    blades.push(
      cone({
        radius: 0.008,
        height: h,
        radialSegments: 3,
        color: i % 3 === 0 ? 'grassDry' : 'grass',
        transform: { translate: [Math.cos(angle) * 0.02, h / 2, Math.sin(angle) * 0.02], rotate: [rand(rng, -0.35, 0.35), 0, rand(rng, -0.35, 0.35)] },
      }),
    );
  }
  return group(blades);
}
defineAsset('flora_grass_tuft_a', grassTuftNode('flora_grass_tuft_a'));
defineAsset('flora_grass_tuft_b', grassTuftNode('flora_grass_tuft_b'));

function wildflowerClumpNode(seedName: string, bloomColor: PaletteKey): MeshNode {
  const rng = rngFor(seedName);
  const stems: MeshNode[] = [];
  for (let i = 0; i < 5; i++) {
    const h = rand(rng, 0.09, 0.15);
    const x = rand(rng, -0.09, 0.09);
    const z = rand(rng, -0.09, 0.09);
    stems.push(
      cylinder({ radiusTop: 0.004, radiusBottom: 0.006, height: h, radialSegments: 4, color: 'leaf', transform: { translate: [x, h / 2, z] } }),
      sphere({ radius: 0.02 + rand(rng, 0, 0.008), widthSegments: 5, heightSegments: 4, color: bloomColor, transform: { translate: [x, h, z] } }),
    );
  }
  return group(stems);
}
defineAsset('flora_wildflowers_red', wildflowerClumpNode('flora_wildflowers_red', 'cropStrawberry'));
defineAsset('flora_wildflowers_blue', wildflowerClumpNode('flora_wildflowers_blue', 'accentCool'));
defineAsset('flora_wildflowers_yellow', wildflowerClumpNode('flora_wildflowers_yellow', 'accent'));
defineAsset('flora_wildflowers_white', wildflowerClumpNode('flora_wildflowers_white', 'wallWhite'));

defineAsset(
  'flora_pumpkin_patch',
  (() => {
    const rng = rngFor('flora_pumpkin_patch');
    const items: MeshNode[] = [
      box({ width: 0.7, height: 0.03, depth: 0.7, color: 'soil', transform: { translate: [0, 0.015, 0] } }),
    ];
    for (let i = 0; i < 5; i++) {
      const x = rand(rng, -0.28, 0.28);
      const z = rand(rng, -0.28, 0.28);
      const r = rand(rng, 0.06, 0.1);
      items.push(
        sphere({ radius: r, widthSegments: 7, heightSegments: 5, color: 'cropPumpkin', transform: { translate: [x, r * 0.85, z], scale: [1, 0.85, 1] } }),
        box({ width: 0.012, height: 0.03, depth: 0.012, color: 'leafDark', transform: { translate: [x, r * 1.6, z] } }),
      );
    }
    for (let i = 0; i < 4; i++) {
      items.push(
        sphere({ radius: 0.06, widthSegments: 5, heightSegments: 4, color: 'leaf', transform: { translate: [rand(rng, -0.3, 0.3), 0.03, rand(rng, -0.3, 0.3)], scale: [1, 0.4, 1] } }),
      );
    }
    return group(items);
  })(),
);

defineAsset(
  'flora_vegetable_patch',
  (() => {
    const rng = rngFor('flora_vegetable_patch');
    const items: MeshNode[] = [
      box({ width: 0.7, height: 0.03, depth: 0.7, color: 'soilDry', transform: { translate: [0, 0.015, 0] } }),
    ];
    for (let row = 0; row < 3; row++) {
      const z = -0.24 + row * 0.24;
      for (let i = 0; i < 3; i++) {
        const x = -0.24 + i * 0.24 + rand(rng, -0.03, 0.03);
        const pick = (row + i) % 3;
        if (pick === 0) {
          items.push(
            cone({ radius: 0.025, height: 0.06, radialSegments: 5, color: 'cropCarrot', transform: { translate: [x, 0.05, z], rotate: [Math.PI, 0, 0] } }),
            sphere({ radius: 0.025, widthSegments: 5, heightSegments: 4, color: 'leaf', transform: { translate: [x, 0.09, z] } }),
          );
        } else if (pick === 1) {
          items.push(sphere({ radius: 0.045, widthSegments: 6, heightSegments: 5, color: 'cropTomato', transform: { translate: [x, 0.05, z] } }));
        } else {
          items.push(sphere({ radius: 0.04, widthSegments: 6, heightSegments: 5, color: 'leafLight', transform: { translate: [x, 0.045, z], scale: [1.2, 0.6, 1.2] } }));
        }
      }
    }
    return group(items);
  })(),
);

function mushroomNode(capColor: PaletteKey, stemColor: PaletteKey, spotted: boolean): MeshNode {
  const rng = rngFor(`flora_mushroom_${capColor}`);
  const children: MeshNode[] = [
    cylinder({ radiusTop: 0.012, radiusBottom: 0.018, height: 0.06, radialSegments: 6, color: stemColor, transform: { translate: [0, 0.03, 0] } }),
    sphere({ radius: 0.05, widthSegments: 7, heightSegments: 5, color: capColor, transform: { translate: [0, 0.065, 0], scale: [1, 0.55, 1] } }),
  ];
  if (spotted) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + rand(rng, -0.3, 0.3);
      children.push(
        sphere({ radius: 0.008, widthSegments: 4, heightSegments: 4, color: 'wallWhite', transform: { translate: [Math.cos(angle) * 0.03, 0.09, Math.sin(angle) * 0.03] } }),
      );
    }
  }
  return group(children);
}
defineAsset('flora_mushroom_red', mushroomNode('cropChilli', 'wallCream', true));
defineAsset('flora_mushroom_brown', mushroomNode('woodDark', 'wallCream', false));

defineAsset(
  'flora_ivy',
  (() => {
    const rng = rngFor('flora_ivy');
    const leaves: MeshNode[] = [];
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const y = t * 0.55;
      const x = Math.sin(t * 5 + rand(rng, -0.4, 0.4)) * 0.06;
      leaves.push(
        sphere({ radius: 0.035 + rand(rng, 0, 0.01), widthSegments: 5, heightSegments: 4, color: i % 2 === 0 ? 'leaf' : 'leafDark', transform: { translate: [x, y, rand(rng, -0.02, 0.02)] } }),
      );
    }
    return group([
      cylinder({ radiusTop: 0.006, radiusBottom: 0.008, height: 0.55, radialSegments: 4, color: 'trunk', transform: { translate: [0, 0.275, 0] } }),
      ...leaves,
    ]);
  })(),
);

defineAsset(
  'flora_hedge_line',
  (() => {
    const rng = rngFor('flora_hedge_line');
    const bumps: MeshNode[] = [];
    for (let i = 0; i < 6; i++) {
      const x = -0.42 + i * 0.17;
      bumps.push(
        sphere({ radius: 0.09 + rand(rng, -0.01, 0.015), widthSegments: 6, heightSegments: 4, color: i % 2 === 0 ? 'leafDark' : 'leaf', transform: { translate: [x, 0.42, 0] } }),
      );
    }
    return group([
      box({ width: 1.0, height: 0.4, depth: 0.3, color: 'leafDark', transform: { translate: [0, 0.2, 0] } }),
      ...bumps,
    ]);
  })(),
);

// ---------------------------------------------------------------------------
// Cultivated garden features
// ---------------------------------------------------------------------------

function flowerbedNode(seedName: string, colorA: PaletteKey, colorB: PaletteKey, colorC: PaletteKey): MeshNode {
  const rng = rngFor(seedName);
  const blooms: MeshNode[] = [];
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + rand(rng, -0.15, 0.15);
    const r = 0.2 + rand(rng, -0.02, 0.02);
    const bloomColor: PaletteKey = i % 3 === 0 ? colorA : i % 3 === 1 ? colorB : colorC;
    blooms.push(
      sphere({ radius: 0.045 + rand(rng, 0, 0.01), widthSegments: 5, heightSegments: 4, color: bloomColor, transform: { translate: [Math.cos(angle) * r, 0.1, Math.sin(angle) * r] } }),
    );
  }
  return group([
    cylinder({ radiusTop: 0.32, radiusBottom: 0.34, height: 0.08, radialSegments: 12, color: 'soilDry', transform: { translate: [0, 0.04, 0] } }),
    ...blooms,
  ]);
}
defineAsset('flora_flowerbed_warm', flowerbedNode('flora_flowerbed_warm', 'cropStrawberry', 'accentWarm', 'cropPumpkin'));
defineAsset('flora_flowerbed_cool', flowerbedNode('flora_flowerbed_cool', 'cropLavender', 'accentCool', 'cropBlueberry'));
defineAsset('flora_flowerbed_pastel', flowerbedNode('flora_flowerbed_pastel', 'wallCream', 'cropVanilla', 'leafLight'));

defineAsset(
  'flora_rose_arch',
  (() => {
    const rng = rngFor('flora_rose_arch');
    const posts: MeshNode[] = [-0.4, 0.4].map((x) =>
      cylinder({ radiusTop: 0.025, radiusBottom: 0.03, height: 0.9, radialSegments: 6, color: 'wood', transform: { translate: [x, 0.45, 0] } }),
    );
    const beam: MeshNode[] = [
      box({ width: 0.5, height: 0.05, depth: 0.05, color: 'wood', transform: { translate: [0, 0.92, 0] } }),
      box({ width: 0.35, height: 0.05, depth: 0.05, color: 'wood', transform: { translate: [-0.28, 1.08, 0], rotate: [0, 0, 0.55] } }),
      box({ width: 0.35, height: 0.05, depth: 0.05, color: 'wood', transform: { translate: [0.28, 1.08, 0], rotate: [0, 0, -0.55] } }),
    ];
    const roses: MeshNode[] = [];
    for (let i = 0; i < 10; i++) {
      const t = rand(rng, 0, 1);
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (0.4 - t * 0.02);
      const y = 0.15 + t * 0.85;
      roses.push(
        sphere({ radius: 0.025 + rand(rng, 0, 0.008), widthSegments: 5, heightSegments: 4, color: 'cropStrawberry', transform: { translate: [x + rand(rng, -0.02, 0.02), y, rand(rng, -0.03, 0.03)] } }),
      );
    }
    return group([...posts, ...beam, ...roses]);
  })(),
);

function planterBoxNode(seedName: string, contentsColor: PaletteKey): MeshNode {
  const rng = rngFor(seedName);
  const plants: MeshNode[] = [];
  for (let i = 0; i < 4; i++) {
    const x = -0.24 + i * 0.16 + rand(rng, -0.02, 0.02);
    plants.push(
      sphere({ radius: 0.045 + rand(rng, 0, 0.01), widthSegments: 6, heightSegments: 5, color: contentsColor, transform: { translate: [x, 0.19, rand(rng, -0.02, 0.02)] } }),
    );
  }
  return group([
    box({ width: 0.62, height: 0.14, depth: 0.2, color: 'wood', transform: { translate: [0, 0.07, 0] } }),
    box({ width: 0.56, height: 0.03, depth: 0.15, color: 'soil', transform: { translate: [0, 0.14, 0] } }),
    ...plants,
  ]);
}
defineAsset('flora_planter_box_flowers', planterBoxNode('flora_planter_box_flowers', 'accentWarm'));
defineAsset('flora_planter_box_herbs', planterBoxNode('flora_planter_box_herbs', 'leaf'));

defineAsset(
  'flora_topiary_cone',
  group([
    cylinder({ radiusTop: 0.05, radiusBottom: 0.06, height: 0.16, radialSegments: 8, color: 'trunk', transform: { translate: [0, 0.08, 0] } }),
    cone({ radius: 0.22, height: 0.6, radialSegments: 9, color: 'leafDark', transform: { translate: [0, 0.16 + 0.3, 0] } }),
  ]),
);

defineAsset(
  'flora_topiary_ball',
  group([
    cylinder({ radiusTop: 0.05, radiusBottom: 0.06, height: 0.22, radialSegments: 8, color: 'trunk', transform: { translate: [0, 0.11, 0] } }),
    sphere({ radius: 0.24, widthSegments: 9, heightSegments: 7, color: 'leafDark', transform: { translate: [0, 0.22 + 0.24, 0] } }),
  ]),
);

defineAsset(
  'flora_topiary_spiral',
  group([
    cylinder({ radiusTop: 0.05, radiusBottom: 0.06, height: 0.16, radialSegments: 8, color: 'trunk', transform: { translate: [0, 0.08, 0] } }),
    cylinder({ radiusTop: 0.18, radiusBottom: 0.2, height: 0.16, radialSegments: 8, color: 'leaf', transform: { translate: [0, 0.24, 0] } }),
    cylinder({ radiusTop: 0.14, radiusBottom: 0.16, height: 0.16, radialSegments: 8, color: 'leafDark', transform: { translate: [0, 0.42, 0] } }),
    cylinder({ radiusTop: 0.1, radiusBottom: 0.12, height: 0.16, radialSegments: 8, color: 'leaf', transform: { translate: [0, 0.6, 0] } }),
    sphere({ radius: 0.09, widthSegments: 7, heightSegments: 5, color: 'leafDark', transform: { translate: [0, 0.76, 0] } }),
  ]),
);

defineAsset(
  'flora_orchard_row',
  (() => {
    const trees: MeshNode[] = [0, 1, 2].map((i) => {
      const x = -0.55 + i * 0.55;
      const treeRng = rngFor(`flora_orchard_row_tree_${i}`);
      return group([fruitLadenNode(0.55, treeRng)], { translate: [x, 0, 0] });
    });
    return group([
      box({ width: 1.7, height: 0.03, depth: 0.4, color: 'soil', transform: { translate: [0, 0.015, 0] } }),
      ...trees,
    ]);
  })(),
);

defineAsset(
  'flora_trellis_vines',
  (() => {
    const rng = rngFor('flora_trellis_vines');
    const lattice: MeshNode[] = [];
    for (let i = 0; i < 4; i++) {
      const x = -0.3 + i * 0.2;
      lattice.push(box({ width: 0.02, height: 0.9, depth: 0.02, color: 'wood', transform: { translate: [x, 0.45, 0] } }));
    }
    for (let i = 0; i < 3; i++) {
      const y = 0.15 + i * 0.3;
      lattice.push(box({ width: 0.62, height: 0.02, depth: 0.02, color: 'wood', transform: { translate: [0, y, 0] } }));
    }
    const vines: MeshNode[] = [];
    for (let i = 0; i < 10; i++) {
      const x = rand(rng, -0.28, 0.28);
      const y = rand(rng, 0.05, 0.85);
      vines.push(
        sphere({ radius: 0.03 + rand(rng, 0, 0.012), widthSegments: 5, heightSegments: 4, color: i % 4 === 0 ? 'cropGrape' : 'leaf', transform: { translate: [x, y, 0.03] } }),
      );
    }
    return group([...lattice, ...vines]);
  })(),
);

// ---------------------------------------------------------------------------
// Ground cover
// ---------------------------------------------------------------------------

defineAsset(
  'flora_leaves_fallen',
  (() => {
    const rng = rngFor('flora_leaves_fallen');
    const leaves: MeshNode[] = [];
    for (let i = 0; i < 7; i++) {
      const x = rand(rng, -0.32, 0.32);
      const z = rand(rng, -0.32, 0.32);
      const colorPick = i % 3;
      const leafColor: PaletteKey = colorPick === 0 ? 'roofClay' : colorPick === 1 ? 'accentWarm' : 'grassDry';
      leaves.push(
        box({ width: 0.05, height: 0.006, depth: 0.04, color: leafColor, transform: { translate: [x, 0.006, z], rotate: [0, rand(rng, 0, Math.PI * 2), 0] } }),
      );
    }
    return group(leaves);
  })(),
);

defineAsset(
  'flora_puddle',
  group([
    sphere({ radius: 0.3, widthSegments: 10, heightSegments: 4, color: 'water', transform: { translate: [0, 0.006, 0], scale: [1, 0.03, 0.75] } }),
    sphere({ radius: 0.16, widthSegments: 8, heightSegments: 4, color: 'waterDeep', transform: { translate: [0.06, 0.007, -0.02], scale: [1, 0.03, 0.8] } }),
  ]),
);

defineAsset(
  'flora_clover_patch',
  (() => {
    const rng = rngFor('flora_clover_patch');
    const clovers: MeshNode[] = [];
    for (let i = 0; i < 6; i++) {
      const cx = rand(rng, -0.26, 0.26);
      const cz = rand(rng, -0.26, 0.26);
      for (let leaf = 0; leaf < 3; leaf++) {
        const angle = (leaf / 3) * Math.PI * 2;
        clovers.push(
          sphere({ radius: 0.02, widthSegments: 4, heightSegments: 4, color: 'leafLight', transform: { translate: [cx + Math.cos(angle) * 0.018, 0.012, cz + Math.sin(angle) * 0.018], scale: [1, 0.4, 1] } }),
        );
      }
    }
    return group(clovers);
  })(),
);

defineAsset(
  'flora_rock_garden',
  (() => {
    const rng = rngFor('flora_rock_garden');
    const rocks: MeshNode[] = [];
    for (let i = 0; i < 5; i++) {
      const x = rand(rng, -0.26, 0.26);
      const z = rand(rng, -0.26, 0.26);
      const s = rand(rng, 0.06, 0.13);
      rocks.push(
        box({
          width: s,
          height: s * 0.7,
          depth: s * 0.85,
          color: i % 2 === 0 ? 'stone' : 'stoneDark',
          transform: { translate: [x, s * 0.35, z], rotate: [rand(rng, -0.2, 0.2), rand(rng, 0, Math.PI), rand(rng, -0.2, 0.2)] },
        }),
      );
    }
    return group([
      box({ width: 0.66, height: 0.02, depth: 0.66, color: 'sand', transform: { translate: [0, 0.01, 0] } }),
      ...rocks,
    ]);
  })(),
);

defineAsset(
  'flora_stump',
  (() => {
    const rng = rngFor('flora_stump');
    const ridges: MeshNode[] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + rand(rng, -0.2, 0.2);
      ridges.push(
        box({ width: 0.015, height: 0.16, depth: 0.02, color: 'woodDark', transform: { translate: [Math.cos(angle) * 0.15, 0.08, Math.sin(angle) * 0.15], rotate: [0, angle, 0] } }),
      );
    }
    return group([
      cylinder({ radiusTop: 0.16, radiusBottom: 0.18, height: 0.16, radialSegments: 10, color: 'trunk', transform: { translate: [0, 0.08, 0] } }),
      cylinder({ radiusTop: 0.15, radiusBottom: 0.15, height: 0.01, radialSegments: 10, color: 'woodDark', transform: { translate: [0, 0.165, 0] } }),
      ...ridges,
    ]);
  })(),
);
