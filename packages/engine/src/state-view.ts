/**
 * state-view.ts — the read-only slice of game state the renderer needs.
 *
 * The real, authoritative game state type lives in `@meadowmark/shared`,
 * owned by a different lane that is being written concurrently with this
 * one. Rather than taking a hard compile-time dependency on a package that
 * may not exist yet (or may shape its fields differently), the engine
 * defines this narrow structural interface describing ONLY the fields it
 * reads to render a frame.
 *
 * Because TypeScript's object types are structural, any `GameState` shape
 * from `@meadowmark/shared` that has at least these fields, in these shapes,
 * is assignable to `GameStateView` with no adapter code required. At
 * integration time, whoever wires the packages together should either:
 *
 *   1. Confirm `@meadowmark/shared`'s GameState is a superset of this shape
 *      (the common case — just pass it straight to `renderer.setState()`), or
 *   2. Add a small mapping function if field names diverge.
 *
 * Keep this file intentionally small. If the renderer starts reading a new
 * field, add it here — do not import the shared package's type directly.
 */

/** World-grid coordinates. Integer tile indices, not world units. */
export interface TileCoord {
  x: number;
  y: number;
}

/**
 * Every crop id balance/crops.json defines (17 today), plus 'berry' as a
 * generic catch-all for any future crop id content adds before the engine
 * ships it a dedicated mesh. Keep this union and assets/nature.ts's own
 * cropColor/cropArchetype tables in sync by hand — see the comment there.
 */
export type CropKind =
  | 'wheat'
  | 'corn'
  | 'carrot'
  | 'sugarcane'
  | 'cotton'
  | 'strawberry'
  | 'tomato'
  | 'potato'
  | 'soybean'
  | 'rice'
  | 'pumpkin'
  | 'chilli'
  | 'coffee_bean'
  | 'lavender'
  | 'grape'
  | 'blueberry'
  | 'vanilla'
  | 'berry';
export type GrowthStage = 'seed' | 'sprout' | 'growing' | 'ready';

export interface CropPlotView {
  id: string;
  position: TileCoord;
  cropKind: CropKind;
  growthStage: GrowthStage;
}

export interface PlacedBuildingView {
  id: string;
  /** Must match a registered asset name in mesh-dsl's registry, e.g. "house_tier_3". */
  assetName: string;
  position: TileCoord;
  /** 0-3, each step a 90-degree yaw. */
  rotation: 0 | 1 | 2 | 3;
}

export type AnimalKind = 'chicken' | 'cow' | 'sheep' | 'pig' | 'goat' | 'bee';

export interface AnimalView {
  id: string;
  kind: AnimalKind;
  position: TileCoord;
  /** Free-form heading in radians; the renderer does not simulate motion. */
  heading: number;
}

export type RoadShape = 'straight' | 'corner' | 'junction' | 'end';

export interface RoadTileView {
  position: TileCoord;
  shape: RoadShape;
  /** 0-3, each step a 90-degree yaw, so a straight/corner tile joins its neighbours. */
  rotation: 0 | 1 | 2 | 3;
}

export type DecorationKind =
  | 'tree_round'
  | 'tree_pine'
  | 'tree_fruit'
  | 'bush'
  | 'bush_berry'
  | 'field_plot_empty'
  | 'rock_small'
  | 'rock_medium'
  | 'rock_large'
  | 'fence_post'
  | 'fence_rail'
  | 'hedge'
  | 'lamp_post'
  | 'bench'
  | 'fountain'
  | 'statue'
  | 'sign'
  | 'flower_bed'
  | 'topiary'
  | 'gazebo';

export interface DecorationView {
  id: string;
  kind: DecorationKind;
  position: TileCoord;
  rotation: 0 | 1 | 2 | 3;
}

export interface TileView {
  position: TileCoord;
  /** Whether this tile is buildable ground, water, or otherwise occupied. */
  terrain: 'grass' | 'soil' | 'water' | 'sand' | 'stone';
}

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'fog';

export interface WeatherView {
  kind: WeatherKind;
  /** 0 = midnight, 12 = noon, 24 = midnight again — fractional hours. */
  timeOfDay: number;
}

/**
 * The complete read-only view the renderer consumes each frame. Every field
 * here is optional at the top level except the ones the renderer cannot
 * function without, so a caller mid-migration can pass a partial state
 * while the shared package's shape stabilizes.
 */
export interface GameStateView {
  tiles: readonly TileView[];
  buildings: readonly PlacedBuildingView[];
  cropPlots: readonly CropPlotView[];
  animals: readonly AnimalView[];
  roads: readonly RoadTileView[];
  decorations: readonly DecorationView[];
  weather: WeatherView;
}
