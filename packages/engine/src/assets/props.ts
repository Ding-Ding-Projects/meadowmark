/**
 * Generated prop meshes — roads and junctions, lamps, benches, fountains,
 * statues, signs, the train and its wagons, the helicopter, and the ship.
 */

import { box, cone, cylinder, defineAsset, group, sphere, type MeshNode } from '../mesh-dsl.js';

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
