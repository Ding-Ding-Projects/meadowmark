/**
 * scene.ts — the three.js scene root: renderer, lighting rig, fog, and a
 * subtle day/night cycle driven by the real local clock (toggleable off).
 */

import * as THREE from 'three';

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
}

export interface CreateSceneOptions {
  canvas: HTMLCanvasElement;
  worldSize: number;
  dayNight?: DayNightOptions;
  antialias?: boolean;
  shadowMapSize?: number;
}

const FIXED_SUN_ANGLE = Math.PI * 0.35; // a fixed pleasant mid-morning elevation

export function createScene(opts: CreateSceneOptions): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3ea);
  scene.fog = new THREE.Fog(0xbfe3ea, opts.worldSize * 0.9, opts.worldSize * 2.4);

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

  const hemiLight = new THREE.HemisphereLight(0xdfefff, 0x4a3c2a, 0.9);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff3d6, 1.4);
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
  sunLight.shadow.bias = -0.0015;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const groundGeo = new THREE.PlaneGeometry(opts.worldSize, opts.worldSize);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x6fae52, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  let dayNightEnabled = opts.dayNight?.enabled ?? true;

  function applySun(angle: number): void {
    const radius = opts.worldSize * 0.8;
    const height = Math.max(0.15, Math.sin(angle)) * radius;
    const horiz = Math.cos(angle) * radius;
    sunLight.position.set(horiz, height, radius * 0.4);
    sunLight.target.position.set(0, 0, 0);

    // Soft day/night colour + intensity blend; never fully dark so the
    // diorama stays readable at night.
    const dayness = THREE.MathUtils.clamp((Math.sin(angle) + 0.15) / 1.15, 0, 1);
    sunLight.intensity = THREE.MathUtils.lerp(0.15, 1.4, dayness);
    hemiLight.intensity = THREE.MathUtils.lerp(0.35, 0.9, dayness);
    const dayColor = new THREE.Color(0xfff3d6);
    const nightColor = new THREE.Color(0x8fa3d6);
    sunLight.color.copy(nightColor).lerp(dayColor, dayness);
    const skyDay = new THREE.Color(0xbfe3ea);
    const skyNight = new THREE.Color(0x1b2440);
    const sky = skyNight.clone().lerp(skyDay, dayness);
    (scene.background as THREE.Color).copy(sky);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(sky);
  }

  applySun(FIXED_SUN_ANGLE);

  function update(nowMs: number): void {
    if (!dayNightEnabled) return;
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
  }

  function dispose(): void {
    groundGeo.dispose();
    groundMat.dispose();
    renderer.dispose();
  }

  return { scene, renderer, hemiLight, sunLight, ground, dispose, update, setDayNightEnabled };
}
