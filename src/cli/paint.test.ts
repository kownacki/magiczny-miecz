import { describe, expect, it } from "vitest";
import { paintFor } from "./paint";

/**
 * The two ways styling turns itself off, and why they matter more here than in
 * most programs: `npm run soak` plays a whole game through this prompt and
 * every test that touches it feeds it stdin. An escape code that leaks into a
 * pipe is four characters of noise in the middle of a sentence somebody is
 * trying to read as data.
 */

describe("styling, and when there is none", () => {
  it("styles when a terminal is on the other end", () => {
    const paint = paintFor(true, {});
    expect(paint.italic("Kowi idzie na Karczmę.")).toBe(
      "\x1b[3mKowi idzie na Karczmę.\x1b[23m",
    );
    // 23 rather than 0, so this cannot switch off styling somebody else set.
    expect(paint.italic("x")).not.toContain("\x1b[0m");
  });

  it("says nothing at all into a pipe", () => {
    for (const tty of [false, undefined]) {
      expect(paintFor(tty, {}).italic("x")).toBe("x");
      expect(paintFor(tty, {}).dim("x")).toBe("x");
    }
  });

  it("honours NO_COLOR, which is about styling and not only colour", () => {
    expect(paintFor(true, { NO_COLOR: "1" }).italic("x")).toBe("x");
    // Empty means unset, by that convention — no-color.org.
    expect(paintFor(true, { NO_COLOR: "" }).italic("x")).toContain("\x1b[3m");
  });

  it("says nothing to a terminal that has told us it is dumb", () => {
    expect(paintFor(true, { TERM: "dumb" }).italic("x")).toBe("x");
  });
});
