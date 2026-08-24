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

/** `comps` is 1 for greyscale or 3 for RGB; anything else is not produced by these scans. */
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
  ihdr[9] = comps === 3 ? 2 : 0;
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
