import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  name.copy(header, 4);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([header, data, checksum]);
}

function parseHex(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid logo color ${value}.`);
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16), 255];
}

function colorName(primitive) {
  return primitive.fill ?? primitive.stroke;
}

export function validateDesign(design) {
  if (design.schemaVersion !== 1 || design.generationId !== "meadowmark-v1" || design.canvas !== 512) throw new Error("Unsupported Meadowmark logo definition.");
  for (const name of ["skyTop", "skyBottom", "sun", "rearMeadow", "frontMeadow", "path", "deepGreen"]) parseHex(design.palette[name]);
  if (design.tile.inset !== 20 || design.tile.radius !== 112 || design.tile.border !== 22) throw new Error("The Meadowmark logo tile geometry is incomplete.");
  if (!Array.isArray(design.primitives) || design.primitives.length !== 9) throw new Error("The Meadowmark logo primitive inventory is incomplete.");
  const allowed = new Set(["verticalGradient", "circle", "polygon", "line", "ellipse", "roundedRectStroke"]);
  for (const primitive of design.primitives) {
    if (!allowed.has(primitive.type)) throw new Error(`Unsupported logo primitive ${primitive.type}.`);
    if (primitive.type === "verticalGradient") {
      if (!design.palette[primitive.top] || !design.palette[primitive.bottom]) throw new Error("Gradient references an unknown palette color.");
    } else if (!design.palette[colorName(primitive)]) throw new Error(`${primitive.type} references an unknown palette color.`);
  }
  return design;
}

function svgPrimitive(primitive) {
  if (primitive.type === "verticalGradient") return '<rect x="20" y="20" width="472" height="472" fill="url(#sky)"/>';
  if (primitive.type === "circle") return `<circle cx="${primitive.cx}" cy="${primitive.cy}" r="${primitive.radius}" fill="${primitive.fill}"/>`;
  if (primitive.type === "polygon") return `<polygon points="${primitive.points.map((point) => point.join(",")).join(" ")}" fill="${primitive.fill}"/>`;
  if (primitive.type === "line") return `<line x1="${primitive.x1}" y1="${primitive.y1}" x2="${primitive.x2}" y2="${primitive.y2}" stroke="${primitive.stroke}" stroke-width="${primitive.width}" stroke-linecap="round"/>`;
  if (primitive.type === "ellipse") return `<ellipse cx="${primitive.cx}" cy="${primitive.cy}" rx="${primitive.rx}" ry="${primitive.ry}" transform="rotate(${primitive.rotation} ${primitive.cx} ${primitive.cy})" fill="${primitive.fill}"/>`;
  if (primitive.type === "roundedRectStroke") return `<rect x="${primitive.x}" y="${primitive.y}" width="${primitive.size}" height="${primitive.size}" rx="${primitive.radius}" fill="none" stroke="${primitive.stroke}" stroke-width="${primitive.width}"/>`;
  throw new Error(`Cannot render ${primitive.type}.`);
}

export function renderSvg(rawDesign) {
  const design = validateDesign(rawDesign);
  const primitives = design.primitives.map((primitive) => {
    const resolved = { ...primitive };
    if (resolved.fill) resolved.fill = design.palette[resolved.fill];
    if (resolved.stroke) resolved.stroke = design.palette[resolved.stroke];
    return `    ${svgPrimitive(resolved)}`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title description" data-generation-id="${design.generationId}">
  <title id="title">${design.title}</title>
  <description id="description">${design.description}</description>
  <defs>
    <clipPath id="tile"><rect x="20" y="20" width="472" height="472" rx="112"/></clipPath>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${design.palette.skyTop}"/><stop offset="1" stop-color="${design.palette.skyBottom}"/></linearGradient>
  </defs>
  <g clip-path="url(#tile)">
${primitives.join("\n")}
  </g>
</svg>
`;
}

function insideRounded(x, y, left, top, size, radius) {
  const right = left + size;
  const bottom = top + size;
  if (x < left || x > right || y < top || y > bottom) return false;
  const cornerX = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cornerY = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  return Math.hypot(x - cornerX, y - cornerY) <= radius;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insidePrimitive(x, y, primitive) {
  if (primitive.type === "verticalGradient") return true;
  if (primitive.type === "circle") return Math.hypot(x - primitive.cx, y - primitive.cy) <= primitive.radius;
  if (primitive.type === "polygon") return insidePolygon(x, y, primitive.points);
  if (primitive.type === "ellipse") {
    const angle = (-primitive.rotation * Math.PI) / 180;
    const dx = x - primitive.cx;
    const dy = y - primitive.cy;
    const rotatedX = dx * Math.cos(angle) - dy * Math.sin(angle);
    const rotatedY = dx * Math.sin(angle) + dy * Math.cos(angle);
    return (rotatedX / primitive.rx) ** 2 + (rotatedY / primitive.ry) ** 2 <= 1;
  }
  if (primitive.type === "line") {
    const dx = primitive.x2 - primitive.x1;
    const dy = primitive.y2 - primitive.y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - primitive.x1) * dx + (y - primitive.y1) * dy) / lengthSquared));
    return Math.hypot(x - (primitive.x1 + t * dx), y - (primitive.y1 + t * dy)) <= primitive.width / 2;
  }
  if (primitive.type === "roundedRectStroke") {
    const half = primitive.width / 2;
    const outer = insideRounded(x, y, primitive.x - half, primitive.y - half, primitive.size + primitive.width, primitive.radius + half);
    const inner = insideRounded(x, y, primitive.x + half, primitive.y + half, primitive.size - primitive.width, primitive.radius - half);
    return outer && !inner;
  }
  return false;
}

function colorAt(x, y, design, colors) {
  const { inset, radius } = design.tile;
  if (!insideRounded(x, y, inset, inset, design.canvas - inset * 2, radius)) return [0, 0, 0, 0];
  let color = [0, 0, 0, 0];
  for (const primitive of design.primitives) {
    if (!insidePrimitive(x, y, primitive)) continue;
    if (primitive.type === "verticalGradient") {
      const mix = Math.max(0, Math.min(1, (y - inset) / (design.canvas - inset * 2)));
      const top = colors[primitive.top];
      const bottom = colors[primitive.bottom];
      color = [0, 1, 2].map((channel) => Math.round(top[channel] + (bottom[channel] - top[channel]) * mix));
      color.push(255);
    } else color = colors[colorName(primitive)];
  }
  return color;
}

function renderRgba(size, design) {
  const samples = size <= 32 ? 4 : 2;
  const colors = Object.fromEntries(Object.entries(design.palette).map(([name, value]) => [name, parseHex(value)]));
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const sample = colorAt(((x + (sx + 0.5) / samples) / size) * design.canvas, ((y + (sy + 0.5) / samples) / size) * design.canvas, design, colors);
          const alpha = sample[3] / 255;
          for (let channel = 0; channel < 3; channel += 1) sums[channel] += sample[channel] * alpha;
          sums[3] += alpha;
        }
      }
      const count = samples * samples;
      const offset = (y * size + x) * 4;
      if (sums[3] > 0) for (let channel = 0; channel < 3; channel += 1) pixels[offset + channel] = Math.round(sums[channel] / sums[3]);
      pixels[offset + 3] = Math.round((sums[3] / count) * 255);
    }
  }
  return pixels;
}

function encodePng(size, design) {
  const rgba = renderRgba(size, design);
  const rows = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (1 + size * 4);
    rows[rowOffset] = 0;
    rgba.copy(rows, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

export function generateIco(sizes, rawDesign) {
  const design = validateDesign(rawDesign);
  const images = sizes.map((size) => ({ size, png: encodePng(size, design) }));
  const directorySize = 6 + images.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = directorySize;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

function inspectPng(image, expectedSize, index) {
  if (!image.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`ICO entry ${index} is not PNG encoded.`);
  let offset = 8;
  let width;
  let height;
  let ended = false;
  const compressed = [];
  while (offset < image.length) {
    if (offset + 12 > image.length) throw new Error(`ICO entry ${index} has a truncated PNG chunk.`);
    const length = image.readUInt32BE(offset);
    const type = image.subarray(offset + 4, offset + 8);
    const data = image.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = image.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([type, data])) !== expectedCrc) throw new Error(`ICO entry ${index} has a PNG CRC mismatch.`);
    const name = type.toString("ascii");
    if (name === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error(`ICO entry ${index} is not RGBA8 PNG.`);
    } else if (name === "IDAT") compressed.push(data);
    else if (name === "IEND") ended = true;
    offset += 12 + length;
  }
  if (!ended || width !== expectedSize || height !== expectedSize || compressed.length < 1) throw new Error(`ICO entry ${index} PNG structure is incomplete.`);
  const rows = inflateSync(Buffer.concat(compressed));
  if (rows.length !== height * (1 + width * 4)) throw new Error(`ICO entry ${index} decompressed size is invalid.`);
  let opaque = 0;
  let transparent = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    if (rows[row] !== 0) throw new Error(`ICO entry ${index} uses an unexpected PNG filter.`);
    for (let x = 0; x < width; x += 1) {
      const alpha = rows[row + 1 + x * 4 + 3];
      if (alpha === 255) opaque += 1;
      if (alpha === 0) transparent += 1;
    }
  }
  if (opaque < width * height * 0.45 || transparent < 1) throw new Error(`ICO entry ${index} has invalid alpha coverage.`);
}

export function inspectIco(buffer) {
  if (buffer.length < 22 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) throw new Error("Invalid ICO header.");
  const count = buffer.readUInt16LE(4);
  if (count < 1 || buffer.length < 6 + count * 16) throw new Error("Invalid ICO directory.");
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = buffer[entry] || 256;
    const height = buffer[entry + 1] || 256;
    const planes = buffer.readUInt16LE(entry + 4);
    const bitCount = buffer.readUInt16LE(entry + 6);
    const length = buffer.readUInt32LE(entry + 8);
    const offset = buffer.readUInt32LE(entry + 12);
    if (width !== height || planes !== 1 || bitCount !== 32 || offset + length > buffer.length) throw new Error(`Invalid ICO entry ${index}.`);
    inspectPng(buffer.subarray(offset, offset + length), width, index);
    entries.push({ width, height, bitCount, length, offset });
  }
  return entries;
}
