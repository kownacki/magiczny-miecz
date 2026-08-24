import { describe, expect, it } from "vitest";
import { BRIDGE_ENTRANCES, DOLNY_KRAG, KAMIENNY_MOST } from "./board";
import { GORNY_KRAG, SRODKOWY_KRAG } from "./rings";
import {
  BRIDGE_LINKS,
  CELLS,
  CELL_BY_ID,
  DOLNY_SIDES,
  GORNY_SIDES,
  SRODKOWY_SIDES,
  VIEW,
  clockwise,
  dotPositions,
} from "./boardMap";

/**
 * The map is the second, independent reading of the board.
 *
 * The ring arrays were derived by walking the scan edge by edge; the side lists
 * in boardMap were derived by looking at the whole board at once and writing
 * down which fields sit on which side. Two readings that agree is the closest
 * thing to verification available without the physical board in hand — so these
 * tests exist to make them disagree loudly if either is ever edited alone.
 */
describe("map sides against the ring arrays", () => {
  const laps = [
    ["Górny", clockwise(GORNY_SIDES), GORNY_KRAG],
    ["Środkowy", clockwise(SRODKOWY_SIDES), SRODKOWY_KRAG],
    ["Dolny", clockwise(DOLNY_SIDES), DOLNY_KRAG],
  ] as const;

  it.each(laps)("%s: one clockwise lap is the ring in order", (_name, lap, ring) => {
    const ids = ring.map((field) => field.id);
    // Same cycle AND same direction: the sides are written clockwise, so a ring
    // stored counter-clockwise fails here rather than quietly inverting every
    // direction the app offers.
    const start = ids.indexOf(lap[0]);
    expect(start, `${lap[0]} is not in the ring`).toBeGreaterThanOrEqual(0);
    expect(lap).toEqual(ids.slice(start).concat(ids.slice(0, start)));
  });

  it("gives every field on the board exactly one cell", () => {
    const all = [...GORNY_KRAG, ...SRODKOWY_KRAG, ...DOLNY_KRAG, ...KAMIENNY_MOST];
    expect(CELLS).toHaveLength(all.length);
    for (const field of all) {
      expect(CELL_BY_ID.get(field.id), field.id).toBeDefined();
    }
  });

  it("keeps the outer ring outside the middle one, and the middle outside the lower", () => {
    // A ring drawn inside the one it should enclose means the side lists and the
    // rectangles have come apart.
    const spread = (ids: readonly { id: string }[]) => {
      const cells = ids.map((f) => CELL_BY_ID.get(f.id)!);
      return Math.min(...cells.map((c) => c.x));
    };
    expect(spread(GORNY_KRAG)).toBeLessThan(spread(SRODKOWY_KRAG));
    expect(spread(SRODKOWY_KRAG)).toBeLessThan(spread(DOLNY_KRAG));
  });

  it("keeps every cell on the canvas", () => {
    for (const cell of CELLS) {
      expect(cell.x, cell.id).toBeGreaterThanOrEqual(0);
      expect(cell.y, cell.id).toBeGreaterThanOrEqual(0);
      expect(cell.x + cell.w, cell.id).toBeLessThanOrEqual(VIEW.width + 0.001);
      expect(cell.y + cell.h, cell.id).toBeLessThanOrEqual(VIEW.height + 0.001);
    }
  });

  it("does not overlap two cells of the same ring", () => {
    for (const ring of [GORNY_KRAG, SRODKOWY_KRAG, DOLNY_KRAG]) {
      const cells = ring.map((f) => CELL_BY_ID.get(f.id)!);
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i];
          const b = cells[j];
          const overlap =
            a.x < b.x + b.w - 1 &&
            b.x < a.x + a.w - 1 &&
            a.y < b.y + b.h - 1 &&
            b.y < a.y + a.h - 1;
          expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
        }
      }
    }
  });
});

describe("player dots", () => {
  const cell = CELL_BY_ID.get("karczma")!;

  it("puts a lone character under the field's name, not over it", () => {
    const [only] = dotPositions(cell, 1);
    expect(only.x).toBe(cell.cx);
    expect(only.y).toBeGreaterThan(cell.cy);
  });

  it("fans a crowd out so no two characters sit on top of each other", () => {
    // Six is the table maximum and they really can all end up on one field.
    const spots = dotPositions(cell, 6);
    expect(spots).toHaveLength(6);
    const seen = new Set(spots.map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)}`));
    expect(seen.size).toBe(6);
  });

  it("keeps a crowd inside its field", () => {
    for (const count of [2, 3, 4, 5, 6]) {
      for (const spot of dotPositions(cell, count)) {
        expect(spot.x).toBeGreaterThanOrEqual(cell.x);
        expect(spot.x).toBeLessThanOrEqual(cell.x + cell.w);
        expect(spot.y).toBeGreaterThanOrEqual(cell.y);
        expect(spot.y).toBeLessThanOrEqual(cell.y + cell.h);
      }
    }
  });
});

describe("the two ways onto the Kamienny Most (11.9)", () => {
  it("sends each entrance to the end of the bridge it actually touches", () => {
    // The bridge runs the length of the board and each entrance sits at one
    // end of it. Crossing the wires here would walk a character the whole
    // length of the bridge past the wrong creatures, while everything else
    // about the move still looked correct.
    for (const entrance of BRIDGE_ENTRANCES) {
      const from = CELL_BY_ID.get(entrance.from)!;
      const lands = CELL_BY_ID.get(entrance.entersAt)!;
      const ends = [
        CELL_BY_ID.get(KAMIENNY_MOST[0].id)!,
        CELL_BY_ID.get(KAMIENNY_MOST[KAMIENNY_MOST.length - 1].id)!,
      ];
      const nearest = ends.reduce((best, end) =>
        Math.abs(end.cy - from.cy) < Math.abs(best.cy - from.cy) ? end : best,
      );
      expect(lands.id, `${entrance.from} enters at the far end`).toBe(nearest.id);
    }
  });

  it("puts the two entrances at opposite ends", () => {
    const [a, b] = BRIDGE_ENTRANCES;
    expect(a.entersAt).not.toBe(b.entersAt);
    expect(a.stat).not.toBe(b.stat);
  });

  it("draws a link for each entrance", () => {
    expect(BRIDGE_LINKS.map((l) => `${l.from}->${l.to}`).sort()).toEqual(
      BRIDGE_ENTRANCES.map((e) => `${e.from}->${e.entersAt}`).sort(),
    );
  });
});
