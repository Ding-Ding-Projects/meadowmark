/**
 * instancing.ts — InstancedMesh pools for crops, trees, props and villagers,
 * plus a cheap billboard LOD swap at far zoom. This is what keeps a large
 * town rendering at 60fps: individual meshes are never added to the scene
 * one-by-one for repeated content.
 */

import * as THREE from 'three';
import { requireAsset } from './mesh-dsl.js';

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

export interface InstanceTransform {
  position: THREE.Vector3Like;
  /** Yaw in radians. */
  rotationY?: number;
  scale?: number;
}

/**
 * A pool of instances of a single generated asset, rendered with one draw
 * call via InstancedMesh. Capacity grows in chunks rather than per-instance
 * to avoid rebuilding the GPU buffer on every placement.
 */
export class InstancePool {
  readonly assetName: string;
  private capacity: number;
  private count = 0;
  private mesh: THREE.InstancedMesh;
  private billboard: THREE.InstancedMesh;
  private material: THREE.MeshStandardMaterial;
  private billboardMaterial: THREE.MeshBasicMaterial;
  private billboardGeometry: THREE.PlaneGeometry;
  private geometry: THREE.BufferGeometry;
  private usingBillboard = false;
  private group: THREE.Group;

  constructor(assetName: string, initialCapacity = 64) {
    this.assetName = assetName;
    const asset = requireAsset(assetName);
    this.geometry = asset.geometry;
    this.capacity = Math.max(1, initialCapacity);

    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = true;

    // A billboard is a flat, camera-independent quad. It swaps in for far
    // zoom so a field of a thousand trees does not push a thousand full
    // meshes through the vertex shader when the player cannot tell.
    const bb = this.geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(
      this.geometry.getAttribute('position') as THREE.BufferAttribute,
    );
    const height = bb.max.y - bb.min.y || 0.3;
    const width = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) || 0.3;
    this.billboardGeometry = new THREE.PlaneGeometry(width, height);
    this.billboardGeometry.translate(0, height / 2, 0);
    this.billboardMaterial = new THREE.MeshBasicMaterial({
      color: averageVertexColor(this.geometry),
      transparent: false,
    });
    this.billboard = new THREE.InstancedMesh(this.billboardGeometry, this.billboardMaterial, this.capacity);
    this.billboard.count = 0;
    this.billboard.visible = false;

    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.add(this.billboard);
  }

  get object3D(): THREE.Object3D {
    return this.group;
  }

  private growTo(minCapacity: number): void {
    if (minCapacity <= this.capacity) return;
    const newCapacity = Math.max(minCapacity, Math.ceil(this.capacity * 1.6));
    const newMesh = new THREE.InstancedMesh(this.geometry, this.material, newCapacity);
    newMesh.castShadow = true;
    newMesh.receiveShadow = true;
    newMesh.instanceMatrix.array.set(this.mesh.instanceMatrix.array.subarray(0, this.count * 16));
    newMesh.count = this.count;
    this.group.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = newMesh;

    const newBillboard = new THREE.InstancedMesh(this.billboardGeometry, this.billboardMaterial, newCapacity);
    newBillboard.instanceMatrix.array.set(this.billboard.instanceMatrix.array.subarray(0, this.count * 16));
    newBillboard.count = this.count;
    newBillboard.visible = this.usingBillboard;
    this.group.remove(this.billboard);
    this.billboard.dispose();
    this.billboard = newBillboard;

    this.mesh.visible = !this.usingBillboard;
    this.group.add(this.mesh);
    this.group.add(this.billboard);
    this.capacity = newCapacity;
  }

  /** Replace the full set of instances in one pass. Cheapest way to sync a
   * pool against a freshly received game-state snapshot. */
  setInstances(transforms: readonly InstanceTransform[]): void {
    this.growTo(transforms.length);
    this.count = transforms.length;
    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i]!;
      _position.set(t.position.x, t.position.y, t.position.z);
      _euler.set(0, t.rotationY ?? 0, 0);
      _quaternion.setFromEuler(_euler);
      const s = t.scale ?? 1;
      _scale.set(s, s, s);
      _matrix.compose(_position, _quaternion, _scale);
      this.mesh.setMatrixAt(i, _matrix);
      this.billboard.setMatrixAt(i, _matrix);
    }
    this.mesh.count = this.count;
    this.billboard.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.billboard.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  setBillboardMode(useBillboard: boolean): void {
    if (useBillboard === this.usingBillboard) return;
    this.usingBillboard = useBillboard;
    this.mesh.visible = !useBillboard;
    this.billboard.visible = useBillboard;
  }

  dispose(): void {
    this.mesh.dispose();
    this.billboard.dispose();
    this.billboardGeometry.dispose();
    this.material.dispose();
    this.billboardMaterial.dispose();
  }
}

function averageVertexColor(geometry: THREE.BufferGeometry): THREE.Color {
  const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!colorAttr) return new THREE.Color(0xffffff);
  let r = 0;
  let g = 0;
  let b = 0;
  const n = colorAttr.count;
  for (let i = 0; i < n; i++) {
    r += colorAttr.getX(i);
    g += colorAttr.getY(i);
    b += colorAttr.getZ(i);
  }
  return new THREE.Color(r / n, g / n, b / n);
}

/**
 * Manages one InstancePool per distinct asset name, and applies a single
 * shared billboard-LOD distance threshold across all of them each frame.
 */
export class InstanceManager {
  private pools = new Map<string, InstancePool>();
  private root: THREE.Group;
  /**
   * Distance at which pools swap to their flat billboard.
   *
   * This MUST sit above the camera's default orbit distance. The camera clamps
   * to 6..60 and opens at ~31, so the previous value of 24 put the entire world
   * into billboard mode on the very first frame and kept it there for every
   * default view -- buildings, crops and field beds all rendered as flat quads
   * facing the camera, which reads as bare ground with the odd grey sheet in it.
   * 50 leaves billboards for the genuinely far end of the zoom range.
   */
  billboardDistance = 50;

  constructor(parent: THREE.Object3D) {
    this.root = new THREE.Group();
    this.root.name = 'instance-pools';
    parent.add(this.root);
  }

  private poolFor(assetName: string): InstancePool {
    let pool = this.pools.get(assetName);
    if (!pool) {
      pool = new InstancePool(assetName);
      this.pools.set(assetName, pool);
      this.root.add(pool.object3D);
    }
    return pool;
  }

  /** Replace an asset's whole instance set for this frame's game state. */
  setInstances(assetName: string, transforms: readonly InstanceTransform[]): void {
    this.poolFor(assetName).setInstances(transforms);
  }

  updateLOD(cameraDistance: number): void {
    const useBillboard = cameraDistance > this.billboardDistance;
    for (const pool of this.pools.values()) pool.setBillboardMode(useBillboard);
  }

  dispose(): void {
    for (const pool of this.pools.values()) pool.dispose();
    this.pools.clear();
    this.root.clear();
  }
}
