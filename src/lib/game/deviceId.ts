/**
 * What this browser calls itself, so a closed tab can be come back from.
 *
 * `localStorage`, and it does not contradict `seatToken.ts` — that file argues
 * for `sessionStorage` and is right, about a different question. The two are
 * different secrets answering different things:
 *
 * - `claim_token` is per **window**: "may this window act as that person?" It
 *   must not be shared between tabs, or a second tab of one browser arrives as
 *   the same player and neither can be anybody else.
 * - `device_id` is per **browser**: "who *is* this person?" It has to survive
 *   the tab closing, because surviving the tab closing is the whole of what it
 *   is for.
 *
 * So reopening a table finds the quiet user carrying this id and offers *Wróć
 * jako Michał*; a second tab finds that user live and offers *Dołącz jako ktoś
 * inny*. Which makes testing with several tabs a deliberate choice rather than
 * an accident, and it used to be an accident either way round.
 *
 * One id for the browser and not one per table: it says which machine this is,
 * and that is the same answer at every table it sits down at.
 */
const KEY = "mm:device";

/**
 * A random id, or null where storage is refused.
 *
 * Null is a working state, not an error: the browser simply cannot be
 * recognised on its way back, which is exactly where it was before this
 * existed. Nothing is gated on having one.
 */
export function deviceId(): string | null {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    const fresh = mint();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private modes, and browsers set to block site data. See above.
    return null;
  }
}

/**
 * `crypto.randomUUID` where it exists, and something as long where it does not.
 *
 * Not `makeUserId`'s alphabet: that one is four characters because a person has
 * to read it off a roster and type it into `kick`, and this one is never shown
 * to anybody. It is a secret — whoever holds it can come back as the person it
 * belongs to — so it is as long as an id can afford to be.
 */
function mint(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join("");
}

/** Deliberately joining as somebody else: this browser stops being who it was. */
export function forgetDevice(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}
