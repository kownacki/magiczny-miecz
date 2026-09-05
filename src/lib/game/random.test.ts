import { describe, expect, it } from "vitest";
import { scriptedRandom } from "@/lib/engine/ports";
import { replayable } from "./random";

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
