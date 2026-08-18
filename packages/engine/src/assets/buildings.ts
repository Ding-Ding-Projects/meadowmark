/**
 * Generated building meshes — houses, factories, community buildings, and
 * the barn, zoo enclosures and mine entrance.
 *
 * Every building is built from box/prism/roof/cone/cylinder/sphere/extrude
 * primitives only and is designed to read correctly from every side,
 * because the player's camera can orbit freely: there is no "front-only"
 * facade, and nothing here relies on a face that is never meant to be seen.
 *
 * A small shared roof/window/chimney toolkit lives at the top of this file
 * so every category (house, factory, community landmark) can mix gabled,
 * hipped/pyramid, flat, sawtooth and domed rooflines instead of every
 * building wearing the same tent shape at a different size.
 */

import {
  box,
  cone,
  cylinder,
  defineAsset,
  extrude,
  group,
  prism,
  roof,
  sphere,
  type MeshNode,
} from '../mesh-dsl.js';
import type { PaletteKey } from '../palette.js';

// ---------------------------------------------------------------------------
// Shared roof toolkit — every building category below picks from this set
// instead of always wearing a plain gable.
// ---------------------------------------------------------------------------

type RoofStyle = 'gable' | 'hip' | 'flat' | 'sawtooth' | 'dome';

/** A gable (pitched) roof sitting on top of a box of the given footprint. */
function gableRoofPart(
  width: number,
  depth: number,
  height: number,
  color: PaletteKey,
  baseY: number,
): MeshNode {
  return roof({ width, depth, height, color, transform: { translate: [0, baseY, 0] } });
}

/**
 * A square pyramid cap, rotated 45 degrees so its faces (not just its
 * vertices) line up with the cardinal directions. It reads as a hip /
 * pavilion roof from any orbit angle even though its base is a square
 * rather than a true rectangle — the same "diamond, rotated square"
 * convention this file already used for the school's bell-tower cap.
 */
function pyramidRoofPart(
  width: number,
  depth: number,
  height: number,
  color: PaletteKey,
  baseY: number,
): MeshNode {
  const radius = (Math.max(width, depth) / 2) * 1.12;
  return cone({
    radius,
    height,
    radialSegments: 4,
    color,
    transform: { translate: [0, baseY + height / 2, 0], rotate: [0, Math.PI / 4, 0] },
  });
}

/** A flat roof with a shallow parapet lip, for a boxier industrial look. */
function flatRoofPart(width: number, depth: number, color: PaletteKey, baseY: number): MeshNode {
  return group([
    box({
      width: width + 0.06,
      height: 0.05,
      depth: depth + 0.06,
      color,
      transform: { translate: [0, baseY + 0.025, 0] },
    }),
    box({
      width,
      height: 0.09,
      depth,
      color,
      transform: { translate: [0, baseY + 0.05 + 0.045, 0] },
    }),
  ]);
}

/**
 * A row of narrow gables imitating a sawtooth mill roof — the classic
 * north-light profile of a 19th-century weaving shed, built here from
 * three ordinary gable roofs tiled side by side along the width axis.
 */
function sawtoothRoofPart(
  width: number,
  depth: number,
  segHeight: number,
  color: PaletteKey,
  baseY: number,
): MeshNode {
  const segments = 3;
  const segWidth = width / segments;
  const parts: MeshNode[] = [];
  for (let i = 0; i < segments; i++) {
    const x = -width / 2 + segWidth * (i + 0.5);
    parts.push(
      roof({
        width: segWidth,
        depth,
        height: segHeight,
        color,
        overhang: 0.015,
        transform: { translate: [x, baseY, 0] },
      }),
    );
  }
  return group(parts);
}

/** A squat dome on a short drum — a landmark cap for the fancier buildings. */
function domeRoofPart(radius: number, color: PaletteKey, baseY: number): MeshNode {
  return group([
    cylinder({
      radiusTop: radius,
      radiusBottom: radius * 1.06,
      height: 0.14,
      radialSegments: 12,
      color,
      transform: { translate: [0, baseY + 0.07, 0] },
    }),
    sphere({
      radius,
      widthSegments: 10,
      heightSegments: 8,
      color,
      transform: { translate: [0, baseY + 0.14, 0], scale: [1, 0.72, 1] },
    }),
  ]);
}

function roofPart(
  style: RoofStyle,
  width: number,
  depth: number,
  height: number,
  color: PaletteKey,
  baseY: number,
): MeshNode {
  switch (style) {
    case 'gable':
      return gableRoofPart(width, depth, height, color, baseY);
    case 'hip':
      return pyramidRoofPart(width, depth, height, color, baseY);
    case 'flat':
      return flatRoofPart(width, depth, color, baseY);
    case 'sawtooth':
      return sawtoothRoofPart(width, depth, height, color, baseY);
    case 'dome':
      return domeRoofPart(Math.max(width, depth) / 2, color, baseY);
    default: {
      const exhaustive: never = style;
      throw new Error(`buildings: unknown roof style ${String(exhaustive)}`);
    }
  }
}

/**
 * Small window panes on the two long side walls, echoing the door's
 * both-sides visibility trick so every wall of the footprint reads from
 * an orbiting camera, not just the two the original design faced.
 */
function sideWindows(
  width: number,
  depth: number,
  wallHeight: number,
  count: number,
  winHeight = 0.16,
  color: PaletteKey = 'glass',
): MeshNode[] {
  const parts: MeshNode[] = [];
  const y = wallHeight - winHeight / 2 - wallHeight * 0.14;
  const spacing = width / (count + 1);
  for (let i = 1; i <= count; i++) {
    const x = -width / 2 + spacing * i;
    parts.push(
      box({
        width: Math.min(0.16, spacing * 0.5),
        height: winHeight,
        depth: 0.03,
        color,
        transform: { translate: [x, y, depth / 2 + 0.02] },
      }),
      box({
        width: Math.min(0.16, spacing * 0.5),
        height: winHeight,
        depth: 0.03,
        color,
        transform: { translate: [x, y, -depth / 2 - 0.02] },
      }),
    );
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Houses — a real tier progression from a one-room cottage to a manor.
// ---------------------------------------------------------------------------

function houseWindows(width: number, depth: number, wallHeight: number): MeshNode[] {
  const y = wallHeight * 0.62;
  const x = width * 0.28;
  return [
    box({ width: 0.16, height: 0.16, depth: 0.03, color: 'glass', transform: { translate: [x, y, depth / 2 + 0.02] } }),
    box({ width: 0.16, height: 0.16, depth: 0.03, color: 'glass', transform: { translate: [-x, y, depth / 2 + 0.02] } }),
    box({ width: 0.16, height: 0.16, depth: 0.03, color: 'glass', transform: { translate: [x, y, -depth / 2 - 0.02] } }),
    box({ width: 0.16, height: 0.16, depth: 0.03, color: 'glass', transform: { translate: [-x, y, -depth / 2 - 0.02] } }),
  ];
}

function chimneyStack(x: number, z: number, wallHeight: number, roofHeight: number, color: PaletteKey = 'wallStone'): MeshNode {
  return box({
    width: 0.2,
    height: roofHeight * 0.95,
    depth: 0.2,
    color,
    transform: { translate: [x, wallHeight + roofHeight * 0.5, z] },
  });
}

/** A gabled canopy on two posts over the front door, plus a stone step. */
function porchPart(width: number, depth: number, wallHeight: number): MeshNode {
  return group([
    roof({
      width: width * 0.42,
      depth: 0.34,
      height: 0.16,
      color: 'roofClay',
      transform: { translate: [0, wallHeight * 0.68, depth / 2 + 0.22] },
    }),
    cylinder({ radiusTop: 0.03, radiusBottom: 0.03, height: wallHeight * 0.6, radialSegments: 6, color: 'wood', transform: { translate: [width * 0.17, wallHeight * 0.3, depth / 2 + 0.36] } }),
    cylinder({ radiusTop: 0.03, radiusBottom: 0.03, height: wallHeight * 0.6, radialSegments: 6, color: 'wood', transform: { translate: [-width * 0.17, wallHeight * 0.3, depth / 2 + 0.36] } }),
    box({ width: width * 0.5, height: 0.1, depth: 0.5, color: 'stone', transform: { translate: [0, 0.05, depth / 2 + 0.24] } }),
  ]);
}

/** A small covered balcony overhang, wood decking under a stone rail. */
function balconyPart(x: number, y: number, z: number, width: number): MeshNode {
  return group([
    box({ width, height: 0.05, depth: 0.34, color: 'wood', transform: { translate: [x, y, z] } }),
    box({ width, height: 0.2, depth: 0.03, color: 'wallStone', transform: { translate: [x, y + 0.12, z + 0.16] } }),
  ]);
}

/** A little roofed dormer window poking out of a pitched roof slope. */
function dormerPart(x: number, roofBaseY: number, wall: PaletteKey, roofColor: PaletteKey): MeshNode {
  return group([
    box({ width: 0.3, height: 0.22, depth: 0.26, color: wall, transform: { translate: [x, roofBaseY + 0.11, 0.03] } }),
    roof({ width: 0.32, depth: 0.28, height: 0.17, color: roofColor, transform: { translate: [x, roofBaseY + 0.22, 0.03] } }),
    box({ width: 0.1, height: 0.1, depth: 0.02, color: 'glass', transform: { translate: [x, roofBaseY + 0.11, 0.16] } }),
  ]);
}

/** Tier 1 — a one-room cottage: box, gable, door. Nothing more. */
defineAsset(
  'house_tier_1',
  group([
    box({ width: 1.4, height: 0.8, depth: 1.2, color: 'wallCream', transform: { translate: [0, 0.4, 0] } }),
    gableRoofPart(1.4, 1.2, 0.55, 'roofClay', 0.8),
    box({ width: 0.24, height: 0.44, depth: 0.05, color: 'woodDark', transform: { translate: [0, 0.22, 0.62] } }),
  ]),
);

/** Tier 2 — a timbered cottage: thatch roof, a chimney, real windows. */
defineAsset(
  'house_tier_2',
  group([
    box({ width: 1.7, height: 0.95, depth: 1.5, color: 'wallTimber', transform: { translate: [0, 0.475, 0] } }),
    gableRoofPart(1.7, 1.5, 0.68, 'roofThatch', 0.95),
    box({ width: 0.28, height: 0.5, depth: 0.05, color: 'woodDark', transform: { translate: [0, 0.25, 0.77] } }),
    chimneyStack(0.55, 0, 0.95, 0.68),
    ...houseWindows(1.7, 1.5, 0.95),
  ]),
);

/** Tier 3 — a stone house: taller walls, a doorstep, a proper chimney. */
defineAsset(
  'house_tier_3',
  group([
    box({ width: 2.1, height: 1.1, depth: 1.7, color: 'wallStone', transform: { translate: [0, 0.55, 0] } }),
    gableRoofPart(2.1, 1.7, 0.78, 'roofClay', 1.1),
    box({ width: 0.3, height: 0.58, depth: 0.05, color: 'woodDark', transform: { translate: [0, 0.29, 0.87] } }),
    box({ width: 0.6, height: 0.08, depth: 0.4, color: 'stone', transform: { translate: [0, 0.04, 0.95] } }),
    chimneyStack(0.62, 0.1, 1.1, 0.78),
    ...houseWindows(2.1, 1.7, 1.1),
  ]),
);

/** Tier 4 — a house with a first attached wing, a hip roof, a porch. */
defineAsset(
  'house_tier_4',
  group([
    box({ width: 2.4, height: 1.25, depth: 2.0, color: 'wallStone', transform: { translate: [0, 0.625, 0] } }),
    pyramidRoofPart(2.4, 2.0, 0.85, 'roofSlate', 1.25),
    box({ width: 0.32, height: 0.6, depth: 0.05, color: 'woodDark', transform: { translate: [0, 0.3, 1.02] } }),
    chimneyStack(0.9, 0.5, 1.25, 0.85),
    ...houseWindows(2.4, 2.0, 1.25),
    porchPart(2.4, 2.0, 1.25),
    box({ width: 0.6, height: 1.0, depth: 0.6, color: 'wallStone', transform: { translate: [1.35, 0.5, -0.9] } }),
    gableRoofPart(0.6, 0.6, 0.32, 'roofSlate', 1.0),
  ]),
);

/** Tier 5 — bigger still: a hip roof, a wing, a covered balcony and a dormer. */
defineAsset(
  'house_tier_5',
  group([
    box({ width: 2.7, height: 1.4, depth: 2.3, color: 'wallCream', transform: { translate: [0, 0.7, 0] } }),
    pyramidRoofPart(2.7, 2.3, 0.95, 'roofSlate', 1.4),
    box({ width: 0.32, height: 0.62, depth: 0.05, color: 'woodDark', transform: { translate: [0, 0.31, 1.17] } }),
    chimneyStack(-1.0, 0.6, 1.4, 0.95),
    ...houseWindows(2.7, 2.3, 1.4),
    dormerPart(0.5, 1.4, 'wallCream', 'roofSlate'),
    box({ width: 0.75, height: 1.15, depth: 0.75, color: 'wallCream', transform: { translate: [1.55, 0.575, -1.0] } }),
    gableRoofPart(0.75, 0.75, 0.45, 'roofSlate', 1.15),
    balconyPart(0, 1.4, 1.15 + 0.17, 1.0),
  ]),
);

/** Tier 6 — twin symmetric wings, a proper hip roof, dormers, two chimneys. */
defineAsset(
  'house_tier_6',
  group([
    box({ width: 3.2, height: 1.55, depth: 2.4, color: 'wallWhite', transform: { translate: [0, 0.775, 0] } }),
    pyramidRoofPart(3.2, 2.4, 1.0, 'roofSlate', 1.55),
    box({ width: 0.36, height: 0.68, depth: 0.05, color: 'woodDark', transform: { translate: [0, 0.34, 1.22] } }),
    chimneyStack(1.1, 0.7, 1.55, 1.0),
    chimneyStack(-1.1, -0.7, 1.55, 1.0),
    ...houseWindows(3.2, 2.4, 1.55),
    dormerPart(-0.6, 1.55, 'wallWhite', 'roofSlate'),
    dormerPart(0.6, 1.55, 'wallWhite', 'roofSlate'),
    box({ width: 0.85, height: 1.3, depth: 0.85, color: 'wallWhite', transform: { translate: [1.85, 0.65, 1.05] } }),
    gableRoofPart(0.85, 0.85, 0.5, 'roofSlate', 1.3),
    box({ width: 0.85, height: 1.3, depth: 0.85, color: 'wallWhite', transform: { translate: [-1.85, 0.65, 1.05] } }),
    gableRoofPart(0.85, 0.85, 0.5, 'roofSlate', 1.3),
    balconyPart(0, 1.55, 1.2 + 0.17, 1.1),
  ]),
);

/** Tier 7 — the manor: a cupola, a grand portico, symmetric wings, wide steps. */
defineAsset(
  'house_tier_7',
  group([
    box({ width: 3.6, height: 1.75, depth: 3.2, color: 'wallWhite', transform: { translate: [0, 0.875, 0] } }),
    pyramidRoofPart(3.6, 3.2, 1.1, 'roofSlate', 1.75),
    domeRoofPart(0.32, 'roofSlate', 1.75 + 1.1 - 0.1),
    cone({ radius: 0.05, height: 0.18, radialSegments: 6, color: 'accent', transform: { translate: [0, 1.75 + 1.1 - 0.1 + 0.32 * 1.72 + 0.09, 0] } }),
    // Portico: columns and a small pediment roof over the entrance.
    ...[-0.55, 0.55].map((x) =>
      prism({ radius: 0.09, height: 1.5, sides: 10, color: 'wallWhite', transform: { translate: [x, 0.75, 1.72] } }),
    ),
    gableRoofPart(1.5, 0.6, 0.35, 'roofClay', 1.5),
    chimneyStack(1.35, 0.9, 1.75, 1.1),
    chimneyStack(-1.35, -0.9, 1.75, 1.1),
    ...houseWindows(3.6, 3.2, 1.75),
    dormerPart(-1.0, 1.75, 'wallWhite', 'roofSlate'),
    dormerPart(1.0, 1.75, 'wallWhite', 'roofSlate'),
    box({ width: 0.95, height: 1.5, depth: 0.95, color: 'wallWhite', transform: { translate: [2.0, 0.75, 1.1] } }),
    gableRoofPart(0.95, 0.95, 0.6, 'roofSlate', 1.5),
    box({ width: 0.95, height: 1.5, depth: 0.95, color: 'wallWhite', transform: { translate: [-2.0, 0.75, 1.1] } }),
    gableRoofPart(0.95, 0.95, 0.6, 'roofSlate', 1.5),
    balconyPart(0, 1.75, 1.6 + 0.17, 1.3),
    box({ width: 3.2, height: 0.12, depth: 0.9, color: 'stone', transform: { translate: [0, 0.06, 2.0] } }),
  ]),
);

// ---------------------------------------------------------------------------
// Factories — every one of balance/factories.json's 21 real factoryTypeIds
// gets a bespoke config: its own footprint, roofline, chimney/silo/vent
// treatment and a handful of hand-placed details, so the factory row of a
// town reads as twenty-one different trades rather than one shed repainted.
// ---------------------------------------------------------------------------

interface FactoryConfig {
  width: number;
  depth: number;
  height: number;
  wall: PaletteKey;
  roofColor: PaletteKey;
  roofStyle: RoofStyle;
  roofHeight?: number;
  chimney?: 'single' | 'twin' | 'silo' | 'vent' | 'none';
  chimneyHeight?: number;
  windowCount?: number;
  windowHeight?: number;
  extras?: (dims: { width: number; depth: number; height: number }) => MeshNode[];
}

function chimneyPart(
  kind: NonNullable<FactoryConfig['chimney']>,
  width: number,
  depth: number,
  height: number,
  chimHeight: number,
): MeshNode[] {
  if (kind === 'none') return [];
  if (kind === 'single') {
    return [
      cylinder({
        radiusTop: 0.16,
        radiusBottom: 0.2,
        height: chimHeight,
        radialSegments: 8,
        color: 'stoneDark',
        transform: { translate: [width * 0.32, height + chimHeight / 2, depth * 0.25] },
      }),
    ];
  }
  if (kind === 'twin') {
    return [-0.28, 0.28].map((fx) =>
      cylinder({
        radiusTop: 0.12,
        radiusBottom: 0.15,
        height: chimHeight,
        radialSegments: 8,
        color: 'stoneDark',
        transform: { translate: [width * fx, height + chimHeight / 2, depth * 0.3] },
      }),
    );
  }
  if (kind === 'vent') {
    return [
      cylinder({
        radiusTop: 0.08,
        radiusBottom: 0.08,
        height: chimHeight,
        radialSegments: 6,
        color: 'metalDark',
        transform: { translate: [width * 0.3, height + chimHeight / 2, -depth * 0.25] },
      }),
      cone({
        radius: 0.11,
        height: 0.12,
        radialSegments: 6,
        color: 'metal',
        transform: { translate: [width * 0.3, height + chimHeight, -depth * 0.25] },
      }),
    ];
  }
  // silo — a pair of tall storage drums with domed caps beside the shed,
  // the dairy's and bottler's signature.
  return [-0.62, -0.3].flatMap((fx) => {
    const siloHeight = chimHeight + height * 0.3;
    const siloRadius = 0.22;
    return [
      cylinder({
        radiusTop: siloRadius,
        radiusBottom: siloRadius,
        height: siloHeight,
        radialSegments: 10,
        color: 'metal',
        transform: { translate: [width * fx, siloHeight / 2, 0] },
      }),
      sphere({
        radius: siloRadius,
        widthSegments: 8,
        heightSegments: 6,
        color: 'metalDark',
        transform: { translate: [width * fx, siloHeight, 0], scale: [1, 0.6, 1] },
      }),
    ];
  });
}

function buildFactory(cfg: FactoryConfig): MeshNode {
  const { width, depth, height, wall, roofColor, roofStyle } = cfg;
  const roofHeight = cfg.roofHeight ?? height * (roofStyle === 'flat' ? 0.12 : 0.35);
  const chimHeight = cfg.chimneyHeight ?? height * 0.7;
  const children: MeshNode[] = [
    box({ width, height, depth, color: wall, transform: { translate: [0, height / 2, 0] } }),
    roofPart(roofStyle, width, depth, roofHeight, roofColor, height),
    ...sideWindows(width, depth, height, cfg.windowCount ?? 2, cfg.windowHeight ?? 0.16),
    // A big wooden door on every side so the delivery-facing wall always reads.
    box({
      width: width * 0.4,
      height: height * 0.6,
      depth: 0.06,
      color: 'woodDark',
      transform: { translate: [0, (height * 0.6) / 2, depth / 2 + 0.03] },
    }),
    box({
      width: width * 0.4,
      height: height * 0.6,
      depth: 0.06,
      color: 'woodDark',
      transform: { translate: [0, (height * 0.6) / 2, -depth / 2 - 0.03] },
    }),
    ...chimneyPart(cfg.chimney ?? 'single', width, depth, height, chimHeight),
  ];
  if (cfg.extras) children.push(...cfg.extras({ width, depth, height }));
  return group(children);
}

const FACTORY_CONFIGS: Record<string, FactoryConfig> = {
  bakery: {
    width: 2.4,
    depth: 2.0,
    height: 1.5,
    wall: 'wallBrick',
    roofColor: 'roofBarn',
    roofStyle: 'gable',
    chimney: 'single',
    chimneyHeight: 1.1,
    extras: ({ height, depth }) => [
      roof({ width: 1.3, depth: 0.32, height: 0.16, color: 'accentWarm', transform: { translate: [0, height * 0.6, depth / 2 + 0.2] } }),
    ],
  },
  mill: {
    width: 2.0,
    depth: 2.0,
    height: 1.7,
    wall: 'wallStone',
    roofColor: 'roofSlate',
    roofStyle: 'hip',
    chimney: 'single',
    chimneyHeight: 0.9,
    extras: ({ height, depth }) => [
      group(
        [0, 1, 2, 3].map((i) =>
          box({
            width: 0.1,
            height: 1.1,
            depth: 0.04,
            color: 'wood',
            transform: { rotate: [0, 0, (Math.PI / 2) * i + Math.PI / 4], translate: [0, 0.55, 0] },
          }),
        ),
        { translate: [0, height * 0.55, depth / 2 + 0.05] },
      ),
    ],
  },
  dairy: {
    width: 2.2,
    depth: 1.8,
    height: 1.3,
    wall: 'wallWhite',
    roofColor: 'roofSlate',
    roofStyle: 'flat',
    chimney: 'silo',
    chimneyHeight: 0.9,
  },
  textile: {
    width: 2.6,
    depth: 2.0,
    height: 1.6,
    wall: 'wallBrick',
    roofColor: 'roofSlate',
    roofStyle: 'sawtooth',
    chimney: 'vent',
    chimneyHeight: 0.5,
    windowCount: 4,
    windowHeight: 0.36,
  },
  furniture: {
    width: 1.8,
    depth: 1.6,
    height: 1.2,
    wall: 'wallTimber',
    roofColor: 'roofBarn',
    roofStyle: 'gable',
    chimney: 'none',
    extras: ({ width, height }) => [
      group(
        [0, 1, 2].map((i) =>
          cylinder({
            radiusTop: 0.06,
            radiusBottom: 0.06,
            height: 0.9,
            radialSegments: 6,
            color: 'trunk',
            transform: { translate: [0, 0.06 + i * 0.13, 0], rotate: [0, 0, Math.PI / 2] },
          }),
        ),
        { translate: [width * 0.55, 0, -0.3] },
      ),
    ],
  },
  bottler: {
    width: 1.9,
    depth: 1.6,
    height: 1.15,
    wall: 'wallStone',
    roofColor: 'roofSlate',
    roofStyle: 'flat',
    chimney: 'vent',
    chimneyHeight: 0.45,
    extras: ({ width, depth }) => [
      ...[0, 1, 2].map((i) =>
        box({ width: 0.26, height: 0.26, depth: 0.26, color: 'wallWhite', transform: { translate: [width * 0.3 - i * 0.3, 0.13, depth / 2 + 0.25] } }),
      ),
      box({ width: 0.6, height: 0.04, depth: 0.5, color: 'metal', transform: { rotate: [-0.15, 0, 0], translate: [0, 0.2, depth / 2 + 0.35] } }),
    ],
  },
  candy: {
    width: 1.8,
    depth: 1.6,
    height: 1.15,
    wall: 'wallCream',
    roofColor: 'roofClay',
    roofStyle: 'gable',
    chimney: 'single',
    chimneyHeight: 0.55,
    extras: ({ width, height, depth }) => [
      ...[-0.35, 0, 0.35].map((fx, i) =>
        box({
          width: 0.12,
          height: 0.08,
          depth: 0.12,
          color: i % 2 === 0 ? 'clothPrimary' : 'wallWhite',
          transform: { translate: [width * fx, height + 0.04, 0] },
        }),
      ),
      box({ width: width * 0.5, height: 0.05, depth: 0.3, color: 'accent', transform: { translate: [0, height * 0.6, depth / 2 + 0.18] } }),
    ],
  },
  chocolate: {
    width: 1.9,
    depth: 1.7,
    height: 1.2,
    wall: 'wallBrick',
    roofColor: 'roofBarn',
    roofStyle: 'gable',
    chimney: 'vent',
    chimneyHeight: 0.6,
    extras: ({ width }) => [
      cylinder({ radiusTop: 0.22, radiusBottom: 0.24, height: 0.36, radialSegments: 10, color: 'metal', transform: { translate: [-width * 0.62, 0.18, 0] } }),
      cylinder({ radiusTop: 0.05, radiusBottom: 0.05, height: 0.3, radialSegments: 6, color: 'metalDark', transform: { translate: [-width * 0.62, 0.51, 0] } }),
    ],
  },
  coffee_house: {
    width: 1.8,
    depth: 1.6,
    height: 1.15,
    wall: 'wallTimber',
    roofColor: 'roofClay',
    roofStyle: 'gable',
    chimney: 'vent',
    chimneyHeight: 0.6,
    extras: ({ width, height, depth }) => [
      cylinder({
        radiusTop: 0.16,
        radiusBottom: 0.16,
        height: 0.42,
        radialSegments: 8,
        color: 'metalDark',
        transform: { rotate: [0, 0, Math.PI / 2], translate: [width * 0.62, 0.22, 0] },
      }),
      box({ width: width * 0.5, height: 0.05, depth: 0.28, color: 'accentWarm', transform: { translate: [0, height * 0.6, depth / 2 + 0.17] } }),
    ],
  },
  cosmetics: {
    width: 1.8,
    depth: 1.6,
    height: 1.1,
    wall: 'wallWhite',
    roofColor: 'roofSlate',
    roofStyle: 'flat',
    chimney: 'none',
    extras: ({ width, depth }) => [
      ...[-0.3, 0, 0.3].map((fx) =>
        box({ width: 0.06, height: 0.22, depth: 0.06, color: 'glass', transform: { translate: [width * fx, 0.11, depth / 2 + 0.2] } }),
      ),
      box({ width: width * 0.55, height: 0.06, depth: 0.02, color: 'accentCool', transform: { translate: [0, 0.7, depth / 2 + 0.01] } }),
    ],
  },
  feed_mill: {
    width: 2.0,
    depth: 1.7,
    height: 1.3,
    wall: 'wallTimber',
    roofColor: 'roofBarn',
    roofStyle: 'hip',
    chimney: 'none',
    extras: ({ width, height }) =>
      [-0.62, -0.3].flatMap((fx) => {
        const h = height * 1.3;
        return [
          cylinder({ radiusTop: 0.18, radiusBottom: 0.18, height: h, radialSegments: 8, color: 'wallTimber', transform: { translate: [width * fx, h / 2, 0] } }),
          cone({ radius: 0.2, height: 0.22, radialSegments: 8, color: 'roofBarn', transform: { translate: [width * fx, h + 0.11, 0] } }),
        ];
      }),
  },
  ice_cream: {
    width: 1.7,
    depth: 1.6,
    height: 1.1,
    wall: 'wallWhite',
    roofColor: 'cropStrawberry',
    roofStyle: 'gable',
    chimney: 'none',
    extras: ({ height }) => [
      cone({ radius: 0.22, height: 0.4, radialSegments: 10, color: 'cropStrawberry', transform: { translate: [0, height + 0.5, 0], rotate: [Math.PI, 0, 0] } }),
      sphere({ radius: 0.2, widthSegments: 8, heightSegments: 6, color: 'wallCream', transform: { translate: [0, height + 0.85, 0] } }),
    ],
  },
  jewellery: {
    width: 1.7,
    depth: 1.5,
    height: 1.1,
    wall: 'wallWhite',
    roofColor: 'accent',
    roofStyle: 'dome',
    chimney: 'none',
    extras: ({ width, height, depth }) => [
      box({ width, height: 0.08, depth, color: 'accent', transform: { translate: [0, height + 0.04, 0] } }),
      cone({ radius: 0.04, height: 0.16, radialSegments: 8, color: 'accent', transform: { translate: [0, height + Math.max(width, depth) / 2 * 1.44 + 0.08, 0] } }),
      box({ width: width * 0.4, height: 0.04, depth: 0.25, color: 'accent', transform: { translate: [0, height * 0.62, depth / 2 + 0.14] } }),
    ],
  },
  pizzeria: {
    width: 1.8,
    depth: 1.6,
    height: 1.15,
    wall: 'wallBrick',
    roofColor: 'roofClay',
    roofStyle: 'gable',
    chimney: 'single',
    chimneyHeight: 0.5,
    extras: ({ width, depth }) => [
      // The wood-fired oven's own little dome, set beside the shopfront.
      group([domeRoofPart(0.24, 'wallBrick', 0)], { translate: [-width * 0.62, 0, 0] }),
      box({ width: width * 0.45, height: 0.05, depth: 0.28, color: 'accentWarm', transform: { translate: [0, 0.7, depth / 2 + 0.17] } }),
    ],
  },
  preserves: {
    width: 1.8,
    depth: 1.6,
    height: 1.1,
    wall: 'wallCream',
    roofColor: 'roofSlate',
    roofStyle: 'gable',
    chimney: 'none',
    extras: ({ width }) => [
      box({ width: 0.5, height: 0.05, depth: 0.12, color: 'wood', transform: { translate: [width * 0.6, 0.3, 0] } }),
      ...[0, 1, 2].map((i) =>
        sphere({
          radius: 0.06,
          widthSegments: 6,
          heightSegments: 5,
          color: i % 2 === 0 ? 'cropBerry' : 'cropTomato',
          transform: { translate: [width * 0.6 - 0.18 + i * 0.18, 0.38, 0] },
        }),
      ),
    ],
  },
  sauce: {
    width: 1.9,
    depth: 1.6,
    height: 1.15,
    wall: 'wallBrick',
    roofColor: 'roofBarn',
    roofStyle: 'gable',
    chimney: 'vent',
    chimneyHeight: 0.5,
    extras: ({ width }) => [
      cylinder({ radiusTop: 0.2, radiusBottom: 0.2, height: 0.4, radialSegments: 10, color: 'metal', transform: { translate: [width * 0.62, 0.2, 0] } }),
      cylinder({ radiusTop: 0.04, radiusBottom: 0.04, height: 0.24, radialSegments: 6, color: 'metalDark', transform: { translate: [width * 0.62, 0.52, 0] } }),
    ],
  },
  sawmill: {
    width: 2.0,
    depth: 1.7,
    height: 1.3,
    wall: 'wallTimber',
    roofColor: 'roofBarn',
    roofStyle: 'gable',
    chimney: 'none',
    extras: ({ width, depth }) => [
      // A stacked pyramid of logs beside the shed.
      ...[0, 1, 2].flatMap((row) =>
        [...Array(3 - row).keys()].map((col) =>
          cylinder({
            radiusTop: 0.09,
            radiusBottom: 0.09,
            height: 0.7,
            radialSegments: 8,
            color: 'trunk',
            transform: {
              rotate: [0, 0, Math.PI / 2],
              translate: [-width * 0.68, 0.1 + row * 0.16, -0.28 + col * 0.18 + row * 0.09],
            },
          }),
        ),
      ),
      // The blade housing: a flat metal disc bolted to the gable end.
      cylinder({ radiusTop: 0.24, radiusBottom: 0.24, height: 0.04, radialSegments: 16, color: 'metal', transform: { rotate: [0, 0, Math.PI / 2], translate: [0, 0.55, depth / 2 + 0.06] } }),
      cylinder({ radiusTop: 0.28, radiusBottom: 0.28, height: 0.02, radialSegments: 10, color: 'metalDark', transform: { rotate: [0, 0, Math.PI / 2], translate: [0, 0.55, depth / 2 + 0.09] } }),
    ],
  },
  snack: {
    width: 1.4,
    depth: 1.3,
    height: 0.95,
    wall: 'wallCream',
    roofColor: 'accentWarm',
    roofStyle: 'flat',
    chimney: 'none',
    extras: ({ width, height, depth }) => [
      box({ width: width * 0.7, height: 0.05, depth: 0.3, color: 'accentWarm', transform: { rotate: [Math.PI * 0.06, 0, 0], translate: [0, height * 0.65, depth / 2 + 0.18] } }),
    ],
  },
  sugar_mill: {
    width: 2.1,
    depth: 1.8,
    height: 1.3,
    wall: 'wallStone',
    roofColor: 'roofSlate',
    roofStyle: 'flat',
    chimney: 'vent',
    chimneyHeight: 0.55,
    extras: ({ width, height }) => [
      prism({ radius: 0.22, height: height * 1.7, sides: 6, color: 'metal', transform: { translate: [-width * 0.62, (height * 1.7) / 2, 0] } }),
      cone({ radius: 0.24, height: 0.2, radialSegments: 6, color: 'metalDark', transform: { translate: [-width * 0.62, height * 1.7 + 0.1, 0] } }),
    ],
  },
  tailor: {
    width: 1.7,
    depth: 1.5,
    height: 1.05,
    wall: 'wallTimber',
    roofColor: 'roofClay',
    roofStyle: 'gable',
    chimney: 'none',
    extras: ({ width, height }) => [
      cone({ radius: 0.05, height: 0.3, radialSegments: 6, color: 'metal', transform: { translate: [0, height + 0.35, 0] } }),
      ...[0, 1, 2].map((i) =>
        cylinder({
          radiusTop: 0.05,
          radiusBottom: 0.05,
          height: 0.5,
          radialSegments: 8,
          color: i === 0 ? 'clothPrimary' : i === 1 ? 'clothSecondary' : 'cropCotton',
          transform: { rotate: [0, 0, Math.PI / 2], translate: [width * 0.62, 0.25 + i * 0.14, -0.3 + i * 0.3] },
        }),
      ),
    ],
  },
  toy_factory: {
    width: 1.8,
    depth: 1.6,
    height: 1.15,
    wall: 'wallWhite',
    roofColor: 'accentCool',
    roofStyle: 'gable',
    chimney: 'single',
    chimneyHeight: 0.5,
    extras: ({ width, depth }) => [
      box({ width: 0.22, height: 0.22, depth: 0.22, color: 'clothPrimary', transform: { translate: [width * 0.6, 0.11, depth / 2 + 0.25] } }),
      box({ width: 0.18, height: 0.18, depth: 0.18, color: 'accent', transform: { rotate: [0, Math.PI / 6, 0], translate: [width * 0.6 + 0.24, 0.09, depth / 2 + 0.22] } }),
      box({ width: 0.16, height: 0.16, depth: 0.16, color: 'clothSecondary', transform: { translate: [width * 0.6 - 0.02, 0.3, depth / 2 + 0.34] } }),
    ],
  },
  winery: {
    width: 2.0,
    depth: 1.8,
    height: 1.25,
    wall: 'wallStone',
    roofColor: 'roofClay',
    roofStyle: 'gable',
    chimney: 'none',
    extras: ({ width, depth }) =>
      [-0.6, -0.3, 0].map((x) =>
        cylinder({
          radiusTop: 0.16,
          radiusBottom: 0.16,
          height: 0.36,
          radialSegments: 10,
          color: 'wood',
          transform: { rotate: [0, 0, Math.PI / 2], translate: [width * (x + 0.62), 0.16, depth / 2 + 0.3] },
        }),
      ),
  },
};

for (const [id, cfg] of Object.entries(FACTORY_CONFIGS)) {
  defineAsset(`factory_${id}`, buildFactory(cfg));
}

// ---------------------------------------------------------------------------
// Community buildings — larger, distinctive landmark silhouettes.
// ---------------------------------------------------------------------------

defineAsset(
  'community_town_hall',
  group([
    box({ width: 3.2, height: 1.8, depth: 2.4, color: 'wallStone', transform: { translate: [0, 0.9, 0] } }),
    roof({ width: 3.2, depth: 2.4, height: 1.1, color: 'roofClay', transform: { translate: [0, 1.8, 0] } }),
    prism({
      radius: 0.4,
      height: 1.6,
      sides: 8,
      color: 'wallWhite',
      transform: { translate: [0, 0.8 + 1.6 / 2, 0] },
    }),
    // A clock face on the tower, readable from either long side.
    cylinder({ radiusTop: 0.22, radiusBottom: 0.22, height: 0.03, radialSegments: 12, color: 'wallCream', transform: { rotate: [0, 0, Math.PI / 2], translate: [0.42, 1.55, 0] } }),
    cylinder({ radiusTop: 0.22, radiusBottom: 0.22, height: 0.03, radialSegments: 12, color: 'wallCream', transform: { rotate: [0, 0, Math.PI / 2], translate: [-0.42, 1.55, 0] } }),
    cylinder({
      radiusTop: 0.02,
      radiusBottom: 0.4,
      height: 0.7,
      radialSegments: 8,
      color: 'roofClay',
      transform: { translate: [0, 0.8 + 1.6 + 0.35, 0] },
    }),
    box({ width: 0.03, height: 0.03, depth: 0.4, color: 'metalDark', transform: { translate: [0, 0.8 + 1.6 + 0.7 + 0.03, 0] } }),
    // Steps
    box({ width: 1.4, height: 0.15, depth: 0.5, color: 'stone', transform: { translate: [0, 0.075, 1.5] } }),
  ]),
);

/** Farmers' Market - open stalls under a shared awning rather than a
 * single walled building, so it reads distinctly from the enclosed
 * community buildings around it. */
defineAsset(
  'community_farmers_market',
  group([
    box({ width: 2.6, height: 0.08, depth: 2.2, color: 'wood', transform: { translate: [0, 0.04, 0] } }),
    ...[-0.9, 0.9].map((x) =>
      [-0.7, 0.7].map((z) =>
        cylinder({
          radiusTop: 0.03,
          radiusBottom: 0.03,
          height: 1.0,
          radialSegments: 6,
          color: 'woodDark',
          transform: { translate: [x, 0.5, z] },
        }),
      ),
    ).flat(),
    box({ width: 2.9, height: 0.06, depth: 2.5, color: 'accentWarm', transform: { translate: [0, 1.02, 0] } }),
    ...[-1.15, -0.35, 0.45].map((x) =>
      box({ width: 0.3, height: 0.3, depth: 0.3, color: 'cropPumpkin', transform: { translate: [x, 0.23, 0] } }),
    ),
    // A hanging scale and a couple of crates for market clutter.
    cylinder({ radiusTop: 0.02, radiusBottom: 0.02, height: 0.3, radialSegments: 6, color: 'metalDark', transform: { translate: [1.0, 0.87, -0.4] } }),
    box({ width: 0.2, height: 0.03, depth: 0.2, color: 'metal', transform: { translate: [1.0, 0.71, -0.4] } }),
    box({ width: 0.25, height: 0.25, depth: 0.25, color: 'wood', transform: { translate: [-1.15, 0.16, -0.5] } }),
  ]),
);

defineAsset(
  'community_train_station',
  group([
    box({ width: 3.6, height: 1.4, depth: 1.6, color: 'wallBrick', transform: { translate: [0, 0.7, 0] } }),
    roof({ width: 3.6, depth: 1.6, height: 0.7, color: 'roofSlate', overhang: 0.4, transform: { translate: [0, 1.4, 0] } }),
    box({ width: 3.4, height: 0.06, depth: 2.4, color: 'wood', transform: { translate: [0, 0.35, 1.6] } }),
    ...[-1.5, -0.5, 0.5, 1.5].map((x) =>
      cylinder({
        radiusTop: 0.05,
        radiusBottom: 0.05,
        height: 1.1,
        radialSegments: 6,
        color: 'metalDark',
        transform: { translate: [x, 0.9, 2.6] },
      }),
    ),
    // A canopy roof over the platform, and a station clock on the gable end.
    roof({ width: 3.4, depth: 1.6, height: 0.16, color: 'roofSlate', overhang: 0.1, transform: { translate: [0, 1.55, 2.0] } }),
    cylinder({ radiusTop: 0.14, radiusBottom: 0.14, height: 0.03, radialSegments: 12, color: 'wallCream', transform: { rotate: [0, 0, Math.PI / 2], translate: [0, 1.55, 0.83] } }),
  ]),
);

defineAsset(
  'community_dock',
  group([
    box({ width: 3.0, height: 0.12, depth: 1.4, color: 'wood', transform: { translate: [0, 0.06, 0] } }),
    ...[-1.3, -0.4, 0.4, 1.3].map((x) =>
      cylinder({
        radiusTop: 0.08,
        radiusBottom: 0.08,
        height: 0.9,
        radialSegments: 6,
        color: 'woodDark',
        transform: { translate: [x, -0.3, 0.65] },
      }),
    ),
    box({ width: 1.0, height: 1.0, depth: 1.0, color: 'wallTimber', transform: { translate: [-0.8, 0.5, -0.6] } }),
    roof({ width: 1.0, depth: 1.0, height: 0.5, color: 'roofBarn', transform: { translate: [-0.8, 1.0, -0.6] } }),
    // A small jib crane on the quay for loading barrels.
    cylinder({ radiusTop: 0.05, radiusBottom: 0.05, height: 0.9, radialSegments: 6, color: 'metalDark', transform: { translate: [1.1, 0.57, -0.5] } }),
    box({ width: 0.7, height: 0.05, depth: 0.05, color: 'metalDark', transform: { translate: [0.85, 1.0, -0.5] } }),
    cylinder({ radiusTop: 0.14, radiusBottom: 0.14, height: 0.2, radialSegments: 10, color: 'wood', transform: { translate: [0.6, 0.7, -0.5] } }),
  ]),
);

defineAsset(
  'community_museum',
  group([
    box({ width: 2.8, height: 1.7, depth: 2.2, color: 'wallWhite', transform: { translate: [0, 0.85, 0] } }),
    ...[-1.0, -0.33, 0.33, 1.0].map((x) =>
      prism({
        radius: 0.15,
        height: 1.7,
        sides: 12,
        color: 'wallWhite',
        transform: { translate: [x, 0.85, 1.15] },
      }),
    ),
    box({ width: 3.2, height: 0.15, depth: 2.6, color: 'stone', transform: { translate: [0, 0.075, 0] } }),
    box({ width: 2.8, height: 0.5, depth: 2.2, color: 'roofClay', transform: { translate: [0, 1.95, 0] } }),
    // A triangular pediment over the row of columns, for a proper temple front.
    extrude({
      points: [
        [-1.4, 0],
        [1.4, 0],
        [0, 0.55],
      ],
      depth: 0.14,
      color: 'wallWhite',
      transform: { translate: [0, 1.7, 1.22] },
    }),
  ]),
);

/** The zoo's entrance gate - a low stone arch with a banner, distinct from
 * the enclosed community buildings around it since visitors walk through
 * rather than into it. */
defineAsset(
  'community_zoo_gate',
  group([
    ...[-1.1, 1.1].map((x) =>
      box({ width: 0.3, height: 1.6, depth: 0.3, color: 'stoneDark', transform: { translate: [x, 0.8, 0] } }),
    ),
    box({ width: 2.5, height: 0.3, depth: 0.3, color: 'stoneDark', transform: { translate: [0, 1.75, 0] } }),
    box({ width: 2.0, height: 0.5, depth: 0.04, color: 'accentWarm', transform: { translate: [0, 1.4, 0.17] } }),
    cone({ radius: 0.15, height: 0.3, radialSegments: 6, color: 'roofClay', transform: { translate: [-1.1, 1.75 + 0.15, 0] } }),
    cone({ radius: 0.15, height: 0.3, radialSegments: 6, color: 'roofClay', transform: { translate: [1.1, 1.75 + 0.15, 0] } }),
  ]),
);

defineAsset(
  'community_restaurant',
  group([
    box({ width: 2.0, height: 1.2, depth: 1.6, color: 'wallCream', transform: { translate: [0, 0.6, 0] } }),
    roof({ width: 2.0, depth: 1.6, height: 0.6, color: 'roofBarn', transform: { translate: [0, 1.2, 0] } }),
    // Awning
    box({ width: 2.0, height: 0.06, depth: 0.6, color: 'accentWarm', transform: { translate: [0, 1.0, 1.1] } }),
    // A little outdoor table with a parasol, for street-side character.
    cylinder({ radiusTop: 0.02, radiusBottom: 0.02, height: 0.34, radialSegments: 6, color: 'metalDark', transform: { translate: [1.35, 0.17, 0.6] } }),
    cylinder({ radiusTop: 0.14, radiusBottom: 0.14, height: 0.02, radialSegments: 10, color: 'wallCream', transform: { translate: [1.35, 0.35, 0.6] } }),
    cone({ radius: 0.22, height: 0.16, radialSegments: 8, color: 'clothPrimary', transform: { translate: [1.35, 0.68, 0.6] } }),
  ]),
);

defineAsset(
  'community_cinema',
  group([
    box({ width: 2.6, height: 1.6, depth: 2.0, color: 'wallStone', transform: { translate: [0, 0.8, 0] } }),
    // The marquee canopy and its bulb-lit sign board.
    box({ width: 2.8, height: 0.08, depth: 0.4, color: 'metalDark', transform: { rotate: [-0.12, 0, 0], translate: [0, 1.55, 1.15] } }),
    box({ width: 2.8, height: 1.0, depth: 0.1, color: 'accentCool', transform: { translate: [0, 1.9, 1.05] } }),
    box({ width: 2.5, height: 0.16, depth: 0.02, color: 'accent', transform: { translate: [0, 1.75, 1.11] } }),
    box({ width: 0.05, height: 1.8, depth: 0.05, color: 'metal', transform: { translate: [1.3, 1.0, 1.1] } }),
    // A small ticket booth beside the entrance.
    box({ width: 0.4, height: 0.7, depth: 0.4, color: 'wallCream', transform: { translate: [-1.6, 0.35, 1.1] } }),
    roof({ width: 0.4, depth: 0.4, height: 0.2, color: 'roofSlate', transform: { translate: [-1.6, 0.7, 1.1] } }),
  ]),
);

defineAsset(
  'community_school',
  group([
    box({ width: 2.6, height: 1.4, depth: 2.0, color: 'wallBrick', transform: { translate: [0, 0.7, 0] } }),
    roof({ width: 2.6, depth: 2.0, height: 0.8, color: 'roofClay', transform: { translate: [0, 1.4, 0] } }),
    prism({
      radius: 0.25,
      height: 0.9,
      sides: 4,
      color: 'wallWhite',
      transform: { translate: [0, 1.4 + 0.9 / 2 - 0.1, 0], rotate: [0, Math.PI / 4, 0] },
    }),
    cone({
      radius: 0.32,
      height: 0.5,
      radialSegments: 4,
      color: 'roofSlate',
      transform: { translate: [0, 1.4 + 0.9 - 0.1 + 0.25, 0], rotate: [0, Math.PI / 4, 0] },
    }),
    // The bell, hanging under the belfry opening.
    sphere({ radius: 0.09, widthSegments: 8, heightSegments: 6, color: 'accent', transform: { translate: [0, 1.4 + 0.9 - 0.1 - 0.16, 0] } }),
  ]),
);

defineAsset(
  'community_hospital',
  group([
    box({ width: 2.6, height: 1.7, depth: 2.0, color: 'wallWhite', transform: { translate: [0, 0.85, 0] } }),
    box({ width: 0.6, height: 0.15, depth: 0.15, color: 'clothPrimary', transform: { translate: [0, 1.75, 1.02] } }),
    box({ width: 0.15, height: 0.6, depth: 0.15, color: 'clothPrimary', transform: { translate: [0, 1.75, 1.02] } }),
    // A rooftop flagpole with a small pennant, for a landmark silhouette.
    cylinder({ radiusTop: 0.02, radiusBottom: 0.02, height: 0.6, radialSegments: 6, color: 'metal', transform: { translate: [-0.9, 1.7 + 0.3, 0] } }),
    box({ width: 0.22, height: 0.14, depth: 0.02, color: 'accentCool', transform: { translate: [-0.79, 1.7 + 0.52, 0] } }),
  ]),
);

defineAsset(
  'community_fire_station',
  group([
    box({ width: 2.4, height: 1.5, depth: 1.8, color: 'wallBrick', transform: { translate: [0, 0.75, 0] } }),
    roof({ width: 2.4, depth: 1.8, height: 0.7, color: 'roofSlate', transform: { translate: [0, 1.5, 0] } }),
    // A big roll-up bay door, wide enough for a fire cart, plus a station numeral.
    box({ width: 1.7, height: 1.2, depth: 0.06, color: 'clothPrimary', transform: { translate: [0, 0.6, 0.93] } }),
    ...[0, 1, 2, 3].map((i) =>
      box({ width: 1.62, height: 0.02, depth: 0.02, color: 'wallStone', transform: { translate: [0, 0.18 + i * 0.26, 0.97] } }),
    ),
    box({ width: 0.3, height: 0.3, depth: 0.02, color: 'wallWhite', transform: { translate: [0, 1.3, 0.93] } }),
    prism({
      radius: 0.14,
      height: 1.9,
      sides: 8,
      color: 'metalDark',
      transform: { translate: [1.0, 0.95, 0.5] },
    }),
    // The hose tower's own small pyramid cap.
    cone({ radius: 0.17, height: 0.22, radialSegments: 8, color: 'roofSlate', transform: { translate: [1.0, 1.9 + 0.11, 0.5] } }),
  ]),
);

defineAsset(
  'community_airport',
  group([
    box({ width: 3.4, height: 1.3, depth: 1.6, color: 'wallWhite', transform: { translate: [0, 0.65, 0] } }),
    box({ width: 3.6, height: 0.15, depth: 1.8, color: 'metal', transform: { translate: [0, 1.35, 0] } }),
    prism({
      radius: 0.2,
      height: 2.0,
      sides: 8,
      color: 'metalDark',
      transform: { translate: [-1.5, 1.0, -0.6] },
    }),
    box({ width: 0.5, height: 0.5, depth: 0.5, color: 'glass', transform: { translate: [-1.5, 1.9, -0.6] } }),
    // A rotating radar dish and a beacon light atop the control tower.
    cylinder({ radiusTop: 0.24, radiusBottom: 0.02, height: 0.05, radialSegments: 12, color: 'metal', transform: { rotate: [Math.PI / 2.4, 0, 0], translate: [-1.5, 2.28, -0.6] } }),
    sphere({ radius: 0.06, widthSegments: 6, heightSegments: 5, color: 'accentWarm', transform: { translate: [-1.5, 2.4, -0.6] } }),
  ]),
);

defineAsset(
  'community_sports_arena',
  group([
    cylinder({
      radiusTop: 1.6,
      radiusBottom: 1.7,
      height: 0.8,
      radialSegments: 16,
      color: 'wallStone',
      transform: { translate: [0, 0.4, 0] },
    }),
    cylinder({
      radiusTop: 1.3,
      radiusBottom: 1.3,
      height: 0.05,
      radialSegments: 16,
      color: 'grass',
      transform: { translate: [0, 0.83, 0] },
    }),
    // Four floodlight towers around the stands.
    ...[
      { x: 1.9, z: 1.9 },
      { x: -1.9, z: 1.9 },
      { x: 1.9, z: -1.9 },
      { x: -1.9, z: -1.9 },
    ].flatMap(({ x, z }) => [
      cylinder({ radiusTop: 0.04, radiusBottom: 0.05, height: 1.6, radialSegments: 6, color: 'metalDark', transform: { translate: [x, 0.8, z] } }),
      box({ width: 0.22, height: 0.12, depth: 0.08, color: 'accent', transform: { translate: [x, 1.65, z] } }),
    ]),
  ]),
);

/** The barn — the player's central production hub. */
defineAsset(
  'barn',
  group([
    box({ width: 2.4, height: 1.6, depth: 2.0, color: 'roofBarn', transform: { translate: [0, 0.8, 0] } }),
    roof({ width: 2.4, depth: 2.0, height: 1.0, color: 'roofSlate', transform: { translate: [0, 1.6, 0] } }),
    box({ width: 1.2, height: 1.3, depth: 0.08, color: 'wallCream', transform: { translate: [0, 0.65, 1.04] } }),
    box({ width: 1.0, height: 1.0, depth: 0.06, color: 'woodDark', transform: { translate: [0, 0.5, 1.06] } }),
    prism({
      radius: 0.35,
      height: 2.0,
      sides: 12,
      color: 'wallStone',
      transform: { translate: [1.4, 1.0, -0.6] },
    }),
    cone({
      radius: 0.42,
      height: 0.5,
      radialSegments: 12,
      color: 'roofSlate',
      transform: { translate: [1.4, 2.25, -0.6] },
    }),
  ]),
);

/** Zoo enclosures — a low fenced pen plus a distinctive habitat feature. */
function zooEnclosureNode(feature: MeshNode | null, fenceColor: 'wood' = 'wood'): MeshNode {
  const posts = [-1, -0.33, 0.33, 1].flatMap((x) =>
    [-1, 1].map((z) =>
      cylinder({
        radiusTop: 0.04,
        radiusBottom: 0.04,
        height: 0.5,
        radialSegments: 6,
        color: fenceColor,
        transform: { translate: [x, 0.25, z] },
      }),
    ),
  );
  const rails = [-1, 1].map((z) =>
    box({ width: 2.2, height: 0.06, depth: 0.05, color: fenceColor, transform: { translate: [0, 0.4, z] } }),
  );
  const children: MeshNode[] = [...posts, ...rails];
  if (feature) children.push(feature);
  return group(children);
}

defineAsset(
  'zoo_enclosure_savanna',
  zooEnclosureNode(
    group([
      box({ width: 0.9, height: 0.5, depth: 0.9, color: 'soilDry', transform: { translate: [0, 0.25, 0] } }),
      cylinder({ radiusTop: 0.05, radiusBottom: 0.08, height: 1.4, radialSegments: 6, color: 'trunk', transform: { translate: [0.2, 1.2, 0] } }),
      cone({ radius: 0.5, height: 0.3, radialSegments: 8, color: 'leaf', transform: { translate: [0.2, 1.95, 0] } }),
    ]),
  ),
);

defineAsset(
  'zoo_enclosure_pond',
  zooEnclosureNode(
    cylinder({
      radiusTop: 0.7,
      radiusBottom: 0.7,
      height: 0.06,
      radialSegments: 16,
      color: 'water',
      transform: { translate: [0, 0.03, 0] },
    }),
  ),
);

defineAsset(
  'zoo_enclosure_rock',
  zooEnclosureNode(
    group([
      box({ width: 0.5, height: 0.4, depth: 0.4, color: 'stone', transform: { rotate: [0.1, 0.3, 0], translate: [-0.15, 0.2, 0.1] } }),
      box({ width: 0.35, height: 0.55, depth: 0.35, color: 'stoneDark', transform: { rotate: [0, -0.2, 0.1], translate: [0.2, 0.28, -0.1] } }),
      box({ width: 0.3, height: 0.3, depth: 0.3, color: 'stone', transform: { translate: [0, 0.15, 0.3] } }),
    ]),
  ),
);

defineAsset(
  'zoo_enclosure_arctic',
  zooEnclosureNode(
    group([
      box({ width: 0.9, height: 0.1, depth: 0.9, color: 'snow', transform: { translate: [0, 0.05, 0] } }),
      cone({ radius: 0.28, height: 0.4, radialSegments: 8, color: 'snow', transform: { translate: [-0.2, 0.3, 0] } }),
      cone({ radius: 0.2, height: 0.3, radialSegments: 8, color: 'snow', transform: { translate: [0.25, 0.25, 0.15] } }),
    ]),
  ),
);

defineAsset('zoo_enclosure_paddock', zooEnclosureNode(null));

/** The mine entrance. */
defineAsset(
  'mine_entrance',
  group([
    box({ width: 1.6, height: 1.4, depth: 0.9, color: 'stoneDark', transform: { translate: [0, 0.7, 0] } }),
    box({ width: 0.9, height: 1.0, depth: 0.5, color: 'stoneDark', transform: { translate: [0, 0.5, 0.4] } }),
    box({ width: 1.8, height: 0.2, depth: 0.3, color: 'wood', transform: { translate: [0, 1.5, 0.3] } }),
    cylinder({
      radiusTop: 0.08,
      radiusBottom: 0.08,
      height: 1.6,
      radialSegments: 6,
      color: 'wood',
      transform: { translate: [-0.9, 0.8, 0.3], rotate: [0, 0, Math.PI * 0.06] },
    }),
    cylinder({
      radiusTop: 0.08,
      radiusBottom: 0.08,
      height: 1.6,
      radialSegments: 6,
      color: 'wood',
      transform: { translate: [0.9, 0.8, 0.3], rotate: [0, 0, -Math.PI * 0.06] },
    }),
  ]),
);
