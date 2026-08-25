/** Crossfades between two looping tracks, through a port so the fading is testable without a browser. */

/** One looping piece of music, already loaded and sitting silent. */
export interface MusicHandle {
  /**
   * Begins playback, still at whatever gain it was left at.
   *
   * Rejects if the browser has not been unlocked by a user gesture yet. The
   * player treats that as "not now" rather than an error — the track stays
   * loaded and the next attempt after a tap succeeds.
   */
  start(): Promise<void>;
  /** Equal-power ramp to `gain` (0..1) over `seconds`. */
  fade(gain: number, seconds: number): void;
  /** Stops playback and releases the audio graph. Not reusable afterwards. */
  stop(): void;
}

export interface MusicPort {
  load(url: string): MusicHandle;
  /** Runs `fn` after `ms`. Returns a cancel, so a fast second change cleans up after the first. */
  schedule(ms: number, fn: () => void): () => void;
}

/**
 * Gain curve for an equal-power fade, as `AudioParam.setValueCurveAtTime` wants it.
 *
 * A linear fade between two unrelated pieces of music audibly dips in the
 * middle: both are at half amplitude, which is a quarter of the power, and the
 * room goes quiet just as the change is supposed to feel seamless. Moving along
 * a sine instead keeps the summed power constant, which is what makes a
 * crossfade sound like one continuous thing.
 *
 * Interpolating the *angle* rather than the gain is what generalises this to
 * fades that start or end part-way, which happens whenever a change interrupts
 * a change already in flight.
 */
export function fadeCurve(from: number, to: number, steps = 64): Float32Array {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const start = Math.asin(clamp(from));
  const end = Math.asin(clamp(to));
  const curve = new Float32Array(steps);
  for (let step = 0; step < steps; step += 1) {
    const at = steps === 1 ? 1 : step / (steps - 1);
    curve[step] = Math.sin(start + (end - start) * at);
  }
  return curve;
}

export interface PlayerOptions {
  /** Crossfade length in seconds. */
  fade: number;
}

export const DEFAULT_OPTIONS: PlayerOptions = { fade: 2.5 };

/**
 * Holds at most one sounding track and however many are still fading out.
 *
 * Outgoing tracks are kept in a set rather than a single slot because a second
 * change can arrive mid-fade — turn order does not wait for the music — and
 * dropping the reference would leave a track playing forever with nothing
 * holding it.
 */
export class CrossfadePlayer {
  private readonly port: MusicPort;
  private options: PlayerOptions;
  private current: { url: string; handle: MusicHandle } | null = null;
  private readonly retiring = new Set<{ handle: MusicHandle; cancel: () => void }>();

  constructor(port: MusicPort, options: PlayerOptions = DEFAULT_OPTIONS) {
    this.port = port;
    this.options = options;
  }

  /**
   * Retunes fade length without rebuilding anything.
   *
   * The alternative is putting the options in the caller's effect deps, which
   * rebuilds the whole audio graph — and so restarts the music — every time
   * somebody nudges a slider. A fade length only matters at the next
   * crossfade, so it can simply be swapped in place.
   */
  setOptions(options: PlayerOptions): void {
    this.options = options;
  }

  /** What is sounding now, for the harness and for tests. */
  get playing(): string | null {
    return this.current?.url ?? null;
  }

  /**
   * Crossfades to `url`, or to silence when given null.
   *
   * Idempotent: asking for the track that is already playing does nothing at
   * all, which is what keeps "both players in the same ring" from restarting
   * the music even if the caller re-asks on every render.
   */
  play(url: string | null): void {
    if (url === this.current?.url) return;

    if (this.current) this.retire(this.current.handle);
    this.current = null;
    if (url === null) return;

    const handle = this.port.load(url);
    this.current = { url, handle };
    handle.fade(1, this.options.fade);
    // A rejection here is the autoplay policy, not a broken file: the track is
    // loaded and silent, and the next play() after a gesture will sound.
    void handle.start().catch(() => {});
  }

  private retire(handle: MusicHandle): void {
    handle.fade(0, this.options.fade);
    const entry = { handle, cancel: () => {} };
    entry.cancel = this.port.schedule(this.options.fade * 1000, () => {
      handle.stop();
      this.retiring.delete(entry);
    });
    this.retiring.add(entry);
  }

  /** Stops everything at once, without fading. For unmount. */
  stop(): void {
    this.current?.handle.stop();
    this.current = null;
    for (const entry of this.retiring) {
      entry.cancel();
      entry.handle.stop();
    }
    this.retiring.clear();
  }
}
