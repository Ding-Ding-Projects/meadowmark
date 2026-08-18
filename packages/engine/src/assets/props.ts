/**
 * Generated prop meshes — roads and junctions, lamps, benches, fountains,
 * statues, signs, the train and its wagons, the helicopter, and the ship,
 * plus the `prop_*` namespace: incidental town-and-yard clutter (carts,
 * market stalls, crates, hay bales, street furniture, gates and hedgerows)
 * added to give a town more to look at than terrain tiles and silhouettes.
 *
 * Every new asset in this file lives under the `prop_` prefix so it can
 * never collide with a name already registered here or in nature.ts /
 * buildings.ts / characters.ts — defineAsset() throws on a duplicate name,
 * which is the whole safety net for a lane that only owns this one file.
 */

import { box, cone, cylinder, defineAsset, extrude, group, lathe, roof, sphere, type MeshNode } from '../mesh-dsl.js';
import type { PaletteKey } from '../palette.js';

/** Road tiles: flat, 1-unit, with a painted centre-line so orientation reads
 * clearly from above and joins visibly with a neighbouring straight tile. */
defineAsset(
  'road_straight',
  group([
    box({ width: 1.0, height: 0.04, depth: 1.0, color: 'road', transform: { translate: [0, 0.02, 0] } }),
    box({ width: 0.06, height: 0.001, depth: 0.6, color: 'roadLine', transform: { translate: [0, 0.041, 0] } }),
  ]),
);

defineAsset(
  'road_corner',
  group([
    box({ width: 1.0, height: 0.04, depth: 1.0, color: 'road', transform: { translate: [0, 0.02, 0] } }),
  ]),
);

defineAsset(
  'road_junction',
  group([
    box({ width: 1.0, height: 0.04, depth: 1.0, color: 'road', transform: { translate: [0, 0.02, 0] } }),
  ]),
);

defineAsset(
  'road_end',
  group([
    box({ width: 1.0, height: 0.04, depth: 1.0, color: 'road', transform: { translate: [0, 0.02, 0] } }),
    box({ width: 0.06, height: 0.001, depth: 0.4, color: 'roadLine', transform: { translate: [0, 0.041, -0.2] } }),
  ]),
);

defineAsset(
  'lamp_post',
  group([
    cylinder({ radiusTop: 0.02, radiusBottom: 0.03, height: 0.9, radialSegments: 8, color: 'metalDark', transform: { translate: [0, 0.45, 0] } }),
    sphere({ radius: 0.06, widthSegments: 8, heightSegments: 6, color: 'accent', transform: { translate: [0, 0.92, 0] } }),
  ]),
);

defineAsset(
  'bench',
  group([
    box({ width: 0.5, height: 0.04, depth: 0.2, color: 'wood', transform: { translate: [0, 0.22, 0] } }),
    box({ width: 0.5, height: 0.2, depth: 0.03, color: 'wood', transform: { translate: [0, 0.34, -0.08] } }),
    ...[-0.2, 0.2].map((x) =>
      box({ width: 0.03, height: 0.22, depth: 0.18, color: 'metalDark', transform: { translate: [x, 0.11, 0] } }),
    ),
  ]),
);

defineAsset(
  'fountain',
  group([
    cylinder({ radiusTop: 0.5, radiusBottom: 0.55, height: 0.16, radialSegments: 16, color: 'stone', transform: { translate: [0, 0.08, 0] } }),
    cylinder({ radiusTop: 0.42, radiusBottom: 0.42, height: 0.02, radialSegments: 16, color: 'water', transform: { translate: [0, 0.17, 0] } }),
    cylinder({ radiusTop: 0.08, radiusBottom: 0.1, height: 0.45, radialSegments: 10, color: 'stone', transform: { translate: [0, 0.4, 0] } }),
    sphere({ radius: 0.1, widthSegments: 8, heightSegments: 6, color: 'water', transform: { translate: [0, 0.68, 0] } }),
  ]),
);

defineAsset(
  'statue',
  group([
    box({ width: 0.4, height: 0.15, depth: 0.4, color: 'stone', transform: { translate: [0, 0.075, 0] } }),
    cylinder({ radiusTop: 0.16, radiusBottom: 0.2, height: 0.55, radialSegments: 8, color: 'stoneDark', transform: { translate: [0, 0.15 + 0.275, 0] } }),
    sphere({ radius: 0.13, widthSegments: 8, heightSegments: 6, color: 'stoneDark', transform: { translate: [0, 0.15 + 0.55 + 0.1, 0] } }),
  ]),
);

defineAsset(
  'sign',
  group([
    cylinder({ radiusTop: 0.015, radiusBottom: 0.015, height: 0.4, radialSegments: 6, color: 'wood', transform: { translate: [0, 0.2, 0] } }),
    box({ width: 0.3, height: 0.16, depth: 0.02, color: 'wallCream', transform: { translate: [0, 0.42, 0] } }),
  ]),
);

/** Train — an engine plus wagons, all readable from every side. */
function trainCarNode(color: 'roofBarn' | 'metal' | 'accentCool', withCab: boolean): MeshNode {
  const children: MeshNode[] = [
    box({ width: 0.5, height: 0.22, depth: 0.9, color, transform: { translate: [0, 0.2, 0] } }),
    ...[-0.35, 0.35].map((z) =>
      [-0.19, 0.19].map((x) =>
        cylinder({
          radiusTop: 0.07,
          radiusBottom: 0.07,
          height: 0.05,
          radialSegments: 10,
          color: 'metalDark',
          transform: { translate: [x, 0.06, z], rotate: [Math.PI / 2, 0, 0] },
        }),
      ),
    ).flat(),
  ];
  if (withCab) {
    children.push(
      box({ width: 0.44, height: 0.2, depth: 0.3, color: 'metal', transform: { translate: [0, 0.42, -0.2] } }),
      cylinder({ radiusTop: 0.07, radiusBottom: 0.09, height: 0.3, radialSegments: 8, color: 'metalDark', transform: { translate: [0, 0.42, 0.32] } }),
    );
  }
  return group(children);
}
defineAsset('train_engine', trainCarNode('metal', true));
defineAsset('train_wagon', trainCarNode('roofBarn', false));
defineAsset('train_wagon_tanker', trainCarNode('accentCool', false));

defineAsset(
  'helicopter',
  group([
    sphere({ radius: 0.22, widthSegments: 8, heightSegments: 6, color: 'accentWarm', transform: { translate: [0, 0.2, 0] } }),
    cylinder({ radiusTop: 0.04, radiusBottom: 0.04, height: 0.4, radialSegments: 6, color: 'metalDark', transform: { translate: [0, 0.2, -0.3], rotate: [Math.PI / 2, 0, 0] } }),
    box({ width: 0.9, height: 0.02, depth: 0.06, color: 'metalDark', transform: { translate: [0, 0.42, 0] } }),
    box({ width: 0.06, height: 0.02, depth: 0.4, color: 'metalDark', transform: { translate: [0, 0.06, -0.5] } }),
  ]),
);

defineAsset(
  'ship',
  group([
    box({ width: 0.7, height: 0.22, depth: 1.6, color: 'wallWhite', transform: { translate: [0, 0.14, 0] } }),
    box({ width: 0.5, height: 0.3, depth: 0.6, color: 'accentCool', transform: { translate: [0, 0.4, -0.2] } }),
    cylinder({ radiusTop: 0.03, radiusBottom: 0.03, height: 0.6, radialSegments: 6, color: 'metalDark', transform: { translate: [0, 0.7, 0.3] } }),
    cone({ radius: 0.3, height: 0.12, radialSegments: 4, color: 'wallStone', transform: { translate: [0, 0.02, 0.75], rotate: [Math.PI, 0, 0] } }),
  ]),
);

// ===========================================================================
// prop_* — incidental town clutter. See file header for the naming rule.
// ===========================================================================

/** A wheel disc: a short flat cylinder standing on its edge, matching the
 * orientation convention already used by the train cars above (cylinder's
 * default Y-axis turned to face sideways via a 90-degree X rotation). */
function wheelNode(x: number, z: number, radius: number, color: PaletteKey = 'metalDark'): MeshNode {
  return cylinder({
    radiusTop: radius,
    radiusBottom: radius,
    height: 0.05,
    radialSegments: 10,
    color,
    transform: { translate: [x, radius, z], rotate: [Math.PI / 2, 0, 0] },
  });
}

// ---------------------------------------------------------------------------
// Vehicles and machines
// ---------------------------------------------------------------------------

defineAsset(
  'prop_cart_hand',
  group([
    box({ width: 0.4, height: 0.14, depth: 0.6, color: 'wood', transform: { translate: [0, 0.24, 0] } }),
    box({ width: 0.42, height: 0.05, depth: 0.62, color: 'woodDark', transform: { translate: [0, 0.32, 0] } }),
    wheelNode(-0.23, 0.05, 0.13),
    wheelNode(0.23, 0.05, 0.13),
    ...[-0.14, 0.14].map((x) =>
      cylinder({
        radiusTop: 0.015,
        radiusBottom: 0.015,
        height: 0.5,
        radialSegments: 6,
        color: 'wood',
        transform: { translate: [x, 0.28, -0.42], rotate: [-0.55, 0, 0] },
      }),
    ),
  ]),
);

defineAsset(
  'prop_wagon_loaded',
  group([
    box({ width: 0.55, height: 0.18, depth: 0.95, color: 'wood', transform: { translate: [0, 0.28, 0] } }),
    ...[-0.28, 0.28].map((x) =>
      box({ width: 0.03, height: 0.14, depth: 0.95, color: 'woodDark', transform: { translate: [x, 0.44, 0] } }),
    ),
    wheelNode(-0.29, -0.32, 0.16),
    wheelNode(0.29, -0.32, 0.16),
    wheelNode(-0.29, 0.32, 0.16),
    wheelNode(0.29, 0.32, 0.16),
    sphere({ radius: 0.24, widthSegments: 8, heightSegments: 6, color: 'cropWheat', transform: { translate: [0, 0.52, -0.1], scale: [1, 0.6, 1.3] } }),
    sphere({ radius: 0.2, widthSegments: 8, heightSegments: 6, color: 'cropWheat', transform: { translate: [0.1, 0.58, 0.2], scale: [1, 0.6, 1] } }),
    cylinder({ radiusTop: 0.02, radiusBottom: 0.02, height: 1.0, radialSegments: 6, color: 'wood', transform: { translate: [0, 0.28, -0.72], rotate: [Math.PI / 2, 0, 0] } }),
  ]),
);

defineAsset(
  'prop_tractor',
  group([
    box({ width: 0.42, height: 0.3, depth: 0.55, color: 'accentWarm', transform: { translate: [0, 0.34, 0.05] } }),
    box({ width: 0.36, height: 0.28, depth: 0.3, color: 'wallCream', transform: { translate: [0, 0.62, -0.12] } }),
    box({ width: 0.3, height: 0.14, depth: 0.02, color: 'glass', transform: { translate: [0, 0.62, -0.27] } }),
    box({ width: 0.3, height: 0.16, depth: 0.4, color: 'accentWarm', transform: { translate: [0, 0.24, -0.5] } }),
    wheelNode(-0.24, -0.5, 0.11, 'metal'),
    wheelNode(0.24, -0.5, 0.11, 'metal'),
    wheelNode(-0.28, 0.15, 0.2, 'metalDark'),
    wheelNode(0.28, 0.15, 0.2, 'metalDark'),
    cylinder({ radiusTop: 0.025, radiusBottom: 0.03, height: 0.4, radialSegments: 8, color: 'metalDark', transform: { translate: [-0.14, 0.78, 0.15] } }),
  ]),
);

defineAsset(
  'prop_truck_delivery',
  group([
    box({ width: 0.42, height: 0.3, depth: 0.36, color: 'wallWhite', transform: { translate: [0, 0.28, -0.32] } }),
    box({ width: 0.38, height: 0.16, depth: 0.02, color: 'glass', transform: { translate: [0, 0.32, -0.5] } }),
    box({ width: 0.44, height: 0.4, depth: 0.7, color: 'accentCool', transform: { translate: [0, 0.36, 0.16] } }),
    box({ width: 0.02, height: 0.4, depth: 0.7, color: 'wallCream', transform: { translate: [0.221, 0.36, 0.16] } }),
    wheelNode(-0.25, -0.32, 0.13, 'metalDark'),
    wheelNode(0.25, -0.32, 0.13, 'metalDark'),
    wheelNode(-0.25, 0.3, 0.13, 'metalDark'),
    wheelNode(0.25, 0.3, 0.13, 'metalDark'),
    box({ width: 0.46, height: 0.03, depth: 0.06, color: 'metalDark', transform: { translate: [0, 0.13, -0.5] } }),
  ]),
);

defineAsset(
  'prop_wheelbarrow',
  group([
    extrude({
      points: [
        [-0.18, 0],
        [0.18, 0],
        [0.14, 0.16],
        [-0.14, 0.16],
      ],
      depth: 0.4,
      color: 'metal',
      transform: { translate: [0, 0.22, 0], rotate: [Math.PI / 2, 0, 0] },
    }),
    wheelNode(0, -0.28, 0.09, 'metalDark'),
    ...[-0.12, 0.12].map((x) =>
      cylinder({
        radiusTop: 0.012,
        radiusBottom: 0.012,
        height: 0.55,
        radialSegments: 6,
        color: 'wood',
        transform: { translate: [x, 0.2, 0.28], rotate: [0.5, 0, 0] },
      }),
    ),
    ...[-0.14, 0.14].map((x) =>
      cylinder({ radiusTop: 0.012, radiusBottom: 0.012, height: 0.22, radialSegments: 6, color: 'wood', transform: { translate: [x, 0.11, -0.14], rotate: [0.35, 0, 0] } }),
    ),
  ]),
);

defineAsset(
  'prop_windmill',
  group([
    cylinder({ radiusTop: 0.16, radiusBottom: 0.26, height: 1.1, radialSegments: 10, color: 'wallStone', transform: { translate: [0, 0.55, 0] } }),
    cone({ radius: 0.3, height: 0.42, radialSegments: 10, color: 'roofSlate', transform: { translate: [0, 1.31, 0] } }),
    sphere({ radius: 0.06, widthSegments: 8, heightSegments: 6, color: 'metalDark', transform: { translate: [0, 1.05, 0.2] } }),
    ...[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle) =>
      box({
        width: 0.14,
        height: 0.5,
        depth: 0.03,
        color: 'wallCream',
        transform: { translate: [0, 1.05, 0.2], rotate: [0, 0, angle] },
      }),
    ),
  ]),
);

defineAsset(
  'prop_water_wheel',
  group([
    box({ width: 0.08, height: 0.5, depth: 0.14, color: 'stoneDark', transform: { translate: [0, 0.25, 0] } }),
    cylinder({ radiusTop: 0.42, radiusBottom: 0.42, height: 0.06, radialSegments: 12, color: 'wood', transform: { translate: [0.11, 0.5, 0], rotate: [0, 0, Math.PI / 2] } }),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const angle = (i / 8) * Math.PI * 2;
      return box({
        width: 0.06,
        height: 0.14,
        depth: 0.34,
        color: 'woodDark',
        transform: {
          translate: [0.11, 0.5 + Math.cos(angle) * 0.4, Math.sin(angle) * 0.4],
          rotate: [angle, 0, 0],
        },
      });
    }),
  ]),
);

defineAsset(
  'prop_silo',
  group([
    cylinder({ radiusTop: 0.28, radiusBottom: 0.28, height: 1.0, radialSegments: 12, color: 'metal', transform: { translate: [0, 0.5, 0] } }),
    cone({ radius: 0.29, height: 0.22, radialSegments: 12, color: 'metalDark', transform: { translate: [0, 1.11, 0] } }),
    box({ width: 0.03, height: 0.95, depth: 0.02, color: 'metalDark', transform: { translate: [0.27, 0.5, 0.14] } }),
  ]),
);

defineAsset(
  'prop_well',
  group([
    cylinder({ radiusTop: 0.32, radiusBottom: 0.34, height: 0.3, radialSegments: 12, color: 'stone', transform: { translate: [0, 0.15, 0] } }),
    ...[-0.28, 0.28].map((x) =>
      cylinder({ radiusTop: 0.025, radiusBottom: 0.025, height: 0.6, radialSegments: 6, color: 'wood', transform: { translate: [x, 0.6, 0] } }),
    ),
    roof({ width: 0.6, depth: 0.5, height: 0.22, overhang: 0.08, color: 'roofThatch', transform: { translate: [0, 0.9, 0] } }),
    cylinder({ radiusTop: 0.004, radiusBottom: 0.004, height: 0.35, radialSegments: 4, color: 'woodDark', transform: { translate: [0, 0.72, 0] } }),
    cylinder({ radiusTop: 0.06, radiusBottom: 0.05, height: 0.1, radialSegments: 8, color: 'wood', transform: { translate: [0, 0.5, 0] } }),
  ]),
);

// ---------------------------------------------------------------------------
// Market and yard clutter
// ---------------------------------------------------------------------------

function marketStallNode(stripeA: PaletteKey, stripeB: PaletteKey): MeshNode {
  const legs = [
    [-0.4, -0.35],
    [0.4, -0.35],
    [-0.4, 0.35],
    [0.4, 0.35],
  ] as const;
  const stripeCount = 6;
  const stripeWidth = 0.9 / stripeCount;
  return group([
    ...legs.map(([x, z]) =>
      cylinder({ radiusTop: 0.02, radiusBottom: 0.02, height: 0.9, radialSegments: 6, color: 'wood', transform: { translate: [x, 0.45, z] } }),
    ),
    box({ width: 0.85, height: 0.06, depth: 0.75, color: 'wood', transform: { translate: [0, 0.45, 0] } }),
    group(
      Array.from({ length: stripeCount }, (_, i) =>
        box({
          width: stripeWidth,
          height: 0.02,
          depth: 0.8,
          color: i % 2 === 0 ? stripeA : stripeB,
          transform: { translate: [-0.45 + stripeWidth * (i + 0.5), 0, 0] },
        }),
      ),
      { translate: [0, 0.95, 0], rotate: [0.12, 0, 0] },
    ),
  ]);
}
defineAsset('prop_market_stall_a', marketStallNode('clothPrimary', 'wallCream'));
defineAsset('prop_market_stall_b', marketStallNode('accentCool', 'wallCream'));

defineAsset(
  'prop_crate_a',
  group([
    box({ width: 0.3, height: 0.3, depth: 0.3, color: 'wood', transform: { translate: [0, 0.15, 0] } }),
    box({ width: 0.32, height: 0.02, depth: 0.06, color: 'woodDark', transform: { translate: [0, 0.3, 0], rotate: [0, 0.79, 0] } }),
    box({ width: 0.32, height: 0.02, depth: 0.06, color: 'woodDark', transform: { translate: [0, 0.3, 0], rotate: [0, -0.79, 0] } }),
  ]),
);
defineAsset(
  'prop_crate_b',
  group([
    box({ width: 0.36, height: 0.26, depth: 0.34, color: 'woodDark', transform: { translate: [0, 0.13, 0], rotate: [0, 0.18, 0] } }),
    box({ width: 0.05, height: 0.28, depth: 0.36, color: 'wood', transform: { translate: [-0.16, 0.13, 0], rotate: [0, 0.18, 0] } }),
    box({ width: 0.05, height: 0.28, depth: 0.36, color: 'wood', transform: { translate: [0.16, 0.13, 0], rotate: [0, 0.18, 0] } }),
  ]),
);

function barrelNode(scale: number, bandColor: PaletteKey): MeshNode {
  const points: Array<[number, number]> = [
    [0, 0],
    [0.15 * scale, 0.02 * scale],
    [0.19 * scale, 0.12 * scale],
    [0.19 * scale, 0.28 * scale],
    [0.15 * scale, 0.38 * scale],
    [0, 0.4 * scale],
  ];
  return group([
    lathe({ points, segments: 12, color: 'wood' }),
    cylinder({ radiusTop: 0.195 * scale, radiusBottom: 0.195 * scale, height: 0.02, radialSegments: 12, color: bandColor, transform: { translate: [0, 0.09 * scale, 0] } }),
    cylinder({ radiusTop: 0.195 * scale, radiusBottom: 0.195 * scale, height: 0.02, radialSegments: 12, color: bandColor, transform: { translate: [0, 0.31 * scale, 0] } }),
  ]);
}
defineAsset('prop_barrel_a', barrelNode(1.0, 'metalDark'));
defineAsset('prop_barrel_b', barrelNode(0.8, 'metal'));

defineAsset(
  'prop_sack_a',
  group([
    sphere({ radius: 0.17, widthSegments: 8, heightSegments: 6, color: 'cropRice', transform: { translate: [0, 0.18, 0], scale: [1, 1.15, 1] } }),
    cylinder({ radiusTop: 0.04, radiusBottom: 0.09, height: 0.1, radialSegments: 6, color: 'cropRice', transform: { translate: [0, 0.36, 0] } }),
  ]),
);
defineAsset(
  'prop_sack_b',
  group([
    sphere({ radius: 0.15, widthSegments: 8, heightSegments: 6, color: 'soilDry', transform: { translate: [0.06, 0.16, 0], scale: [1.1, 1, 1], rotate: [0, 0, 0.3] } }),
    sphere({ radius: 0.14, widthSegments: 8, heightSegments: 6, color: 'soilDry', transform: { translate: [-0.08, 0.15, 0.05], scale: [1.1, 0.95, 1], rotate: [0, 0, -0.2] } }),
  ]),
);

defineAsset(
  'prop_hay_bale_round',
  group([
    cylinder({ radiusTop: 0.22, radiusBottom: 0.22, height: 0.4, radialSegments: 12, color: 'cropWheat', transform: { translate: [0, 0.22, 0], rotate: [0, 0, Math.PI / 2] } }),
    cylinder({ radiusTop: 0.225, radiusBottom: 0.225, height: 0.03, radialSegments: 12, color: 'soilDry', transform: { translate: [-0.12, 0.22, 0], rotate: [0, 0, Math.PI / 2] } }),
    cylinder({ radiusTop: 0.225, radiusBottom: 0.225, height: 0.03, radialSegments: 12, color: 'soilDry', transform: { translate: [0.12, 0.22, 0], rotate: [0, 0, Math.PI / 2] } }),
  ]),
);
defineAsset(
  'prop_hay_bale_square',
  group([
    box({ width: 0.4, height: 0.26, depth: 0.26, color: 'cropWheat', transform: { translate: [0, 0.13, 0] } }),
    box({ width: 0.42, height: 0.03, depth: 0.28, color: 'soilDry', transform: { translate: [0, 0.06, 0] } }),
    box({ width: 0.42, height: 0.03, depth: 0.28, color: 'soilDry', transform: { translate: [0, 0.2, 0] } }),
  ]),
);

defineAsset(
  'prop_milk_churn',
  group([
    lathe({
      points: [
        [0, 0],
        [0.09, 0.02],
        [0.1, 0.18],
        [0.06, 0.3],
        [0.06, 0.34],
        [0.08, 0.36],
      ],
      segments: 10,
      color: 'metal',
    }),
    sphere({ radius: 0.05, widthSegments: 8, heightSegments: 6, color: 'metalDark', transform: { translate: [0, 0.4, 0] } }),
    ...[-0.09, 0.09].map((x) =>
      box({ width: 0.02, height: 0.08, depth: 0.02, color: 'metalDark', transform: { translate: [x, 0.28, 0] } }),
    ),
  ]),
);

defineAsset(
  'prop_basket_produce',
  group([
    lathe({
      points: [
        [0, 0],
        [0.12, 0],
        [0.16, 0.14],
        [0.17, 0.22],
      ],
      segments: 10,
      color: 'wood',
    }),
    sphere({ radius: 0.06, widthSegments: 6, heightSegments: 5, color: 'cropTomato', transform: { translate: [-0.06, 0.24, 0.02] } }),
    sphere({ radius: 0.06, widthSegments: 6, heightSegments: 5, color: 'cropPumpkin', transform: { translate: [0.05, 0.25, -0.04] } }),
    sphere({ radius: 0.05, widthSegments: 6, heightSegments: 5, color: 'cropCarrot', transform: { translate: [0.02, 0.27, 0.07] } }),
  ]),
);

defineAsset(
  'prop_log_pile',
  group([
    ...[-0.16, -0.05, 0.06, 0.17].map((x) =>
      cylinder({ radiusTop: 0.07, radiusBottom: 0.07, height: 0.5, radialSegments: 8, color: 'wood', transform: { translate: [x, 0.07, 0], rotate: [0, 0, Math.PI / 2] } }),
    ),
    ...[-0.1, 0.0, 0.1].map((x) =>
      cylinder({ radiusTop: 0.07, radiusBottom: 0.07, height: 0.5, radialSegments: 8, color: 'woodDark', transform: { translate: [x, 0.2, 0], rotate: [0, 0, Math.PI / 2] } }),
    ),
  ]),
);

defineAsset(
  'prop_scarecrow',
  group([
    cylinder({ radiusTop: 0.02, radiusBottom: 0.025, height: 0.9, radialSegments: 6, color: 'wood', transform: { translate: [0, 0.45, 0] } }),
    box({ width: 0.5, height: 0.02, depth: 0.02, color: 'wood', transform: { translate: [0, 0.62, 0] } }),
    box({ width: 0.24, height: 0.36, depth: 0.14, color: 'clothPrimary', transform: { translate: [0, 0.52, 0] } }),
    sphere({ radius: 0.13, widthSegments: 8, heightSegments: 6, color: 'cropWheat', transform: { translate: [0, 0.78, 0] } }),
    cone({ radius: 0.16, height: 0.14, radialSegments: 8, color: 'roofThatch', transform: { translate: [0, 0.92, 0] } }),
    ...[-0.28, 0.28].map((x) =>
      box({ width: 0.14, height: 0.05, depth: 0.05, color: 'cropWheat', transform: { translate: [x, 0.62, 0] } }),
    ),
  ]),
);

defineAsset(
  'prop_beehive',
  group([
    box({ width: 0.24, height: 0.14, depth: 0.24, color: 'wallCream', transform: { translate: [0, 0.07, 0] } }),
    box({ width: 0.22, height: 0.14, depth: 0.22, color: 'wallWhite', transform: { translate: [0, 0.21, 0] } }),
    box({ width: 0.2, height: 0.14, depth: 0.2, color: 'wallCream', transform: { translate: [0, 0.35, 0] } }),
    roof({ width: 0.22, depth: 0.22, height: 0.1, overhang: 0.03, color: 'roofClay', transform: { translate: [0, 0.42, 0] } }),
    box({ width: 0.26, height: 0.02, depth: 0.08, color: 'wood', transform: { translate: [0, 0.01, 0.14] } }),
  ]),
);

defineAsset(
  'prop_dog_kennel',
  group([
    box({ width: 0.4, height: 0.3, depth: 0.44, color: 'wood', transform: { translate: [0, 0.15, 0] } }),
    roof({ width: 0.44, depth: 0.48, height: 0.16, overhang: 0.05, color: 'roofBarn', transform: { translate: [0, 0.3, 0] } }),
    box({ width: 0.18, height: 0.2, depth: 0.02, color: 'stoneDark', transform: { translate: [0, 0.1, -0.22] } }),
  ]),
);

defineAsset(
  'prop_mailbox',
  group([
    cylinder({ radiusTop: 0.02, radiusBottom: 0.02, height: 0.6, radialSegments: 6, color: 'wood', transform: { translate: [0, 0.3, 0] } }),
    lathe({
      points: [
        [0, 0],
        [0.08, 0],
        [0.08, 0.1],
        [0.05, 0.15],
        [0, 0.15],
      ],
      segments: 8,
      color: 'metal',
      transform: { translate: [0, 0.6, 0], rotate: [0, 0, Math.PI / 2] },
    }),
    box({ width: 0.02, height: 0.1, depth: 0.02, color: 'accentWarm', transform: { translate: [0.09, 0.68, 0], rotate: [0, 0, -0.4] } }),
  ]),
);

defineAsset(
  'prop_signpost',
  group([
    cylinder({ radiusTop: 0.025, radiusBottom: 0.03, height: 0.9, radialSegments: 8, color: 'wood', transform: { translate: [0, 0.45, 0] } }),
    group([
      box({ width: 0.3, height: 0.08, depth: 0.02, color: 'woodDark', transform: { translate: [0.16, 0, 0] } }),
      box({ width: 0.09, height: 0.07, depth: 0.021, color: 'wallCream', transform: { translate: [0.16, 0, 0.001] } }),
    ], { translate: [0, 0.72, 0], rotate: [0, 0.5, 0] }),
    group([
      box({ width: 0.24, height: 0.08, depth: 0.02, color: 'woodDark', transform: { translate: [0.13, 0, 0] } }),
      box({ width: 0.08, height: 0.07, depth: 0.021, color: 'wallCream', transform: { translate: [0.13, 0, 0.001] } }),
    ], { translate: [0, 0.6, 0], rotate: [0, -1.2, 0] }),
  ]),
);

// ---------------------------------------------------------------------------
// Street furniture
// ---------------------------------------------------------------------------

defineAsset(
  'prop_lamp_post_ornate',
  group([
    cylinder({ radiusTop: 0.1, radiusBottom: 0.13, height: 0.08, radialSegments: 10, color: 'metalDark', transform: { translate: [0, 0.04, 0] } }),
    cylinder({ radiusTop: 0.025, radiusBottom: 0.035, height: 1.0, radialSegments: 8, color: 'metalDark', transform: { translate: [0, 0.58, 0] } }),
    box({ width: 0.5, height: 0.02, depth: 0.02, color: 'metalDark', transform: { translate: [0, 0.98, 0] } }),
    sphere({ radius: 0.07, widthSegments: 8, heightSegments: 6, color: 'accent', transform: { translate: [-0.23, 0.98, 0] } }),
    sphere({ radius: 0.07, widthSegments: 8, heightSegments: 6, color: 'accent', transform: { translate: [0.23, 0.98, 0] } }),
    sphere({ radius: 0.08, widthSegments: 8, heightSegments: 6, color: 'accent', transform: { translate: [0, 1.16, 0] } }),
  ]),
);
defineAsset(
  'prop_lamp_post_modern',
  group([
    box({ width: 0.06, height: 1.0, depth: 0.06, color: 'metal', transform: { translate: [0, 0.5, 0] } }),
    box({ width: 0.12, height: 0.14, depth: 0.12, color: 'metal', transform: { translate: [0, 1.05, 0] } }),
    box({ width: 0.09, height: 0.02, depth: 0.09, color: 'accentCool', transform: { translate: [0, 0.99, 0] } }),
  ]),
);

defineAsset(
  'prop_bench_stone',
  group([
    box({ width: 0.5, height: 0.06, depth: 0.22, color: 'stone', transform: { translate: [0, 0.26, 0] } }),
    ...[-0.19, 0.19].map((x) =>
      box({ width: 0.08, height: 0.26, depth: 0.2, color: 'stoneDark', transform: { translate: [x, 0.13, 0] } }),
    ),
  ]),
);

defineAsset(
  'prop_picnic_table',
  group([
    box({ width: 0.34, height: 0.03, depth: 0.9, color: 'wood', transform: { translate: [0, 0.36, 0] } }),
    ...[-0.55, 0.55].map((z) => [
      box({ width: 0.5, height: 0.03, depth: 0.22, color: 'wood', transform: { translate: [0, 0.22, z] } }),
      box({ width: 0.03, height: 0.24, depth: 0.36, color: 'woodDark', transform: { translate: [-0.15, 0.22, z], rotate: [0.28, 0, 0] } }),
      box({ width: 0.03, height: 0.24, depth: 0.36, color: 'woodDark', transform: { translate: [0.15, 0.22, z], rotate: [0.28, 0, 0] } }),
    ]).flat(),
  ]),
);

defineAsset(
  'prop_planter_box',
  group([
    box({ width: 0.44, height: 0.2, depth: 0.24, color: 'wood', transform: { translate: [0, 0.1, 0] } }),
    box({ width: 0.38, height: 0.03, depth: 0.18, color: 'soilDry', transform: { translate: [0, 0.19, 0] } }),
    ...[-0.13, 0, 0.13].map((x, i) => {
      const bloom: PaletteKey = i === 0 ? 'accentWarm' : i === 1 ? 'cropLavender' : 'cropStrawberry';
      return sphere({ radius: 0.05, widthSegments: 6, heightSegments: 5, color: bloom, transform: { translate: [x, 0.24, 0] } });
    }),
  ]),
);
defineAsset(
  'prop_planter_round',
  group([
    cylinder({ radiusTop: 0.22, radiusBottom: 0.18, height: 0.22, radialSegments: 12, color: 'stone', transform: { translate: [0, 0.11, 0] } }),
    cylinder({ radiusTop: 0.19, radiusBottom: 0.19, height: 0.03, radialSegments: 12, color: 'soilDry', transform: { translate: [0, 0.21, 0] } }),
    ...[0, 1, 2, 3].map((i) => {
      const angle = (i / 4) * Math.PI * 2;
      const bloom: PaletteKey = i % 2 === 0 ? 'accent' : 'cropLavender';
      return sphere({ radius: 0.045, widthSegments: 6, heightSegments: 5, color: bloom, transform: { translate: [Math.cos(angle) * 0.08, 0.26, Math.sin(angle) * 0.08] } });
    }),
  ]),
);

defineAsset(
  'prop_noticeboard',
  group([
    cylinder({ radiusTop: 0.025, radiusBottom: 0.025, height: 0.9, radialSegments: 6, color: 'wood', transform: { translate: [-0.35, 0.45, 0] } }),
    cylinder({ radiusTop: 0.025, radiusBottom: 0.025, height: 0.9, radialSegments: 6, color: 'wood', transform: { translate: [0.35, 0.45, 0] } }),
    box({ width: 0.8, height: 0.5, depth: 0.04, color: 'wallCream', transform: { translate: [0, 0.75, 0] } }),
    box({ width: 0.86, height: 0.06, depth: 0.06, color: 'woodDark', transform: { translate: [0, 1.03, 0] } }),
    roof({ width: 0.82, depth: 0.14, height: 0.14, overhang: 0.04, color: 'roofSlate', transform: { translate: [0, 1.08, 0] } }),
  ]),
);

defineAsset(
  'prop_bunting',
  group([
    cylinder({ radiusTop: 0.02, radiusBottom: 0.025, height: 0.9, radialSegments: 6, color: 'wood', transform: { translate: [-0.5, 0.45, 0] } }),
    cylinder({ radiusTop: 0.02, radiusBottom: 0.025, height: 0.9, radialSegments: 6, color: 'wood', transform: { translate: [0.5, 0.45, 0] } }),
    ...[-0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36].map((x, i) => {
      const sag = 0.14 * (1 - Math.pow(x / 0.5, 2));
      const flagColor: PaletteKey = i % 3 === 0 ? 'clothPrimary' : i % 3 === 1 ? 'accent' : 'accentCool';
      return extrude({
        points: [
          [-0.05, 0],
          [0.05, 0],
          [0, -0.09],
        ],
        depth: 0.005,
        color: flagColor,
        transform: { translate: [x, 0.82 - sag, 0] },
      });
    }),
  ]),
);

defineAsset(
  'prop_flagpole',
  group([
    cylinder({ radiusTop: 0.015, radiusBottom: 0.02, height: 1.4, radialSegments: 8, color: 'metal', transform: { translate: [0, 0.7, 0] } }),
    sphere({ radius: 0.03, widthSegments: 6, heightSegments: 5, color: 'accent', transform: { translate: [0, 1.42, 0] } }),
    box({ width: 0.34, height: 0.22, depth: 0.01, color: 'clothPrimary', transform: { translate: [0.17, 1.24, 0] } }),
  ]),
);

// ---------------------------------------------------------------------------
// Boundaries and paths
// ---------------------------------------------------------------------------

defineAsset(
  'prop_gate_wood',
  group([
    ...[-0.48, 0.48].map((x) =>
      box({ width: 0.06, height: 0.6, depth: 0.06, color: 'wood', transform: { translate: [x, 0.3, 0] } }),
    ),
    ...[0.18, 0.34, 0.5].map((y) =>
      box({ width: 0.9, height: 0.045, depth: 0.03, color: 'wood', transform: { translate: [0, y, 0] } }),
    ),
    box({ width: 0.9, height: 0.045, depth: 0.03, color: 'woodDark', transform: { translate: [0, 0.34, 0], rotate: [0, 0, 0.4] } }),
  ]),
);

defineAsset(
  'prop_stile',
  group([
    ...[-0.16, 0.16].map((x) =>
      box({ width: 0.05, height: 0.5, depth: 0.05, color: 'wood', transform: { translate: [x, 0.25, 0] } }),
    ),
    box({ width: 0.5, height: 0.05, depth: 0.14, color: 'wood', transform: { translate: [0, 0.24, 0] } }),
    box({ width: 0.34, height: 0.05, depth: 0.12, color: 'woodDark', transform: { translate: [0, 0.06, 0.1] } }),
  ]),
);

defineAsset(
  'prop_hedge_low',
  group([
    box({ width: 1.0, height: 0.22, depth: 0.28, color: 'leafDark', transform: { translate: [0, 0.11, 0] } }),
    ...[-0.32, 0.02, 0.34].map((x) =>
      sphere({ radius: 0.1, widthSegments: 6, heightSegments: 5, color: 'leafLight', transform: { translate: [x, 0.22, 0] } }),
    ),
  ]),
);
defineAsset(
  'prop_hedge_tall',
  group([
    box({ width: 1.0, height: 0.6, depth: 0.32, color: 'leafDark', transform: { translate: [0, 0.3, 0] } }),
    ...[-0.34, -0.11, 0.12, 0.35].map((x) =>
      sphere({ radius: 0.12, widthSegments: 6, heightSegments: 5, color: 'leaf', transform: { translate: [x, 0.58, 0] } }),
    ),
  ]),
);

defineAsset(
  'prop_wall_stone_low',
  group(
    [0, 1, 2, 3].map((i) =>
      box({
        width: 0.24,
        height: 0.22 + (i % 2) * 0.03,
        depth: 0.16,
        color: i % 2 === 0 ? 'stone' : 'stoneDark',
        transform: { translate: [-0.375 + i * 0.25, 0.11 + (i % 2) * 0.015, 0] },
      }),
    ),
  ),
);

defineAsset(
  'prop_stepping_stone',
  cylinder({ radiusTop: 0.22, radiusBottom: 0.24, height: 0.06, radialSegments: 6, color: 'stone', transform: { translate: [0, 0.03, 0], rotate: [0, 0.3, 0] } }),
);

defineAsset(
  'prop_bridge_small',
  group([
    box({ width: 0.5, height: 0.06, depth: 1.1, color: 'wood', transform: { translate: [0, 0.15, 0] } }),
    ...[-0.24, 0.24].map((x) =>
      box({ width: 0.03, height: 0.16, depth: 1.1, color: 'woodDark', transform: { translate: [x, 0.24, 0] } }),
    ),
    ...[-0.5, 0.5].map((z) => [
      box({ width: 0.5, height: 0.14, depth: 0.14, color: 'stoneDark', transform: { translate: [0, 0.07, z] } }),
    ]).flat(),
  ]),
);
