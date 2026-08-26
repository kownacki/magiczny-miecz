/**
 * Where a browser keeps the secret that proves it holds a seat.
 *
 * `sessionStorage`, not `localStorage`, and the difference is the whole point:
 * `localStorage` is shared by every tab of a browser, so opening a table in a
 * second tab arrived as the *same player* — two windows both driving the host's
 * seat, neither able to be anybody else. A seat is held by a window, not by a
 * machine, and `sessionStorage` is scoped exactly that way.
 *
 * What this costs is that closing the tab drops the claim. That is the right
 * trade, because the game already has an answer for it: mid-game the seat is
 * marked as having nobody behind it and the character stays exactly as it was
 * for somebody — the same person on a new tab, or anybody else — to take over.
 * Everyone is in the same room; who gets to pick a character back up is settled
 * out loud, not by a token surviving in a browser.
 *
 * Reloading a tab keeps the seat, which is the case that actually happens.
 */
const key = (code: string) => `mm:${code.toUpperCase()}`;

/** Null on the server, in private modes that forbid storage, and in a fresh tab. */
export function readSeatToken(code: string): string | null {
  try {
    return sessionStorage.getItem(key(code));
  } catch {
    return null;
  }
}

export function writeSeatToken(code: string, token: string): void {
  try {
    sessionStorage.setItem(key(code), token);
  } catch {
    // A browser that refuses storage still plays; it just cannot survive a
    // reload, and the takeover path is what gets the seat back.
  }
}

export function forgetSeatToken(code: string): void {
  try {
    sessionStorage.removeItem(key(code));
  } catch {
    // Nothing to forget.
  }
}

/**
 * That a seat was taken away rather than given up, kept just long enough to say so.
 *
 * A player put out of their seat finds out the same way they find out anything
 * else: the next poll comes back saying they hold no seat. That is enough to
 * stop showing them the controls, and not enough to tell them why — from the
 * inside, being kicked and having a token go stale look identical, and the
 * difference is the whole of what the person wants to know.
 *
 * So the page that notices writes it down and the page they land on reads it.
 * `sessionStorage` like the token itself, and for the same reason: this is
 * about one window, and a second tab of the same browser was never at the table
 * being talked about.
 *
 * One key rather than one per table, because the landing page has no code to
 * ask about — what it holds is the code, so the notice can still name it.
 */
const REMOVED = "mm:usuniety";

export function noteRemoved(code: string): void {
  try {
    sessionStorage.setItem(REMOVED, code.toUpperCase());
  } catch {
    // The redirect still happens; only the sentence is lost.
  }
}

/** Reads it and clears it — a notice still standing next visit is a notice about nothing. */
export function takeRemovedNotice(): string | null {
  try {
    const code = sessionStorage.getItem(REMOVED);
    if (code) sessionStorage.removeItem(REMOVED);
    return code;
  } catch {
    return null;
  }
}
