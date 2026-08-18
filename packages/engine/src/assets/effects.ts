/**
 * Generated effect meshes and their motion — chimney smoke, ready-to-harvest
 * cues, water ripples/splashes, weather and atmosphere, and one-shot action
 * feedback.
 *
 * Static geometry alone reads as a diorama rather than a living town. Every
 * asset registered here is small and cheap, meant to be pushed through the
 * same `InstanceManager` pools as buildings and crops (see `instancing.ts`);
 * this module only builds the geometry and computes *where the instances
 * currently are*, exactly once per animation frame, from a pure function of
 * elapsed time. It never touches `THREE.Scene`, never allocates per frame,
 * and never calls `Math.random()` — every wobble, stagger and twinkle is
 * derived from a caller-supplied seed so the same town looks the same on
 * every reload.
 *
 * Renderer usage sketch:
 *
 *   for (const group of computeEffectFrame('chimneySmoke', spawns, nowSeconds, reducedMotion)) {
 *     instances.setInstances(group.assetName, group.transforms);
 *   }
 *
 * `spawns` is whatever list of anchor points the caller already knows about
 * (an active factory's chimney top, a pond's centre, a crop plot that just
 * became ready) — this module owns none of that bookkeeping, only the
 * per-frame math that turns an anchor plus a clock into instance transforms.
 */

import * as THREE from 'three';
import { box, cone, cylinder, defineAsset, group, lathe, sphere } from '../mesh-dsl.js';
import type { InstanceTransform } from '../instancing.js';

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Profile points (radius, height pairs) tracing a small circle offset from
 * the lathe axis. Revolved by `lathe()` around Y, this produces a torus —
 * the cheapest way to draw a "ring on the ground" (a ripple, a growth pop)
 * with the primitives this engine has, since there is no dedicated torus
 * node in the mesh DSL.
 */
function torusProfilePoints(bigRadius: number, tubeRadius: number, segments: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([bigRadius + tubeRadius * Math.cos(angle), tubeRadius * Math.sin(angle)]);
  }
  return points;
}

// ---------------------------------------------------------------------------
// Registered assets — every one prefixed `effect_` so this lane's names can
// never collide with a building, crop, prop or character asset.
// ---------------------------------------------------------------------------

/** A soft puff of smoke — a low-poly sphere instanced several times per
 * chimney at staggered rise/fade phases. */
defineAsset('effect_smoke_puff', sphere({ radius: 0.14, widthSegments: 6, heightSegments: 5, color: 'stone' }));

/** A puff of ground dust — the same shape family, tinted warm/dry, used for
 * a building landing or a villager's footsteps. */
defineAsset('effect_dust_puff', sphere({ radius: 0.1, widthSegments: 6, heightSegments: 4, color: 'soilDry' }));

/** A small floating gem/diamond — the "something here is nice" ambient
 * sparkle above a ready crop, factory or animal. */
defineAsset(
  'effect_sparkle',
  group([
    cone({ radius: 0.05, height: 0.09, radialSegments: 4, color: 'accent', transform: { translate: [0, 0.045, 0] } }),
    cone({
      radius: 0.05,
      height: 0.09,
      radialSegments: 4,
      color: 'accent',
      transform: { translate: [0, -0.045, 0], rotate: [Math.PI, 0, 0] },
    }),
  ]),
);

/** A bouncing exclamation mark — the explicit "needs attention" gameplay
 * affordance, distinct from the ambient sparkle above. */
defineAsset(
  'effect_ready_icon',
  group([
    box({ width: 0.03, height: 0.14, depth: 0.03, color: 'accentWarm', transform: { translate: [0, 0.09, 0] } }),
    sphere({ radius: 0.025, widthSegments: 6, heightSegments: 4, color: 'accentWarm' }),
  ]),
);

/** A thin ring lying flat on the ground — a pond ripple or a splash's
 * settling wave, expanding from an interaction point. */
defineAsset('effect_ripple_ring', lathe({ points: torusProfilePoints(0.4, 0.03, 7), segments: 14, color: 'water' }));

/** A single droplet, reused for a splash burst, a fountain jet and falling
 * rain — the difference between those effects is entirely in their motion,
 * not their geometry. */
defineAsset('effect_splash_droplet', sphere({ radius: 0.035, widthSegments: 5, heightSegments: 4, color: 'glass' }));

/** A tiny mote drifting through a sunbeam. */
defineAsset('effect_dust_mote', sphere({ radius: 0.018, widthSegments: 4, heightSegments: 3, color: 'sand' }));

/** Three tinted leaf variants so a fall of leaves does not read as one
 * repeated stamp — picked per-particle from a seed, never at random. */
defineAsset('effect_leaf_a', box({ width: 0.06, height: 0.01, depth: 0.08, color: 'leafDark' }));
defineAsset('effect_leaf_b', box({ width: 0.06, height: 0.01, depth: 0.08, color: 'leaf' }));
defineAsset('effect_leaf_c', box({ width: 0.06, height: 0.01, depth: 0.08, color: 'leafLight' }));

/** A flat wet patch decal for the ground under active rain — static, no
 * motion of its own. */
defineAsset(
  'effect_rain_patch',
  box({ width: 0.9, height: 0.01, depth: 0.9, color: 'waterDeep', transform: { translate: [0, 0.005, 0] } }),
);

/** A single falling rain streak. */
defineAsset('effect_rain_streak', cylinder({ radiusTop: 0.006, radiusBottom: 0.006, height: 0.3, radialSegments: 4, color: 'waterDeep' }));

/** A tiny glowing mote for a firefly at night — brightness is approximated
 * by pulsing its instance scale, the only per-instance channel this engine
 * exposes without a custom shader. */
defineAsset('effect_firefly', sphere({ radius: 0.02, widthSegments: 5, heightSegments: 4, color: 'accent' }));

/** A small gliding bird silhouette — wings fixed in a glide pose; the
 * flapping cost of an articulated wing is not worth it for a background
 * circling flock rendered through one instanced draw call. */
defineAsset(
  'effect_bird',
  group([
    box({ width: 0.05, height: 0.03, depth: 0.12, color: 'stoneDark' }),
    box({ width: 0.16, height: 0.01, depth: 0.05, color: 'stoneDark', transform: { translate: [-0.09, 0.01, 0], rotate: [0, 0, 0.3] } }),
    box({ width: 0.16, height: 0.01, depth: 0.05, color: 'stoneDark', transform: { translate: [0.09, 0.01, 0], rotate: [0, 0, -0.3] } }),
  ]),
);

/** A coin, stood on edge so its instance-Y rotation reads as a spin rather
 * than a flat disc rotating uselessly about its own face normal. */
defineAsset(
  'effect_coin',
  cylinder({
    radiusTop: 0.05,
    radiusBottom: 0.05,
    height: 0.015,
    radialSegments: 10,
    color: 'accent',
    transform: { rotate: [Math.PI / 2, 0, 0] },
  }),
);

/** An eight-point asterisk burst for a completed action. */
defineAsset(
  'effect_star_burst',
  group([
    box({ width: 0.16, height: 0.02, depth: 0.02, color: 'accentWarm' }),
    box({ width: 0.02, height: 0.02, depth: 0.16, color: 'accentWarm' }),
    box({ width: 0.11, height: 0.02, depth: 0.02, color: 'accentWarm', transform: { rotate: [0, Math.PI / 4, 0] } }),
    box({ width: 0.02, height: 0.02, depth: 0.11, color: 'accentWarm', transform: { rotate: [0, Math.PI / 4, 0] } }),
  ]),
);

/** A small green ring pop for a crop advancing a growth stage — the same
 * torus trick as the pond ripple, scaled down and tinted for foliage. */
defineAsset('effect_growth_pop', lathe({ points: torusProfilePoints(0.12, 0.012, 6), segments: 10, color: 'leafLight' }));

// ---------------------------------------------------------------------------
// Deterministic seeding — no Math.random() anywhere below this line.
// ---------------------------------------------------------------------------

/** FNV-1a — a cheap, dependency-free string hash so a spawn's stable id
 * (an entity id, a tile key) can seed its own effect deterministically. */
function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A deterministic pseudo-random unit value in [0, 1) from an integer-ish
 * seed. Intentionally a small self-contained copy of the same trig trick
 * `palette.ts` uses internally (`seededUnit`) rather than importing it —
 * this module has no other reason to depend on palette internals, and a
 * two-line pure function is cheaper to keep isolated than to share.
 */
function rand01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Position, in [0, 1), within a repeating cycle of `periodSeconds`,
 * offset so many instances of one effect do not pulse in lockstep. */
function phaseOf(timeSeconds: number, periodSeconds: number, offsetSeconds: number): number {
  const x = (timeSeconds + offsetSeconds) % periodSeconds;
  return (x < 0 ? x + periodSeconds : x) / periodSeconds;
}

/** Derives a per-particle seed from a spawn's own seed (or its hashed id)
 * plus a small integer salt, so several independent random streams (which
 * puff, which axis, which leaf variant) can be drawn from one spawn without
 * correlating with each other. */
function seedFor(spawn: EffectSpawn, salt: number): number {
  const base = spawn.seed ?? (typeof spawn.id === 'number' ? spawn.id : hashString(spawn.id));
  return base + salt * 104729;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type EffectKind =
  | 'chimneySmoke'
  | 'readySparkle'
  | 'readyIcon'
  | 'pondRipple'
  | 'splash'
  | 'fountainPlume'
  | 'dustMotes'
  | 'fallingLeaves'
  | 'rainPatch'
  | 'rain'
  | 'fireflies'
  | 'circlingBirds'
  | 'coinBurst'
  | 'starBurst'
  | 'placementDust'
  | 'growthPop';

export const EFFECT_KINDS: readonly EffectKind[] = [
  'chimneySmoke',
  'readySparkle',
  'readyIcon',
  'pondRipple',
  'splash',
  'fountainPlume',
  'dustMotes',
  'fallingLeaves',
  'rainPatch',
  'rain',
  'fireflies',
  'circlingBirds',
  'coinBurst',
  'starBurst',
  'placementDust',
  'growthPop',
];

export interface EffectSpawn {
  /** A stable identity for this spawn point — an entity id, a tile hash, a
   * loop index. Used to derive a deterministic per-spawn seed when `seed`
   * is not given explicitly. Two spawns sharing an id look identical, which
   * is the point: the same entity produces the same effect on every frame
   * and every reload. */
  id: string | number;
  /** World-space anchor the effect is placed at or around (a chimney top,
   * a pond centre, a crop plot). */
  position: THREE.Vector3Like;
  /** Explicit deterministic seed, overriding the id-derived one. */
  seed?: number;
  /**
   * Seconds on the same clock as `computeEffectFrame`'s `timeSeconds`
   * argument, marking when this spawn began. Continuous/ambient kinds
   * (chimney smoke, fireflies, falling leaves, ...) ignore it and loop
   * forever from the caller's clock. One-shot feedback kinds (`splash`,
   * `coinBurst`, `starBurst`, `placementDust`, `growthPop`) use it to know
   * where in their short lifecycle they are, and produce no transform once
   * their duration has elapsed — the caller is expected to stop passing
   * that spawn once its known duration (see the `*_DURATION_S` constants
   * below) has passed, the same way any other short-lived game event is
   * retired. Defaults to 0.
   */
  startTime?: number;
  /** Heading in radians, used by directional kinds (a circling flock's
   * starting bearing). Optional. */
  heading?: number;
  /** Per-kind radius override (a pond's true edge, a flock's orbit radius,
   * a dust-mote wander volume). Falls back to a sensible per-kind default. */
  radius?: number;
}

export interface EffectFrameGroup {
  assetName: string;
  transforms: InstanceTransform[];
}

/** One-shot effect durations, in seconds — a spawn passed to one of these
 * kinds produces no transform once `timeSeconds - startTime` exceeds this,
 * so the caller knows when it is safe to stop tracking the spawn. */
export const SPLASH_DURATION_S = 0.6;
export const COIN_BURST_DURATION_S = 0.7;
export const STAR_BURST_DURATION_S = 0.45;
export const PLACEMENT_DUST_DURATION_S = 0.5;
export const GROWTH_POP_DURATION_S = 0.4;

const CHIMNEY_SMOKE_PERIOD_S = 3.2;
const CHIMNEY_SMOKE_PUFFS = 3;

const SPARKLE_PERIOD_S = 2.4;
const SPARKLE_HEIGHT = 0.55;
const SPARKLE_BOB = 0.05;

const READY_ICON_PERIOD_S = 1.1;
const READY_ICON_HEIGHT = 0.5;
const READY_ICON_BOUNCE = 0.06;

const RIPPLE_PERIOD_S = 2.6;
const RIPPLE_RINGS = 2;
const RIPPLE_ASSET_RADIUS = 0.4;
const RIPPLE_MAX_SCALE = 1.6;

const SPLASH_DROPLETS = 6;

const FOUNTAIN_PERIOD_S = 1.4;
const FOUNTAIN_DROPLETS = 8;
const FOUNTAIN_HEIGHT = 0.55;

const DUST_MOTE_PERIOD_S = 6;
const DUST_MOTES_PER_SPAWN = 5;

const LEAF_ASSETS = ['effect_leaf_a', 'effect_leaf_b', 'effect_leaf_c'] as const;
const LEAVES_PER_SPAWN = 4;
const LEAF_FALL_HEIGHT = 1.6;
const LEAF_PERIOD_S = 5;

const RAIN_PARTICLES_PER_SPAWN = 6;
const RAIN_FALL_HEIGHT = 1.8;
const RAIN_PERIOD_S = 0.9;

const FIREFLIES_PER_SPAWN = 4;
const FIREFLY_WANDER_PERIOD_S = 4;
const FIREFLY_TWINKLE_PERIOD_S = 1.3;

const BIRDS_PER_SPAWN = 3;
const BIRD_ORBIT_PERIOD_S = 9;

const COINS_PER_BURST = 5;
const PLACEMENT_DUST_PUFFS = 5;

/**
 * Compute this frame's instance transforms for one effect kind across every
 * given spawn point. Pure in `timeSeconds`: called again with the same
 * arguments, it returns byte-identical numbers. The renderer is expected to
 * call this once per animation frame per active effect kind and feed each
 * returned group straight into `InstanceManager.setInstances()` — this
 * module never touches the scene graph itself.
 *
 * `reducedMotion` freezes every continuous animation (rise, bob, spin,
 * drift, twinkle) to a single stable per-spawn frame instead of animating
 * it — the geometry and its position stay visible so the cue (a factory is
 * producing, a crop is ready) is not lost, only its motion. One-shot
 * feedback kinds still play out their short pop-and-settle rather than
 * holding a frozen mid-burst pose, since a still frame of a coin burst
 * reads as broken rather than as "reduced motion".
 */
export function computeEffectFrame(
  kind: EffectKind,
  spawns: readonly EffectSpawn[],
  timeSeconds: number,
  reducedMotion = false,
): EffectFrameGroup[] {
  if (spawns.length === 0) return [];
  switch (kind) {
    case 'chimneySmoke':
      return chimneySmokeFrame(spawns, timeSeconds, reducedMotion);
    case 'readySparkle':
      return readySparkleFrame(spawns, timeSeconds, reducedMotion);
    case 'readyIcon':
      return readyIconFrame(spawns, timeSeconds, reducedMotion);
    case 'pondRipple':
      return pondRippleFrame(spawns, timeSeconds, reducedMotion);
    case 'splash':
      return splashFrame(spawns, timeSeconds, reducedMotion);
    case 'fountainPlume':
      return fountainPlumeFrame(spawns, timeSeconds, reducedMotion);
    case 'dustMotes':
      return dustMotesFrame(spawns, timeSeconds, reducedMotion);
    case 'fallingLeaves':
      return fallingLeavesFrame(spawns, timeSeconds, reducedMotion);
    case 'rainPatch':
      return rainPatchFrame(spawns);
    case 'rain':
      return rainFrame(spawns, timeSeconds, reducedMotion);
    case 'fireflies':
      return firefliesFrame(spawns, timeSeconds, reducedMotion);
    case 'circlingBirds':
      return circlingBirdsFrame(spawns, timeSeconds, reducedMotion);
    case 'coinBurst':
      return coinBurstFrame(spawns, timeSeconds, reducedMotion);
    case 'starBurst':
      return starBurstFrame(spawns, timeSeconds, reducedMotion);
    case 'placementDust':
      return placementDustFrame(spawns, timeSeconds, reducedMotion);
    case 'growthPop':
      return growthPopFrame(spawns, timeSeconds, reducedMotion);
    default: {
      const exhaustive: never = kind;
      throw new Error(`effects: unknown effect kind ${JSON.stringify(exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-kind motion
// ---------------------------------------------------------------------------

function chimneySmokeFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    for (let i = 0; i < CHIMNEY_SMOKE_PUFFS; i++) {
      const seed = seedFor(spawn, i);
      const stagger = (i / CHIMNEY_SMOKE_PUFFS) * CHIMNEY_SMOKE_PERIOD_S + rand01(seed) * 0.4;
      const phase = reducedMotion ? i / CHIMNEY_SMOKE_PUFFS : phaseOf(t, CHIMNEY_SMOKE_PERIOD_S, stagger);
      const rise = phase * 0.9;
      const drift = reducedMotion ? 0 : Math.sin(phase * Math.PI * 2 + rand01(seed + 1) * 6) * 0.08 * phase;
      const growth = lerp(0.4, 1.3, clamp01(phase * 1.6));
      const fade = phase > 0.75 ? lerp(1, 0.05, (phase - 0.75) / 0.25) : 1;
      transforms.push({
        position: {
          x: spawn.position.x + drift,
          y: spawn.position.y + rise,
          z: spawn.position.z + drift * 0.6,
        },
        rotationY: rand01(seed + 2) * Math.PI * 2,
        scale: reducedMotion ? 0.9 : growth * fade,
      });
    }
  }
  return [{ assetName: 'effect_smoke_puff', transforms }];
}

function readySparkleFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms = spawns.map((spawn) => {
    const seed = seedFor(spawn, 0);
    const phase = phaseOf(reducedMotion ? 0 : t, SPARKLE_PERIOD_S, rand01(seed) * SPARKLE_PERIOD_S);
    const bob = reducedMotion ? 0 : Math.sin(phase * Math.PI * 2) * SPARKLE_BOB;
    const pulse = (Math.sin(phase * Math.PI * 2) + 1) / 2;
    const transform: InstanceTransform = {
      position: { x: spawn.position.x, y: spawn.position.y + SPARKLE_HEIGHT + bob, z: spawn.position.z },
      rotationY: reducedMotion ? rand01(seed + 1) * Math.PI * 2 : phase * Math.PI * 2,
      scale: reducedMotion ? 0.95 : lerp(0.85, 1.1, pulse),
    };
    return transform;
  });
  return [{ assetName: 'effect_sparkle', transforms }];
}

function readyIconFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms = spawns.map((spawn) => {
    const seed = seedFor(spawn, 0);
    const phase = phaseOf(reducedMotion ? 0 : t, READY_ICON_PERIOD_S, rand01(seed) * READY_ICON_PERIOD_S);
    const bounce = reducedMotion ? 0 : Math.abs(Math.sin(phase * Math.PI)) * READY_ICON_BOUNCE;
    const transform: InstanceTransform = {
      position: { x: spawn.position.x, y: spawn.position.y + READY_ICON_HEIGHT + bounce, z: spawn.position.z },
      rotationY: 0,
      scale: 1,
    };
    return transform;
  });
  return [{ assetName: 'effect_ready_icon', transforms }];
}

function pondRippleFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    const maxScale = spawn.radius ? spawn.radius / RIPPLE_ASSET_RADIUS : RIPPLE_MAX_SCALE;
    for (let i = 0; i < RIPPLE_RINGS; i++) {
      const stagger = (i / RIPPLE_RINGS) * RIPPLE_PERIOD_S;
      const phase = reducedMotion ? i / RIPPLE_RINGS : phaseOf(t, RIPPLE_PERIOD_S, stagger);
      const grow = clamp01(phase / 0.85);
      const collapse = phase > 0.85 ? lerp(1, 0, (phase - 0.85) / 0.15) : 1;
      const scale = reducedMotion ? maxScale * 0.6 : Math.max(0.02, lerp(0.05, maxScale, grow) * collapse);
      transforms.push({
        position: { x: spawn.position.x, y: spawn.position.y + 0.01, z: spawn.position.z },
        rotationY: 0,
        scale,
      });
    }
  }
  return [{ assetName: 'effect_ripple_ring', transforms }];
}

function splashFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    const elapsed = t - (spawn.startTime ?? 0);
    if (elapsed < 0 || elapsed > SPLASH_DURATION_S) continue;
    const p = clamp01(elapsed / SPLASH_DURATION_S);
    for (let i = 0; i < SPLASH_DROPLETS; i++) {
      const seed = seedFor(spawn, i);
      const angle = (i / SPLASH_DROPLETS) * Math.PI * 2 + rand01(seed) * 0.6;
      const outSpeed = lerp(0.05, 0.28, rand01(seed + 1));
      const dist = reducedMotion ? outSpeed * 0.5 : outSpeed * p;
      const rise = reducedMotion ? 0.08 : Math.sin(p * Math.PI) * 0.22;
      transforms.push({
        position: {
          x: spawn.position.x + Math.cos(angle) * dist,
          y: spawn.position.y + rise,
          z: spawn.position.z + Math.sin(angle) * dist,
        },
        rotationY: angle,
        scale: reducedMotion ? 0.6 : lerp(1, 0.3, p),
      });
    }
  }
  return [{ assetName: 'effect_splash_droplet', transforms }];
}

function fountainPlumeFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    for (let i = 0; i < FOUNTAIN_DROPLETS; i++) {
      const seed = seedFor(spawn, i);
      const stagger = (i / FOUNTAIN_DROPLETS) * FOUNTAIN_PERIOD_S;
      const phase = reducedMotion ? i / FOUNTAIN_DROPLETS : phaseOf(t, FOUNTAIN_PERIOD_S, stagger);
      const arc = Math.sin(phase * Math.PI);
      const spreadX = (rand01(seed) - 0.5) * 0.12;
      const spreadZ = (rand01(seed + 1) - 0.5) * 0.12;
      transforms.push({
        position: {
          x: spawn.position.x + spreadX,
          y: spawn.position.y + arc * FOUNTAIN_HEIGHT,
          z: spawn.position.z + spreadZ,
        },
        rotationY: 0,
        scale: reducedMotion ? 0.5 : lerp(0.4, 0.85, arc),
      });
    }
  }
  return [{ assetName: 'effect_splash_droplet', transforms }];
}

function dustMotesFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    const volume = spawn.radius ?? 0.8;
    for (let i = 0; i < DUST_MOTES_PER_SPAWN; i++) {
      const seed = seedFor(spawn, i);
      const phase = phaseOf(reducedMotion ? 0 : t, DUST_MOTE_PERIOD_S, rand01(seed) * DUST_MOTE_PERIOD_S);
      const angle = rand01(seed + 1) * Math.PI * 2 + (reducedMotion ? 0 : phase * Math.PI * 2 * 0.15);
      const radius = volume * (0.3 + rand01(seed + 2) * 0.7);
      const bob = reducedMotion ? 0 : Math.sin(phase * Math.PI * 4 + rand01(seed + 3) * 6) * 0.15;
      transforms.push({
        position: {
          x: spawn.position.x + Math.cos(angle) * radius,
          y: spawn.position.y + 0.3 + bob,
          z: spawn.position.z + Math.sin(angle) * radius,
        },
        rotationY: 0,
        scale: 0.6 + rand01(seed + 4) * 0.5,
      });
    }
  }
  return [{ assetName: 'effect_dust_mote', transforms }];
}

function fallingLeavesFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const groups = new Map<string, InstanceTransform[]>();
  for (const spawn of spawns) {
    for (let i = 0; i < LEAVES_PER_SPAWN; i++) {
      const seed = seedFor(spawn, i);
      const assetIndex = Math.min(LEAF_ASSETS.length - 1, Math.floor(rand01(seed) * LEAF_ASSETS.length));
      const assetName = LEAF_ASSETS[assetIndex] ?? LEAF_ASSETS[0];
      const stagger = rand01(seed + 1) * LEAF_PERIOD_S;
      const phase = reducedMotion ? rand01(seed + 2) : phaseOf(t, LEAF_PERIOD_S, stagger);
      const fallY = LEAF_FALL_HEIGHT * (1 - phase);
      const sway = reducedMotion ? 0 : Math.sin(phase * Math.PI * 6 + rand01(seed + 3) * 6) * 0.3;
      const drift = reducedMotion ? 0 : Math.cos(phase * Math.PI * 4) * 0.15;
      const spinSpeed = 4 + rand01(seed + 4) * 3;
      const list = groups.get(assetName) ?? [];
      list.push({
        position: {
          x: spawn.position.x + sway,
          y: spawn.position.y + fallY,
          z: spawn.position.z + drift,
        },
        rotationY: reducedMotion ? rand01(seed + 5) * Math.PI * 2 : phase * spinSpeed,
        scale: 0.8 + rand01(seed + 6) * 0.4,
      });
      groups.set(assetName, list);
    }
  }
  return [...groups.entries()].map(([assetName, transforms]) => ({ assetName, transforms }));
}

function rainPatchFrame(spawns: readonly EffectSpawn[]): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = spawns.map((spawn) => ({
    position: { x: spawn.position.x, y: spawn.position.y, z: spawn.position.z },
    rotationY: 0,
    scale: 1,
  }));
  return [{ assetName: 'effect_rain_patch', transforms }];
}

function rainFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    const area = spawn.radius ?? 0.6;
    for (let i = 0; i < RAIN_PARTICLES_PER_SPAWN; i++) {
      const seed = seedFor(spawn, i);
      const stagger = rand01(seed) * RAIN_PERIOD_S;
      const phase = reducedMotion ? rand01(seed + 1) : phaseOf(t, RAIN_PERIOD_S, stagger);
      const dx = (rand01(seed + 2) - 0.5) * area * 2;
      const dz = (rand01(seed + 3) - 0.5) * area * 2;
      transforms.push({
        position: {
          x: spawn.position.x + dx,
          y: spawn.position.y + RAIN_FALL_HEIGHT * (1 - phase),
          z: spawn.position.z + dz,
        },
        rotationY: 0,
        scale: 1,
      });
    }
  }
  return [{ assetName: 'effect_rain_streak', transforms }];
}

function firefliesFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    const radius = spawn.radius ?? 1.2;
    for (let i = 0; i < FIREFLIES_PER_SPAWN; i++) {
      const seed = seedFor(spawn, i);
      const wanderPhase = phaseOf(reducedMotion ? 0 : t, FIREFLY_WANDER_PERIOD_S, rand01(seed) * FIREFLY_WANDER_PERIOD_S);
      const angle = rand01(seed + 1) * Math.PI * 2 + wanderPhase * Math.PI * 2;
      const orbit = radius * (0.3 + rand01(seed + 2) * 0.7);
      const bob = reducedMotion ? 0 : Math.sin(wanderPhase * Math.PI * 4) * 0.2;
      const twinklePhase = reducedMotion ? 0.5 : phaseOf(t, FIREFLY_TWINKLE_PERIOD_S, rand01(seed + 3) * FIREFLY_TWINKLE_PERIOD_S);
      const glow = 0.4 + 0.6 * Math.abs(Math.sin(twinklePhase * Math.PI));
      transforms.push({
        position: {
          x: spawn.position.x + Math.cos(angle) * orbit,
          y: spawn.position.y + 0.4 + bob,
          z: spawn.position.z + Math.sin(angle) * orbit,
        },
        rotationY: 0,
        scale: reducedMotion ? 0.7 : glow,
      });
    }
  }
  return [{ assetName: 'effect_firefly', transforms }];
}

function circlingBirdsFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    const radius = spawn.radius ?? 2.2;
    for (let i = 0; i < BIRDS_PER_SPAWN; i++) {
      const seed = seedFor(spawn, i);
      const startAngle = (spawn.heading ?? 0) + (i / BIRDS_PER_SPAWN) * Math.PI * 2 + rand01(seed) * 0.5;
      const phase = phaseOf(reducedMotion ? 0 : t, BIRD_ORBIT_PERIOD_S, rand01(seed + 1) * BIRD_ORBIT_PERIOD_S);
      const angle = startAngle + phase * Math.PI * 2;
      const bob = reducedMotion ? 0 : Math.sin(phase * Math.PI * 6 + rand01(seed + 2) * 6) * 0.08;
      transforms.push({
        position: {
          x: spawn.position.x + Math.cos(angle) * radius,
          y: spawn.position.y + 1.4 + bob,
          z: spawn.position.z + Math.sin(angle) * radius,
        },
        rotationY: angle + Math.PI / 2,
        scale: 1,
      });
    }
  }
  return [{ assetName: 'effect_bird', transforms }];
}

function coinBurstFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    const elapsed = t - (spawn.startTime ?? 0);
    if (elapsed < 0 || elapsed > COIN_BURST_DURATION_S) continue;
    const p = clamp01(elapsed / COIN_BURST_DURATION_S);
    for (let i = 0; i < COINS_PER_BURST; i++) {
      const seed = seedFor(spawn, i);
      const angle = (i / COINS_PER_BURST) * Math.PI * 2 + rand01(seed) * 0.4;
      const outR = reducedMotion ? 0.1 : 0.22 * p;
      const arcHeight = reducedMotion ? 0.2 : Math.sin(p * Math.PI) * 0.4;
      transforms.push({
        position: {
          x: spawn.position.x + Math.cos(angle) * outR,
          y: spawn.position.y + 0.15 + arcHeight,
          z: spawn.position.z + Math.sin(angle) * outR,
        },
        rotationY: reducedMotion ? angle : angle + p * 10,
        scale: reducedMotion ? 0.8 : lerp(0.7, 1, Math.sin(p * Math.PI)),
      });
    }
  }
  return [{ assetName: 'effect_coin', transforms }];
}

function starBurstFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    const elapsed = t - (spawn.startTime ?? 0);
    if (elapsed < 0 || elapsed > STAR_BURST_DURATION_S) continue;
    const p = clamp01(elapsed / STAR_BURST_DURATION_S);
    const seed = seedFor(spawn, 0);
    const pop = Math.sin(p * Math.PI);
    transforms.push({
      position: { x: spawn.position.x, y: spawn.position.y + 0.4, z: spawn.position.z },
      rotationY: reducedMotion ? rand01(seed) * Math.PI * 2 : p * Math.PI * 1.5 + rand01(seed),
      scale: reducedMotion ? 0.8 : lerp(0.2, 1.4, pop),
    });
  }
  return [{ assetName: 'effect_star_burst', transforms }];
}

function placementDustFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    const elapsed = t - (spawn.startTime ?? 0);
    if (elapsed < 0 || elapsed > PLACEMENT_DUST_DURATION_S) continue;
    const p = clamp01(elapsed / PLACEMENT_DUST_DURATION_S);
    for (let i = 0; i < PLACEMENT_DUST_PUFFS; i++) {
      const seed = seedFor(spawn, i);
      const angle = (i / PLACEMENT_DUST_PUFFS) * Math.PI * 2 + rand01(seed) * 0.5;
      const dist = reducedMotion ? 0.1 : 0.18 * p;
      transforms.push({
        position: {
          x: spawn.position.x + Math.cos(angle) * dist,
          y: spawn.position.y + 0.04 + p * 0.1,
          z: spawn.position.z + Math.sin(angle) * dist,
        },
        rotationY: angle,
        scale: reducedMotion ? 0.6 : lerp(0.3, 1, p) * lerp(1, 0.2, p),
      });
    }
  }
  return [{ assetName: 'effect_dust_puff', transforms }];
}

function growthPopFrame(spawns: readonly EffectSpawn[], t: number, reducedMotion: boolean): EffectFrameGroup[] {
  const transforms: InstanceTransform[] = [];
  for (const spawn of spawns) {
    const elapsed = t - (spawn.startTime ?? 0);
    if (elapsed < 0 || elapsed > GROWTH_POP_DURATION_S) continue;
    const p = clamp01(elapsed / GROWTH_POP_DURATION_S);
    transforms.push({
      position: { x: spawn.position.x, y: spawn.position.y + 0.05, z: spawn.position.z },
      rotationY: 0,
      scale: reducedMotion ? 1 : lerp(0.2, 2.4, p),
    });
  }
  return [{ assetName: 'effect_growth_pop', transforms }];
}
