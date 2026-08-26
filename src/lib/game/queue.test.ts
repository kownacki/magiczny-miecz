import { describe, expect, it } from "vitest";
import { queued, serially } from "./queue";

/** Something that finishes when a test says so, so order can be forced. */
function held<T>() {
  let release!: (value: T) => void;
  let refuse!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    release = resolve;
    refuse = reject;
  });
  return { promise, release, refuse };
}

describe("one change to a table at a time", () => {
  it("runs work in the order it arrived, never overlapping", async () => {
    const order: string[] = [];
    const step = (name: string) => async () => {
      order.push(`${name} in`);
      await Promise.resolve();
      await Promise.resolve();
      order.push(`${name} out`);
    };

    await Promise.all([
      serially("g1", step("a")),
      serially("g1", step("b")),
      serially("g1", step("c")),
    ]);

    // Not just the right order — no "b in" between "a in" and "a out", which
    // is the whole point: two changes reading the same table at once is what
    // put two of them on the same journal line.
    expect(order).toEqual(["a in", "a out", "b in", "b out", "c in", "c out"]);
  });

  it("does not make one table wait for another", async () => {
    const first = held<void>();
    const order: string[] = [];

    const slow = serially("g1", async () => {
      await first.promise;
      order.push("g1");
    });
    await serially("g2", async () => {
      order.push("g2");
    });

    // g2 went while g1 was still holding, which a single global lock would not
    // have allowed and a table full of people would notice.
    expect(order).toEqual(["g2"]);
    first.release();
    await slow;
    expect(order).toEqual(["g2", "g1"]);
  });

  it("lets the next one through after the one before it was refused", async () => {
    const refused = serially("g1", async () => {
      throw new Error("nie twoja tura");
    });
    await expect(refused).rejects.toThrow("nie twoja tura");

    // Somebody else's refused move is not a reason to refuse ours — and a
    // rejection must not be handed forward down the chain either.
    await expect(serially("g1", async () => "done")).resolves.toBe("done");
  });

  it("hands back what the work returned, and what it threw", async () => {
    await expect(serially("g1", async () => 42)).resolves.toBe(42);
    await expect(
      serially("g1", async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
  });

  it("forgets a table once nothing is behind it", async () => {
    await serially("g-done", async () => {});
    // Waiting a turn: the chain drops itself once its own settling has run.
    await new Promise((wake) => setTimeout(wake, 0));
    expect(queued()).toBe(0);
  });
});
