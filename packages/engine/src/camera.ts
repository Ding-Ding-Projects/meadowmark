/**
 * camera.ts — the tilt-shift diorama camera: a narrow-FOV perspective camera
 * on a hand-written orbit rig (no examples/ addon dependency).
 *
 * The narrow field of view (~20 degrees) placed far back is what gives the
 * miniature-diorama read while staying genuine 3D. The player gets full
 * freedom: drag to pan, wheel/pinch to zoom, right-drag or modifier-drag to
 * rotate and tilt — and every one of those actions also has a keyboard
 * equivalent, so the camera is never mouse-only.
 */

import * as THREE from 'three';

export interface CameraLimits {
  minDistance: number;
  maxDistance: number;
  minPitch: number; // radians
  maxPitch: number; // radians
  panBounds: number; // half-extent, in world units, from the pan target's origin
}

export const DEFAULT_LIMITS: CameraLimits = {
  minDistance: 6,
  maxDistance: 60,
  minPitch: THREE.MathUtils.degToRad(20),
  maxPitch: THREE.MathUtils.degToRad(75),
  panBounds: 40,
};

export interface CameraController {
  camera: THREE.PerspectiveCamera;
  update: (deltaSeconds: number) => void;
  dispose: () => void;
  /** Snap yaw to the nearest of the four corner presets, smoothly eased. */
  snapToCorner: (corner: 0 | 1 | 2 | 3) => void;
  setReducedMotion: (reduced: boolean) => void;
  panBy: (dx: number, dz: number) => void;
  zoomBy: (delta: number) => void;
  rotateBy: (deltaYaw: number, deltaPitch: number) => void;
}

export interface CreateCameraOptions {
  domElement: HTMLElement;
  aspect: number;
  limits?: Partial<CameraLimits>;
  fovDegrees?: number;
}

/** Keyboard bindings, exposed so the UI layer can render a legend for them. */
export const KEYBOARD_BINDINGS = {
  panForward: ['KeyW', 'ArrowUp'],
  panBackward: ['KeyS', 'ArrowDown'],
  panLeft: ['KeyA', 'ArrowLeft'],
  panRight: ['KeyD', 'ArrowRight'],
  rotateLeft: ['KeyQ'],
  rotateRight: ['KeyE'],
  tiltUp: ['KeyR'],
  tiltDown: ['KeyF'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
  snapCornerPrefix: 'Digit', // Digit1..Digit4 snap to the four corners
} as const;

export function createCameraController(opts: CreateCameraOptions): CameraController {
  const limits: CameraLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  const camera = new THREE.PerspectiveCamera(opts.fovDegrees ?? 20, opts.aspect, 0.5, 300);

  const target = new THREE.Vector3(0, 0, 0);
  let distance = (limits.minDistance + limits.maxDistance) / 3;
  let yaw = Math.PI * 0.25;
  let pitch = THREE.MathUtils.degToRad(45);

  // The values the camera eases toward; smooth easing gives the diorama a
  // gentle, weighted feel and is disabled entirely under reduced motion.
  let targetYaw = yaw;
  let targetPitch = pitch;
  let targetDistance = distance;
  const targetPos = target.clone();
  const desiredTargetPos = target.clone();

  let reducedMotion = false;
  const EASE = 10; // higher = snappier

  const el = opts.domElement;
  const pressed = new Set<string>();
  let dragging = false;
  let dragButton = 0;
  let lastX = 0;
  let lastY = 0;

  function clampAll(): void {
    targetDistance = THREE.MathUtils.clamp(targetDistance, limits.minDistance, limits.maxDistance);
    targetPitch = THREE.MathUtils.clamp(targetPitch, limits.minPitch, limits.maxPitch);
    desiredTargetPos.x = THREE.MathUtils.clamp(desiredTargetPos.x, -limits.panBounds, limits.panBounds);
    desiredTargetPos.z = THREE.MathUtils.clamp(desiredTargetPos.z, -limits.panBounds, limits.panBounds);
  }

  function panBy(dx: number, dz: number): void {
    // Pan relative to current yaw so "forward" always means "up-screen".
    const forward = new THREE.Vector3(Math.sin(targetYaw), 0, Math.cos(targetYaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    desiredTargetPos.addScaledVector(right, dx);
    desiredTargetPos.addScaledVector(forward, dz);
    clampAll();
  }

  function zoomBy(delta: number): void {
    targetDistance += delta;
    clampAll();
  }

  function rotateBy(deltaYaw: number, deltaPitch: number): void {
    targetYaw += deltaYaw;
    targetPitch += deltaPitch;
    clampAll();
  }

  function snapToCorner(corner: 0 | 1 | 2 | 3): void {
    targetYaw = (Math.PI / 2) * corner + Math.PI / 4;
    clampAll();
  }

  function onPointerDown(e: PointerEvent): void {
    dragging = true;
    dragButton = e.button;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    const rotating = dragButton === 2 || e.shiftKey || e.altKey;
    if (rotating) {
      rotateBy(-dx * 0.006, -dy * 0.005);
    } else {
      const panScale = targetDistance * 0.0018;
      panBy(-dx * panScale, dy * panScale);
    }
  }

  function onPointerUp(e: PointerEvent): void {
    dragging = false;
    el.releasePointerCapture(e.pointerId);
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    zoomBy(e.deltaY * 0.02);
  }

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
  }

  function onKeyDown(e: KeyboardEvent): void {
    pressed.add(e.code);
    if (e.code.startsWith(KEYBOARD_BINDINGS.snapCornerPrefix)) {
      const digit = Number(e.code.replace(KEYBOARD_BINDINGS.snapCornerPrefix, ''));
      if (digit >= 1 && digit <= 4) snapToCorner(((digit - 1) as 0 | 1 | 2 | 3));
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    pressed.delete(e.code);
  }

  el.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function applyKeyboard(dt: number): void {
    const panSpeed = targetDistance * 1.4 * dt;
    const rotateSpeed = 1.6 * dt;
    const zoomSpeed = (limits.maxDistance - limits.minDistance) * 0.6 * dt;

    let dx = 0;
    let dz = 0;
    if (KEYBOARD_BINDINGS.panForward.some((k) => pressed.has(k))) dz -= panSpeed;
    if (KEYBOARD_BINDINGS.panBackward.some((k) => pressed.has(k))) dz += panSpeed;
    if (KEYBOARD_BINDINGS.panLeft.some((k) => pressed.has(k))) dx -= panSpeed;
    if (KEYBOARD_BINDINGS.panRight.some((k) => pressed.has(k))) dx += panSpeed;
    if (dx !== 0 || dz !== 0) panBy(dx, dz);

    let dYaw = 0;
    if (KEYBOARD_BINDINGS.rotateLeft.some((k) => pressed.has(k))) dYaw -= rotateSpeed;
    if (KEYBOARD_BINDINGS.rotateRight.some((k) => pressed.has(k))) dYaw += rotateSpeed;
    let dPitch = 0;
    if (KEYBOARD_BINDINGS.tiltUp.some((k) => pressed.has(k))) dPitch += rotateSpeed * 0.6;
    if (KEYBOARD_BINDINGS.tiltDown.some((k) => pressed.has(k))) dPitch -= rotateSpeed * 0.6;
    if (dYaw !== 0 || dPitch !== 0) rotateBy(dYaw, dPitch);

    if (KEYBOARD_BINDINGS.zoomIn.some((k) => pressed.has(k))) zoomBy(-zoomSpeed);
    if (KEYBOARD_BINDINGS.zoomOut.some((k) => pressed.has(k))) zoomBy(zoomSpeed);
  }

  function update(deltaSeconds: number): void {
    applyKeyboard(deltaSeconds);

    const easeFactor = reducedMotion ? 1 : 1 - Math.exp(-EASE * deltaSeconds);
    yaw += (targetYaw - yaw) * easeFactor;
    pitch += (targetPitch - pitch) * easeFactor;
    distance += (targetDistance - distance) * easeFactor;
    targetPos.lerp(desiredTargetPos, easeFactor);

    const x = targetPos.x + distance * Math.sin(yaw) * Math.cos(pitch);
    const y = targetPos.y + distance * Math.sin(pitch);
    const z = targetPos.z + distance * Math.cos(yaw) * Math.cos(pitch);
    camera.position.set(x, y, z);
    camera.lookAt(targetPos);
  }

  function setReducedMotion(reduced: boolean): void {
    reducedMotion = reduced;
  }

  function dispose(): void {
    el.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  }

  clampAll();
  update(0);

  return { camera, update, dispose, snapToCorner, setReducedMotion, panBy, zoomBy, rotateBy };
}
