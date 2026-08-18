/**
 * renderer.ts — the top-level entry point the UI package drives.
 *
 * `createRenderer()` owns the three.js scene, camera rig, instancing pools,
 * picking, placement ghost, and ambient villager wandering. It reads a
 * `GameStateView` snapshot on every `setState()` call and renders it — it
 * NEVER owns or mutates game state itself. Gameplay logic lives entirely in
 * `@meadowmark/shared` and whichever package drives this one.
 */

import * as THREE from 'three';
import { createScene, type SceneBundle } from './scene.js';
import { createCameraController, type CameraController } from './camera.js';
import { InstanceManager } from './instancing.js';
import { PickableSet, KeyboardCursor, pickGroundTile, type PickResult, type PickTarget } from './picking.js';
import { createPlacementController, type PlacementController } from './placement.js';
import { VillagerWanderSystem } from './villagers.js';
import { OccupancyGrid, footprintTiles, TILE_SIZE } from './grid.js';
import { requireAsset } from './mesh-dsl.js';
import { QualityController, type QualitySettings, type SpeedLevel } from './quality.js';
import type { GameStateView, TileCoord, RoadShape } from './state-view.js';

const ROAD_ASSET_BY_SHAPE: Record<RoadShape, string> = {
  straight: 'road_straight',
  corner: 'road_corner',
  junction: 'road_junction',
  end: 'road_end',
};

export type RendererEvent =
  | { type: 'pick'; result: PickResult }
  | { type: 'placementDrop'; footprint: { origin: TileCoord; width: number; depth: number; rotation: 0 | 1 | 2 | 3 } };

export type RendererEventHandler = (event: RendererEvent) => void;

export interface CreateRendererOptions {
  worldSize?: number;
  reducedMotion?: boolean;
  quality?: QualitySettings;
}

export interface RendererHandle {
  setState: (state: GameStateView) => void;
  resize: () => void;
  dispose: () => void;
  setQuality: (settings: Partial<QualitySettings>) => void;
  setSpeedLevel: (level: SpeedLevel) => void;
  setReducedMotion: (reduced: boolean) => void;
  on: (handler: RendererEventHandler) => () => void;
  camera: {
    snapToCorner: (corner: 0 | 1 | 2 | 3) => void;
    panBy: (dx: number, dz: number) => void;
    zoomBy: (delta: number) => void;
    rotateBy: (deltaYaw: number, deltaPitch: number) => void;
  };
  placement: {
    begin: (assetName: string, footprintWidth: number, footprintDepth: number) => void;
    moveTo: (tile: TileCoord) => boolean;
    rotate: () => void;
    drop: () => void;
    cancel: () => void;
  };
  keyboardCursor: {
    move: (dx: number, dy: number) => void;
    activate: () => void;
  };
}

export function createRenderer(canvas: HTMLCanvasElement, opts: CreateRendererOptions = {}): RendererHandle {
  const worldSize = opts.worldSize ?? 96;
  const sceneBundle: SceneBundle = createScene({
    canvas,
    worldSize,
    dayNight: { enabled: opts.quality?.dayNightEnabled ?? true },
  });

  const cameraController: CameraController = createCameraController({
    domElement: canvas,
    aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight),
  });
  cameraController.setReducedMotion(opts.reducedMotion ?? false);

  const worldGroup = new THREE.Group();
  worldGroup.name = 'meadowmark-world';
  sceneBundle.scene.add(worldGroup);

  const instances = new InstanceManager(worldGroup);
  const pickables = new PickableSet(worldGroup);
  const keyboardCursor = new KeyboardCursor(worldGroup);
  const occupancy = new OccupancyGrid();
  const placement: PlacementController = createPlacementController(worldGroup, occupancy);
  placement.setReducedMotion(opts.reducedMotion ?? false);
  const villagerSystem = new VillagerWanderSystem();

  const quality = new QualityController(opts.quality);
  sceneBundle.sunLight.shadow.mapSize.set(
    quality.getSettings().shadowMapResolution,
    quality.getSettings().shadowMapResolution,
  );
  sceneBundle.sunLight.shadow.map?.dispose();
  sceneBundle.sunLight.shadow.map = null;
  // WebGLRenderer has no readable/writable `antialias` property — it is a
  // context-creation flag baked in by `createScene()` at construction time,
  // not something that can be toggled after the fact. The desired value is
  // tracked in `quality`'s own state (read via `quality.getSettings().antialiasing`);
  // actually changing it at runtime would require recreating the renderer/canvas.
  instances.billboardDistance = quality.getSettings().lodDistance;

  const listeners = new Set<RendererEventHandler>();
  function emit(event: RendererEvent): void {
    for (const l of listeners) l(event);
  }

  const raycaster = new THREE.Raycaster();

  function onClick(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cameraController.camera);
    const result = pickables.raycast(raycaster);
    if (result) emit({ type: 'pick', result });
  }
  canvas.addEventListener('click', onClick);

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'ArrowUp' && e.shiftKey) keyboardCursor.move(0, -1);
    else if (e.code === 'ArrowDown' && e.shiftKey) keyboardCursor.move(0, 1);
    else if (e.code === 'ArrowLeft' && e.shiftKey) keyboardCursor.move(-1, 0);
    else if (e.code === 'ArrowRight' && e.shiftKey) keyboardCursor.move(1, 0);
    else if (e.code === 'Enter' || e.code === 'Space') keyboardCursor.activate();
    else if (e.code === 'KeyR') placement.rotate();
  }
  window.addEventListener('keydown', onKeyDown);

  const unsubKeyboardActivate = keyboardCursor.onActivate((tile) => {
    // A keyboard activation on an occupied pick target behaves like a click.
    const raysFromTile = new THREE.Raycaster();
    raysFromTile.set(
      new THREE.Vector3(tile.x * TILE_SIZE, 5, tile.y * TILE_SIZE),
      new THREE.Vector3(0, -1, 0),
    );
    const result = pickables.raycast(raysFromTile);
    if (result) emit({ type: 'pick', result });
  });

  // ---- static, non-gameplay decoration/building/road/crop/animal render --

  function syncWorld(state: GameStateView): void {
    occupancy.reset();

    const buildingsByAsset = new Map<string, { position: THREE.Vector3Like; rotationY: number }[]>();
    const buildingPickTargets: PickTarget[] = [];
    for (const b of state.buildings) {
      const asset = requireAsset(b.assetName); // throws loudly if unknown, per contract
      const list = buildingsByAsset.get(b.assetName) ?? [];
      list.push({
        position: { x: b.position.x * TILE_SIZE, y: 0, z: b.position.y * TILE_SIZE },
        rotationY: (Math.PI / 2) * b.rotation,
      });
      buildingsByAsset.set(b.assetName, list);

      const bb = asset.geometry.boundingBox;
      const halfWidth = bb ? Math.max(0.5, (bb.max.x - bb.min.x) / 2) : 0.6;
      const halfDepth = bb ? Math.max(0.5, (bb.max.z - bb.min.z) / 2) : 0.6;
      const height = bb ? bb.max.y - bb.min.y : 1.5;
      buildingPickTargets.push({ id: b.id, tile: b.position, halfWidth, halfDepth, height });
      occupancy.markOccupied(footprintTiles({
        origin: b.position,
        width: Math.max(1, Math.round(halfWidth * 2)),
        depth: Math.max(1, Math.round(halfDepth * 2)),
        rotation: b.rotation,
      }));
    }
    for (const [assetName, list] of buildingsByAsset) {
      instances.setInstances(assetName, list);
    }
    pickables.sync(buildingPickTargets);

    const cropsByAsset = new Map<string, { position: THREE.Vector3Like }[]>();
    for (const c of state.cropPlots) {
      const assetName = `crop_${c.cropKind}_${c.growthStage}`;
      const list = cropsByAsset.get(assetName) ?? [];
      list.push({ position: { x: c.position.x * TILE_SIZE, y: 0, z: c.position.y * TILE_SIZE } });
      cropsByAsset.set(assetName, list);
    }
    for (const [assetName, list] of cropsByAsset) instances.setInstances(assetName, list);

    const animalsByAsset = new Map<string, { position: THREE.Vector3Like; rotationY: number }[]>();
    for (const a of state.animals) {
      const assetName = `animal_${a.kind}`;
      const list = animalsByAsset.get(assetName) ?? [];
      list.push({ position: { x: a.position.x * TILE_SIZE, y: 0, z: a.position.y * TILE_SIZE }, rotationY: a.heading });
      animalsByAsset.set(assetName, list);
    }
    for (const [assetName, list] of animalsByAsset) instances.setInstances(assetName, list);

    const decorationsByAsset = new Map<string, { position: THREE.Vector3Like; rotationY: number }[]>();
    for (const d of state.decorations) {
      const list = decorationsByAsset.get(d.kind) ?? [];
      list.push({ position: { x: d.position.x * TILE_SIZE, y: 0, z: d.position.y * TILE_SIZE }, rotationY: (Math.PI / 2) * d.rotation });
      decorationsByAsset.set(d.kind, list);
    }
    for (const [assetName, list] of decorationsByAsset) instances.setInstances(assetName, list);

    const roadsByAsset = new Map<string, { position: THREE.Vector3Like; rotationY: number }[]>();
    const roadTiles: TileCoord[] = [];
    for (const r of state.roads) {
      const assetName = ROAD_ASSET_BY_SHAPE[r.shape];
      const list = roadsByAsset.get(assetName) ?? [];
      list.push({ position: { x: r.position.x * TILE_SIZE, y: 0, z: r.position.y * TILE_SIZE }, rotationY: (Math.PI / 2) * r.rotation });
      roadsByAsset.set(assetName, list);
      roadTiles.push(r.position);
    }
    for (const [assetName, list] of roadsByAsset) instances.setInstances(assetName, list);
    villagerSystem.setRoadTiles(roadTiles);

    sceneBundle.setDayNightEnabled(state.weather.timeOfDay >= 0);
  }

  function setState(state: GameStateView): void {
    syncWorld(state);
  }

  // ---- render loop ----

  let disposed = false;
  let lastTime = performance.now();

  function frame(now: number): void {
    if (disposed) return;
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    cameraController.update(dt);
    placement.update(dt);
    villagerSystem.update(dt);

    const villagerTransforms = villagerSystem.getTransformsByAsset();
    for (const [assetName, transforms] of villagerTransforms) {
      instances.setInstances(assetName, transforms);
    }

    const camDistance = cameraController.camera.position.length();
    instances.updateLOD(camDistance);

    sceneBundle.update(now);
    sceneBundle.renderer.render(sceneBundle.scene, cameraController.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function resize(): void {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    sceneBundle.renderer.setSize(width, height, false);
    cameraController.camera.aspect = width / height;
    cameraController.camera.updateProjectionMatrix();
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  function setQuality(settings: Partial<QualitySettings>): void {
    quality.setRaw(settings);
    const s = quality.getSettings();
    instances.billboardDistance = s.lodDistance;
    sceneBundle.setDayNightEnabled(s.dayNightEnabled);
  }

  function setSpeedLevel(level: SpeedLevel): void {
    quality.applySpeedLevel(level);
    setQuality(quality.getSettings());
  }

  function setReducedMotion(reduced: boolean): void {
    cameraController.setReducedMotion(reduced);
    placement.setReducedMotion(reduced);
  }

  function dispose(): void {
    disposed = true;
    resizeObserver.disconnect();
    canvas.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown);
    unsubKeyboardActivate();
    cameraController.dispose();
    instances.dispose();
    pickables.dispose();
    keyboardCursor.dispose();
    placement.dispose();
    sceneBundle.dispose();
    listeners.clear();
  }

  return {
    setState,
    resize,
    dispose,
    setQuality,
    setSpeedLevel,
    setReducedMotion,
    on: (handler) => {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    camera: {
      snapToCorner: cameraController.snapToCorner,
      panBy: cameraController.panBy,
      zoomBy: cameraController.zoomBy,
      rotateBy: cameraController.rotateBy,
    },
    placement: {
      begin: placement.begin,
      moveTo: placement.moveTo,
      rotate: placement.rotate,
      drop: () => {
        const footprint = placement.drop();
        if (footprint) emit({ type: 'placementDrop', footprint });
      },
      cancel: placement.cancel,
    },
    keyboardCursor: {
      move: (dx, dy) => keyboardCursor.move(dx, dy),
      activate: () => keyboardCursor.activate(),
    },
  };
}
