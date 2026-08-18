/**
 * Generated character meshes — simple low-poly villagers and farm animals,
 * built from the same DSL as everything else. Kept deliberately simple
 * (a handful of primitives each) since these are the assets instanced in
 * the largest numbers.
 */

import { box, cylinder, defineAsset, group, sphere, type MeshNode } from '../mesh-dsl.js';
import type { PaletteKey } from '../palette.js';

function villagerNode(cloth: PaletteKey, skin: PaletteKey): MeshNode {
  return group([
    cylinder({ radiusTop: 0.06, radiusBottom: 0.08, height: 0.3, radialSegments: 8, color: cloth, transform: { translate: [0, 0.15, 0] } }),
    sphere({ radius: 0.07, widthSegments: 8, heightSegments: 6, color: skin, transform: { translate: [0, 0.37, 0] } }),
    sphere({ radius: 0.075, widthSegments: 8, heightSegments: 6, color: 'hair', transform: { translate: [0, 0.4, -0.01] } }),
    ...[-0.09, 0.09].map((x) =>
      cylinder({ radiusTop: 0.025, radiusBottom: 0.02, height: 0.28, radialSegments: 6, color: skin, transform: { translate: [x, 0, 0] } }),
    ),
  ]);
}

defineAsset('villager_a', villagerNode('clothPrimary', 'skinLight'));
defineAsset('villager_b', villagerNode('clothSecondary', 'skinMid'));
defineAsset('villager_c', villagerNode('accent', 'skinDark'));
defineAsset('villager_d', villagerNode('accentCool', 'skinLight'));

function quadrupedNode(body: PaletteKey, spot: PaletteKey | null, earStyle: 'floppy' | 'small'): MeshNode {
  const children: MeshNode[] = [
    box({ width: 0.16, height: 0.14, depth: 0.32, color: body, transform: { translate: [0, 0.17, 0] } }),
    sphere({ radius: 0.09, widthSegments: 8, heightSegments: 6, color: body, transform: { translate: [0, 0.2, 0.2] } }),
    ...[-0.05, 0.05].map((x) =>
      [-0.12, 0.12].map((z) =>
        cylinder({ radiusTop: 0.018, radiusBottom: 0.018, height: 0.16, radialSegments: 6, color: body, transform: { translate: [x, 0.08, z] } }),
      ),
    ).flat(),
  ];
  if (spot) {
    children.push(
      sphere({ radius: 0.04, widthSegments: 6, heightSegments: 5, color: spot, transform: { translate: [0.03, 0.2, -0.05] } }),
      sphere({ radius: 0.03, widthSegments: 6, heightSegments: 5, color: spot, transform: { translate: [-0.02, 0.17, 0.05] } }),
    );
  }
  const earSize = earStyle === 'floppy' ? 0.03 : 0.018;
  children.push(
    ...[-0.04, 0.04].map((x) =>
      sphere({ radius: earSize, widthSegments: 5, heightSegments: 4, color: body, transform: { translate: [x, 0.26, 0.24] } }),
    ),
  );
  return group(children);
}

defineAsset('animal_chicken', chickenNode());
function chickenNode(): MeshNode {
  return group([
    sphere({ radius: 0.08, widthSegments: 7, heightSegments: 6, color: 'wallWhite', transform: { translate: [0, 0.12, 0] } }),
    sphere({ radius: 0.05, widthSegments: 6, heightSegments: 5, color: 'wallWhite', transform: { translate: [0, 0.2, 0.06] } }),
    box({ width: 0.02, height: 0.02, depth: 0.04, color: 'accentWarm', transform: { translate: [0, 0.2, 0.11] } }),
    box({ width: 0.02, height: 0.02, depth: 0.02, color: 'accentWarm', transform: { translate: [0, 0.26, 0.06] } }),
  ]);
}

defineAsset('animal_cow', quadrupedNode('wallWhite', 'stoneDark', 'floppy'));
defineAsset('animal_sheep', quadrupedNode('wallCream', null, 'small'));
defineAsset('animal_pig', quadrupedNode('skinLight', null, 'small'));
defineAsset('animal_goat', quadrupedNode('wallStone', null, 'small'));

defineAsset(
  'animal_bee',
  group([
    sphere({ radius: 0.03, widthSegments: 6, heightSegments: 5, color: 'accent', transform: { translate: [0, 0, 0] } }),
    box({ width: 0.05, height: 0.005, depth: 0.03, color: 'wallWhite', transform: { translate: [0.03, 0.01, 0], rotate: [0, 0.3, 0] } }),
    box({ width: 0.05, height: 0.005, depth: 0.03, color: 'wallWhite', transform: { translate: [-0.03, 0.01, 0], rotate: [0, -0.3, 0] } }),
  ]),
);
