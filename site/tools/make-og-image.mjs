#!/usr/bin/env node
/* Meadowmark site — Open Graph raster generator.
 *
 * Discord/Slack/iMessage/Twitter-X do not render SVG for link-embed
 * og:image (verified live: the SVG returned 200 with the right
 * content-type and every embed still showed no picture). This script
 * writes a real 1200x630 8-bit RGBA PNG with the same composition as
 * og-image.svg — sky gradient, low-poly farm/town skyline, crop rows,
 * wordmark and tagline — using no image library at all: pixels are
 * composed by hand into a raw RGBA buffer, then encoded to PNG with
 * node:zlib for the DEFLATE/IDAT stream and a hand-rolled CRC32/chunk
 * writer for the container. og-image.svg remains the editable master;
 * this script (and its checked-in output, og-image.png) is how that
 * master gets turned into something a crawler will actually display.
 *
 * IMPORTANT — cache-busting note for whoever edits the image next:
 * Discord and friends cache a fetched og:image aggressively BY URL. A
 * future redesign of this picture should ship under a NEW filename
 * (e.g. og-image-2.png) and update every og:image tag to match, rather
 * than overwriting og-image.png in place — overwriting in place means
 * chat apps that already cached the old picture keep showing it
 * indefinitely, with no way for a visitor to force a refresh.
 *
 * Run: node site/tools/make-og-image.mjs
 * (regenerates site/og-image.png from the drawing code below)
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WIDTH = 1200;
const HEIGHT = 630;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "og-image.png");

// ---------------------------------------------------------------------
// Tiny RGBA framebuffer + rasterisation primitives (rects + triangles).
// No antialiasing beyond what falls out of simple scanline fill.
// ---------------------------------------------------------------------

function makeCanvas(w, h) {
  const px = new Uint8Array(w * h * 4);
  return { w, h, px };
}

function hex(c) {
  const n = parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function setPixel(cv, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  const i = (y * cv.w + x) * 4;
  if (a >= 255) {
    cv.px[i] = r; cv.px[i + 1] = g; cv.px[i + 2] = b; cv.px[i + 3] = 255;
    return;
  }
  // simple over-blend against whatever is already there
  const ia = 255 - a;
  cv.px[i] = (r * a + cv.px[i] * ia) / 255;
  cv.px[i + 1] = (g * a + cv.px[i + 1] * ia) / 255;
  cv.px[i + 2] = (b * a + cv.px[i + 2] * ia) / 255;
  cv.px[i + 3] = 255;
}

function fillRect(cv, x0, y0, w, h, color) {
  const [r, g, b] = hex(color);
  const x1 = Math.min(cv.w, x0 + w), y1 = Math.min(cv.h, y0 + h);
  for (let y = Math.max(0, y0); y < y1; y++) {
    for (let x = Math.max(0, x0); x < x1; x++) setPixel(cv, x, y, r, g, b);
  }
}

// Vertical gradient between two hex colours across the whole canvas height.
function fillVerticalGradient(cv, topHex, bottomHex) {
  const [r0, g0, b0] = hex(topHex);
  const [r1, g1, b1] = hex(bottomHex);
  for (let y = 0; y < cv.h; y++) {
    const t = y / (cv.h - 1);
    const r = Math.round(r0 + (r1 - r0) * t);
    const g = Math.round(g0 + (g1 - g0) * t);
    const b = Math.round(b0 + (b1 - b0) * t);
    for (let x = 0; x < cv.w; x++) setPixel(cv, x, y, r, g, b);
  }
}

// Filled triangle via a plain scanline half-space rasteriser.
function fillTriangle(cv, x0, y0, x1, y1, x2, y2, color) {
  const [r, g, b] = hex(color);
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(cv.h - 1, Math.ceil(Math.max(y0, y1, y2)));
  const edge = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const area = edge(x0, y0, x1, y1, x2, y2);
  if (area === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = Math.max(0, Math.floor(Math.min(x0, x1, x2))); x <= Math.min(cv.w - 1, Math.ceil(Math.max(x0, x1, x2))); x++) {
      const w0 = edge(x1, y1, x2, y2, x + 0.5, y + 0.5);
      const w1 = edge(x2, y2, x0, y0, x + 0.5, y + 0.5);
      const w2 = edge(x0, y0, x1, y1, x + 0.5, y + 0.5);
      const inside = (w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0);
      if (inside) setPixel(cv, x, y, r, g, b);
    }
  }
}

// ---------------------------------------------------------------------
// A tiny built-in 5x7 bitmap font (A-Z, 0-9, space, hyphen, apostrophe).
// Rendered upper-case only — a logotype reads fine in caps, and it
// keeps the glyph table small. Each glyph is 5 columns x 7 rows, 1 = lit.
// ---------------------------------------------------------------------

const FONT = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "'": ["01000", "01000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  0: ["01110", "10011", "10101", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

function drawText(cv, text, x, y, scale, color) {
  const [r, g, b] = hex(color);
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] || FONT[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "1") {
          fillRect(cv, cx + col * scale, y + row * scale, scale, scale, `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`);
        }
      }
    }
    cx += 6 * scale;
  }
  return cx - x; // total width drawn
}

function textWidth(text, scale) {
  return text.length * 6 * scale - scale;
}

function drawTextCentered(cv, text, centerX, y, scale, color) {
  const w = textWidth(text, scale);
  drawText(cv, text, Math.round(centerX - w / 2), y, scale, color);
}

// ---------------------------------------------------------------------
// Compose the Meadowmark og:image — same shapes as og-image.svg.
// ---------------------------------------------------------------------

function compose() {
  const cv = makeCanvas(WIDTH, HEIGHT);

  // Sky gradient, matching the SVG's <linearGradient id="sky">.
  fillVerticalGradient(cv, "#cdeccb", "#f7fbf1");

  // Ground band, then the lighter strip on top of it (same order as the SVG).
  fillRect(cv, 0, 470, 1200, 160, "#3a6b3f");
  fillRect(cv, 0, 440, 1200, 40, "#4d8a53");

  // Low-poly skyline: body rectangle + triangular roof per building.
  const buildings = [
    { x: 80, y: 380, w: 120, h: 90, roof: "#c99a3a", body: "#8a6d1f" },   // barn, left
    { x: 260, y: 400, w: 90, h: 70, roof: "#5b93a8", body: "#3d6373" },   // dock building
    { x: 400, y: 420, w: 70, h: 50, roof: "#c99a3a", body: "#8a6d1f" },   // small house
    { x: 950, y: 410, w: 100, h: 60, roof: "#5aa15f", body: "#3a6b3f" },  // town hall, right
    { x: 1080, y: 430, w: 60, h: 40, roof: "#c99a3a", body: "#8a6d1f" },  // small house, right
  ];
  for (const b of buildings) {
    fillRect(cv, b.x, b.y, b.w, b.h, b.body);
    fillTriangle(cv, b.x - 5, b.y, b.x + b.w / 2, b.y - b.h * 0.55, b.x + b.w + 5, b.y, b.roof);
  }

  // Crop rows — eight little squares, two rows of four, matching the SVG.
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      fillRect(cv, 540 + col * 34, 440 + row * 34, 24, 24, "#5aa15f");
    }
  }

  // Wordmark + tagline.
  drawTextCentered(cv, "MEADOWMARK", WIDTH / 2, 150, 11, "#191d17");
  drawTextCentered(cv, "A 3D TOWN-AND-FARM BUILDING GAME FOR WINDOWS", WIDTH / 2, 250, 3, "#3a6b3f");
  drawTextCentered(cv, "NOTHING HERE IS EVER FOR SALE", WIDTH / 2, 285, 3, "#42493f");

  return cv;
}

// ---------------------------------------------------------------------
// Minimal PNG encoder: IHDR + IDAT (zlib-deflated, filter type 0 per
// scanline) + IEND, each chunk length-prefixed and CRC32-checked.
// ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(cv) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(cv.w, 0);
  ihdrData.writeUInt32BE(cv.h, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // colour type 6 = RGBA
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  // Raw scanlines: one filter-type byte (0 = None) then w*4 RGBA bytes, per row.
  const stride = cv.w * 4;
  const raw = Buffer.alloc((stride + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type 0
    raw.set(cv.px.subarray(y * stride, y * stride + stride), rowStart + 1);
  }
  const idatData = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdrData),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const canvas = compose();
const png = encodePng(canvas);
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${png.length} bytes, ${WIDTH}x${HEIGHT})`);
