/** Pulls the embedded raster images out of a PDF at their native resolution, without any external tooling. */

import zlib from "node:zlib";

/**
 * The scans are Photoshop-produced PDFs: one page, one full-bleed image, no
 * text layer. Rasterising the *page* (sips, Preview) resamples to the 72 DPI
 * MediaBox and throws away three quarters of the detail. Reading the image
 * XObject straight out of the file gives the original pixels instead — 2480 x
 * 3508 for a card sheet, which is what makes the card text legible enough to
 * transcribe.
 */
export function extractImages(buf) {
  const images = [];
  const haystack = buf.toString("latin1");
  // These are old Photoshop PDFs whose tokens are separated by bare CR, so
  // `stream` may be followed by CR alone — not just LF or CRLF.
  const re = /\/Subtype\s*\/Image([\s\S]{0,600}?)stream(?:\r\n|\r|\n)/g;
  let m;
  while ((m = re.exec(haystack)) !== null) {
    const dict = m[1];
    // These files write `/Length 11 0 R` — an indirect reference, not a byte
    // count. Reading that as the literal 11 truncates the stream to nothing,
    // so the lookahead rejects it. The `\\b` is load-bearing: without it the
    // engine backtracks `(\\d+)` down to a single digit, the lookahead then
    // sees a non-space and succeeds, and `/Length 11 0 R` silently yields 1.
    const num = (key) => {
      const hit = dict.match(new RegExp(`/${key}\\s+(\\d+)\\b(?!\\s+\\d+\\s+R)`));
      return hit ? Number(hit[1]) : null;
    };
    const width = num("Width");
    const height = num("Height");
    const length = num("Length");
    if (!width || !height) continue;

    const colorSpace = dict.match(/\/ColorSpace\s*\/(\w+)/)?.[1] ?? null;
    const filter = dict.match(/\/Filter\s*\/(\w+)/)?.[1] ?? null;
    const predictor = num("Predictor");
    // `/Colors` lives inside /DecodeParms and describes the *predictor's* idea
    // of the pixel stride, which is the authority here. Fall back to the
    // colour space, then to whatever the byte count implies.
    const colors =
      num("Colors") ??
      (colorSpace === "DeviceRGB" ? 3 : colorSpace === "DeviceGray" ? 1 : null);

    const start = m.index + m[0].length;
    let data = buf.subarray(start, length ? start + length : undefined);

    if (filter === "FlateDecode") {
      try {
        data = zlib.inflateSync(data);
      } catch {
        // Truncated /Length happens in these files; inflate what we can.
        data = zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
      }
    } else if (filter) {
      continue; // DCT/JPX would need a real decoder; none of these scans use one.
    }

    const comps = colors ?? (Math.round(data.length / (width * height)) || 1);
    if (predictor === 2) undoTiffPredictor(data, width, comps);

    images.push({ width, height, comps, data });
  }
  return images;
}

/**
 * TIFF horizontal differencing: every byte was stored as its difference from
 * the sample one pixel to the left, per channel. Undone in place, row by row.
 */
function undoTiffPredictor(data, width, comps) {
  const stride = width * comps;
  const rows = Math.floor(data.length / stride);
  for (let row = 0; row < rows; row++) {
    const base = row * stride;
    for (let i = comps; i < stride; i++) {
      data[base + i] = (data[base + i] + data[base + i - comps]) & 0xff;
    }
  }
}
