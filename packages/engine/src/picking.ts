/**
 * picking.ts — pointer picking via raycast against a simplified collider
 * set, never against full mesh geometry. Also exposes a keyboard-driven
 * selection cursor so picking is never pointer-only.
 */

import * as THREE from 'three';
import type { TileCoord } from './state-view.js';
import { TILE_SIZE } from './grid.js';

export interface PickTarget {
  id: string;
  tile: TileCoord;
  /** Footprint half-extent in tiles, used to build a cheap box collider. */
  halfWidth: number;
  halfDepth: number;
  height: number;
}

export interface PickResult {
  id: string;
  tile: TileCoord;
}

/**
 * A pool of cheap invisible box colliders, one per pickable object, kept in
 * sync with game state. Raycasting against these — never against the
 * generated visual geometry — keeps picking cost independent of how
 * detailed a building's mesh is.
 */
export class PickableSet {
  private group: THREE.Group;
  private colliders = new Map<string, THREE.Mesh>();
  private tileById = new Map<string, TileCoord>();
  private sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
  private sharedMaterial = new THREE.MeshBasicMaterial({ visible: false });

  constructor(parent: THREE.Object3D) {
    this.group = new THREE.Group();
    this.group.name = 'pick-colliders';
    parent.add(this.group);
  }

  sync(targets: readonly PickTarget[]): void {
    const seen = new Set<string>();
    for (const t of targets) {
      seen.add(t.id);
      this.tileById.set(t.id, t.tile);
      let mesh = this.colliders.get(t.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.sharedGeometry, this.sharedMaterial);
        this.colliders.set(t.id, mesh);
        this.group.add(mesh);
      }
      mesh.position.set(t.tile.x * TILE_SIZE, t.height / 2, t.tile.y * TILE_SIZE);
      mesh.scale.set(t.halfWidth * 2 * TILE_SIZE, t.height, t.halfDepth * 2 * TILE_SIZE);
      mesh.userData.pickId = t.id;
    }
    for (const [id, mesh] of this.colliders) {
      if (!seen.has(id)) {
        this.group.remove(mesh);
        this.colliders.delete(id);
        this.tileById.delete(id);
      }
    }
  }

  raycast(raycaster: THREE.Raycaster): PickResult | null {
    const hits = raycaster.intersectObjects(this.group.children, false);
    if (hits.length === 0) return null;
    const id = hits[0]!.object.userData.pickId as string;
    const tile = this.tileById.get(id);
    if (!tile) return null;
    return { id, tile };
  }

  dispose(): void {
    this.sharedGeometry.dispose();
    this.sharedMaterial.dispose();
    this.colliders.clear();
    this.tileById.clear();
  }
}

/** Convert a normalized-device-coordinate pointer position + camera into a
 * ground-plane tile coordinate (for placement ghosts, drag-select, etc). */
export function pickGroundTile(
  ndcX: number,
  ndcY: number,
  camera: THREE.Camera,
): TileCoord | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(groundPlane, point);
  if (!hit) return null;
  return { x: Math.round(point.x / TILE_SIZE), y: Math.round(point.z / TILE_SIZE) };
}

/**
 * A keyboard-driven selection cursor: an on-screen highlighted tile that
 * arrow keys move around the grid, with Enter/Space activating whatever
 * pickable occupies it. This is the non-pointer path required alongside
 * mouse picking.
 */
export class KeyboardCursor {
  tile: TileCoord = { x: 0, y: 0 };
  private marker: THREE.Mesh;
  private listeners = new Set<(tile: TileCoord) => void>();
  private activateListeners = new Set<(tile: TileCoord) => void>();

  constructor(parent: THREE.Object3D) {
    const geo = new THREE.RingGeometry(0.35, 0.46, 16);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.y = 0.02;
    parent.add(this.marker);
    this.updateMarker();
  }

  onMove(cb: (tile: TileCoord) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onActivate(cb: (tile: TileCoord) => void): () => void {
    this.activateListeners.add(cb);
    return () => this.activateListeners.delete(cb);
  }

  private updateMarker(): void {
    this.marker.position.set(this.tile.x * TILE_SIZE, 0.02, this.tile.y * TILE_SIZE);
  }

  move(dx: number, dy: number): void {
    this.tile = { x: this.tile.x + dx, y: this.tile.y + dy };
    this.updateMarker();
    for (const cb of this.listeners) cb(this.tile);
  }

  activate(): void {
    for (const cb of this.activateListeners) cb(this.tile);
  }

  setVisible(visible: boolean): void {
    this.marker.visible = visible;
  }

  dispose(): void {
    this.marker.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
  }
}
