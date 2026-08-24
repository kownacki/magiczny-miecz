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
