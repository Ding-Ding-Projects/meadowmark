/**
 * Generated character meshes — villagers, farm animals, wild scenery
 * critters and the zoo's species catalogue.
 *
 * Every mesh here is a fixed, deterministic geometry built once at module
 * load time from the shared mesh DSL and vertex-coloured from the semantic
 * palette. There is no per-instance randomness in this file: variety comes
 * from registering several distinct named variants (a farmer, a baker, a
 * builder, ...) that other systems pick between deterministically (by
 * wanderer index, by animal kind, by zoo species id) at instancing time.
 */

import { box, cone, cylinder, defineAsset, group, sphere, type MeshNode } from '../mesh-dsl.js';
import type { PaletteKey } from '../palette.js';

// ---------------------------------------------------------------------------
// Villagers — several distinct archetypes rather than one repeated figure.
// ---------------------------------------------------------------------------

interface VillagerOptions {
  /** Shirt/dress colour. */
  cloth: PaletteKey;
  /** Apron, bib or vest overlay on the chest, if any. */
  chestPanel?: PaletteKey;
  trousers?: PaletteKey;
  skin: PaletteKey;
  hairColor?: PaletteKey;
  /** Overall height multiplier — smaller for a child, slightly reduced for an elder. */
  heightScale?: number;
  /** Head-to-body proportion multiplier — bigger for a child. */
  headScale?: number;
  hat?: 'sunhat' | 'chef' | 'cap' | 'hardhat' | 'bandana' | 'none';
  hatColor?: PaletteKey;
  carried?: 'basket' | 'satchel' | 'toolbox' | 'cane' | 'none';
}

function villagerNode(opt: VillagerOptions): MeshNode {
  const s = opt.heightScale ?? 1;
  const hs = opt.headScale ?? 1;
  const trousers = opt.trousers ?? 'woodDark';
  const hair = opt.hairColor ?? 'hair';

  const legH = 0.16 * s;
  const torsoY = 0.26 * s;
  const torsoH = 0.2 * s;
  const headR = 0.075 * s * hs;
  const headY = legH + torsoH + headR + 0.01 * s;

  const parts: MeshNode[] = [
    // Legs.
    ...[-0.045, 0.045].map((x) =>
      cylinder({
        radiusTop: 0.022 * s,
        radiusBottom: 0.02 * s,
        height: legH,
        radialSegments: 6,
        color: trousers,
        transform: { translate: [x * s, legH / 2, 0] },
      }),
    ),
    // Torso.
    box({ width: 0.15 * s, height: torsoH, depth: 0.1 * s, color: opt.cloth, transform: { translate: [0, torsoY, 0] } }),
    // Arms, angled slightly outward so a carried item reads as held.
    ...[-0.1, 0.1].map((x) =>
      cylinder({
        radiusTop: 0.017 * s,
        radiusBottom: 0.015 * s,
        height: 0.17 * s,
        radialSegments: 6,
        color: opt.skin,
        transform: { translate: [x * s, torsoY + 0.01 * s, 0], rotate: [0, 0, x < 0 ? 0.1 : -0.1] },
      }),
    ),
    // Head + hair cap.
    sphere({ radius: headR, widthSegments: 8, heightSegments: 6, color: opt.skin, transform: { translate: [0, headY, 0] } }),
    sphere({
      radius: headR * 1.04,
      widthSegments: 8,
      heightSegments: 6,
      color: hair,
      transform: { translate: [0, headY + headR * 0.15, -headR * 0.1] },
    }),
  ];

  if (opt.chestPanel) {
    parts.push(
      box({
        width: 0.11 * s,
        height: 0.15 * s,
        depth: 0.02 * s,
        color: opt.chestPanel,
        transform: { translate: [0, torsoY - 0.02 * s, 0.055 * s] },
      }),
    );
  }

  const hatColor = opt.hatColor ?? 'wallWhite';
  switch (opt.hat) {
    case 'sunhat':
      parts.push(
        cylinder({
          radiusTop: 0.11 * s,
          radiusBottom: 0.11 * s,
          height: 0.015 * s,
          radialSegments: 10,
          color: hatColor,
          transform: { translate: [0, headY + headR * 0.55, 0] },
        }),
        cone({
          radius: 0.06 * s,
          height: 0.08 * s,
          radialSegments: 8,
          color: hatColor,
          transform: { translate: [0, headY + headR * 0.55 + 0.045 * s, 0] },
        }),
      );
      break;
    case 'chef':
      parts.push(
        cylinder({
          radiusTop: 0.062 * s,
          radiusBottom: 0.068 * s,
          height: 0.13 * s,
          radialSegments: 10,
          color: hatColor,
          transform: { translate: [0, headY + headR * 0.75 + 0.06 * s, 0] },
        }),
        sphere({
          radius: 0.07 * s,
          widthSegments: 8,
          heightSegments: 6,
          color: hatColor,
          transform: { translate: [0, headY + headR * 0.75 + 0.13 * s, 0] },
        }),
      );
      break;
    case 'cap':
      parts.push(
        sphere({
          radius: 0.066 * s,
          widthSegments: 8,
          heightSegments: 5,
          color: hatColor,
          transform: { translate: [0, headY + headR * 0.35, 0], scale: [1, 0.8, 1] },
        }),
        box({
          width: 0.08 * s,
          height: 0.012 * s,
          depth: 0.045 * s,
          color: hatColor,
          transform: { translate: [0, headY + headR * 0.1, headR * 0.85] },
        }),
      );
      break;
    case 'hardhat':
      parts.push(
        sphere({
          radius: 0.078 * s,
          widthSegments: 8,
          heightSegments: 6,
          color: hatColor,
          transform: { translate: [0, headY + headR * 0.4, 0], scale: [1, 0.75, 1] },
        }),
        cylinder({
          radiusTop: 0.085 * s,
          radiusBottom: 0.085 * s,
          height: 0.012 * s,
          radialSegments: 10,
          color: hatColor,
          transform: { translate: [0, headY, 0] },
        }),
      );
      break;
    case 'bandana':
      parts.push(
        sphere({
          radius: 0.078 * s,
          widthSegments: 8,
          heightSegments: 5,
          color: hatColor,
          transform: { translate: [0, headY + headR * 0.3, 0], scale: [1, 0.65, 1] },
        }),
      );
      break;
    default:
      break;
  }

  switch (opt.carried) {
    case 'basket':
      parts.push(
        cylinder({
          radiusTop: 0.045 * s,
          radiusBottom: 0.035 * s,
          height: 0.055 * s,
          radialSegments: 8,
          color: 'wood',
          transform: { translate: [0.13 * s, 0.19 * s, 0] },
        }),
        sphere({
          radius: 0.03 * s,
          widthSegments: 6,
          heightSegments: 5,
          color: 'cropCarrot',
          transform: { translate: [0.13 * s, 0.225 * s, 0] },
        }),
      );
      break;
    case 'satchel':
      parts.push(
        box({
          width: 0.06 * s,
          height: 0.07 * s,
          depth: 0.03 * s,
          color: 'woodDark',
          transform: { translate: [0.11 * s, 0.19 * s, 0] },
        }),
        box({
          width: 0.02 * s,
          height: 0.2 * s,
          depth: 0.02 * s,
          color: 'woodDark',
          transform: { translate: [0, torsoY, 0.06 * s], rotate: [0, 0, 0.5] },
        }),
      );
      break;
    case 'toolbox':
      parts.push(
        box({
          width: 0.07 * s,
          height: 0.05 * s,
          depth: 0.04 * s,
          color: 'metal',
          transform: { translate: [0.12 * s, 0.14 * s, 0] },
        }),
        box({
          width: 0.07 * s,
          height: 0.012 * s,
          depth: 0.012 * s,
          color: 'accentWarm',
          transform: { translate: [0.12 * s, 0.17 * s, 0] },
        }),
      );
      break;
    case 'cane':
      parts.push(
        cylinder({
          radiusTop: 0.01 * s,
          radiusBottom: 0.01 * s,
          height: 0.3 * s,
          radialSegments: 6,
          color: 'woodDark',
          transform: { translate: [0.12 * s, 0.15 * s, 0], rotate: [0, 0, 0.06] },
        }),
      );
      break;
    default:
      break;
  }

  return group(parts);
}

// villager_a..d keep their existing names — the ambient wandering system
// (villagers.ts) already references them by name — but now carry distinct
// archetypes instead of four identical figures. villager_e..g are new
// archetypes available for other systems to place (market stalls, homes,
// building doorsteps) once they are wired up.

/** Farmer in dungarees, straw sunhat, carrying a harvest basket. */
defineAsset(
  'villager_a',
  villagerNode({
    cloth: 'clothPrimary',
    chestPanel: 'clothSecondary',
    trousers: 'clothSecondary',
    skin: 'skinMid',
    hat: 'sunhat',
    hatColor: 'cropWheat',
    carried: 'basket',
  }),
);

/** Baker in a white apron and tall toque. */
defineAsset(
  'villager_b',
  villagerNode({
    cloth: 'clothPrimary',
    chestPanel: 'wallWhite',
    trousers: 'woodDark',
    skin: 'skinLight',
    hat: 'chef',
    hatColor: 'wallWhite',
    carried: 'basket',
  }),
);

/** Builder in a hi-vis vest and hard hat, carrying a toolbox. */
defineAsset(
  'villager_c',
  villagerNode({
    cloth: 'accentWarm',
    chestPanel: 'wallStone',
    trousers: 'woodDark',
    skin: 'skinMid',
    hat: 'hardhat',
    hatColor: 'accent',
    carried: 'toolbox',
  }),
);

/** Visitor with a cap and a satchel slung across the chest. */
defineAsset(
  'villager_d',
  villagerNode({
    cloth: 'accentCool',
    trousers: 'wallStone',
    skin: 'skinLight',
    hat: 'cap',
    hatColor: 'clothSecondary',
    carried: 'satchel',
  }),
);

/** Child — short, big-headed, bare-headed, empty-handed. */
defineAsset(
  'villager_e',
  villagerNode({
    cloth: 'clothSecondary',
    trousers: 'wallCream',
    skin: 'skinLight',
    heightScale: 0.6,
    headScale: 1.25,
    hat: 'none',
    carried: 'none',
  }),
);

/** Older villager with grey hair, a headscarf and a walking cane. */
defineAsset(
  'villager_f',
  villagerNode({
    cloth: 'wallStone',
    trousers: 'stoneDark',
    skin: 'skinDark',
    hairColor: 'wallWhite',
    heightScale: 0.92,
    hat: 'bandana',
    hatColor: 'clothPrimary',
    carried: 'cane',
  }),
);

/** Market trader in a bright vendor's apron, carrying wares in a basket. */
defineAsset(
  'villager_g',
  villagerNode({
    cloth: 'accent',
    chestPanel: 'clothPrimary',
    trousers: 'woodDark',
    skin: 'skinDark',
    hat: 'cap',
    hatColor: 'accentWarm',
    carried: 'basket',
  }),
);

// ---------------------------------------------------------------------------
// Farm animals — a shared quadruped builder with per-species markings,
// ears, tails, horns and pose so a field of them does not read as one
// stamped-out shape repeated forty times.
// ---------------------------------------------------------------------------

interface QuadrupedOptions {
  body: PaletteKey;
  legColor?: PaletteKey;
  /** Overall size multiplier — smaller for a calf/piglet, bigger for a lion/bear. */
  scale?: number;
  bodyLength?: number;
  earStyle?: 'floppy' | 'small' | 'pointed' | 'round' | 'none';
  earColor?: PaletteKey;
  tail?: 'thin' | 'tuft' | 'fluffy' | 'none';
  tailColor?: PaletteKey;
  /** Two irregular patches, cow/pony style. */
  spots?: PaletteKey | null;
  /** Three stripe bands across the body, zebra/tiger style. */
  stripes?: PaletteKey | null;
  snout?: PaletteKey | null;
  horns?: PaletteKey | null;
  mane?: PaletteKey | null;
  /** Shaggy wool lumps across the back, unsheared-sheep style. */
  wool?: PaletteKey | null;
  pose?: 'standing' | 'grazing';
}

function quadrupedNode(opt: QuadrupedOptions): MeshNode {
  const scale = opt.scale ?? 1;
  const bodyLen = (opt.bodyLength ?? 0.32) * scale;
  const legH = 0.16 * scale;
  const bodyY = legH + 0.07 * scale;
  const legColor = opt.legColor ?? opt.body;
  const grazing = opt.pose === 'grazing';

  const parts: MeshNode[] = [
    box({ width: 0.16 * scale, height: 0.14 * scale, depth: bodyLen, color: opt.body, transform: { translate: [0, bodyY, 0] } }),
  ];

  for (const x of [-0.05 * scale, 0.05 * scale]) {
    for (const sign of [-1, 1]) {
      parts.push(
        cylinder({
          radiusTop: 0.018 * scale,
          radiusBottom: 0.018 * scale,
          height: legH,
          radialSegments: 6,
          color: legColor,
          transform: { translate: [x, legH / 2, sign * (bodyLen / 2 - 0.05 * scale)] },
        }),
      );
    }
  }

  const headZ = bodyLen / 2 + (grazing ? 0.13 : 0.08) * scale;
  const headY = grazing ? bodyY - 0.05 * scale : bodyY + 0.03 * scale;
  parts.push(
    sphere({ radius: 0.09 * scale, widthSegments: 8, heightSegments: 6, color: opt.body, transform: { translate: [0, headY, headZ] } }),
  );

  if (opt.spots) {
    parts.push(
      sphere({
        radius: 0.045 * scale,
        widthSegments: 6,
        heightSegments: 5,
        color: opt.spots,
        transform: { translate: [0.035 * scale, bodyY + 0.05 * scale, -0.06 * scale] },
      }),
      sphere({
        radius: 0.035 * scale,
        widthSegments: 6,
        heightSegments: 5,
        color: opt.spots,
        transform: { translate: [-0.03 * scale, bodyY + 0.02 * scale, 0.07 * scale] },
      }),
    );
  }

  if (opt.stripes) {
    for (let i = 0; i < 3; i++) {
      const z = -bodyLen / 2 + (bodyLen / 4) * (i + 1);
      parts.push(
        box({ width: 0.165 * scale, height: 0.14 * scale, depth: 0.02 * scale, color: opt.stripes, transform: { translate: [0, bodyY, z] } }),
      );
    }
  }

  if (opt.wool) {
    const woolLumps: Array<[number, number]> = [
      [-0.03, -0.08],
      [0.03, -0.08],
      [-0.03, 0.02],
      [0.03, 0.02],
      [0, 0.1],
    ];
    for (const [dx, dz] of woolLumps) {
      parts.push(
        sphere({
          radius: 0.055 * scale,
          widthSegments: 6,
          heightSegments: 5,
          color: opt.wool,
          transform: { translate: [dx * scale, bodyY + 0.05 * scale, dz * scale] },
        }),
      );
    }
  }

  if (opt.earStyle && opt.earStyle !== 'none') {
    const earColor = opt.earColor ?? opt.body;
    const earSize = opt.earStyle === 'floppy' ? 0.035 : opt.earStyle === 'round' ? 0.03 : 0.02;
    const earScale: [number, number, number] =
      opt.earStyle === 'floppy' ? [0.7, 1.6, 0.5] : opt.earStyle === 'pointed' ? [0.7, 1.3, 0.6] : [1, 1, 1];
    for (const x of [-0.045 * scale, 0.045 * scale]) {
      parts.push(
        sphere({
          radius: earSize * scale,
          widthSegments: 5,
          heightSegments: 4,
          color: earColor,
          transform: { translate: [x, headY + 0.07 * scale, headZ - 0.02 * scale], scale: earScale },
        }),
      );
    }
  }

  if (opt.horns) {
    for (const x of [-0.035 * scale, 0.035 * scale]) {
      parts.push(
        cone({
          radius: 0.014 * scale,
          height: 0.06 * scale,
          radialSegments: 6,
          color: opt.horns,
          transform: { translate: [x, headY + 0.08 * scale, headZ - 0.02 * scale], rotate: [-0.3, 0, x < 0 ? -0.2 : 0.2] },
        }),
      );
    }
  }

  if (opt.mane) {
    const mane = opt.mane;
    parts.push(
      sphere({ radius: 0.045 * scale, widthSegments: 6, heightSegments: 5, color: mane, transform: { translate: [-0.05 * scale, headY + 0.02 * scale, headZ - 0.03 * scale] } }),
      sphere({ radius: 0.045 * scale, widthSegments: 6, heightSegments: 5, color: mane, transform: { translate: [0.05 * scale, headY + 0.02 * scale, headZ - 0.03 * scale] } }),
      sphere({ radius: 0.045 * scale, widthSegments: 6, heightSegments: 5, color: mane, transform: { translate: [0, headY + 0.06 * scale, headZ - 0.03 * scale] } }),
      sphere({ radius: 0.04 * scale, widthSegments: 6, heightSegments: 5, color: mane, transform: { translate: [-0.04 * scale, headY - 0.02 * scale, headZ - 0.02 * scale] } }),
      sphere({ radius: 0.04 * scale, widthSegments: 6, heightSegments: 5, color: mane, transform: { translate: [0.04 * scale, headY - 0.02 * scale, headZ - 0.02 * scale] } }),
    );
  }

  if (opt.snout) {
    parts.push(
      box({ width: 0.05 * scale, height: 0.035 * scale, depth: 0.03 * scale, color: opt.snout, transform: { translate: [0, headY - 0.02 * scale, headZ + 0.08 * scale] } }),
    );
  }

  const tailBaseZ = -bodyLen / 2 - 0.02 * scale;
  switch (opt.tail) {
    case 'thin':
      parts.push(
        cylinder({
          radiusTop: 0.008 * scale,
          radiusBottom: 0.008 * scale,
          height: 0.14 * scale,
          radialSegments: 5,
          color: opt.tailColor ?? opt.body,
          transform: { translate: [0, bodyY + 0.02 * scale, tailBaseZ], rotate: [0.6, 0, 0] },
        }),
      );
      break;
    case 'tuft':
      parts.push(
        cylinder({
          radiusTop: 0.01 * scale,
          radiusBottom: 0.01 * scale,
          height: 0.1 * scale,
          radialSegments: 5,
          color: opt.body,
          transform: { translate: [0, bodyY, tailBaseZ], rotate: [0.5, 0, 0] },
        }),
        sphere({
          radius: 0.025 * scale,
          widthSegments: 5,
          heightSegments: 4,
          color: opt.tailColor ?? 'hair',
          transform: { translate: [0, bodyY - 0.05 * scale, tailBaseZ - 0.06 * scale] },
        }),
      );
      break;
    case 'fluffy':
      parts.push(
        sphere({
          radius: 0.05 * scale,
          widthSegments: 6,
          heightSegments: 5,
          color: opt.tailColor ?? opt.body,
          transform: { translate: [0, bodyY, tailBaseZ] },
        }),
      );
      break;
    default:
      break;
  }

  return group(parts);
}

interface ChickenOptions {
  scale?: number;
  rooster?: boolean;
  comb?: boolean;
}

function chickenNode(opt: ChickenOptions = {}): MeshNode {
  const scale = opt.scale ?? 1;
  const showComb = opt.comb ?? true;
  const bodyColor: PaletteKey = opt.rooster ? 'accentWarm' : 'wallWhite';

  const parts: MeshNode[] = [
    sphere({ radius: 0.08 * scale, widthSegments: 7, heightSegments: 6, color: bodyColor, transform: { translate: [0, 0.12 * scale, 0] } }),
    sphere({
      radius: 0.05 * scale,
      widthSegments: 6,
      heightSegments: 5,
      color: opt.rooster ? 'wallCream' : 'wallWhite',
      transform: { translate: [0, 0.2 * scale, 0.06 * scale] },
    }),
    box({ width: 0.02 * scale, height: 0.02 * scale, depth: 0.04 * scale, color: 'accentWarm', transform: { translate: [0, 0.2 * scale, 0.11 * scale] } }),
    ...[-0.02, 0.02].map((x) =>
      cylinder({
        radiusTop: 0.006 * scale,
        radiusBottom: 0.006 * scale,
        height: 0.06 * scale,
        radialSegments: 5,
        color: 'accentWarm',
        transform: { translate: [x * scale, 0.03 * scale, 0] },
      }),
    ),
  ];

  if (showComb) {
    parts.push(
      box({ width: 0.02 * scale, height: 0.02 * scale, depth: 0.02 * scale, color: 'clothPrimary', transform: { translate: [0, 0.26 * scale, 0.06 * scale] } }),
    );
  }
  if (opt.rooster) {
    parts.push(
      sphere({
        radius: 0.04 * scale,
        widthSegments: 5,
        heightSegments: 4,
        color: 'hair',
        transform: { translate: [0, 0.16 * scale, -0.09 * scale], scale: [0.6, 1.4, 0.6] },
      }),
    );
  }

  return group(parts);
}

defineAsset('animal_chicken', chickenNode());
defineAsset('animal_rooster', chickenNode({ rooster: true }));
defineAsset('animal_chick', chickenNode({ scale: 0.55, comb: false }));

defineAsset(
  'animal_cow',
  quadrupedNode({ body: 'wallWhite', spots: 'stoneDark', earStyle: 'floppy', tail: 'tuft', tailColor: 'hair' }),
);
defineAsset(
  'animal_cow_grazing',
  quadrupedNode({ body: 'wallWhite', spots: 'stoneDark', earStyle: 'floppy', tail: 'tuft', tailColor: 'hair', pose: 'grazing' }),
);
defineAsset(
  'animal_cow_holstein',
  quadrupedNode({ body: 'wallWhite', spots: 'hair', earStyle: 'floppy', tail: 'tuft', tailColor: 'hair' }),
);
defineAsset(
  'animal_calf',
  quadrupedNode({ body: 'wallCream', spots: 'stoneDark', earStyle: 'floppy', tail: 'tuft', tailColor: 'hair', scale: 0.6 }),
);

defineAsset(
  'animal_sheep',
  quadrupedNode({ body: 'wallCream', earStyle: 'small', tail: 'tuft', bodyLength: 0.3, wool: 'wallCream' }),
);
defineAsset(
  'animal_sheep_sheared',
  quadrupedNode({ body: 'skinLight', earStyle: 'small', tail: 'thin', bodyLength: 0.26, legColor: 'wallCream' }),
);

defineAsset(
  'animal_pig',
  quadrupedNode({ body: 'skinLight', earStyle: 'small', snout: 'skinMid', tail: 'thin', bodyLength: 0.3 }),
);
defineAsset(
  'animal_piglet',
  quadrupedNode({ body: 'skinLight', earStyle: 'small', snout: 'skinMid', tail: 'thin', bodyLength: 0.22, scale: 0.6 }),
);

defineAsset('animal_goat', quadrupedNode({ body: 'wallStone', earStyle: 'small', horns: 'stoneDark', tail: 'thin' }));
defineAsset(
  'animal_goat_grazing',
  quadrupedNode({ body: 'wallStone', earStyle: 'small', horns: 'stoneDark', tail: 'thin', pose: 'grazing' }),
);

defineAsset(
  'animal_bee',
  group([
    sphere({ radius: 0.03, widthSegments: 6, heightSegments: 5, color: 'accent', transform: { translate: [0, 0, 0] } }),
    box({ width: 0.05, height: 0.005, depth: 0.03, color: 'wallWhite', transform: { translate: [0.03, 0.01, 0], rotate: [0, 0.3, 0] } }),
    box({ width: 0.05, height: 0.005, depth: 0.03, color: 'wallWhite', transform: { translate: [-0.03, 0.01, 0], rotate: [0, -0.3, 0] } }),
  ]),
);

// ---------------------------------------------------------------------------
// Wild scenery critters — decoration-grade animals for a pond, a garden or
// a passing moment of ambience. Not required by any current game-state
// field; registered under a `critter_` prefix so a decoration/placement
// system can pick them up.
// ---------------------------------------------------------------------------

function duckNode(body: PaletteKey, scale = 1): MeshNode {
  return group([
    sphere({ radius: 0.06 * scale, widthSegments: 7, heightSegments: 6, color: body, transform: { translate: [0, 0.05 * scale, 0], scale: [1, 0.85, 1.4] } }),
    sphere({ radius: 0.035 * scale, widthSegments: 6, heightSegments: 5, color: body, transform: { translate: [0, 0.1 * scale, 0.07 * scale] } }),
    box({ width: 0.02 * scale, height: 0.012 * scale, depth: 0.03 * scale, color: 'accentWarm', transform: { translate: [0, 0.095 * scale, 0.1 * scale] } }),
  ]);
}

defineAsset('critter_duck', duckNode('wallCream'));
defineAsset('critter_duck_brown', duckNode('soilDry'));

interface SmallCritterOptions {
  body: PaletteKey;
  earStyle: 'cat' | 'dog' | 'rabbit';
  earColor?: PaletteKey;
  tailStyle: 'thin' | 'fluffy' | 'poof';
  tailColor?: PaletteKey;
  sitting?: boolean;
  scale?: number;
}

function smallCritterNode(opt: SmallCritterOptions): MeshNode {
  const scale = opt.scale ?? 1;
  const bodyR = 0.07 * scale;
  const bodyY = opt.sitting ? bodyR * 1.1 : bodyR;
  const headY = bodyY + (opt.sitting ? bodyR * 0.9 : bodyR * 0.4) + bodyR * 0.5;
  const headZ = opt.sitting ? 0 : bodyR * 1.1;

  const parts: MeshNode[] = [
    sphere({
      radius: bodyR,
      widthSegments: 7,
      heightSegments: 6,
      color: opt.body,
      transform: { translate: [0, bodyY, 0], scale: opt.sitting ? [1, 1.3, 0.9] : [1, 0.85, 1.3] },
    }),
    sphere({
      radius: bodyR * 0.7,
      widthSegments: 7,
      heightSegments: 6,
      color: opt.body,
      transform: { translate: [0, headY, headZ] },
    }),
  ];

  if (!opt.sitting) {
    for (const x of [-0.035 * scale, 0.035 * scale]) {
      for (const sign of [-1, 1]) {
        parts.push(
          cylinder({
            radiusTop: 0.012 * scale,
            radiusBottom: 0.012 * scale,
            height: 0.06 * scale,
            radialSegments: 5,
            color: opt.body,
            transform: { translate: [x, 0.03 * scale, sign * bodyR * 0.7] },
          }),
        );
      }
    }
  } else {
    for (const x of [-0.04 * scale, 0.04 * scale]) {
      parts.push(
        cylinder({
          radiusTop: 0.012 * scale,
          radiusBottom: 0.012 * scale,
          height: 0.08 * scale,
          radialSegments: 5,
          color: opt.body,
          transform: { translate: [x, 0.04 * scale, bodyR * 0.7] },
        }),
      );
    }
  }

  const earColor = opt.earColor ?? opt.body;
  for (const x of [-0.03 * scale, 0.03 * scale]) {
    parts.push(
      cone({
        radius: opt.earStyle === 'rabbit' ? 0.012 * scale : 0.018 * scale,
        height: opt.earStyle === 'rabbit' ? 0.09 * scale : 0.035 * scale,
        radialSegments: 5,
        color: earColor,
        transform: { translate: [x, headY, headZ], rotate: opt.earStyle === 'dog' ? [0.6, 0, x < 0 ? 0.2 : -0.2] : [0, 0, 0] },
      }),
    );
  }

  const tailZ = opt.sitting ? -bodyR * 1.1 : -bodyR * 1.3;
  switch (opt.tailStyle) {
    case 'thin':
      parts.push(
        cylinder({
          radiusTop: 0.008 * scale,
          radiusBottom: 0.008 * scale,
          height: 0.12 * scale,
          radialSegments: 5,
          color: opt.tailColor ?? opt.body,
          transform: { translate: [0, bodyY + 0.02 * scale, tailZ], rotate: [0.8, 0, 0] },
        }),
      );
      break;
    case 'fluffy':
      parts.push(
        sphere({ radius: 0.04 * scale, widthSegments: 6, heightSegments: 5, color: opt.tailColor ?? opt.body, transform: { translate: [0, bodyY + 0.05 * scale, tailZ] } }),
      );
      break;
    case 'poof':
      parts.push(
        sphere({ radius: 0.035 * scale, widthSegments: 6, heightSegments: 5, color: opt.tailColor ?? 'wallWhite', transform: { translate: [0, bodyY, tailZ] } }),
      );
      break;
  }

  return group(parts);
}

defineAsset('critter_cat', smallCritterNode({ body: 'stoneDark', earStyle: 'cat', tailStyle: 'thin' }));
defineAsset('critter_cat_sitting', smallCritterNode({ body: 'stoneDark', earStyle: 'cat', tailStyle: 'thin', sitting: true }));
defineAsset('critter_dog', smallCritterNode({ body: 'soilDry', earStyle: 'dog', tailStyle: 'fluffy', scale: 1.1 }));
defineAsset('critter_dog_sitting', smallCritterNode({ body: 'soilDry', earStyle: 'dog', tailStyle: 'fluffy', scale: 1.1, sitting: true }));
defineAsset('critter_rabbit', smallCritterNode({ body: 'wallCream', earStyle: 'rabbit', tailStyle: 'poof', scale: 0.85 }));

function songbirdNode(body: PaletteKey, accent: PaletteKey, scale = 1): MeshNode {
  return group([
    sphere({ radius: 0.035 * scale, widthSegments: 6, heightSegments: 5, color: body, transform: { translate: [0, 0.05 * scale, 0], scale: [1, 0.9, 1.3] } }),
    sphere({ radius: 0.022 * scale, widthSegments: 5, heightSegments: 4, color: accent, transform: { translate: [0, 0.075 * scale, 0.035 * scale] } }),
    box({ width: 0.05 * scale, height: 0.006 * scale, depth: 0.02 * scale, color: accent, transform: { translate: [0.03 * scale, 0.05 * scale, -0.01 * scale], rotate: [0, 0.2, 0] } }),
    box({ width: 0.05 * scale, height: 0.006 * scale, depth: 0.02 * scale, color: accent, transform: { translate: [-0.03 * scale, 0.05 * scale, -0.01 * scale], rotate: [0, -0.2, 0] } }),
  ]);
}

defineAsset('critter_bird', songbirdNode('accentWarm', 'wallCream'));

defineAsset(
  'critter_butterfly',
  group([
    box({ width: 0.05, height: 0.002, depth: 0.03, color: 'accentCool', transform: { translate: [0.025, 0.15, 0], rotate: [0, 0, 0.35] } }),
    box({ width: 0.05, height: 0.002, depth: 0.03, color: 'accentCool', transform: { translate: [-0.025, 0.15, 0], rotate: [0, 0, -0.35] } }),
    cylinder({
      radiusTop: 0.004,
      radiusBottom: 0.004,
      height: 0.04,
      radialSegments: 5,
      color: 'hair',
      transform: { translate: [0, 0.15, 0], rotate: [Math.PI / 2, 0, 0] },
    }),
  ]),
);

// ---------------------------------------------------------------------------
// Zoo species — each of the zoo's catalog entries (balance/zoo.json) gets a
// recognisable low-poly mesh rather than a generic placeholder box.
// Registered as `zoo_animal_<speciesId>` so a rendering system can look one
// up directly from a hatched species id.
// ---------------------------------------------------------------------------

defineAsset(
  'zoo_animal_lion',
  quadrupedNode({ body: 'accentWarm', mane: 'woodDark', earStyle: 'round', tail: 'tuft', tailColor: 'woodDark', scale: 1.15 }),
);
defineAsset(
  'zoo_animal_zebra',
  quadrupedNode({ body: 'wallWhite', stripes: 'hair', earStyle: 'round', tail: 'tuft', tailColor: 'hair' }),
);
defineAsset(
  'zoo_animal_tiger',
  quadrupedNode({ body: 'accentWarm', stripes: 'hair', earStyle: 'round', tail: 'tuft', tailColor: 'hair', scale: 1.1 }),
);
defineAsset(
  'zoo_animal_mountain_goat',
  quadrupedNode({ body: 'wallCream', earStyle: 'small', horns: 'stoneDark', tail: 'thin', scale: 0.9 }),
);
defineAsset(
  'zoo_animal_polar_bear',
  quadrupedNode({ body: 'snow', earStyle: 'round', tail: 'thin', scale: 1.3, bodyLength: 0.36 }),
);
defineAsset(
  'zoo_animal_arctic_fox',
  quadrupedNode({ body: 'snow', earStyle: 'pointed', tail: 'fluffy', tailColor: 'snow', scale: 0.75 }),
);

function elephantNode(): MeshNode {
  const body: PaletteKey = 'metalDark';
  return group([
    box({ width: 0.24, height: 0.22, depth: 0.4, color: body, transform: { translate: [0, 0.25, 0] } }),
    ...[-0.08, 0.08].flatMap((x) =>
      [-1, 1].map((sign) =>
        cylinder({ radiusTop: 0.03, radiusBottom: 0.032, height: 0.22, radialSegments: 6, color: body, transform: { translate: [x, 0.11, sign * 0.14] } }),
      ),
    ),
    sphere({ radius: 0.13, widthSegments: 8, heightSegments: 6, color: body, transform: { translate: [0, 0.34, 0.22] } }),
    ...[-0.16, 0.16].map((x) =>
      box({ width: 0.02, height: 0.16, depth: 0.16, color: body, transform: { translate: [x, 0.36, 0.2], rotate: [0, x < 0 ? -0.3 : 0.3, 0] } }),
    ),
    cylinder({ radiusTop: 0.03, radiusBottom: 0.02, height: 0.18, radialSegments: 8, color: body, transform: { translate: [0, 0.24, 0.34], rotate: [0.25, 0, 0] } }),
    ...[-0.05, 0.05].map((x) =>
      cone({ radius: 0.012, height: 0.05, radialSegments: 5, color: 'wallCream', transform: { translate: [x, 0.3, 0.28], rotate: [1.6, 0, x < 0 ? -0.1 : 0.1] } }),
    ),
  ]);
}
defineAsset('zoo_animal_elephant', elephantNode());

function flamingoNode(): MeshNode {
  const body: PaletteKey = 'cropStrawberry';
  return group([
    sphere({ radius: 0.08, widthSegments: 7, heightSegments: 6, color: body, transform: { translate: [0, 0.34, 0] } }),
    cylinder({ radiusTop: 0.018, radiusBottom: 0.018, height: 0.16, radialSegments: 6, color: body, transform: { translate: [0, 0.44, 0.03], rotate: [0.2, 0, 0] } }),
    sphere({ radius: 0.045, widthSegments: 6, heightSegments: 5, color: body, transform: { translate: [0, 0.53, 0.06] } }),
    box({ width: 0.015, height: 0.012, depth: 0.045, color: 'hair', transform: { translate: [0, 0.525, 0.1], rotate: [0.5, 0, 0] } }),
    ...[-0.02, 0.02].map((x) =>
      cylinder({ radiusTop: 0.01, radiusBottom: 0.008, height: 0.28, radialSegments: 5, color: body, transform: { translate: [x, 0.14, 0], rotate: [0, 0, x < 0 ? 0.06 : -0.06] } }),
    ),
  ]);
}
defineAsset('zoo_animal_flamingo', flamingoNode());

function otterNode(): MeshNode {
  const body: PaletteKey = 'woodDark';
  return group([
    sphere({ radius: 0.075, widthSegments: 7, heightSegments: 6, color: body, transform: { translate: [0, 0.08, 0], scale: [1, 0.8, 1.7] } }),
    sphere({ radius: 0.05, widthSegments: 6, heightSegments: 5, color: body, transform: { translate: [0, 0.1, 0.14] } }),
    ...[-0.04, 0.04].flatMap((x) =>
      [-1, 1].map((sign) =>
        cylinder({ radiusTop: 0.014, radiusBottom: 0.014, height: 0.05, radialSegments: 5, color: body, transform: { translate: [x, 0.03, sign * 0.09] } }),
      ),
    ),
    cylinder({ radiusTop: 0.02, radiusBottom: 0.006, height: 0.16, radialSegments: 6, color: body, transform: { translate: [0, 0.06, -0.18], rotate: [1.4, 0, 0] } }),
  ]);
}
defineAsset('zoo_animal_otter', otterNode());

function sealNode(): MeshNode {
  const body: PaletteKey = 'stoneDark';
  return group([
    sphere({ radius: 0.09, widthSegments: 8, heightSegments: 6, color: body, transform: { translate: [0, 0.09, 0], scale: [1, 0.75, 1.8] } }),
    sphere({ radius: 0.055, widthSegments: 6, heightSegments: 5, color: body, transform: { translate: [0, 0.11, 0.17] } }),
    ...[-0.08, 0.08].map((x) =>
      box({ width: 0.06, height: 0.015, depth: 0.1, color: body, transform: { translate: [x, 0.04, 0.05], rotate: [0, 0, x < 0 ? 0.3 : -0.3] } }),
    ),
    box({ width: 0.05, height: 0.012, depth: 0.09, color: body, transform: { translate: [0, 0.04, -0.2], rotate: [0.15, 0, 0] } }),
  ]);
}
defineAsset('zoo_animal_seal', sealNode());

function penguinNode(): MeshNode {
  return group([
    cone({ radius: 0.07, height: 0.24, radialSegments: 8, color: 'hair', transform: { translate: [0, 0.12, 0] } }),
    sphere({ radius: 0.045, widthSegments: 6, heightSegments: 5, color: 'wallWhite', transform: { translate: [0, 0.11, 0.045], scale: [0.85, 1.3, 0.6] } }),
    sphere({ radius: 0.05, widthSegments: 7, heightSegments: 6, color: 'hair', transform: { translate: [0, 0.27, 0] } }),
    box({ width: 0.02, height: 0.02, depth: 0.03, color: 'accentWarm', transform: { translate: [0, 0.26, 0.045] } }),
    ...[-0.07, 0.07].map((x) =>
      box({ width: 0.02, height: 0.1, depth: 0.03, color: 'hair', transform: { translate: [x, 0.16, 0], rotate: [0, 0, x < 0 ? 0.3 : -0.3] } }),
    ),
    ...[-0.03, 0.03].map((x) =>
      box({ width: 0.03, height: 0.01, depth: 0.05, color: 'accentWarm', transform: { translate: [x, 0.005, 0.02] } }),
    ),
  ]);
}
defineAsset('zoo_animal_penguin', penguinNode());

function eagleNode(): MeshNode {
  return group([
    sphere({ radius: 0.09, widthSegments: 8, heightSegments: 6, color: 'woodDark', transform: { translate: [0, 0.14, 0], scale: [1, 0.9, 1.4] } }),
    sphere({ radius: 0.055, widthSegments: 6, heightSegments: 5, color: 'wallWhite', transform: { translate: [0, 0.22, 0.1] } }),
    cone({ radius: 0.018, height: 0.04, radialSegments: 5, color: 'accentWarm', transform: { translate: [0, 0.21, 0.16], rotate: [1.5, 0, 0] } }),
    ...[-0.02, 0.02].map((x) =>
      cylinder({ radiusTop: 0.012, radiusBottom: 0.012, height: 0.1, radialSegments: 5, color: 'accentWarm', transform: { translate: [x, 0.05, 0.02] } }),
    ),
    ...[-1, 1].map((sign) =>
      box({ width: 0.16, height: 0.015, depth: 0.08, color: 'woodDark', transform: { translate: [sign * 0.1, 0.16, -0.02], rotate: [0, 0, sign * 0.15] } }),
    ),
  ]);
}
defineAsset('zoo_animal_eagle', eagleNode());
