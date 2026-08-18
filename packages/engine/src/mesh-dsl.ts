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

/**
 * Per-instance deterministic vertex jitter: nudges every vertex of a node's
 * geometry by up to `amount` along a pseudo-random direction derived from
 * `seed` and the vertex's own index. Applied in the node's local space,
 * before its transform, so the same seed always produces the same bumps
 * regardless of where the instance is placed in the world. Use it to break
 * up an otherwise-identical crop, crate, or fence-post silhouette across a
 * large instanced field without touching the underlying primitive.
 */
export interface VertexJitter {
  seed: number;
  /** Maximum offset per axis, in local units. */
  amount: number;
}

/**
 * Bands a node's geometry into alternating vertex colours along one local
 * axis instead of a single flat `color` — a striped awning canopy, a
 * market-stall skirt, a barber-pole post — with no texture involved. Bands
 * are computed from the geometry's own local bounding box on `axis`, so the
 * stripes always exactly cover the shape regardless of its size.
 */
export interface VertexStripes {
  axis: 'x' | 'y' | 'z';
  /** Cycled in order; must have at least one entry. */
  colors: PaletteKey[];
  /** Number of bands to divide the axis into. Defaults to `colors.length`. */
  bandCount?: number;
}

interface BaseNode {
  transform?: Transform;
  /** Deterministic per-vertex jitter; see {@link VertexJitter}. */
  jitter?: VertexJitter;
  /** Banded/striped vertex colouring; see {@link VertexStripes}. */
  stripes?: VertexStripes;
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

export interface TorusNode extends BaseNode {
  /** A torus/ring — a barrel hoop, a wheel rim, a life-preserver, a halo. */
  kind: 'torus';
  radius: number;
  tube: number;
  radialSegments?: number;
  tubularSegments?: number;
  /** Sweep angle in radians; defaults to a full ring (2*PI). */
  arc?: number;
  color: PaletteKey;
}

export interface TubeNode extends BaseNode {
  /**
   * A circular-section tube that follows a straight-segment polyline —
   * fence rails, pipes, ropes, vines, a market-stall awning frame. Corners
   * stay sharp (no spline smoothing) so a fence rail reads as built, not
   * as a wobbly cable.
   */
  kind: 'tube';
  points: Array<[number, number, number]>;
  radius: number;
  radialSegments?: number;
  /** Loop the last point back to the first. */
  closed?: boolean;
  color: PaletteKey;
}

export interface BevelBoxNode extends BaseNode {
  /**
   * A box with every edge softened by a small chamfer — the corners in the
   * XY cross-section are cut, and the extrusion caps are bevelled too, so
   * all twelve edges pick up a highlight instead of a hard line. A plain
   * `box()` reads flatter under the low-poly lighting than this does.
   */
  kind: 'bevelBox';
  width: number;
  height: number;
  depth: number;
  /** Chamfer size in local units; clamped to stay inside the cross-section. */
  bevel?: number;
  color: PaletteKey;
}

export interface TaperedCylinderNode extends BaseNode {
  /**
   * A cylinder whose radius follows a curve from bottom to top rather than
   * a straight taper — `curve` above 1 pinches the middle in (a wine
   * bottle, a fence post), below 1 bulges it out (a barrel, a keg), and 1
   * is a plain linear taper. Built from more vertical rings than a plain
   * `cylinder`/`cone`, so the curve actually reads.
   */
  kind: 'taperedCylinder';
  radiusBottom: number;
  radiusTop: number;
  height: number;
  /** Exponent applied to the bottom-to-top blend; 1 = linear taper. */
  curve?: number;
  /** Number of vertical rings; more rings = smoother curve. */
  heightSegments?: number;
  radialSegments?: number;
  color: PaletteKey;
}

export interface ArchNode extends BaseNode {
  /**
   * A rectangular opening topped with a rounded arch — a doorway, a
   * window, a market-stall entrance, a covered-bridge mouth — extruded
   * along Z like `extrude`, but without hand-plotting the curve points.
   */
  kind: 'arch';
  width: number;
  /** Total height from the base to the top of the arch. */
  height: number;
  /** Height of the curved part alone; defaults to width / 2 (a semicircle). */
  archHeight?: number;
  depth: number;
  /** Number of straight segments approximating the curve. */
  segments?: number;
  color: PaletteKey;
}

export interface FanNode extends BaseNode {
  /**
   * A radial arrangement of flat wedge blades around a shared centre — a
   * windmill's sail assembly, a scalloped market awning, a hand fan. Each
   * blade is a thin extruded pie-slice; the gaps between them are real
   * gaps, not painted-on lines.
   */
  kind: 'fan';
  /** Number of blades arranged evenly around the full circle. */
  blades: number;
  innerRadius: number;
  outerRadius: number;
  /** Extrusion thickness of each blade. */
  thickness: number;
  /** Fraction (0-1) of each blade's sector that is filled blade vs. gap. */
  bladeArcFraction?: number;
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
  | TorusNode
  | TubeNode
  | BevelBoxNode
  | TaperedCylinderNode
  | ArchNode
  | FanNode
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
export const torus = (n: Omit<TorusNode, 'kind'>): TorusNode => ({ kind: 'torus', ...n });
export const tube = (n: Omit<TubeNode, 'kind'>): TubeNode => ({ kind: 'tube', ...n });
export const bevelBox = (n: Omit<BevelBoxNode, 'kind'>): BevelBoxNode => ({
  kind: 'bevelBox',
  ...n,
});
export const taperedCylinder = (
  n: Omit<TaperedCylinderNode, 'kind'>,
): TaperedCylinderNode => ({ kind: 'taperedCylinder', ...n });
export const arch = (n: Omit<ArchNode, 'kind'>): ArchNode => ({ kind: 'arch', ...n });
export const fan = (n: Omit<FanNode, 'kind'>): FanNode => ({ kind: 'fan', ...n });
export const group = (children: MeshNode[], transform?: Transform): GroupNode => ({
  kind: 'group',
  children,
  transform,
});

/**
 * Stepped/staircase helper: a `count`-step staircase built from plain boxes,
 * rising along Y and advancing along Z, each step `stepWidth` wide. This is
 * a composition over `box`/`group`, not a new primitive kind, so it costs
 * nothing beyond what boxes already cost and stays instanceable exactly the
 * same way. Steps start flush at the origin's near-bottom corner.
 */
export function stairs(n: {
  count: number;
  stepWidth: number;
  stepHeight: number;
  stepDepth: number;
  color: PaletteKey;
  transform?: Transform;
}): GroupNode {
  const steps: MeshNode[] = [];
  const total = Math.max(1, Math.floor(n.count));
  for (let i = 0; i < total; i++) {
    // Step i is a solid riser from the ground up to its own tread height,
    // so the staircase reads as solid blocks rather than floating slabs.
    const riseHeight = n.stepHeight * (i + 1);
    steps.push(
      box({
        width: n.stepWidth,
        height: riseHeight,
        depth: n.stepDepth,
        color: n.color,
        transform: {
          translate: [0, riseHeight / 2, n.stepDepth * i],
        },
      }),
    );
  }
  return group(steps, n.transform);
}

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
    case 'torus':
      return new THREE.TorusGeometry(
        node.radius,
        node.tube,
        node.radialSegments ?? 8,
        node.tubularSegments ?? 16,
        node.arc ?? Math.PI * 2,
      );
    case 'tube':
      return buildTubeGeometry(node);
    case 'bevelBox':
      return buildBevelBoxGeometry(node);
    case 'taperedCylinder':
      return buildTaperedCylinderGeometry(node);
    case 'arch':
      return buildArchGeometry(node);
    case 'fan':
      return buildFanGeometry(node);
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

/**
 * Concatenate the position attributes of several non-indexed (or
 * to-non-indexed) geometries into one position-only BufferGeometry. Colour
 * and normals are added later by collect(), so builders that assemble a
 * primitive out of several THREE geometries (a fan of blades, a tube of
 * chained segments) only need to worry about triangle soup here.
 */
function mergePositionsOnly(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  for (const g of parts) totalVerts += g.getAttribute('position').count;

  const positions = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of parts) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    positions.set(pos.array as Float32Array, offset * 3);
    offset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return merged;
}

/**
 * A straight-segment polyline curve for THREE.TubeGeometry. Chains a
 * LineCurve3 per pair of consecutive points so every corner in the input
 * stays a sharp corner, with no Catmull-Rom smoothing rounding off a fence
 * post or turning a pipe joint into a curve nobody drew.
 */
function polylineCurve(points: THREE.Vector3[], closed: boolean): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (from && to) path.add(new THREE.LineCurve3(from, to));
  }
  if (closed && points.length > 2) {
    const last = points[points.length - 1];
    const first = points[0];
    if (last && first) path.add(new THREE.LineCurve3(last, first));
  }
  return path;
}

function buildTubeGeometry(node: TubeNode): THREE.BufferGeometry {
  const points = node.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  if (points.length < 2) {
    throw new Error('mesh-dsl: tube() needs at least two points');
  }
  const curve = polylineCurve(points, node.closed ?? false);
  // One tubular segment per straight span keeps corners sharp and the
  // vertex count proportional to how bendy the path actually is.
  const spans = node.closed ? points.length : points.length - 1;
  return new THREE.TubeGeometry(
    curve,
    Math.max(1, spans),
    node.radius,
    Math.max(3, node.radialSegments ?? 6),
    false,
  );
}

/**
 * A rectangle with its four corners chamfered by bevel, used as the
 * cross-section for bevelBox. Chamfering the corners here plus enabling
 * the extrude bevel on the caps softens all twelve edges of the resulting
 * box, not just the four running along the extrusion axis.
 */
function chamferedRectShape(width: number, height: number, bevel: number): THREE.Shape {
  const hw = width / 2;
  const hh = height / 2;
  // Never let the chamfer eat more than the shape actually has to give.
  const b = Math.max(0, Math.min(bevel, hw * 0.9, hh * 0.9));
  const shape = new THREE.Shape();
  shape.moveTo(-hw + b, -hh);
  shape.lineTo(hw - b, -hh);
  shape.lineTo(hw, -hh + b);
  shape.lineTo(hw, hh - b);
  shape.lineTo(hw - b, hh);
  shape.lineTo(-hw + b, hh);
  shape.lineTo(-hw, hh - b);
  shape.lineTo(-hw, -hh + b);
  shape.closePath();
  return shape;
}

function buildBevelBoxGeometry(node: BevelBoxNode): THREE.BufferGeometry {
  const bevel = node.bevel ?? Math.min(node.width, node.height) * 0.12;
  const shape = chamferedRectShape(node.width, node.height, bevel);
  const bevelSize = Math.max(0, Math.min(bevel, node.depth * 0.4));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: node.depth,
    bevelEnabled: bevelSize > 0,
    bevelThickness: bevelSize,
    bevelSize,
    bevelSegments: 1,
    curveSegments: 1,
  });
  // Match extrude()'s convention: depth is centred on the local origin.
  geo.translate(0, 0, -node.depth / 2);
  return geo;
}

function buildTaperedCylinderGeometry(node: TaperedCylinderNode): THREE.BufferGeometry {
  const rings = Math.max(2, node.heightSegments ?? 6);
  const exponent = node.curve ?? 1;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    // Blend bottom -> top radius through exponent; 1 is a plain linear
    // taper, >1 pinches the middle in, <1 bulges it out (a barrel).
    const eased = exponent === 1 ? t : Math.pow(t, exponent);
    const radius = node.radiusBottom + (node.radiusTop - node.radiusBottom) * eased;
    points.push(new THREE.Vector2(Math.max(0.0001, radius), t * node.height));
  }
  return new THREE.LatheGeometry(points, Math.max(3, node.radialSegments ?? 8));
}

function buildArchGeometry(node: ArchNode): THREE.BufferGeometry {
  const hw = node.width / 2;
  const archHeight = node.archHeight ?? node.width / 2;
  const wallHeight = Math.max(0, node.height - archHeight);
  const segments = Math.max(2, node.segments ?? 8);

  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(-hw, wallHeight);
  // Arc from the left spring point, over the top, to the right spring
  // point. archHeight scales the vertical radius so a shallow arch stays
  // shallow instead of always being a true semicircle.
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI - (Math.PI * i) / segments;
    const x = Math.cos(angle) * hw;
    const y = wallHeight + Math.sin(angle) * archHeight;
    shape.lineTo(x, y);
  }
  shape.lineTo(hw, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: node.depth,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.translate(0, 0, -node.depth / 2);
  return geo;
}

function buildFanGeometry(node: FanNode): THREE.BufferGeometry {
  const blades = Math.max(1, Math.floor(node.blades));
  const arcFraction = Math.min(1, Math.max(0.05, node.bladeArcFraction ?? 0.4));
  const sectorAngle = (Math.PI * 2) / blades;
  const bladeAngle = sectorAngle * arcFraction;
  const parts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < blades; i++) {
    const start = i * sectorAngle;
    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(start) * node.innerRadius, Math.sin(start) * node.innerRadius);
    shape.lineTo(Math.cos(start) * node.outerRadius, Math.sin(start) * node.outerRadius);
    const end = start + bladeAngle;
    shape.lineTo(Math.cos(end) * node.outerRadius, Math.sin(end) * node.outerRadius);
    shape.lineTo(Math.cos(end) * node.innerRadius, Math.sin(end) * node.innerRadius);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: node.thickness,
      bevelEnabled: false,
      curveSegments: 2,
    });
    geo.translate(0, 0, -node.thickness / 2);
    parts.push(geo.index ? geo.toNonIndexed() : geo);
  }

  const merged = mergePositionsOnly(parts);
  for (const p of parts) p.dispose();
  return merged;
}

// ---------------------------------------------------------------------------
// Deterministic per-vertex variation: jitter + banded/striped colouring
// ---------------------------------------------------------------------------

/**
 * A cheap deterministic pseudo-random value in [-1, 1] derived from two
 * integers. Not cryptographic; it only has to scatter enough that a field
 * of a thousand instanced crates or fence posts does not read as one
 * stamped-out shape repeated everywhere.
 */
function seededSigned(seed: number, index: number): number {
  const x = Math.sin(seed * 12.9898 + index * 78.233 + 37.719) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * Mutates a geometry's position attribute in place, nudging every vertex by
 * up to `amount` along each axis using a hash of (seed, vertex index). Runs
 * in the node's local space, before its world transform, so the jitter is
 * comparable to the primitive's own local dimensions no matter how the
 * instance is later placed or scaled. Deterministic: the same seed and
 * geometry always produce the same bumps.
 */
function jitterPositionsInPlace(geometry: THREE.BufferGeometry, jitter: VertexJitter): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const array = position.array as Float32Array;
  for (let i = 0; i < position.count; i++) {
    const base = i * 3;
    const dx = seededSigned(jitter.seed, base) * jitter.amount;
    const dy = seededSigned(jitter.seed, base + 1) * jitter.amount;
    const dz = seededSigned(jitter.seed, base + 2) * jitter.amount;
    const x = array[base];
    const y = array[base + 1];
    const z = array[base + 2];
    if (x === undefined || y === undefined || z === undefined) continue;
    array[base] = x + dx;
    array[base + 1] = y + dy;
    array[base + 2] = z + dz;
  }
  position.needsUpdate = true;
}

/**
 * Computes a banded/striped vertex-colour buffer for a geometry, cycling
 * through stripes.colors along the geometry's own local bounding extent on
 * stripes.axis. Used for a striped awning canopy or a market-stall skirt
 * without a texture: the geometry provides the shape, this provides the
 * paint job. Called before the node's world transform is applied, so the
 * bands stay stable relative to the shape no matter how the instance is
 * later rotated, scaled, or placed.
 */
function bandedVertexColors(
  geometry: THREE.BufferGeometry,
  stripes: VertexStripes,
): Float32Array {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const array = position.array as Float32Array;
  const axisOffset = stripes.axis === 'x' ? 0 : stripes.axis === 'y' ? 1 : 2;
  const bandCount = Math.max(1, Math.floor(stripes.bandCount ?? stripes.colors.length));
  const paletteHex = stripes.colors.map((key) => getPaletteColor(key));

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const v = array[i * 3 + axisOffset];
    if (v === undefined) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;

  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const v = array[i * 3 + axisOffset] ?? min;
    const t = Math.min(0.999999, Math.max(0, (v - min) / span));
    const bandIndex = Math.floor(t * bandCount) % paletteHex.length;
    const hex = paletteHex[bandIndex] ?? paletteHex[0] ?? 0xffffff;
    const c = new THREE.Color(hex);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  return colors;
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
  // Jitter and stripes are both computed in the node's own local space,
  // before the world transform below, so a striped awning's bands and a
  // crate's jitter bumps stay stable relative to the shape itself no
  // matter how the instance is later rotated, scaled, or placed.
  if (node.jitter) jitterPositionsInPlace(nonIndexed, node.jitter);
  const localColors =
    node.stripes && node.stripes.colors.length > 0
      ? bandedVertexColors(nonIndexed, node.stripes)
      : null;

  nonIndexed.applyMatrix4(worldMatrix);
  // Always re-derive normals post-transform, whether or not the primitive
  // already had them, so a non-uniform scale never bakes in a skewed
  // normal. Cheap relative to the cost of getting lighting wrong.
  nonIndexed.computeVertexNormals();

  const vertexCount = nonIndexed.getAttribute('position').count;
  let colors: Float32Array;
  if (localColors) {
    colors = localColors;
  } else {
    const hex = getPaletteColor(node.color);
    const c = new THREE.Color(hex);
    colors = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
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
