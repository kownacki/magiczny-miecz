/** The real `MusicPort`: Web Audio gain nodes over looping media elements. */

import { fadeCurve, type MusicHandle, type MusicPort } from "./player";

/**
 * Why Web Audio and not just `audio.volume`.
 *
 * iOS ignores writes to `HTMLMediaElement.volume` entirely — the property
 * accepts the value and the loudness does not move — so a volume-based
 * crossfade is silently a hard cut on every iPhone at the table. A `GainNode`
 * works everywhere, and `setValueCurveAtTime` runs the fade on the audio thread
 * instead of a `setInterval` that stutters whenever React renders.
 */
export interface BrowserPort extends MusicPort {
  /**
   * Resumes the audio context. Must be called from a real user gesture; until
   * then browsers keep it suspended and everything is silently inaudible.
   */
  unlock(): Promise<void>;
  /** Master gain, 0..1, applied over the per-track crossfade gains. */
  setVolume(volume: number): void;
  /** True once a gesture has actually resumed the context. */
  readonly unlocked: boolean;
  close(): void;
}

export function browserMusicPort(initialVolume = 0.6): BrowserPort {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = initialVolume;
  master.connect(context.destination);

  return {
    load(url) {
      const element = new Audio(url);
      element.loop = true;
      element.preload = "auto";
      // Fetched same-origin from public/music, but the flag is what lets the
      // media element be routed through Web Audio without tainting the graph.
      element.crossOrigin = "anonymous";

      const gain = context.createGain();
      gain.gain.value = 0;
      context.createMediaElementSource(element).connect(gain);
      gain.connect(master);

      const handle: MusicHandle = {
        start: () => element.play(),
        fade(to, seconds) {
          const now = context.currentTime;
          const from = gain.gain.value;
          gain.gain.cancelScheduledValues(now);
          // cancelScheduledValues leaves the param wherever the cancelled ramp
          // had reached, which is the value the new curve has to start from —
          // hence reading it first. Without this a change mid-fade jumps.
          gain.gain.setValueAtTime(from, now);
          gain.gain.setValueCurveAtTime(fadeCurve(from, to), now, Math.max(0.01, seconds));
        },
        stop() {
          element.pause();
          element.src = "";
          gain.disconnect();
        },
      };
      return handle;
    },

    schedule(ms, fn) {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    },

    async unlock() {
      if (context.state === "suspended") await context.resume();
    },

    get unlocked() {
      return context.state === "running";
    },

    setVolume(volume) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      // Short ramp rather than a jump: stepping a gain node produces a click.
      master.gain.linearRampToValueAtTime(Math.min(1, Math.max(0, volume)), now + 0.05);
    },

    close() {
      void context.close();
    },
  };
}
