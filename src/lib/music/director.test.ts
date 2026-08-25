import { describe, expect, it } from "vitest";
import { INITIAL, observe, pendingAt, type DirectorConfig } from "./director";

const HOLD: DirectorConfig = { hold: 30_000 };
const INSTANT: DirectorConfig = { hold: 0 };

describe("director", () => {
  it("starts the first zone it sees immediately", () => {
    const state = observe(INITIAL, "dolny", 1000, HOLD);
    expect(state.playing).toBe("dolny");
    expect(state.since).toBe(1000);
  });

  it("does nothing when the zone has not changed", () => {
    // The requirement in one test: two players in the same ring must not make
    // the music restart or fade. Same object back means the caller can drive
    // this from every render without checking anything itself.
    const first = observe(INITIAL, "dolny", 1000, HOLD);
    const second = observe(first, "dolny", 99_000, HOLD);
    expect(second).toBe(first);
    expect(pendingAt(second, HOLD)).toBeNull();
  });

  it("keeps playing when the zone is unknown", () => {
    // A refetch in flight must not drop the room into silence.
    const first = observe(INITIAL, "gorny", 0, HOLD);
    expect(observe(first, null, 60_000, HOLD)).toBe(first);
  });

  it("holds the room for the configured time before handing over", () => {
    const first = observe(INITIAL, "dolny", 0, HOLD);
    const during = observe(first, "gorny", 10_000, HOLD);
    expect(during.playing).toBe("dolny");
    expect(during.observed).toBe("gorny");
    expect(pendingAt(during, HOLD)).toBe(30_000);
  });

  it("hands over once the hold has expired", () => {
    const first = observe(INITIAL, "dolny", 0, HOLD);
    const during = observe(first, "gorny", 10_000, HOLD);
    const after = observe(during, "gorny", 30_000, HOLD);
    expect(after.playing).toBe("gorny");
    expect(after.since).toBe(30_000);
    expect(pendingAt(after, HOLD)).toBeNull();
  });

  it("cancels a pending switch when the zone comes back", () => {
    // Someone steps onto the bridge and straight back off. The room should
    // never have heard it.
    const first = observe(INITIAL, "dolny", 0, HOLD);
    const away = observe(first, "most", 5_000, HOLD);
    const back = observe(away, "dolny", 12_000, HOLD);
    expect(back.playing).toBe("dolny");
    expect(pendingAt(back, HOLD)).toBeNull();
    // ...and the hold still dates from when Dolny started, not from the return,
    // so a genuine change right after is not punished twice.
    expect(back.since).toBe(0);
  });

  it("switches instantly when the hold is zero", () => {
    const first = observe(INITIAL, "dolny", 0, INSTANT);
    const next = observe(first, "most", 1, INSTANT);
    expect(next.playing).toBe("most");
  });

  it("takes the newest zone when several pass during one hold", () => {
    const first = observe(INITIAL, "dolny", 0, HOLD);
    let state = observe(first, "most", 5_000, HOLD);
    state = observe(state, "gorny", 9_000, HOLD);
    expect(state.playing).toBe("dolny");
    state = observe(state, "gorny", 30_000, HOLD);
    expect(state.playing).toBe("gorny");
  });
});
