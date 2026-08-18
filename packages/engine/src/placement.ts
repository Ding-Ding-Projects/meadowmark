/**
 * placement.ts — building placement: a ghost mesh that follows the cursor,
 * valid/invalid tint from a collision check, grid snap, `R` to rotate, and a
 * squash-stretch "pop" drop animation (disabled under reduced motion).
 */

import * as THREE from 'three';
import { requireAsset } from './mesh-dsl.js';
import { footprintTiles, TILE_SIZE, type Footprint, type OccupancyGrid } from './grid.js';
import type { TileCoord } from './state-view.js';

const VALID_TINT = new THREE.Color(0x8fe08a);
const INVALID_TINT = new THREE.Color(0xe08a8a);

export interface PlacementController {
  object3D: THREE.Object3D;
  /** Start (or switch) ghost preview for a given asset. */
  begin: (assetName: string, footprintWidth: number, footprintDepth: number) => void;
  /** Move the ghost to a tile, updating validity against the occupancy grid. */
  moveTo: (tile: TileCoord) => boolean;
  rotate: () => void;
  /** Trigger the drop animation and hide the ghost; returns the footprint
   * that was placed so the caller can commit it to game state. */
  drop: () => Footprint | null;
  cancel: () => void;
  setReducedMotion: (reduced: boolean) => void;
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}

export function createPlacementController(
  parent: THREE.Object3D,
  occupancy: OccupancyGrid,
): PlacementController {
  const ghostGroup = new THREE.Group();
  ghostGroup.name = 'placement-ghost';
  ghostGroup.visible = false;
  parent.add(ghostGroup);

  let ghostMesh: THREE.Mesh | null = null;
  let currentAssetName: string | null = null;
  let footprintW = 1;
  let footprintD = 1;
  let rotation: 0 | 1 | 2 | 3 = 0;
  let currentTile: TileCoord = { x: 0, y: 0 };
  let valid = false;
  let reducedMotion = false;

  // Drop "pop" animation state.
  let animating = false;
  let animT = 0;
  const ANIM_DURATION = 0.28;
  let animTarget: THREE.Object3D | null = null;

  function rebuildGhost(): void {
    if (ghostMesh) {
      ghostGroup.remove(ghostMesh);
      (ghostMesh.material as THREE.Material).dispose();
      ghostMesh = null;
    }
    if (!currentAssetName) return;
    const asset = requireAsset(currentAssetName);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
    });
    ghostMesh = new THREE.Mesh(asset.geometry, material);
    ghostMesh.castShadow = false;
    ghostGroup.add(ghostMesh);
    applyTint();
  }

  function applyTint(): void {
    if (!ghostMesh) return;
    const material = ghostMesh.material as THREE.MeshStandardMaterial;
    material.color.copy(valid ? VALID_TINT : INVALID_TINT);
  }

  function currentFootprint(): Footprint {
    return { origin: currentTile, width: footprintW, depth: footprintD, rotation };
  }

  function begin(assetName: string, w: number, d: number): void {
    currentAssetName = assetName;
    footprintW = w;
    footprintD = d;
    rotation = 0;
    ghostGroup.visible = true;
    rebuildGhost();
  }

  function moveTo(tile: TileCoord): boolean {
    currentTile = tile;
    ghostGroup.position.set(tile.x * TILE_SIZE, 0, tile.y * TILE_SIZE);
    ghostGroup.rotation.y = (Math.PI / 2) * rotation;
    valid = occupancy.isFootprintFree(currentFootprint());
    applyTint();
    return valid;
  }

  function rotate(): void {
    rotation = ((rotation + 1) % 4) as 0 | 1 | 2 | 3;
    ghostGroup.rotation.y = (Math.PI / 2) * rotation;
    valid = occupancy.isFootprintFree(currentFootprint());
    applyTint();
  }

  function drop(): Footprint | null {
    if (!valid || !currentAssetName) return null;
    const fp = currentFootprint();
    occupancy.markOccupied(footprintTiles(fp));

    if (ghostMesh && !reducedMotion) {
      animTarget = ghostGroup;
      animT = 0;
      animating = true;
    } else {
      ghostGroup.visible = false;
    }
    currentAssetName = null;
    return fp;
  }

  function cancel(): void {
    currentAssetName = null;
    ghostGroup.visible = false;
    animating = false;
  }

  function update(dt: number): void {
    if (!animating || !animTarget) return;
    animT += dt;
    const t = Math.min(1, animT / ANIM_DURATION);
    // Squash on impact, then overshoot back to 1 — a simple spring-like pop.
    const squash = t < 0.5 ? 1 - 0.35 * Math.sin(t * Math.PI) : 1 + 0.12 * Math.sin((t - 0.5) * Math.PI * 2);
    animTarget.scale.set(squash, 1 / Math.sqrt(squash), squash);
    if (t >= 1) {
      animating = false;
      animTarget.visible = false;
      animTarget.scale.set(1, 1, 1);
      animTarget = null;
    }
  }

  function setReducedMotion(reduced: boolean): void {
    reducedMotion = reduced;
  }

  function dispose(): void {
    if (ghostMesh) (ghostMesh.material as THREE.Material).dispose();
    ghostGroup.clear();
  }

  return {
    object3D: ghostGroup,
    begin,
    moveTo,
    rotate,
    drop,
    cancel,
    setReducedMotion,
    update,
    dispose,
  };
}
