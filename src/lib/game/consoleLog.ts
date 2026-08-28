"use client";

/**
 * What the test console said, kept across a reload.
 *
 * The console is where a table gets driven into the state somebody wants to look
 * at — half a dozen commands to hand out a card, move a figure, take a turn — and
 * reloading the page is a normal part of that, because reloading is how you see
 * whether the change you just made to the app worked. Losing the transcript at
 * exactly that moment loses the record of how you got here.
 *
 * Per table and per browser. Two tables are two different conversations, and the
 * console is a device's own tool rather than anything the game knows about, so
 * it never travels to the server — same footing as `testMode`.
 */

const KEY = (table: string) => `mm:konsola:${table}`;

/** One line of the transcript: what was said, and whether the player said it. */
export interface ConsoleLine {
  said: string;
  mine: boolean;
  /**
   * The first line of a block that should be read from its top.
   *
   * The scroll lines the newest one of these up with the top edge. An echo of
   * what was typed is one by definition; the only other is a Tab listing, which
   * nobody typed and which can be taller than the box. Optional, and absent
   * from every line written before it existed — a restored history is fine
   * without it, because the echoes it does have are enough to anchor on.
   */
  anchor?: boolean;
}

export interface ConsoleHistory {
  log: ConsoleLine[];
  /** What has been typed before, newest last, for the up arrow. */
  past: string[];
}

const EMPTY: ConsoleHistory = { log: [], past: [] };

/** As many lines as the console keeps in memory anyway. */
const LIMIT = 100;

/**
 * Never called during a render on the server.
 *
 * There is no `localStorage` there, so reading it while rendering would give one
 * answer on the server and another in the browser. The console draws nothing
 * until it is opened, which is what makes a lazy initialiser safe here.
 */
export function readConsole(table: string): ConsoleHistory {
  try {
    const raw = localStorage.getItem(KEY(table));
    if (!raw) return EMPTY;
    const stored = JSON.parse(raw) as Partial<ConsoleHistory>;
    return {
      // Anything that is not the shape this writes is treated as nothing: the
      // key survives across versions of the app, and half-understood history is
      // worse than none.
      log: Array.isArray(stored.log)
        ? stored.log
            .filter(
              (line): line is ConsoleLine =>
                typeof line?.said === "string" && typeof line?.mine === "boolean",
            )
            .slice(-LIMIT)
        : [],
      past: Array.isArray(stored.past)
        ? stored.past.filter((line): line is string => typeof line === "string").slice(-LIMIT)
        : [],
    };
  } catch {
    // A browser with storage switched off can still use the console; it just
    // starts empty every time.
    return EMPTY;
  }
}

export function writeConsole(table: string, history: ConsoleHistory): void {
  try {
    localStorage.setItem(
      KEY(table),
      JSON.stringify({
        log: history.log.slice(-LIMIT),
        past: history.past.slice(-LIMIT),
      }),
    );
  } catch {
    // Nothing to do about it, and nothing that depends on it having worked.
  }
}

export function forgetConsole(table: string): void {
  try {
    localStorage.removeItem(KEY(table));
  } catch {
    // As above.
  }
}
