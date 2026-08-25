/** Decides which zone owns the speakers, and when it is allowed to hand them over. */

import type { MusicZone } from "./tracks";

export interface DirectorConfig {
  /**
   * How long a zone keeps the room, in ms, before another may take over.
   *
   * Zero by default: the music follows whoever is taking their turn, and a
   * change of ring is heard as soon as it happens. That is the point of the
   * feature — players watch each other play, so the music is describing where
   * the game currently *is*, and lagging it makes it describe the past.
   *
   * Raising it buys one thing: a player who dips into another ring for a single
   * turn and comes straight back never interrupts. That costs responsiveness on
   * every other change, which is why it is off. It stays a number rather than
   * being deleted because it is the only dial that trades those two against
   * each other, and the right value is a matter of taste at a real table.
   */
  hold: number;
}

export const DEFAULT_CONFIG: DirectorConfig = { hold: 0 };

export interface DirectorState {
  /** The zone currently sounding. Null before the first observation. */
  playing: MusicZone | null;
  /** When `playing` took over, on the same clock the caller passes to `observe`. */
  since: number;
  /** The most recently observed zone, which may be waiting out the hold. */
  observed: MusicZone | null;
}

export const INITIAL: DirectorState = { playing: null, since: 0, observed: null };

/**
 * Folds one observation of "where the game is now" into the director.
 *
 * Pure, and takes `now` rather than reading a clock, so the whole behaviour —
 * including the hold — is testable without timers. Repeating the same
 * observation is free and returns the identical object, which is what lets the
 * caller drive this straight from rendered state on every refetch instead of
 * having to detect changes itself.
 */
export function observe(
  state: DirectorState,
  zone: MusicZone | null,
  now: number,
  config: DirectorConfig = DEFAULT_CONFIG,
): DirectorState {
  // Nothing known yet — usually a refetch in flight. Keep playing whatever is
  // playing rather than falling silent on a dropped poll.
  if (zone === null) return state;

  // First zone we ever see starts immediately; there is nothing to fade from
  // and nobody to protect from whiplash.
  if (state.playing === null) return { playing: zone, since: now, observed: zone };

  if (zone === state.playing) {
    // Back to what is already sounding. This also cancels a pending switch,
    // which is exactly the "player dipped into another ring and came back"
    // case the hold exists for.
    return state.observed === zone ? state : { ...state, observed: zone };
  }

  if (now - state.since >= config.hold) {
    return { playing: zone, since: now, observed: zone };
  }

  return state.observed === zone ? state : { ...state, observed: zone };
}

/**
 * When the caller should look again, or null if nothing is pending.
 *
 * A switch held back by the hold has no event to wake it — the zone stopped
 * changing, the clock is what moves. The caller sets one timer for this instant
 * and calls `observe` again; anything sooner is wasted work and anything later
 * is a late crossfade.
 */
export function pendingAt(
  state: DirectorState,
  config: DirectorConfig = DEFAULT_CONFIG,
): number | null {
  if (state.observed === null || state.observed === state.playing) return null;
  return state.since + config.hold;
}
