/**
 * Wraps @meadowmark/engine's RendererHandle as the RendererBridge interface
 * @meadowmark/ui's town panel expects (see ui/src/contracts.ts).
 *
 * Placement itself (ghost tracking the cursor, grid snap, valid/invalid
 * tint, R to rotate, arrow keys, Enter, drop pop animation) is owned end to
 * end by @meadowmark/engine now - see packages/engine/src/renderer.ts and
 * placement.ts. This bridge only forwards begin/cancel, turns a mouse click
 * into a drop (the one placement input the engine cannot originate itself,
 * since it has no reason to assume every click on its canvas means "drop"),
 * and turns the engine's `placementDrop` event into the `onPlaced` callback
 * the town panel gave it. It also tracks its own `placing`/`onCancelled`
 * bookkeeping so `enterPlacementMode`'s `onCancel` fires correctly even
 * when Escape cancels placement at the engine level, where this bridge
 * cannot see it happen except by listening for the same key itself.
 *
 * GAP: focusCameraOnEntity/focusCameraOnTile have no real implementation
 * to call into - RendererHandle's camera controls are relative
 * (panBy/zoomBy/rotateBy/snapToCorner), not "look at this absolute world
 * position", so there is nothing to compute a jump from without a camera
 * accessor. Both are no-ops.
 *
 * GAP: highlightEntity has no matching capability on RendererHandle
 * (PickableSet has no exposed highlight/outline toggle) - also a no-op.
 */

import type { BuildingId, EntityId, RendererBridge } from '@meadowmark/ui';
import type { RendererHandle } from '@meadowmark/engine';
import { assetNameForBuildingType } from './state-to-engine.js';
import { buildingCatalogByType } from '../content.js';

export interface DisposableRendererBridge extends RendererBridge {
  dispose(): void;
}

export function createRendererBridge(canvas: HTMLCanvasElement, renderer: RendererHandle): DisposableRendererBridge {
  let onPlacedCallback: ((x: number, y: number, rotation: 0 | 90 | 180 | 270) => void) | null = null;
  let onCancelCallback: (() => void) | null = null;
  let placing = false;

  function endPlacement(): void {
    placing = false;
    onPlacedCallback = null;
    onCancelCallback = null;
  }

  const unsubscribeDrop = renderer.on((event) => {
    if (event.type !== 'placementDrop' || !onPlacedCallback) return;
    const rotationDeg = ((event.footprint.rotation * 90) % 360) as 0 | 90 | 180 | 270;
    const onPlaced = onPlacedCallback;
    endPlacement();
    onPlaced(event.footprint.origin.x, event.footprint.origin.y, rotationDeg);
  });

  function onCanvasClick(): void {
    // The engine's own click listener uses this same event to raycast
    // against already-placed pickables; that raycast is harmless here
    // since nothing is subscribed to the resulting 'pick' event while a
    // placement drop is what the click is actually for.
    if (placing) renderer.placement.drop();
  }
  canvas.addEventListener('click', onCanvasClick);

  function onKeyDown(e: KeyboardEvent): void {
    if (!placing || e.code !== 'Escape') return;
    // The engine already cancels its own ghost on Escape; this listener
    // exists so the bridge's own placing/callback bookkeeping - and the
    // caller's onCancel - stay in sync with that, since the engine has no
    // event to report a cancellation through.
    const onCancel = onCancelCallback;
    endPlacement();
    onCancel?.();
  }
  window.addEventListener('keydown', onKeyDown);

  return {
    enterPlacementMode(buildingId: BuildingId, onPlaced, onCancel) {
      const catalog = buildingCatalogByType[buildingId];
      if (!catalog) {
        onCancel();
        return;
      }
      const assetName = assetNameForBuildingType(buildingId);
      renderer.placement.begin(assetName, catalog.footprint.width, catalog.footprint.height);
      placing = true;
      onPlacedCallback = onPlaced;
      onCancelCallback = onCancel;
    },
    exitPlacementMode() {
      renderer.placement.cancel();
      endPlacement();
    },
    focusCameraOnEntity(_entityId: EntityId) {
      // no-op - see file header GAP note.
    },
    focusCameraOnTile(_x: number, _y: number) {
      // no-op - see file header GAP note.
    },
    highlightEntity(_entityId: EntityId | null) {
      // no-op - see file header GAP note.
    },
    setInteractionEnabled(enabled: boolean) {
      canvas.style.pointerEvents = enabled ? 'auto' : 'none';
    },
    dispose() {
      unsubscribeDrop();
      canvas.removeEventListener('click', onCanvasClick);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
