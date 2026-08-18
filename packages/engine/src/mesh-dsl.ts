/**
 * mesh-dsl.ts — Meadowmark's generative geometry language.
 *
 * Every visible object in the game — buildings, crops, props, villagers,
 * animals — is expressed as a small declarative tree of primitives built
 * with this module and nothing else. There are no imported models and no
 * texture files anywhere in the engine; colour comes straight from the
 * palette and is baked into each geometry's vertex-colour attribute.
 *
 * The tree is pure data (a `MeshNode`) until `buildAsset()` walks it and
 * merges every primitive into one flat, non-indexed `BufferGeometry`. Given
 * the same node tree and the same palette, `buildAsset()` always produces
 * byte-identical output, which is what makes a generated asset diffable in
 * code review the same way any other source change is.
 */

import * as THREE from 'three';
import { type PaletteKey, getPaletteColor } from './palette.js';

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

export interface Transform {
  translate?: [number, number, number];
  /** Euler angles in radians, XYZ order. */
  rotate?: [number, number, number];
  scale?: [number, number, number] | number;
}

function transformToMatrix(t: Transform | undefined): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  if (!t) return m;
  const position = t.translate
    ? new THREE.Vector3(t.translate[0], t.translate[1], t.translate[2])
    : new THREE.Vector3();
  const euler = t.rotate
    ? new THREE.Euler(t.rotate[0], t.rotate[1], t.rotate[2], 'XYZ')
    : new THREE.Euler();
  const quaternion = new THREE.Quaternion().setFromEuler(euler);
  const scale =
    t.scale === undefined
      ? new THREE.Vector3(1, 1, 1)
      : typeof t.scale === 'number'
        ? new THREE.Vector3(t.scale, t.scale, t.scale)
        : new THREE.Vector3(t.scale[0], t.scale[1], t.scale[2]);
  m.compose(position, quaternion, scale);
  return m;
}

// ---------------------------------------------------------------------------
// Node definitions
// ---------------------------------------------------------------------------

interface BaseNode {
  transform?: Transform;
}

export interface BoxNode extends BaseNode {
  kind: 'box';
  width: number;
  height: number;
  depth: number;
  color: PaletteKey;
}

export interface PrismNode extends BaseNode {
  /** A low-poly n-sided prism (a cylinder with few radial segments). */
  kind: 'prism';
  radius: number;
  height: number;
  sides: number;
  color: PaletteKey;
}

export interface CylinderNode extends BaseNode {
  kind: 'cylinder';
  radiusTop: number;
  radiusBottom: number;
  height: number;
  radialSegments?: number;
  color: PaletteKey;
}

export interface ConeNode extends BaseNode {
  kind: 'cone';
  radius: number;
  height: number;
  radialSegments?: number;
  color: PaletteKey;
}

export interface SphereNode extends BaseNode {
  kind: 'sphere';
  radius: number;
  widthSegments?: number;
  heightSegments?: number;
  color: PaletteKey;
}

export interface ExtrudeNode extends BaseNode {
  /** An arbitrary 2D polygon (XY) extruded along Z, then rotated into place. */
  kind: 'extrude';
  points: Array<[number, number]>;
  depth: number;
  bevel?: boolean;
  color: PaletteKey;
}

export interface RoofNode extends BaseNode {
  /** A pitched (gable) roof: a ridge running along Z, sloping down in X. */
  kind: 'roof';
  width: number;
  depth: number;
  height: number;
  overhang?: number;
  color: PaletteKey;
}

export interface LatheNode extends BaseNode {
  /** A profile (X = radius, Y = height) revolved around the Y axis. */
  kind: 'lathe';
  points: Array<[number, number]>;
  segments?: number;
  color: PaletteKey;
}

export interface GroupNode extends BaseNode {
  kind: 'group';
  children: MeshNode[];
}

export type MeshNode =
  | BoxNode
  | PrismNode
  | CylinderNode
  | ConeNode
  | SphereNode
  | ExtrudeNode
  | RoofNode
  | LatheNode
  | GroupNode;

// ---------------------------------------------------------------------------
// Builder helpers — the ergonomic surface authors of assets/*.ts use
// ---------------------------------------------------------------------------

export const box = (n: Omit<BoxNode, 'kind'>): BoxNode => ({ kind: 'box', ...n });
export const prism = (n: Omit<PrismNode, 'kind'>): PrismNode => ({ kind: 'prism', ...n });
export const cylinder = (n: Omit<CylinderNode, 'kind'>): CylinderNode => ({
  kind: 'cylinder',
  ...n,
});
export const cone = (n: Omit<ConeNode, 'kind'>): ConeNode => ({ kind: 'cone', ...n });
export const sphere = (n: Omit<SphereNode, 'kind'>): SphereNode => ({ kind: 'sphere', ...n });
export const extrude = (n: Omit<ExtrudeNode, 'kind'>): ExtrudeNode => ({
  kind: 'extrude',
  ...n,
});
export const roof = (n: Omit<RoofNode, 'kind'>): RoofNode => ({ kind: 'roof', ...n });
export const lathe = (n: Omit<LatheNode, 'kind'>): LatheNode => ({ kind: 'lathe', ...n });
export const group = (children: MeshNode[], transform?: Transform): GroupNode => ({
  kind: 'group',
  children,
  transform,
});

// ---------------------------------------------------------------------------
// Geometry generation per primitive
// ---------------------------------------------------------------------------

function geometryForNode(node: MeshNode): THREE.BufferGeometry | null {
  switch (node.kind) {
    case 'box':
      return new THREE.BoxGeometry(node.width, node.height, node.depth);
    case 'prism':
      return new THREE.CylinderGeometry(node.radius, node.radius, node.height, Math.max(3, node.sides));
    case 'cylinder':
      return new THREE.CylinderGeometry(
        node.radiusTop,
        node.radiusBottom,
        node.height,
        node.radialSegments ?? 12,
      );
    case 'cone':
      return new THREE.ConeGeometry(node.radius, node.height, node.radialSegments ?? 8);
    case 'sphere':
      return new THREE.SphereGeometry(
        node.radius,
        node.widthSegments ?? 8,
        node.heightSegments ?? 6,
      );
    case 'extrude': {
      const shape = new THREE.Shape();
      node.points.forEach(([x, y], i) => {
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: node.depth,
        bevelEnabled: node.bevel ?? false,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 1,
        curveSegments: 4,
      });
      // Extrusion runs along +Z centred at the shape's own origin; recentre
      // depth around the local origin so `depth` behaves like width/height do
      // on every other primitive.
      geo.translate(0, 0, -node.depth / 2);
      return geo;
    }
    case 'roof':
      return buildRoofGeometry(node);
    case 'lathe': {
      const pts = node.points.map(([x, y]) => new THREE.Vector2(x, y));
      return new THREE.LatheGeometry(pts, node.segments ?? 10);
    }
    case 'group':
      return null;
    default: {
      const exhaustive: never = node;
      throw new Error(`mesh-dsl: unknown node kind ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * A pitched (gable) roof: a ridge running the length of Z, sloping down to
 * eaves on either side of X. Built by hand as a small non-indexed triangle
 * list (six triangles: two roof slopes, two gable ends) so every face gets
 * its own flat-shaded normal — three's built-in primitives have no "tent"
 * shape, and this is cheap enough not to need one.
 */
function buildRoofGeometry(node: RoofNode): THREE.BufferGeometry {
  const ov = node.overhang ?? 0.15;
  const hw = node.width / 2 + ov;
  const hd = node.depth / 2 + ov;
  const h = node.height;

  const v0 = new THREE.Vector3(-hw, 0, -hd); // front-left-bottom
  const v1 = new THREE.Vector3(hw, 0, -hd); // front-right-bottom
  const v2 = new THREE.Vector3(hw, 0, hd); // back-right-bottom
  const v3 = new THREE.Vector3(-hw, 0, hd); // back-left-bottom
  const r0 = new THREE.Vector3(0, h, -hd); // front ridge
  const r1 = new THREE.Vector3(0, h, hd); // back ridge

  const triangles: THREE.Vector3[] = [
    // +X slope
    v1, v2, r1,
    v1, r1, r0,
    // -X slope
    v3, v0, r0,
    v3, r0, r1,
    // front gable
    v0, v1, r0,
    // back gable
    v2, v3, r1,
  ];

  const positions = new Float32Array(triangles.length * 3);
  triangles.forEach((v, i) => {
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Walk + merge
// ---------------------------------------------------------------------------

interface Colored {
  geometry: THREE.BufferGeometry;
}

function collect(
  node: MeshNode,
  parentMatrix: THREE.Matrix4,
  out: Colored[],
): void {
  const localMatrix = transformToMatrix(node.transform);
  const worldMatrix = parentMatrix.clone().multiply(localMatrix);

  if (node.kind === 'group') {
    for (const child of node.children) collect(child, worldMatrix, out);
    return;
  }

  const raw = geometryForNode(node);
  if (!raw) return;

  const nonIndexed = raw.index ? raw.toNonIndexed() : raw;
  nonIndexed.applyMatrix4(worldMatrix);
  // Always re-derive normals post-transform, whether or not the primitive
  // already had them, so a non-uniform scale never bakes in a skewed
  // normal. Cheap relative to the cost of getting lighting wrong.
  nonIndexed.computeVertexNormals();

  const vertexCount = nonIndexed.getAttribute('position').count;
  const hex = getPaletteColor(node.color);
  const c = new THREE.Color(hex);
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  out.push({ geometry: nonIndexed });
  raw.dispose();
}

/**
 * Merge a flat list of same-shaped (position/normal/color) non-indexed
 * geometries into a single BufferGeometry. Written by hand rather than
 * pulled from `three/examples/jsm/utils/BufferGeometryUtils.js` so the
 * engine has one fewer import path to keep working across three.js
 * releases.
 */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  for (const g of parts) totalVerts += g.getAttribute('position').count;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);

  let offset = 0;
  for (const g of parts) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    const col = g.getAttribute('color') as THREE.BufferAttribute;
    const count = pos.count;
    positions.set(pos.array as Float32Array, offset * 3);
    normals.set(nrm.array as Float32Array, offset * 3);
    colors.set(col.array as Float32Array, offset * 3);
    offset += count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------
// Public build API + registry
// ---------------------------------------------------------------------------

export interface AssetManifestEntry {
  name: string;
  vertexCount: number;
  triangleCount: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
}

export interface BuiltAsset {
  name: string;
  geometry: THREE.BufferGeometry;
  manifest: AssetManifestEntry;
}

function manifestFor(name: string, geometry: THREE.BufferGeometry): AssetManifestEntry {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox ?? new THREE.Box3();
  const vertexCount = geometry.getAttribute('position').count;
  return {
    name,
    vertexCount,
    triangleCount: Math.floor(vertexCount / 3),
    boundingBox: {
      min: [bb.min.x, bb.min.y, bb.min.z],
      max: [bb.max.x, bb.max.y, bb.max.z],
    },
  };
}

/** Build a merged, vertex-coloured BufferGeometry from a MeshNode tree. */
export function build(node: MeshNode): THREE.BufferGeometry {
  const parts: Colored[] = [];
  collect(node, new THREE.Matrix4(), parts);
  if (parts.length === 0) {
    // An empty group is valid (e.g. a placeholder asset) — return an empty
    // geometry rather than throwing, so callers can still register it.
    return new THREE.BufferGeometry();
  }
  const geometries = parts.map((p) => p.geometry);
  const merged = mergeGeometries(geometries);
  for (const g of geometries) g.dispose();
  return merged;
}

const registry = new Map<string, BuiltAsset>();

/**
 * Build a mesh tree and register it under `name`. Every generated asset in
 * the game — building, crop, prop, or character — is defined by calling this
 * once at module load time. `tools/gen-meshes` imports every assets/*.ts
 * module purely for this side effect, then reads the registry to emit the
 * manifest.
 */
export function defineAsset(name: string, node: MeshNode): BuiltAsset {
  if (registry.has(name)) {
    throw new Error(`mesh-dsl: asset "${name}" is already registered — names must be unique`);
  }
  const geometry = build(node);
  const asset: BuiltAsset = { name, geometry, manifest: manifestFor(name, geometry) };
  registry.set(name, asset);
  return asset;
}

export function getAsset(name: string): BuiltAsset | undefined {
  return registry.get(name);
}

/**
 * Look up a registered asset, throwing loudly when it does not exist. Every
 * call site in the engine that turns game state into a mesh must use this
 * rather than `getAsset`, so a scene referencing a mesh name the manifest
 * lacks fails fast instead of silently rendering nothing.
 */
export function requireAsset(name: string): BuiltAsset {
  const asset = registry.get(name);
  if (!asset) {
    throw new Error(
      `mesh-dsl: no asset named "${name}" is registered. Known assets: ${[...registry.keys()].sort().join(', ')}`,
    );
  }
  return asset;
}

export function listAssetNames(): string[] {
  return [...registry.keys()].sort();
}

export function getManifest(): AssetManifestEntry[] {
  return [...registry.values()]
    .map((a) => a.manifest)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Dispose every registered geometry and clear the registry. Test/dev use. */
export function clearRegistry(): void {
  for (const asset of registry.values()) asset.geometry.dispose();
  registry.clear();
}
