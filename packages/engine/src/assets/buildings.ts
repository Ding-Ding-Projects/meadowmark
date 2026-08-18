/**
 * Generated building meshes — houses, factories, community buildings, and
 * the barn, zoo enclosures and mine entrance.
 *
 * Every building is built from box/prism/roof primitives only and is
 * designed to read correctly from every side, because the player's camera
 * can orbit freely: there is no "front-only" facade, and nothing here relies
 * on a face that is never meant to be seen.
 */

import { box, cylinder, defineAsset, group, prism, roof, type MeshNode } from '../mesh-dsl.js';

/** A simple gabled house: a box body plus a roof, walls readable on all sides. */
function houseNode(opts: {
  width: number;
  depth: number;
  wallHeight: number;
  roofHeight: number;
  wall: 'wallCream' | 'wallStone' | 'wallBrick' | 'wallTimber' | 'wallWhite';
  roofColor: 'roofClay' | 'roofSlate' | 'roofThatch' | 'roofBarn';
  chimney?: boolean;
}): MeshNode {
  const children: MeshNode[] = [
    box({
      width: opts.width,
      height: opts.wallHeight,
      depth: opts.depth,
      color: opts.wall,
      transform: { translate: [0, opts.wallHeight / 2, 0] },
    }),
    roof({
      width: opts.width,
      depth: opts.depth,
      height: opts.roofHeight,
      color: opts.roofColor,
      transform: { translate: [0, opts.wallHeight, 0] },
    }),
    // Door, readable from the front only in placement, but a real solid box
    // rather than a decal, so it reads from an angle too.
    box({
      width: opts.width * 0.18,
      height: opts.wallHeight * 0.55,
      depth: 0.05,
      color: 'woodDark',
      transform: { translate: [0, (opts.wallHeight * 0.55) / 2, opts.depth / 2 + 0.02] },
    }),
  ];
  if (opts.chimney) {
    children.push(
      box({
        width: 0.22,
        height: opts.roofHeight * 0.9,
        depth: 0.22,
        color: 'wallStone',
        transform: {
          translate: [opts.width * 0.28, opts.wallHeight + opts.roofHeight * 0.45, 0],
        },
      }),
    );
  }
  return group(children);
}

defineAsset(
  'house_small',
  houseNode({
    width: 1.6,
    depth: 1.4,
    wallHeight: 1.0,
    roofHeight: 0.7,
    wall: 'wallCream',
    roofColor: 'roofClay',
    chimney: true,
  }),
);

defineAsset(
  'house_medium',
  houseNode({
    width: 2.2,
    depth: 1.8,
    wallHeight: 1.3,
    roofHeight: 0.9,
    wall: 'wallStone',
    roofColor: 'roofSlate',
    chimney: true,
  }),
);

defineAsset(
  'house_cottage',
  houseNode({
    width: 1.8,
    depth: 1.6,
    wallHeight: 0.9,
    roofHeight: 0.85,
    wall: 'wallTimber',
    roofColor: 'roofThatch',
  }),
);

defineAsset(
  'house_manor',
  group([
    houseNode({
      width: 3.0,
      depth: 2.2,
      wallHeight: 1.6,
      roofHeight: 1.0,
      wall: 'wallWhite',
      roofColor: 'roofSlate',
      chimney: true,
    }),
    box({
      width: 0.9,
      height: 1.3,
      depth: 0.9,
      color: 'wallWhite',
      transform: { translate: [1.55, 0.65, 0] },
    }),
    roof({
      width: 0.9,
      depth: 0.9,
      height: 0.55,
      color: 'roofSlate',
      transform: { translate: [1.55, 1.3, 0] },
    }),
  ]),
);

/** A generic industrial/factory shed: a tall box, a chimney, a loading roof. */
function factoryNode(opts: {
  width: number;
  depth: number;
  height: number;
  wall: 'wallBrick' | 'wallStone' | 'wallTimber';
  roofColor: 'roofSlate' | 'roofBarn';
  chimneyHeight: number;
}): MeshNode {
  return group([
    box({
      width: opts.width,
      height: opts.height,
      depth: opts.depth,
      color: opts.wall,
      transform: { translate: [0, opts.height / 2, 0] },
    }),
    roof({
      width: opts.width,
      depth: opts.depth,
      height: opts.height * 0.35,
      color: opts.roofColor,
      transform: { translate: [0, opts.height, 0] },
    }),
    cylinder({
      radiusTop: 0.16,
      radiusBottom: 0.2,
      height: opts.chimneyHeight,
      radialSegments: 8,
      color: 'stoneDark',
      transform: {
        translate: [opts.width * 0.32, opts.height + opts.chimneyHeight / 2, opts.depth * 0.25],
      },
    }),
    // A big wooden door on every side so the delivery-facing wall always reads.
    box({
      width: opts.width * 0.4,
      height: opts.height * 0.6,
      depth: 0.06,
      color: 'woodDark',
      transform: { translate: [0, (opts.height * 0.6) / 2, opts.depth / 2 + 0.03] },
    }),
    box({
      width: opts.width * 0.4,
      height: opts.height * 0.6,
      depth: 0.06,
      color: 'woodDark',
      transform: { translate: [0, (opts.height * 0.6) / 2, -opts.depth / 2 - 0.03] },
    }),
  ]);
}

defineAsset(
  'factory_bakery',
  factoryNode({
    width: 2.4,
    depth: 2.0,
    height: 1.5,
    wall: 'wallBrick',
    roofColor: 'roofBarn',
    chimneyHeight: 1.1,
  }),
);

defineAsset(
  'factory_mill',
  group([
    factoryNode({
      width: 2.0,
      depth: 2.0,
      height: 1.7,
      wall: 'wallStone',
      roofColor: 'roofSlate',
      chimneyHeight: 0.9,
    }),
    // Windmill sails: four thin boxes crossed on a hub, on the gable end.
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
      { translate: [0, 1.9, 1.02] },
    ),
  ]),
);

defineAsset(
  'factory_dairy',
  factoryNode({
    width: 2.2,
    depth: 1.8,
    height: 1.3,
    wall: 'wallWhite',
    roofColor: 'roofSlate',
    chimneyHeight: 0.7,
  }),
);

defineAsset(
  'factory_textile',
  factoryNode({
    width: 2.6,
    depth: 2.0,
    height: 1.6,
    wall: 'wallBrick',
    roofColor: 'roofSlate',
    chimneyHeight: 1.0,
  }),
);

defineAsset(
  'factory_workshop',
  factoryNode({
    width: 1.8,
    depth: 1.6,
    height: 1.2,
    wall: 'wallTimber',
    roofColor: 'roofBarn',
    chimneyHeight: 0.6,
  }),
);

/** Community buildings — larger, distinctive silhouettes for landmarks. */

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
    cylinder({
      radiusTop: 0.02,
      radiusBottom: 0.4,
      height: 0.7,
      radialSegments: 8,
      color: 'roofClay',
      transform: { translate: [0, 0.8 + 1.6 + 0.35, 0] },
    }),
    // Steps
    box({ width: 1.4, height: 0.15, depth: 0.5, color: 'stone', transform: { translate: [0, 0.075, 1.5] } }),
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
  ]),
);

defineAsset(
  'community_restaurant',
  group([
    box({ width: 2.0, height: 1.2, depth: 1.6, color: 'wallCream', transform: { translate: [0, 0.6, 0] } }),
    roof({ width: 2.0, depth: 1.6, height: 0.6, color: 'roofBarn', transform: { translate: [0, 1.2, 0] } }),
    // Awning
    box({ width: 2.0, height: 0.06, depth: 0.6, color: 'accentWarm', transform: { translate: [0, 1.0, 1.1] } }),
  ]),
);

defineAsset(
  'community_cinema',
  group([
    box({ width: 2.6, height: 1.6, depth: 2.0, color: 'wallStone', transform: { translate: [0, 0.8, 0] } }),
    box({ width: 2.8, height: 1.0, depth: 0.1, color: 'accentCool', transform: { translate: [0, 1.9, 1.05] } }),
    box({ width: 0.05, height: 1.8, depth: 0.05, color: 'metal', transform: { translate: [1.3, 1.0, 1.1] } }),
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
  ]),
);

defineAsset(
  'community_hospital',
  group([
    box({ width: 2.6, height: 1.7, depth: 2.0, color: 'wallWhite', transform: { translate: [0, 0.85, 0] } }),
    box({ width: 0.6, height: 0.15, depth: 0.15, color: 'clothPrimary', transform: { translate: [0, 1.75, 1.02] } }),
    box({ width: 0.15, height: 0.6, depth: 0.15, color: 'clothPrimary', transform: { translate: [0, 1.75, 1.02] } }),
  ]),
);

defineAsset(
  'community_fire_station',
  group([
    box({ width: 2.4, height: 1.5, depth: 1.8, color: 'wallBrick', transform: { translate: [0, 0.75, 0] } }),
    roof({ width: 2.4, depth: 1.8, height: 0.7, color: 'roofSlate', transform: { translate: [0, 1.5, 0] } }),
    box({ width: 1.6, height: 1.1, depth: 0.06, color: 'clothPrimary', transform: { translate: [0, 0.55, 0.93] } }),
    prism({
      radius: 0.14,
      height: 1.9,
      sides: 8,
      color: 'metalDark',
      transform: { translate: [1.0, 0.95, 0.5] },
    }),
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
