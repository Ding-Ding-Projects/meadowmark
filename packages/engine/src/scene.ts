/**
 * scene.ts — the three.js scene root: renderer, lighting rig, fog, and a
 * subtle day/night cycle driven by the real local clock (toggleable off).
 */

import * as THREE from 'three';
import { getPaletteColor, varyColor } from './palette.js';

export interface DayNightOptions {
  /** When false, lighting is frozen at a fixed pleasant mid-morning look. */
  enabled: boolean;
}

export interface SceneBundle {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  hemiLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
  ground: THREE.Mesh;
  dispose: () => void;
  /** Advance the day/night cycle; call once per frame with the elapsed clock. */
  update: (nowMs: number) => void;
  setDayNightEnabled: (enabled: boolean) => void;
  /** Set a simulation-owned hour in the 0..24 range, when one is available. */
  setTimeOfDay: (timeOfDay: number | null) => void;
}

export interface CreateSceneOptions {
  canvas: HTMLCanvasElement;
  worldSize: number;
  dayNight?: DayNightOptions;
  antialias?: boolean;
  shadowMapSize?: number;
}

const FIXED_SUN_ANGLE = Math.PI * 0.35; // a fixed pleasant mid-morning elevation

// The ground is subdivided (rather than one flat quad) purely so it can
// carry a per-vertex colour attribute: subtle tile-to-tile tonal variation
// plus a soft vignette toward the world edge, so a huge plane of a single
// flat swatch does not read like a spreadsheet.
const GROUND_SEGMENTS = 32;

function buildGroundVertexColors(geometry: THREE.PlaneGeometry, worldSize: number): Float32Array {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const base = new THREE.Color(getPaletteColor('grass'));
  const scratch = new THREE.Color();
  const halfDiagonal = Math.max((worldSize * Math.SQRT2) / 2, 1);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);

    // Deterministic per-vertex jitter so neighbouring frames never swim;
    // quantising to whole tiles keeps the variation readable as patches
    // of colour rather than noisy static.
    const tileSeed = Math.round(x) * 7919 + Math.round(z) * 104729;
    scratch.setHex(varyColor(base.getHex(), 0.07, tileSeed));

    // A gentle vignette: tiles near the world edge sit a touch darker,
    // drawing the eye back toward the town at the centre of the diorama.
    // Kept subtle (a 0.85 floor, not the previous 0.68) so a sunny mid-green
    // field never reads as dimming into a murky forest-floor tone toward
    // the world's edge.
    const distanceFromCenter = Math.sqrt(x * x + z * z) / halfDiagonal;
    const vignette = THREE.MathUtils.clamp(1 - distanceFromCenter * 0.2, 0.85, 1);
    scratch.multiplyScalar(vignette);

    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }

  return colors;
}

export function createScene(opts: CreateSceneOptions): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7fd0ec);
  scene.fog = new THREE.Fog(0x7fd0ec, opts.worldSize * 0.9, opts.worldSize * 2.4);

  const renderer = new THREE.WebGLRenderer({
    canvas: opts.canvas,
    antialias: opts.antialias ?? true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Soft ambient bounce light: warm pale sky tint from above, a warmer
  // brown ground-bounce tint from below. This is deliberately kept low
  // relative to the key/fill pair below it, so the shadow the key light
  // casts still reads as a real shadow instead of being washed flat.
  const hemiLight = new THREE.HemisphereLight(0xfff2d9, 0x5a4326, 0.55);
  scene.add(hemiLight);

  // The warm key light: strong, saturated late-morning sun, casting the
  // scene's real shadows.
  const sunLight = new THREE.DirectionalLight(0xffe6b0, 1.65);
  sunLight.castShadow = true;
  const shadowMapSize = opts.shadowMapSize ?? 2048;
  sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  const shadowExtent = opts.worldSize * 0.6;
  sunLight.shadow.camera.left = -shadowExtent;
  sunLight.shadow.camera.right = shadowExtent;
  sunLight.shadow.camera.top = shadowExtent;
  sunLight.shadow.camera.bottom = -shadowExtent;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = opts.worldSize * 3;
  sunLight.shadow.bias = -0.0018;
  sunLight.shadow.radius = 3;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // The cool fill light: a soft, unshadowed cross light from the opposite
  // side of the key light. It is what keeps the shadow side of every
  // building and prop readable as real geometry instead of going flat
  // black, and its cool tint against the warm key is what gives surfaces
  // actual colour modelling rather than a single flat wash of light.
  const fillLight = new THREE.DirectionalLight(0x9fc6e6, 0.4);
  fillLight.castShadow = false;
  scene.add(fillLight);

  const groundGeo = new THREE.PlaneGeometry(opts.worldSize, opts.worldSize, GROUND_SEGMENTS, GROUND_SEGMENTS);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.setAttribute('color', new THREE.BufferAttribute(buildGroundVertexColors(groundGeo, opts.worldSize), 3));
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  let dayNightEnabled = opts.dayNight?.enabled ?? true;
  let fixedTimeOfDay: number | null = null;

  function angleForHour(hour: number): number {
    const normalizedHour = THREE.MathUtils.euclideanModulo(hour, 24);
    return ((normalizedHour - 6) / 24) * Math.PI * 2;
  }

  function applySun(angle: number): void {
    const radius = opts.worldSize * 0.8;
    const height = Math.max(0.15, Math.sin(angle)) * radius;
    const horiz = Math.cos(angle) * radius;
    sunLight.position.set(horiz, height, radius * 0.4);
    sunLight.target.position.set(0, 0, 0);

    // The fill light sits on the opposite side of the key light and a
    // little higher, so it lights the shadow face of buildings without
    // ever competing with the key for which side reads as "lit".
    fillLight.position.set(-horiz * 0.6, Math.max(height * 0.7, radius * 0.25), -radius * 0.5);

    // Soft day/night colour + intensity blend; never fully dark so the
    // diorama stays readable at night. `dayness` also has a raised floor
    // (0.55 rather than the previous 0.2) so dawn/dusk hours — and this
    // whole rig's fixed mid-morning default — sit well up the bright end
    // rather than near the dim one: a farm-builder should read as a bright
    // sunny afternoon by default, not a scene the player has to wait out.
    const dayness = THREE.MathUtils.clamp((Math.sin(angle) + 0.55) / 1.55, 0, 1);
    // three.js's modern physically-based light units read as noticeably
    // dimmer than the intuitive 0-2ish range this rig used to use — a
    // real headless capture at these numbers measured ground pixels at
    // roughly a third of the intended albedo's brightness even at a
    // decent mid-afternoon sun angle. These are calibrated up from an
    // actual rendered-pixel measurement rather than guessed, so the
    // ground reads as genuinely bright and sunny rather than merely "a
    // bit less dim".
    sunLight.intensity = THREE.MathUtils.lerp(2.0, 3.6, dayness);
    hemiLight.intensity = THREE.MathUtils.lerp(1.2, 1.7, dayness);
    fillLight.intensity = THREE.MathUtils.lerp(0.65, 1.0, dayness);
    const dayColor = new THREE.Color(0xffe6b0);
    const nightColor = new THREE.Color(0x7d93d1);
    sunLight.color.copy(nightColor).lerp(dayColor, dayness);
    const skyDay = new THREE.Color(0x7fd0ec);
    const skyNight = new THREE.Color(0x2c3a5e);
    const sky = skyNight.clone().lerp(skyDay, dayness);
    (scene.background as THREE.Color).copy(sky);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(sky);
  }

  applySun(FIXED_SUN_ANGLE);

  function update(nowMs: number): void {
    if (!dayNightEnabled) return;
    if (fixedTimeOfDay !== null) {
      applySun(angleForHour(fixedTimeOfDay));
      return;
    }
    // A full day/night cycle every 10 real-world minutes by default; this is
    // deliberately not tied to the *actual* wall clock time of day, since a
    // player who opens the game at 2am should still see a lively town.
    const cycleMs = 10 * 60 * 1000;
    const angle = (nowMs % cycleMs) / cycleMs * Math.PI * 2;
    applySun(angle);
  }

  function setDayNightEnabled(enabled: boolean): void {
    dayNightEnabled = enabled;
    if (!enabled) applySun(FIXED_SUN_ANGLE);
    else if (fixedTimeOfDay !== null) applySun(angleForHour(fixedTimeOfDay));
  }

  function setTimeOfDay(timeOfDay: number | null): void {
    fixedTimeOfDay = timeOfDay === null || !Number.isFinite(timeOfDay) ? null : timeOfDay;
    if (dayNightEnabled && fixedTimeOfDay !== null) applySun(angleForHour(fixedTimeOfDay));
  }

  function dispose(): void {
    groundGeo.dispose();
    groundMat.dispose();
    renderer.dispose();
  }

  return { scene, renderer, hemiLight, sunLight, ground, dispose, update, setDayNightEnabled, setTimeOfDay };
}
