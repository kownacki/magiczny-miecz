import { describe, expect, it } from "vitest";
import { scriptedRandom } from "@/lib/engine/ports";
import { replayable, supplied } from "./random";

describe("supplied", () => {
  it("hands out what the table typed, in order", async () => {
    const port = supplied([4, 2], scriptedRandom([]));
    expect(await port.rollD6("first")).toBe(4);
    expect(await port.rollD6("second")).toBe(2);
  });

  /** The `value ?? roll` the store used to write out at every die. */
  it("falls through to the app for anything nobody typed", async () => {
    const port = supplied([null, 5, undefined], scriptedRandom([1, 6]));
    expect(await port.rollD6("app")).toBe(1);
    expect(await port.rollD6("typed")).toBe(5);
    expect(await port.rollD6("app again")).toBe(6);
  });

  it("refuses a number that is not a die", async () => {
    await expect(supplied([9], scriptedRandom([])).rollD6("bad")).rejects.toThrow(/od 1 do 6/);
  });
});

describe("replayable", () => {
  /**
   * The guarantee a retry needs.
   *
   * A losing commit is one nobody saw, so re-running the command is safe.
   * Re-rolling it would not be: a retry that turned a 6 into a 2 would be the
   * app deciding a fight on which attempt won the race.
   */
  it("throws the same dice again when a command is re-run", async () => {
    const log: number[] = [];
    const base = scriptedRandom([6, 3, 1]);

    const first = replayable(base, log);
    expect(await first.rollD6("a")).toBe(6);
    expect(await first.rollD6("b")).toBe(3);

    const retry = replayable(base, log);
    expect(await retry.rollD6("a")).toBe(6);
    expect(await retry.rollD6("b")).toBe(3);
    // Only a roll the first attempt never reached comes off the base port.
    expect(await retry.rollD6("c")).toBe(1);
  });

  it("does not spend the underlying port twice", async () => {
    const log: number[] = [];
    const base = scriptedRandom([2]);
    await replayable(base, log).rollD6("once");
    await replayable(base, log).rollD6("again");
    expect(log).toEqual([2]);
  });
});
