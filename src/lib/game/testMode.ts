"use client";

/**
 * Whether this device is being used to test the game rather than to play it.
 *
 * Test mode is the deliberate exception to the rule that in simulation nothing
 * is entered by hand (CLAUDE.md). Reaching a fight on the Kamienny Most
 * legitimately is twenty minutes of play, so this hands you the card, the
 * square and the ± on a tracked value — everything the referee otherwise owns.
 * It is off by default, and turning it on is a decision taken in the top bar
 * where it stays visible for as long as it is on.
 *
 * A preference of the person, not of the table: it changes what *you* can
 * reach, never what the game is. So it lives in `localStorage` — one switch
 * across every table and every tab, surviving reloads — rather than travelling
 * to the server with the game. What it lets you *do* is shared, of course, and
 * the journal marks all of it as a manual override, because that is what it is.
 *
 * The debug route refuses everything in a production build, so the switch is
 * only drawn where it could do something.
 */

const KEY = "mm:tryb-testowy";

/**
 * Never called during a render.
 *
 * The server has no `localStorage`, so reading this while rendering would give
 * one answer on the server and another in the browser, and React would throw
 * out the markup it had just been sent. Read it in an effect and let the first
 * paint say "off", which is what it was until somebody says otherwise.
 */
export function readTestMode(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    // A browser with storage switched off can still play; it just cannot test.
    return false;
  }
}

export function writeTestMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Nothing to do about it, and nothing that depends on it having worked.
  }
}

/** Whether this build can do anything with it at all. */
export const TESTING_POSSIBLE = process.env.NODE_ENV !== "production";
