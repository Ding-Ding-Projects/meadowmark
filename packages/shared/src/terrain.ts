/**
 * Terrain: per-tile ground cover on the town grid (grass/soil/water/sand/
 * stone). Nothing in the simulation reads terrain to decide game rules
 * today - it exists purely so the renderer has real, saved ground cover
 * to draw instead of defaulting every tile to 'grass' and recomputing
 * "soil under an unlocked plot" from scratch every frame. Tiles are
 * stored flat and row-major (index = y * gridWidth + x), the same
 * convention as MineTile.index.
 */

import type { GameEvent, GameState, TerrainKind, TerrainState, TerrainTile } from "./types.js";

export function terrainTileIndex(gridWidth: number, x: number, y: number): number {
  return y * gridWidth + x;
}

/**
 * Builds a fresh terrain grid: grass everywhere except the tiles named in
 * `soilIndices` (row-major indices), which are marked 'soil' so an
 * unlocked-but-nothing-planted-yet field still reads as tilled ground.
 */
export function createInitialTerrain(gridWidth: number, gridHeight: number, soilIndices: ReadonlySet<number>): TerrainState {
  const tiles: TerrainTile[] = [];
  const count = gridWidth * gridHeight;
  for (let i = 0; i < count; i++) {
    tiles.push({ index: i, kind: soilIndices.has(i) ? "soil" : "grass" });
  }
  return { gridWidth, gridHeight, tiles };
}

/** Sets the terrain kind at a specific tile (e.g. a future biome/expansion tool). No-op if the position is out of bounds. */
export function setTerrainTile(state: GameState, x: number, y: number, kind: TerrainKind): GameState {
  const { gridWidth, gridHeight } = state.terrain;
  if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) return state;
  const index = terrainTileIndex(gridWidth, x, y);
  const tiles = state.terrain.tiles.map((t) => (t.index === index ? { ...t, kind } : t));
  return { ...state, terrain: { ...state.terrain, tiles } };
}

/**
 * No time-based behavior yet - terrain only changes from explicit
 * setTerrainTile() calls. Kept as an explicit tick step for symmetry with
 * every other subsystem (see fields.ts's tickFields for the same
 * no-op-by-design shape) and for future weather-driven terrain effects
 * (e.g. snow cover appearing while it's snowing).
 */
export function tickTerrain(state: GameState, _now: number): { state: GameState; events: GameEvent[] } {
  return { state, events: [] };
}
