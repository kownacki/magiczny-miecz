import { describe, expect, it } from "vitest";
import { CrossfadePlayer, fadeCurve, type MusicHandle, type MusicPort } from "./player";

interface Fake {
  port: MusicPort;
  loaded: string[];
  live: () => string[];
  run: () => void;
  fades: Array<{ url: string; gain: number }>;
}

/** A port that records instead of making noise, and runs timers when told to. */
function fakePort(): Fake {
  const loaded: string[] = [];
  const stopped = new Set<string>();
  const fades: Array<{ url: string; gain: number }> = [];
  let timers: Array<() => void> = [];

  const port: MusicPort = {
    load(url) {
      loaded.push(url);
      const handle: MusicHandle = {
        start: () => Promise.resolve(),
        fade: (gain) => void fades.push({ url, gain }),
        stop: () => void stopped.add(url),
      };
      return handle;
    },
    schedule(ms, fn) {
      timers.push(fn);
      return () => {
        timers = timers.filter((timer) => timer !== fn);
      };
    },
  };

  return {
    port,
    loaded,
    fades,
    live: () => loaded.filter((url) => !stopped.has(url)),
    run: () => {
      const due = timers;
      timers = [];
      for (const timer of due) timer();
    },
  };
}

describe("crossfade player", () => {
  it("fades the new track in and the old one out", () => {
    const fake = fakePort();
    const player = new CrossfadePlayer(fake.port, { fade: 2 });

    player.play("/music/a.m4a");
    expect(fake.fades).toEqual([{ url: "/music/a.m4a", gain: 1 }]);

    player.play("/music/b.m4a");
    expect(fake.fades).toEqual([
      { url: "/music/a.m4a", gain: 1 },
      { url: "/music/a.m4a", gain: 0 },
      { url: "/music/b.m4a", gain: 1 },
    ]);
    expect(player.playing).toBe("/music/b.m4a");
  });

  it("ignores a request for the track already playing", () => {
    // The same-zone requirement, at the other end of the system: even if the
    // caller re-asks on every render, nothing restarts.
    const fake = fakePort();
    const player = new CrossfadePlayer(fake.port, { fade: 2 });
    player.play("/music/a.m4a");
    player.play("/music/a.m4a");
    player.play("/music/a.m4a");
    expect(fake.loaded).toEqual(["/music/a.m4a"]);
    expect(fake.fades).toHaveLength(1);
  });

  it("releases the outgoing track once its fade is over", () => {
    const fake = fakePort();
    const player = new CrossfadePlayer(fake.port, { fade: 2 });
    player.play("/music/a.m4a");
    player.play("/music/b.m4a");
    expect(fake.live()).toEqual(["/music/a.m4a", "/music/b.m4a"]);
    fake.run();
    expect(fake.live()).toEqual(["/music/b.m4a"]);
  });

  it("keeps hold of every track when changes arrive mid-fade", () => {
    // Three zones inside one crossfade. Nothing may be left playing with no
    // reference to it — that is a track that never stops.
    const fake = fakePort();
    const player = new CrossfadePlayer(fake.port, { fade: 5 });
    player.play("/music/a.m4a");
    player.play("/music/b.m4a");
    player.play("/music/c.m4a");
    fake.run();
    expect(fake.live()).toEqual(["/music/c.m4a"]);
  });

  it("fades to silence when asked for nothing", () => {
    const fake = fakePort();
    const player = new CrossfadePlayer(fake.port, { fade: 2 });
    player.play("/music/a.m4a");
    player.play(null);
    expect(player.playing).toBeNull();
    fake.run();
    expect(fake.live()).toEqual([]);
  });

  it("retunes the fade without disturbing what is playing", () => {
    // Changing fade length must not rebuild anything: the caller passes options
    // as a fresh object literal every render, and rebuilding would restart the
    // music every time a slider moved.
    const fake = fakePort();
    const player = new CrossfadePlayer(fake.port, { fade: 2 });
    player.play("/music/a.m4a");
    player.setOptions({ fade: 6 });
    expect(player.playing).toBe("/music/a.m4a");
    expect(fake.loaded).toEqual(["/music/a.m4a"]);
    player.play("/music/b.m4a");
    expect(fake.live()).toEqual(["/music/a.m4a", "/music/b.m4a"]);
  });

  it("stops everything on stop, including tracks still fading", () => {
    const fake = fakePort();
    const player = new CrossfadePlayer(fake.port, { fade: 5 });
    player.play("/music/a.m4a");
    player.play("/music/b.m4a");
    player.stop();
    expect(fake.live()).toEqual([]);
  });
});

describe("fade curve", () => {
  it("holds power constant across a crossfade", () => {
    // The reason this is not a linear ramp: at the midpoint a linear pair sums
    // to 0.5 power and the room audibly dips. These must sum to 1 throughout.
    const rising = fadeCurve(0, 1, 33);
    const falling = fadeCurve(1, 0, 33);
    for (let at = 0; at < rising.length; at += 1) {
      expect(rising[at] ** 2 + falling[at] ** 2).toBeCloseTo(1, 5);
    }
  });

  it("starts and ends exactly where asked", () => {
    const curve = fadeCurve(0, 1, 16);
    expect(curve[0]).toBeCloseTo(0, 6);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 6);
  });

  it("interpolates from a part-way gain, for a fade that interrupts a fade", () => {
    const curve = fadeCurve(0.5, 1, 16);
    expect(curve[0]).toBeCloseTo(0.5, 6);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 6);
    for (let at = 1; at < curve.length; at += 1) {
      expect(curve[at]).toBeGreaterThanOrEqual(curve[at - 1]);
    }
  });
});
