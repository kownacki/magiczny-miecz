/** Finds the card cells on a scanned sheet so slices need no hardcoded layout per sheet. */

/**
 * The sheets come in two printings. The event, spell and item sheets are a
 * tight grid sharing one cut line between neighbours; the character sheets are
 * colour, double-ruled, and separated by a blank gutter. Hardcoding offsets for
 * both would be forty-odd magic numbers that rot the moment a scan is
 * re-exported, so the rules are detected instead.
 *
 * The trick that covers both printings: find every dark line, take the gaps
 * between them as candidate cells, and keep only the gaps near the largest
 * size. Cards on one sheet are all the same size, so gutters, double-rule
 * slivers and the blank paper margin all fall away as too small.
 *
 * Returns `{ columns, rows }` as `[start, size]` pairs.
 */
export function detectCells(img, { darkness = 0.6, coverage = 0.8, keep = 0.7 } = {}) {
  return {
    columns: cellsFromLines(darkLines(img, "column", darkness, coverage), img.width, keep),
    rows: cellsFromLines(darkLines(img, "row", darkness, coverage), img.height, keep),
  };
}

function luminance(img, x, y) {
  const i = (y * img.width + x) * img.comps;
  if (img.comps === 1) return img.data[i];
  return (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
}

function darkLines(img, axis, darkness, coverage) {
  const along = axis === "column" ? img.height : img.width;
  const across = axis === "column" ? img.width : img.height;
  const threshold = 255 * darkness;
  // Every 4th pixel is plenty to tell a printed rule from a line that merely
  // crosses some artwork, and it keeps a full-sheet scan fast.
  const step = 4;
  const hits = [];
  for (let i = 0; i < across; i++) {
    let dark = 0;
    let total = 0;
    for (let j = 0; j < along; j += step) {
      const lum = axis === "column" ? luminance(img, i, j) : luminance(img, j, i);
      if (lum < threshold) dark++;
      total++;
    }
    if (dark / total >= coverage) hits.push(i);
  }
  return hits;
}

function cellsFromLines(hits, extent, keep) {
  if (hits.length === 0) return [[0, extent]];

  // A printed rule is several pixels thick, so hits arrive in runs; collapse
  // each run to its midpoint.
  const lines = [];
  let start = hits[0];
  let prev = hits[0];
  for (const hit of hits.slice(1)) {
    if (hit - prev > 3) {
      lines.push(Math.round((start + prev) / 2));
      start = hit;
    }
    prev = hit;
  }
  lines.push(Math.round((start + prev) / 2));

  // The outermost cards may be bounded by paper rather than by a rule.
  const bounds = [...lines];
  if (bounds[0] > extent * 0.05) bounds.unshift(0);
  if (bounds.at(-1) < extent * 0.95) bounds.push(extent);

  const gaps = bounds.slice(1).map((b, i) => [bounds[i], b - bounds[i]]);
  const largest = Math.max(...gaps.map(([, size]) => size));
  const cells = gaps.filter(([, size]) => size >= largest * keep);
  return padIntoGutters(cells, extent);
}

/**
 * Grows each cell halfway into the space separating it from its neighbours.
 *
 * On the character plates the detected cell is only the white body of the card:
 * the title bar sits above it and the rotated "Miecz 3" / "Magia 3" bands sit
 * beside it, all in the coloured surround that reads as a gap. Slicing the bare
 * cell silently drops the character's name and both of its starting stats.
 *
 * On the tightly-gridded sheets neighbouring cells already touch, so the gap is
 * zero and this is a no-op — which is why it can be applied unconditionally
 * instead of branching per sheet.
 */
function padIntoGutters(cells, extent) {
  if (cells.length < 2) return cells;
  const gutters = cells
    .slice(1)
    .map(([start], i) => start - (cells[i][0] + cells[i][1]))
    .filter((g) => g > 0);
  if (gutters.length === 0) return cells;
  const pad = Math.floor(median(gutters) / 2);

  return cells.map(([start, size]) => {
    const from = Math.max(0, start - pad);
    const to = Math.min(extent, start + size + pad);
    return [from, to - from];
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
