"use client";

import type { Intent } from "@/lib/engine/intentText";

/**
 * A decision that has been made but not yet sent.
 *
 * Every button under a Karta commits something the rules give no way back
 * from: „Weź Przedmiot" cannot be un-taken, „Walcz" cannot be un-fought, and a
 * `wybor` answered is answered. There is no inverse `Changeset` in this app and
 * there should not be — `commit` writes under a compare-and-swap and knows
 * nothing about undoing. So the window has to sit *before* the write: pressing
 * a button schedules the request rather than making it, and for three seconds
 * the same button says „Anuluj" instead.
 *
 * That window pays for itself twice. The player who misclicked gets out of it,
 * and the player who changes their mind gets out of it — and the rest of the
 * table gets three seconds in which the app can say what is about to happen,
 * which is the only moment between „nothing yet" and „it is done" that anyone
 * watching has ever had.
 *
 * **Cancelling is an act, not a change of aim.** Clicking a different option
 * does nothing while one is channelling, because the others are disabled: you
 * cancel, the panel returns to exactly the state it was in before you touched
 * it, and you choose again. A pending decision that could be re-pointed would
 * be a fourth state to explain in a panel that already has three.
 *
 * **There is exactly one of these per browser tab**, which is why this is a
 * module and not a context. A second one would mean two irreversible things in
 * flight with one `Anuluj` between them, and every button in the app is already
 * disabled while another is filling — the invariant is real, so it is stated
 * here rather than hoped for from wherever a provider happened to be mounted.
 */

/**
 * How long a decision waits before it is sent.
 *
 * Three seconds is long for a button and short for a table. It is long enough
 * to read „Test (WIEDŹMA) wybiera: Tracisz 1 Sztukę Złota" from across the
 * room, and — since cancelling costs a second full window, the price of not
 * being able to re-point a pending choice — short enough that changing your
 * mind twice is not a punishment.
 */
export const CHANNEL_MS = 3000;

/**
 * Who tells the rest of the table, and how.
 *
 * A module cannot post anything itself — it has no join code, no token and no
 * business holding either — so the table hands it a way to speak and takes it
 * back on unmount. Nothing here waits for it or finds out whether it worked:
 * the warning the other players get is a courtesy, and a courtesy must never be
 * the reason a decision fails to be sent.
 */
type Announcer = (intent: Intent | null) => void;

let announce: Announcer = () => {};

export function announcingWith(say: Announcer) {
  announce = say;
  return () => {
    // Only if it is still ours. A second table mounting before the first has
    // finished tearing down would otherwise leave the room silent.
    if (announce === say) announce = () => {};
  };
}

/** The one decision in flight, or nothing. */
export type Channelled = {
  /** Which button is filling. `useId` per `ActionButton` instance. */
  readonly id: string;
  /** What the rest of the table was told, where the button had anything to say. */
  readonly says: Intent | null;
  /** So the fill, the clock and anything watching agree on one deadline. */
  readonly startedAt: number;
  /** What the button would have done had it been an ordinary button. */
  readonly send: () => void;
};

let held: (Channelled & { timer: ReturnType<typeof setTimeout> }) | null = null;
const watchers = new Set<() => void>();

function tell() {
  for (const watcher of watchers) watcher();
}

/**
 * Escape cancels, ahead of everything else that answers it.
 *
 * Captured at the document, and only while something is actually channelling,
 * so the key means „take that back" before it means „close this sheet" — which
 * is the right order: a player reaching for Escape with a button filling wants
 * the decision stopped, not the Karta they were reading put away. Every other
 * Escape handler on the page is untouched the rest of the time.
 */
function onEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || !held) return;
  event.preventDefault();
  event.stopPropagation();
  cancelChannelling();
}

/**
 * Guarded so the rules above can be tested without a DOM.
 *
 * Everything that matters here — one at a time, what a cancel undoes, that a
 * timer which has already fired cannot be called back — is timing, not markup,
 * and none of it should need a browser to check.
 */
function listenForEscape(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) document.addEventListener("keydown", onEscape, true);
  else document.removeEventListener("keydown", onEscape, true);
}

export function beginChannelling(id: string, send: () => void, says: Intent | null = null) {
  // Nothing to decide: one at a time, and the others are disabled anyway.
  if (held) return;
  const startedAt = Date.now();
  const timer = setTimeout(() => {
    // Cancelled and replaced inside the same tick — `clearTimeout` cannot
    // unfire a callback that has already been queued, so the record it was
    // scheduled for is what says whether it still counts.
    if (held?.id !== id) return;
    // Cleared *before* the request goes, so „Anuluj" is gone the instant the
    // action is: `post` raises `busy` on its first line, and between these two
    // statements there is no frame in which a player could press a cancel that
    // would no longer work.
    held = null;
    listenForEscape(false);
    tell();
    send();
  }, CHANNEL_MS);
  held = { id, startedAt, send, says, timer };
  listenForEscape(true);
  tell();
  // After the record exists, so a synchronous announcer cannot find a half-built
  // one. Nothing is announced when it *fires*: the decision is still in flight
  // until the revision carrying it arrives, and the watching device expires the
  // line on its own clock if it never does.
  if (says) announce(says);
}

export function cancelChannelling() {
  if (!held) return;
  const said = held.says;
  clearTimeout(held.timer);
  held = null;
  listenForEscape(false);
  tell();
  // The cancel travels too, and at the moment it happens. A watcher shown a
  // decision has to be shown it withdrawn rather than left to time it out.
  if (said) announce(null);
}

/** The snapshot, stable by identity until it changes — `useSyncExternalStore`. */
export function channelled(): Channelled | null {
  return held;
}

/** Nothing is ever in flight on the server. */
export function noChannelling(): Channelled | null {
  return null;
}

export function watchChannelling(watcher: () => void) {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}
