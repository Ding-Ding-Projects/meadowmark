/**
 * Wraps @meadowmark/engine's RendererHandle as the RendererBridge interface
 * @meadowmark/ui's town panel expects (see ui/src/contracts.ts).
 *
 * GAP: RendererHandle.placement (packages/engine/src/renderer.ts) exposes
 * begin/moveTo/rotate/drop/cancel, but moveTo() needs a hovered ground-tile
 * coordinate, and RendererHandle exposes no camera or raycaster accessor
 * for computing one from outside the engine package - its own pointer
 * handling only raycasts against already-placed pickable objects (see
 * renderer.ts's onClick), never against the ground plane for a
 * not-yet-placed ghost. So this bridge can begin/cancel placement and can
 * drop on click, but the placement ghost will not visually track the
 * cursor as it moves - moveTo() is never called. Fixing this properly
 * means @meadowmark/engine either exposing enough to raycast the ground
 * plane from outside, or driving placement.moveTo itself from its
 * existing pointer machinery and emitting a hover event. Reported here
 * rather than faked with a guessed tile coordinate.
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
  let placing = false;

  const unsubscribeDrop = renderer.on((event) => {
    if (event.type !== 'placementDrop' || !onPlacedCallback) return;
    const rotationDeg = ((event.footprint.rotation * 90) % 360) as 0 | 90 | 180 | 270;
    onPlacedCallback(event.footprint.origin.x, event.footprint.origin.y, rotationDeg);
    placing = false;
    onPlacedCallback = null;
  });

  function onCanvasClick(): void {
    if (placing) renderer.placement.drop();
  }
  canvas.addEventListener('click', onCanvasClick);

  function onKeyDown(e: KeyboardEvent): void {
    if (!placing) return;
    if (e.code === 'Escape') {
      renderer.placement.cancel();
      placing = false;
      onPlacedCallback = null;
    }
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
    },
    exitPlacementMode() {
      renderer.placement.cancel();
      placing = false;
      onPlacedCallback = null;
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
