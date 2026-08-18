/**
 * Pixel-level editing operations on RGBA8 bitmaps: allocation, cropping,
 * resizing, the three fit modes (cover/contain/fill), background
 * compositing, and safe-area geometry. Pure functions throughout -- none
 * of these touch the filesystem or any external resource.
 */
import { InvalidEditParametersError } from './errors';
import type { CropRect, FitMode, NormalizedPoint, RGBA8Image, RGBAColor, SafeAreaRect } from './types';

export function createImage(width: number, height: number, fill: RGBAColor = { r: 0, g: 0, b: 0, a: 0 }): RGBA8Image {
  if (width <= 0 || height <= 0) {
    throw new InvalidEditParametersError('createImage: width and height must be positive.');
  }
  const data = Buffer.alloc(width * height * 4);
  if (fill.r !== 0 || fill.g !== 0 || fill.b !== 0 || fill.a !== 0) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill.r;
      data[i + 1] = fill.g;
      data[i + 2] = fill.b;
      data[i + 3] = fill.a;
    }
  }
  return { width, height, data };
}

/** Crops `src` to an exact integer pixel rectangle, fully contained within it. */
export function cropImage(src: RGBA8Image, rect: CropRect): RGBA8Image {
  const { x, y, width, height } = rect;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new InvalidEditParametersError('cropImage: crop rectangle must use integer pixel coordinates.');
  }
  if (width <= 0 || height <= 0) {
    throw new InvalidEditParametersError('cropImage: crop width and height must be positive.');
  }
  if (x < 0 || y < 0 || x + width > src.width || y + height > src.height) {
    throw new InvalidEditParametersError(
      `cropImage: rectangle (${x},${y},${width}x${height}) is outside the source image (${src.width}x${src.height}).`,
    );
  }

  const out = createImage(width, height);
  const srcStride = src.width * 4;
  const dstStride = width * 4;
  for (let row = 0; row < height; row += 1) {
    const srcOffset = (y + row) * srcStride + x * 4;
    const dstOffset = row * dstStride;
    src.data.copy(out.data, dstOffset, srcOffset, srcOffset + dstStride);
  }
  return out;
}

/**
 * Resizes `src` to exactly `dstWidth`x`dstHeight` using bilinear
 * interpolation performed in premultiplied-alpha space, then
 * un-premultiplied on the way out. Sampling in premultiplied space is
 * what stops fully-transparent source pixels (whose RGB is often
 * meaningless garbage) from bleeding a dark halo into the resized edges
 * of translucent artwork.
 */
export function resizeBilinear(src: RGBA8Image, dstWidth: number, dstHeight: number): RGBA8Image {
  if (dstWidth <= 0 || dstHeight <= 0) {
    throw new InvalidEditParametersError('resizeBilinear: target dimensions must be positive.');
  }
  if (dstWidth === src.width && dstHeight === src.height) {
    return { width: src.width, height: src.height, data: Buffer.from(src.data) };
  }

  const out = createImage(dstWidth, dstHeight);
  const scaleX = src.width / dstWidth;
  const scaleY = src.height / dstHeight;

  const sample = (sx: number, sy: number): [number, number, number, number] => {
    const cx = Math.min(Math.max(sx, 0), src.width - 1);
    const cy = Math.min(Math.max(sy, 0), src.height - 1);
    const idx = (cy * src.width + cx) * 4;
    const alpha = src.data[idx + 3] as number;
    const scale = alpha / 255;
    return [
      (src.data[idx] as number) * scale,
      (src.data[idx + 1] as number) * scale,
      (src.data[idx + 2] as number) * scale,
      alpha,
    ];
  };

  for (let dy = 0; dy < dstHeight; dy += 1) {
    const srcY = (dy + 0.5) * scaleY - 0.5;
    const y0 = Math.floor(srcY);
    const fy = srcY - y0;

    for (let dx = 0; dx < dstWidth; dx += 1) {
      const srcX = (dx + 0.5) * scaleX - 0.5;
      const x0 = Math.floor(srcX);
      const fx = srcX - x0;

      const [r00, g00, b00, a00] = sample(x0, y0);
      const [r10, g10, b10, a10] = sample(x0 + 1, y0);
      const [r01, g01, b01, a01] = sample(x0, y0 + 1);
      const [r11, g11, b11, a11] = sample(x0 + 1, y0 + 1);

      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const premulR = lerp(lerp(r00, r10, fx), lerp(r01, r11, fx), fy);
      const premulG = lerp(lerp(g00, g10, fx), lerp(g01, g11, fx), fy);
      const premulB = lerp(lerp(b00, b10, fx), lerp(b01, b11, fx), fy);
      const alpha = lerp(lerp(a00, a10, fx), lerp(a01, a11, fx), fy);

      const outIdx = (dy * dstWidth + dx) * 4;
      const outAlpha = Math.round(Math.min(255, Math.max(0, alpha)));
      if (outAlpha === 0) {
        out.data[outIdx] = 0;
        out.data[outIdx + 1] = 0;
        out.data[outIdx + 2] = 0;
        out.data[outIdx + 3] = 0;
      } else {
        const unscale = 255 / alpha;
        out.data[outIdx] = Math.round(Math.min(255, Math.max(0, premulR * unscale)));
        out.data[outIdx + 1] = Math.round(Math.min(255, Math.max(0, premulG * unscale)));
        out.data[outIdx + 2] = Math.round(Math.min(255, Math.max(0, premulB * unscale)));
        out.data[outIdx + 3] = outAlpha;
      }
    }
  }

  return out;
}

/** Alpha-composites `src` over an opaque or translucent solid `background` ("over" operator). */
export function compositeOnBackground(src: RGBA8Image, background: RGBAColor): RGBA8Image {
  const out = createImage(src.width, src.height);
  const bgA = background.a / 255;
  for (let i = 0; i < src.data.length; i += 4) {
    const srcA = (src.data[i + 3] as number) / 255;
    const outA = srcA + bgA * (1 - srcA);
    if (outA <= 0) {
      out.data[i] = 0;
      out.data[i + 1] = 0;
      out.data[i + 2] = 0;
      out.data[i + 3] = 0;
      continue;
    }
    const blend = (srcChannel: number, bgChannel: number) =>
      Math.round((srcChannel * srcA + bgChannel * bgA * (1 - srcA)) / outA);
    out.data[i] = blend(src.data[i] as number, background.r);
    out.data[i + 1] = blend(src.data[i + 1] as number, background.g);
    out.data[i + 2] = blend(src.data[i + 2] as number, background.b);
    out.data[i + 3] = Math.round(outA * 255);
  }
  return out;
}

function clampFocal(focal: NormalizedPoint | undefined): NormalizedPoint {
  const x = focal?.x ?? 0.5;
  const y = focal?.y ?? 0.5;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

/** Scales to fully cover the destination, cropping overflow around the focal point. */
export function fitCover(
  src: RGBA8Image,
  dstWidth: number,
  dstHeight: number,
  focalPoint?: NormalizedPoint,
): RGBA8Image {
  const focal = clampFocal(focalPoint);
  const scale = Math.max(dstWidth / src.width, dstHeight / src.height);
  const scaledWidth = Math.max(1, Math.round(src.width * scale));
  const scaledHeight = Math.max(1, Math.round(src.height * scale));
  const scaled = resizeBilinear(src, scaledWidth, scaledHeight);

  const maxX = scaledWidth - dstWidth;
  const maxY = scaledHeight - dstHeight;
  const cropX = Math.min(Math.max(Math.round(focal.x * scaledWidth - dstWidth / 2), 0), Math.max(maxX, 0));
  const cropY = Math.min(Math.max(Math.round(focal.y * scaledHeight - dstHeight / 2), 0), Math.max(maxY, 0));

  return cropImage(scaled, {
    x: cropX,
    y: cropY,
    width: Math.min(dstWidth, scaledWidth),
    height: Math.min(dstHeight, scaledHeight),
  });
}

/** Scales to fit entirely within the destination, letterboxing with `background`. */
export function fitContain(src: RGBA8Image, dstWidth: number, dstHeight: number, background: RGBAColor): RGBA8Image {
  const scale = Math.min(dstWidth / src.width, dstHeight / src.height);
  const scaledWidth = Math.max(1, Math.round(src.width * scale));
  const scaledHeight = Math.max(1, Math.round(src.height * scale));
  const scaled = resizeBilinear(src, scaledWidth, scaledHeight);

  const canvas = createImage(dstWidth, dstHeight, background);
  const offsetX = Math.round((dstWidth - scaledWidth) / 2);
  const offsetY = Math.round((dstHeight - scaledHeight) / 2);

  const scaledStride = scaledWidth * 4;
  for (let row = 0; row < scaledHeight; row += 1) {
    const dstRow = offsetY + row;
    if (dstRow < 0 || dstRow >= dstHeight) continue;
    // Composite this row of the scaled image over the background rather than
    // overwriting it, so translucent source pixels still blend correctly.
    for (let col = 0; col < scaledWidth; col += 1) {
      const dstCol = offsetX + col;
      if (dstCol < 0 || dstCol >= dstWidth) continue;
      const srcIdx = row * scaledStride + col * 4;
      const dstIdx = (dstRow * dstWidth + dstCol) * 4;
      const srcA = (scaled.data[srcIdx + 3] as number) / 255;
      const bgR = canvas.data[dstIdx] as number;
      const bgG = canvas.data[dstIdx + 1] as number;
      const bgB = canvas.data[dstIdx + 2] as number;
      const bgA = (canvas.data[dstIdx + 3] as number) / 255;
      const outA = srcA + bgA * (1 - srcA);
      if (outA <= 0) continue;
      const blend = (s: number, b: number) => Math.round((s * srcA + b * bgA * (1 - srcA)) / outA);
      canvas.data[dstIdx] = blend(scaled.data[srcIdx] as number, bgR);
      canvas.data[dstIdx + 1] = blend(scaled.data[srcIdx + 1] as number, bgG);
      canvas.data[dstIdx + 2] = blend(scaled.data[srcIdx + 2] as number, bgB);
      canvas.data[dstIdx + 3] = Math.round(outA * 255);
    }
  }

  return canvas;
}

/** Non-uniform stretch to exactly fill the destination, ignoring aspect ratio. */
export function fitFill(src: RGBA8Image, dstWidth: number, dstHeight: number): RGBA8Image {
  return resizeBilinear(src, dstWidth, dstHeight);
}

export function applyFit(
  src: RGBA8Image,
  mode: FitMode,
  dstWidth: number,
  dstHeight: number,
  background: RGBAColor,
  focalPoint?: NormalizedPoint,
): RGBA8Image {
  switch (mode) {
    case 'cover':
      return fitCover(src, dstWidth, dstHeight, focalPoint);
    case 'contain':
      return fitContain(src, dstWidth, dstHeight, background);
    case 'fill':
      return fitFill(src, dstWidth, dstHeight);
    default: {
      const exhaustive: never = mode;
      throw new InvalidEditParametersError(`applyFit: unknown fit mode ${String(exhaustive)}.`);
    }
  }
}

/**
 * Computes a centered "safe area" rectangle: the region within which
 * important artwork should stay so it is not clipped when the app
 * renders this logo inside a circular or otherwise inset mask (a
 * taskbar badge, a rounded tile, etc.). Geometry only -- the caller's UI
 * is responsible for drawing the overlay this describes.
 */
export function computeSafeArea(width: number, height: number, marginRatio = 0.12): SafeAreaRect {
  if (marginRatio < 0 || marginRatio >= 0.5) {
    throw new InvalidEditParametersError('computeSafeArea: marginRatio must be within [0, 0.5).');
  }
  const marginX = Math.round(width * marginRatio);
  const marginY = Math.round(height * marginRatio);
  return {
    x: marginX,
    y: marginY,
    width: Math.max(1, width - marginX * 2),
    height: Math.max(1, height - marginY * 2),
  };
}
