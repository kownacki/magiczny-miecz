import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIELDS, type FieldId } from "@/lib/engine/board";
import boxes from "./field-text-boxes.json";
import cells from "./field-cells.json";
import windows from "./field-art-windows.json";
import parchment from "../../public/parchment/index.json";

/**
 * Three files say where things are on the board scan, and all three are only
 * useful if they cover every Obszar.
 *
 * They are hand-measured and cheap to get 56 out of 57 right — the one that gets
 * missed is the one nobody looks at, and the failure is silent: a dialog with no
 * picture, or a survey with a hole in its ranking. `FieldId` is a literal union,
 * so the compiler already stops a *misspelled* id; what it cannot see is an id
 * that is simply absent, or one that was left behind by a rename.
 */
const IDS = [...FIELDS.keys()].sort();

const BOARD = { width: 4916, height: 6798 };

describe("every field is measured on the board scan", () => {
  it.each([
    ["text boxes", boxes.boxes],
    ["cells", cells.cells],
    ["art windows", windows.windows],
  ])("%s", (_what, rows: { id: string }[]) => {
    expect(rows.map((row) => row.id).sort()).toEqual(IDS);
  });
});

describe("the measurements are on the board", () => {
  it("puts every text box inside the scan", () => {
    const off = boxes.boxes.filter(
      (box) =>
        box.cx < 0 || box.cy < 0 || box.cx > BOARD.width || box.cy > BOARD.height || box.w <= 0 || box.h <= 0,
    );
    expect(off.map((box) => box.id)).toEqual([]);
  });

  /**
   * The window is the largest rectangle of a cell with no parchment in it, so a
   * window that has escaped its cell is measuring somebody else's square. It is
   * the one error in that survey a reader could not see by looking at the
   * picture, because the picture would be perfectly good artwork.
   */
  it("keeps every art window inside its own cell", () => {
    const cellById = new Map(cells.cells.map((cell) => [cell.id as FieldId, cell]));
    const escaped = windows.windows.filter((win) => {
      const cell = cellById.get(win.id as FieldId)!;
      return (
        win.x < cell.x0 || win.y < cell.y0 || win.x + win.w > cell.x1 || win.y + win.h > cell.y1
      );
    });
    expect(escaped.map((win) => win.id)).toEqual([]);
  });
});

/**
 * The parchment library is committed for the same reason `public/cards` is: a
 * fresh checkout has no scans and must still be able to draw one.
 *
 * The height check is the whole point of the library rather than a tidiness
 * check. Every piece is cut where its torn contour crosses the baseline on the
 * way out, so any end butts against any other without a step — and that only
 * holds if every run puts its baseline on the same row, which it only does if
 * they are all the same height. A run of another height is a run that cannot be
 * shuffled with the rest, which makes it worse than no run at all.
 */
describe("the parchment library", () => {
  it("has a file behind every piece it lists", () => {
    const missing = parchment.pieces.filter(
      (piece) => !existsSync(join("public/parchment", piece.file)),
    );
    expect(missing.map((piece) => piece.file)).toEqual([]);
  });

  it("cuts every straight run to one height, so any two can be butted", () => {
    const runs = parchment.pieces.filter((piece) => piece.kind === "run");
    expect(runs.length).toBeGreaterThan(0);
    const heights = [...new Set(runs.map((run) => run.height))];
    expect(heights).toEqual([parchment.baseline.out + parchment.baseline.paper]);
  });

  it("has a paper sample to fill the middle with", () => {
    expect(existsSync("public/parchment/paper.png")).toBe(true);
  });
});
