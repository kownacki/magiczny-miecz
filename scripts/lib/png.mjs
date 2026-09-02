/** Minimal PNG encoder and cropper, so the asset pipeline needs no image library. */

import zlib from "node:zlib";

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([head, typed, crc]);
}

/**
 * `comps` is 1 for greyscale, 3 for RGB or 4 for RGBA.
 *
 * The scans themselves are all RGB — there is no transparency anywhere in the
 * box. The fourth channel is here because the parchment scraps are cut *out* of
 * the painting along a torn contour, and a torn edge on an opaque rectangle is
 * just a picture of a torn edge with the neighbouring field's artwork still
 * attached to it.
 */
export function encodePng({ width, height, comps, data }) {
  const stride = width * comps;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = { 1: 0, 3: 2, 4: 6 }[comps];
  if (ihdr[9] === undefined) throw new Error(`cannot encode ${comps} components`);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function cropImage(img, x, y, w, h) {
  const { width, comps, data } = img;
  const out = Buffer.alloc(w * h * comps);
  for (let j = 0; j < h; j++) {
    const from = ((y + j) * width + x) * comps;
    data.copy(out, j * w * comps, from, from + w * comps);
  }
  return { width: w, height: h, comps, data: out };
}

/**
 * True when a cell carries no printed content. Sheets are not always full — the
 * character plates leave a blank band under the last row, and the final sheet
 * of a deck can be short — so slices are checked for ink rather than trusted to
 * be cards just because the grid had room for them.
 */
export function isBlank(img, { darkness = 0.75, minInk = 0.002 } = {}) {
  const { width, height, comps, data } = img;
  const threshold = 255 * darkness;
  let ink = 0;
  let seen = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * comps;
      const lum =
        comps === 1
          ? data[i]
          : (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      if (lum < threshold) ink++;
      seen++;
    }
  }
  return seen === 0 || ink / seen < minInk;
}

/**
 * Decodes an 8-bit non-interlaced PNG into the same `{width, height, comps, data}`
 * shape the rest of this pipeline passes around.
 *
 * The pipeline normally never needs this — images arrive as raw XObjects straight
 * out of the PDFs, already decompressed. The board is the exception: it is only
 * kept as a PNG, and deriving the map geometry means reading its printed grid
 * lines back out. Supports colour types 0 (grey), 2 (RGB), 4 (grey+alpha) and 6
 * (RGBA); the scans are all type 2, the others are here so a surprise fails
 * loudly rather than silently misreading.
 */
export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");

  let width = 0;
  let height = 0;
  let comps = 0;
  const idat = [];

  for (let at = 8; at < buffer.length; ) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString("latin1", at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colourType = body[9];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (body[12] !== 0) throw new Error("interlaced PNGs are not supported");
      comps = { 0: 1, 2: 3, 4: 2, 6: 4 }[colourType];
      if (!comps) throw new Error(`unsupported colour type ${colourType}`);
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * comps;
  const data = Buffer.alloc(stride * height);

  // Un-filter in place, row by row. Each row is prefixed with its filter byte and
  // refers back to the row above, so this cannot be parallelised or skipped.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    const to = y * stride;
    const up = (y - 1) * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[from + i];
      const a = i >= comps ? data[to + i - comps] : 0;
      const b = y > 0 ? data[up + i] : 0;
      const c = y > 0 && i >= comps ? data[up + i - comps] : 0;
      let value;
      if (filter === 0) value = x;
      else if (filter === 1) value = x + a;
      else if (filter === 2) value = x + b;
      else if (filter === 3) value = x + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`unknown filter ${filter} on row ${y}`);
      data[to + i] = value & 0xff;
    }
  }

  return { width, height, comps, data };
}
