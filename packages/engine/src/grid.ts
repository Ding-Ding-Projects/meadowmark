/**
 * grid.ts — the world grid: tile<->world coordinate conversion, footprint
 * occupancy, and neighbour queries used for road-tile joining.
 */

import type { RoadShape, TileCoord } from './state-view.js';

export const TILE_SIZE = 1.0;

export function tileToWorld(tile: TileCoord, y = 0): [number, number, number] {
  return [tile.x * TILE_SIZE, y, tile.y * TILE_SIZE];
}

export function worldToTile(x: number, z: number): TileCoord {
  return { x: Math.round(x / TILE_SIZE), y: Math.round(z / TILE_SIZE) };
}

export function tileKey(tile: TileCoord): string {
  return `${tile.x},${tile.y}`;
}

export function tilesEqual(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

/** The four cardinal neighbour offsets, in a fixed order used everywhere
 * road-joining logic needs a stable N/E/S/W ordering. */
export const CARDINAL_OFFSETS: ReadonlyArray<{ dx: number; dy: number; label: 'N' | 'E' | 'S' | 'W' }> = [
  { dx: 0, dy: -1, label: 'N' },
  { dx: 1, dy: 0, label: 'E' },
  { dx: 0, dy: 1, label: 'S' },
  { dx: -1, dy: 0, label: 'W' },
];

export function neighborsOf(tile: TileCoord): TileCoord[] {
  return CARDINAL_OFFSETS.map((o) => ({ x: tile.x + o.dx, y: tile.y + o.dy }));
}

/**
 * A footprint is a rectangular set of tiles, anchored at `origin` (its
 * top-left / minimum corner before rotation), `width` tiles along local X,
 * and `depth` tiles along local Z. `rotation` is 0-3, each step a 90-degree
 * yaw, matching PlacedBuildingView.rotation.
 */
export interface Footprint {
  origin: TileCoord;
  width: number;
  depth: number;
  rotation: 0 | 1 | 2 | 3;
}

/** Every tile a footprint occupies, accounting for its rotation. */
export function footprintTiles(fp: Footprint): TileCoord[] {
  const w = fp.rotation % 2 === 0 ? fp.width : fp.depth;
  const d = fp.rotation % 2 === 0 ? fp.depth : fp.width;
  const tiles: TileCoord[] = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) {
      tiles.push({ x: fp.origin.x + dx, y: fp.origin.y + dy });
    }
  }
  return tiles;
}

/** Simple grid-wide occupancy tracker, used by placement validity checks. */
export class OccupancyGrid {
  private occupied = new Set<string>();

  markOccupied(tiles: Iterable<TileCoord>): void {
    for (const t of tiles) this.occupied.add(tileKey(t));
  }

  clearOccupied(tiles: Iterable<TileCoord>): void {
    for (const t of tiles) this.occupied.delete(tileKey(t));
  }

  isOccupied(tile: TileCoord): boolean {
    return this.occupied.has(tileKey(tile));
  }

  isFootprintFree(fp: Footprint): boolean {
    return footprintTiles(fp).every((t) => !this.isOccupied(t));
  }

  reset(): void {
    this.occupied.clear();
  }
}

/**
 * Determine which of the four cardinal neighbours of a road tile are also
 * roads, returning a bitmask-friendly object. `scene.ts`/`props.ts` use this
 * to choose between road_straight/road_corner/road_junction/road_end and the
 * correct rotation so adjacent tiles visually join.
 */
export function roadConnections(
  tile: TileCoord,
  isRoad: (t: TileCoord) => boolean,
): { N: boolean; E: boolean; S: boolean; W: boolean } {
  return {
    N: isRoad({ x: tile.x, y: tile.y - 1 }),
    E: isRoad({ x: tile.x + 1, y: tile.y }),
    S: isRoad({ x: tile.x, y: tile.y + 1 }),
    W: isRoad({ x: tile.x - 1, y: tile.y }),
  };
}

/**
 * Chooses which road mesh (straight/corner/junction/end) and yaw a road
 * tile should use, purely from which of its four cardinal neighbours are
 * also road tiles. Pure geometry with no game-state dependency, so both the
 * renderer and any future editor/preview tooling can share it.
 */
export function resolveRoadTile(connections: { N: boolean; E: boolean; S: boolean; W: boolean }): {
  shape: RoadShape;
  rotation: 0 | 1 | 2 | 3;
} {
  const { N, E, S, W } = connections;
  const count = [N, E, S, W].filter(Boolean).length;

  if (count >= 3) {
    // 3-way and 4-way junctions share one mesh today (it reads fine either
    // way at this scale); rotation still derives from the missing side so
    // it stays deterministic and stable across reloads.
    if (!N) return { shape: 'junction', rotation: 0 };
    if (!E) return { shape: 'junction', rotation: 1 };
    if (!S) return { shape: 'junction', rotation: 2 };
    if (!W) return { shape: 'junction', rotation: 3 };
    return { shape: 'junction', rotation: 0 };
  }

  if (count === 2) {
    if (N && S) return { shape: 'straight', rotation: 0 };
    if (E && W) return { shape: 'straight', rotation: 1 };
    if (N && E) return { shape: 'corner', rotation: 0 };
    if (E && S) return { shape: 'corner', rotation: 1 };
    if (S && W) return { shape: 'corner', rotation: 2 };
    return { shape: 'corner', rotation: 3 }; // W && N
  }

  if (count === 1) {
    if (N) return { shape: 'end', rotation: 0 };
    if (E) return { shape: 'end', rotation: 1 };
    if (S) return { shape: 'end', rotation: 2 };
    return { shape: 'end', rotation: 3 }; // W
  }

  // An isolated road tile with no connected neighbours at all: still a
  // valid (if lonely) placement, rendered as an end-cap.
  return { shape: 'end', rotation: 0 };
}
