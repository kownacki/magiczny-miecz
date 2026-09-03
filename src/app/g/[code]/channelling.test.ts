import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  beginChannelling,
  cancelChannelling,
  channelled,
  CHANNEL_MS,
  watchChannelling,
} from "./channelling";

/**
 * The window before an irreversible decision is sent.
 *
 * Everything worth pinning here is timing rather than markup: that two
 * decisions can never be in flight at once, that a cancel leaves nothing
 * behind, and — the one that is genuinely a race — that a cancel arriving in
 * the same tick as the deadline does not send anyway.
 */
describe("channelling", () => {
  beforeEach(() => {
    cancelChannelling();
    vi.useFakeTimers();
  });

  it("holds the decision back until the window is up", () => {
    const send = vi.fn();
    beginChannelling("a", send);

    expect(channelled()?.id).toBe("a");
    vi.advanceTimersByTime(CHANNEL_MS - 1);
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("lets go of the button before the request goes, never after", () => {
    // „Anuluj" must be gone the instant the action is. If the record were
    // cleared after `send`, there would be a frame in which a player could
    // press a cancel that no longer worked.
    const order: string[] = [];
    watchChannelling(() => order.push(channelled() === null ? "released" : "held"));
    beginChannelling("a", () => order.push("sent"));

    vi.advanceTimersByTime(CHANNEL_MS);
    expect(order).toEqual(["held", "released", "sent"]);
  });

  it("sends nothing when it is cancelled", () => {
    const send = vi.fn();
    beginChannelling("a", send);
    cancelChannelling();

    expect(channelled()).toBeNull();
    vi.advanceTimersByTime(CHANNEL_MS * 2);
    expect(send).not.toHaveBeenCalled();
  });

  it("takes one decision at a time, and the first one keeps the window", () => {
    // The other buttons are disabled while one fills, so this should be
    // unreachable from the UI — but „unreachable" is what the second decision
    // in flight always is until it happens.
    const first = vi.fn();
    const second = vi.fn();
    beginChannelling("a", first);
    beginChannelling("b", second);

    expect(channelled()?.id).toBe("a");
    vi.advanceTimersByTime(CHANNEL_MS);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("does not send the cancelled one when a new decision starts in the same tick", () => {
    // `clearTimeout` cannot unfire a callback the runtime has already queued,
    // so the record the timer was scheduled for is what says whether it counts.
    const dropped = vi.fn();
    const kept = vi.fn();
    beginChannelling("a", dropped);
    vi.advanceTimersByTime(CHANNEL_MS - 1);

    cancelChannelling();
    beginChannelling("b", kept);
    vi.advanceTimersByTime(1);

    expect(dropped).not.toHaveBeenCalled();
    expect(channelled()?.id).toBe("b");

    vi.advanceTimersByTime(CHANNEL_MS);
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it("tells watchers on both edges, and stops when they let go", () => {
    const seen: (string | null)[] = [];
    const stop = watchChannelling(() => seen.push(channelled()?.id ?? null));

    beginChannelling("a", () => {});
    cancelChannelling();
    stop();
    beginChannelling("b", () => {});

    expect(seen).toEqual(["a", null]);
  });

  it("agrees with itself about when the window opened", () => {
    const at = channelled();
    expect(at).toBeNull();
    beginChannelling("a", () => {});
    const held = channelled();
    expect(held).not.toBeNull();
    expect(Date.now() - held!.startedAt).toBeLessThan(CHANNEL_MS);
  });
});
