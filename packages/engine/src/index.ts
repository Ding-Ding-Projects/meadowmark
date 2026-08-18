/**
 * @meadowmark/engine — public exports.
 *
 * Importing this module registers every generated asset (buildings, nature,
 * props, characters) into the mesh-dsl registry as a side effect. Anything
 * that calls `createRenderer()` should import from here rather than from an
 * individual assets/*.ts file directly, so the registry is always complete
 * before a scene tries to look anything up.
 */

// Side-effect imports: populate the mesh registry.
import './assets/buildings.js';
import './assets/nature.js';
import './assets/flora.js';
import './assets/props.js';
import './assets/characters.js';
import './assets/effects.js';

export {
  build,
  defineAsset,
  getAsset,
  requireAsset,
  listAssetNames,
  getManifest,
  clearRegistry,
  box,
  prism,
  cylinder,
  cone,
  sphere,
  extrude,
  roof,
  lathe,
  group,
} from './mesh-dsl.js';
export type {
  MeshNode,
  BoxNode,
  PrismNode,
  CylinderNode,
  ConeNode,
  SphereNode,
  ExtrudeNode,
  RoofNode,
  LatheNode,
  GroupNode,
  Transform,
  AssetManifestEntry,
  BuiltAsset,
} from './mesh-dsl.js';

export { getPalette, getPaletteColor, setPalette, resetPalette, defaultPalette } from './palette.js';
export type { Palette, PaletteKey } from './palette.js';

export { cropAssetName, growthStages } from './assets/nature.js';

export {
  TILE_SIZE,
  tileToWorld,
  worldToTile,
  tileKey,
  tilesEqual,
  neighborsOf,
  footprintTiles,
  roadConnections,
  resolveRoadTile,
  OccupancyGrid,
  CARDINAL_OFFSETS,
} from './grid.js';
export type { Footprint } from './grid.js';

export { createScene } from './scene.js';
export type { SceneBundle, CreateSceneOptions, DayNightOptions } from './scene.js';

export { createCameraController, DEFAULT_LIMITS, KEYBOARD_BINDINGS } from './camera.js';
export type { CameraController, CameraLimits, CreateCameraOptions } from './camera.js';

export { InstancePool, InstanceManager } from './instancing.js';
export type { InstanceTransform } from './instancing.js';

export { PickableSet, KeyboardCursor, pickGroundTile } from './picking.js';
export type { PickTarget, PickResult } from './picking.js';

export { createPlacementController } from './placement.js';
export type { PlacementController } from './placement.js';

export { VillagerWanderSystem, VILLAGER_ASSET_NAMES } from './villagers.js';

export {
  QualityController,
  speedLevelSettings,
  detectSpeedLevel,
  SPEED_LEVEL_TABLE,
  DEFAULT_SPEED_LEVEL,
} from './quality.js';
export type { QualitySettings, SpeedLevel } from './quality.js';

export { createRenderer } from './renderer.js';
export type { RendererHandle, RendererEvent, RendererEventHandler, CreateRendererOptions } from './renderer.js';

export type {
  GameStateView,
  TileCoord,
  TileView,
  PlacedBuildingView,
  CropPlotView,
  CropKind,
  GrowthStage,
  AnimalView,
  AnimalKind,
  RoadTileView,
  RoadShape,
  DecorationView,
  DecorationKind,
  WeatherView,
  WeatherKind,
} from './state-view.js';
