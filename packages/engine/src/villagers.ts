/**
 * villagers.ts — ambient, instanced low-poly villagers that wander along
 * the road network so the town looks alive whether or not the player is
 * doing anything.
 *
 * This is purely a visual flourish: the renderer owns this wandering
 * simulation itself (positions, paths) rather than reading it from game
 * state, because it has no gameplay meaning and must never leak back into
 * authoritative state. It only needs to know which tiles are road.
 */

import { TILE_SIZE } from './grid.js';
import type { TileCoord } from './state-view.js';
import type { InstanceTransform } from './instancing.js';

export const VILLAGER_ASSET_NAMES = ['villager_a', 'villager_b', 'villager_c', 'villager_d'] as const;

interface Wanderer {
  assetIndex: number;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  speed: number;
}

function tileKey(t: TileCoord): string {
  return `${t.x},${t.y}`;
}

export class VillagerWanderSystem {
  private wanderers: Wanderer[] = [];
  private roadTiles: TileCoord[] = [];
  private roadSet = new Set<string>();

  constructor(private count: number = 12) {}

  /** Call whenever the road network changes (placement/removal). */
  setRoadTiles(tiles: readonly TileCoord[]): void {
    this.roadTiles = [...tiles];
    this.roadSet = new Set(tiles.map(tileKey));
    if (this.roadTiles.length === 0) {
      this.wanderers = [];
      return;
    }
    while (this.wanderers.length < this.count) {
      const spawn = this.roadTiles[Math.floor(Math.random() * this.roadTiles.length)]!;
      this.wanderers.push({
        assetIndex: Math.floor(Math.random() * VILLAGER_ASSET_NAMES.length),
        x: spawn.x * TILE_SIZE,
        z: spawn.y * TILE_SIZE,
        targetX: spawn.x * TILE_SIZE,
        targetZ: spawn.y * TILE_SIZE,
        speed: 0.5 + Math.random() * 0.35,
      });
    }
    if (this.wanderers.length > this.count) this.wanderers.length = this.count;
  }

  private pickNewTarget(from: TileCoord): TileCoord {
    const neighbors = [
      { x: from.x + 1, y: from.y },
      { x: from.x - 1, y: from.y },
      { x: from.x, y: from.y + 1 },
      { x: from.x, y: from.y - 1 },
    ].filter((t) => this.roadSet.has(tileKey(t)));
    if (neighbors.length === 0) return from;
    return neighbors[Math.floor(Math.random() * neighbors.length)]!;
  }

  update(deltaSeconds: number): void {
    if (this.roadTiles.length === 0) return;
    for (const w of this.wanderers) {
      const dx = w.targetX - w.x;
      const dz = w.targetZ - w.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.03) {
        const currentTile: TileCoord = {
          x: Math.round(w.x / TILE_SIZE),
          y: Math.round(w.z / TILE_SIZE),
        };
        const next = this.pickNewTarget(currentTile);
        w.targetX = next.x * TILE_SIZE;
        w.targetZ = next.y * TILE_SIZE;
      } else {
        const step = Math.min(dist, w.speed * deltaSeconds);
        w.x += (dx / dist) * step;
        w.z += (dz / dist) * step;
      }
    }
  }

  /** Instance transforms grouped by asset name, ready for InstanceManager. */
  getTransformsByAsset(): Map<string, InstanceTransform[]> {
    const byAsset = new Map<string, InstanceTransform[]>();
    for (const name of VILLAGER_ASSET_NAMES) byAsset.set(name, []);
    for (const w of this.wanderers) {
      const dx = w.targetX - w.x;
      const dz = w.targetZ - w.z;
      const heading = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : 0;
      const list = byAsset.get(VILLAGER_ASSET_NAMES[w.assetIndex]!)!;
      list.push({ position: { x: w.x, y: 0, z: w.z }, rotationY: heading });
    }
    return byAsset;
  }
}
