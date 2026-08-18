/**
 * Applies a user's editing decisions (crop, then fit, then background)
 * to a decoded source image, producing a single square canonical image
 * that the conversion pipeline then resamples down to every output
 * size. Fixed order, always: crop first (so fit/focal-point math works
 * in the cropped image's own coordinate space), then fit into the
 * canonical square, with background compositing folded into the fit
 * step so aspect-ratio and transparency decisions are applied together.
 */
import { PRESET_CANVAS_SIZE } from './presets';
import { applyFit, cropImage } from './image-ops';
import { InvalidEditParametersError } from './errors';
import type { LogoEditParams, RGBA8Image } from './types';

/** The fixed square size every edited logo is normalized to before size variants are derived. */
export const CANONICAL_SIZE = PRESET_CANVAS_SIZE;

export function applyLogoEdit(source: RGBA8Image, edits: LogoEditParams): RGBA8Image {
  if (!edits.background) {
    throw new InvalidEditParametersError('applyLogoEdit: a background color is required.');
  }

  const cropped = edits.crop ? cropImage(source, edits.crop) : source;
  return applyFit(cropped, edits.fit, CANONICAL_SIZE, CANONICAL_SIZE, edits.background, edits.focalPoint);
}
