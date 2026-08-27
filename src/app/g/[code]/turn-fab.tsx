"use client";

import { useEffect, useRef } from "react";
import { SEAT_COLOURS } from "@/lib/view/boardMap";

/**
 * The turn, at the foot of every screen at the table.
 *
 * Two things used to live here and they were the same thing. A watcher who
 * folded a turn away got a pill saying "Halina walczy — pokaż"; the player
 * being asked got one saying what they still owed. Which meant the control was
 * written twice, appeared only while a sheet happened to be open, and vanished
 * entirely on a quiet Obszar — so a table where somebody was deciding whether
 * to end their turn showed the rest of the room nothing at all, and there was
 * no way in to look.
 *
 * So it is one button, and everybody has it for the whole of every turn. What
 * changes is only whose turn it is describing:
 *
 *     ● TWOJA TURA · walka: DEMON      to the player being asked
 *     ● TURA: MICHAŁ · walka: DEMON    to everybody else
 *
 * Both open the same window on the same thing. What differs is what may be
 * pressed inside it, and that is decided there — by `canAct`, in one place —
 * rather than by withholding the way in.
 *
 * A turn that is on screen has no need of a way back to itself, so this is
 * drawn only while every window is shut. It is what the absence of the turn
 * looks like, and there is no turn it is absent from.
 */
/**
 * The gap the pill floats on, above whatever the console is taking.
 *
 * In pixels rather than `1rem`, because it is added to a measured
 * `offsetHeight` and the two have to be the same unit. Sixteen is the browser
 * default root size and what `1rem` resolves to everywhere else in this app.
 */
const RESERVED_ABOVE = 16;

export function TurnFab({
  mine,
  playerName,
  seatIndex,
  owed,
  onOpen,
}: {
  /** Whether the viewer is the one being asked. Changes the words and the weight. */
  mine: boolean;
  /** Whose turn it is, for everybody who is not having it. */
  playerName: string;
  /**
   * Whose colour to wear.
   *
   * The active seat's, not the viewer's — this says whose turn it is, and the
   * colour is the app's word for "whose" everywhere else it appears: the figure
   * on the board, the dot in the journal, the border of the Teraz box. On your
   * own turn it is also where you learn what colour you are.
   */
  seatIndex: number;
  /**
   * What is still to be done, in the words the turn uses for it — or null when
   * nothing is owed and all that is left is to end the turn.
   *
   * Null rather than "zakończ turę", because this button must not become a way
   * to end a turn. Ending one is a decision and it lives in the window, next to
   * the Obszar it is being made about; a pill in the corner reading "zakończ
   * turę" is the same control in a second place, and the second place is the
   * one you press by accident on the way past.
   */
  owed: string | null;
  onOpen: () => void;
}) {
  const colour = SEAT_COLOURS[seatIndex % SEAT_COLOURS.length];
  const pill = useRef<HTMLButtonElement>(null);

  /**
   * What this reserves at the foot of the right column, published for it.
   *
   * The same bargain the console strikes with `--console-h`, and for the same
   * reason: this is `fixed`, so it pushes nothing, and the column it floats
   * over scrolls underneath it. Padding that column by the console's height
   * alone left the pill sitting on the last row of the seat card — the
   * Zdolności heading, which it covered exactly.
   *
   * The published number is the whole strip this takes, not the pill's own
   * height: it floats `1rem` above whatever the console is taking, and a
   * reservation that forgot the gap would leave the fold's triangle just under
   * the pill's edge. `RESERVED_ABOVE` is that `1rem` written once, so the
   * offset and the room made for it cannot drift — they are the same number in
   * two places and this is the one place it is typed.
   *
   * Cleared on unmount rather than left behind. The pill is drawn only while
   * every window is shut, so it comes and goes many times a turn, and a stale
   * reservation is a column padded for something that is not on screen.
   */
  useEffect(() => {
    const root = document.documentElement;
    const element = pill.current;
    const clear = () => root.style.setProperty("--fab-h", "0px");
    if (!element) {
      clear();
      return;
    }
    const measure = () =>
      root.style.setProperty("--fab-h", `${element.offsetHeight + RESERVED_ABOVE}px`);
    measure();
    // The words change with the turn — "walka: DEMON" arrives and leaves — and
    // a long enough `owed` wraps the pill to a second line. Watching it is what
    // keeps the reservation right through that rather than only on mount.
    const watching = new ResizeObserver(measure);
    watching.observe(element);
    return () => {
      watching.disconnect();
      clear();
    };
  }, []);

  return (
    <button
      ref={pill}
      onClick={onOpen}
      /**
       * Bottom centre, over everything, on the pill the folded sheet used to
       * use — because to a player it *is* that pill.
       *
       * Below the console's layer and above the board's: this is the game
       * asking, and the console is the thing you type at while it asks.
       *
       * Full-strength border when the game is waiting on you, half when it is
       * waiting on somebody else. The same button either way; the difference is
       * whether it is a summons or a place to look.
       */
      /**
       * Above whatever the console is taking, and by exactly that much.
       *
       * The console is docked to the bottom of the right column and this is
       * centred on the *window*, so on a wide screen the two land on each
       * other — and they did, with the button sitting over "TRYB TESTOWY —
       * KONSOLA" while the console was folded to its bar. `--console-h` is the
       * measured height the console publishes for exactly this kind of
       * reservation (see `table-layout.tsx`, which pads the column with it), so
       * the lift is right for all three of its states and zero when it is
       * closed.
       */
      style={{ bottom: `calc(${RESERVED_ABOVE}px + var(--console-h, 0px))` }}
      /* `hover:bg-raised` and not a tint. A tinted background *replaces* the
         one it is written next to rather than laying over it, so hovering this
         turned an opaque pill ninety percent transparent and the board showed
         through the words. Anything that sits over the game hovers to another
         solid colour; tints are for buttons with no background of their own,
         where there is nothing to see through to. */
      className={`fixed left-1/2 z-40 flex max-w-[min(90vw,28rem)] -translate-x-1/2 items-center gap-2 rounded-full border bg-panel px-4 py-2 text-xs text-ink shadow-[0_4px_20px_rgba(0,0,0,0.6)] transition hover:bg-raised ${
        mine ? "border-ochre" : "border-ochre/40 hover:border-ochre/70"
      }`}
    >
      {/* The slow pulse is "somebody is being waited on", and it is true on
          every screen — the difference between the two readings is the words
          beside it, not whether the table is waiting. */}
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full motion-safe:animate-pulse"
        style={{ background: colour }}
        aria-hidden
      />
      <span className="truncate font-[family-name:var(--font-display)] tracking-wide">
        {/* The player's name only, with no character after it: this is a
            compact return control and the Teraz box two inches away carries
            "Michał (WIKING)" in full. */}
        {mine ? "Twoja tura" : `Tura: ${playerName}`}
      </span>
      {owed && (
        <>
          <span className="text-muted">·</span>
          <span className="shrink-0 text-ochre">{owed}</span>
        </>
      )}
    </button>
  );
}

/**
 * What the turn still owes, said in as few words as it can be.
 *
 * Taken from `windowsFor`'s own ranking rather than worked out again here: the
 * first compulsory window is by definition the thing that cannot be walked past
 * — 16.4 puts the cards before the Obszar, and a fight before either.
 *
 * The same words on every screen. A watcher is told what the turn is waiting
 * for, not what they may do about it — those are different questions and only
 * one of them is answered by a button in the corner.
 *
 * Null where nothing is compulsory. What is left then is ending the turn, and
 * that is deliberately not said here: it is a decision, it belongs in the
 * window beside the Obszar it is about, and naming it on the button would make
 * the button look like the place to take it.
 */
export function owedLabel(
  windows: readonly { id: string; label: string; count?: number; compulsory?: boolean }[],
  fightName: string | null,
): string | null {
  const first = windows.find((window) => window.compulsory);
  if (!first) return null;
  if (first.id === "walka") return fightName ? `walka: ${fightName}` : "walka";
  if (first.id === "karty") return first.count === 1 ? "1 karta" : `${first.count} karty`;
  return first.label.toLowerCase();
}
