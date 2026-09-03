"use client";

/** What the die did, where the button that threw it was standing. */

import { ActionButton } from "./action-button";
import { DieMark } from "./die-mark";
import { WithRules } from "./rule-ref";

/**
 * A die that has been thrown and not yet read.
 *
 * Held by the table (`page.tsx`) rather than by the panel that shows it,
 * because by the time it exists the panel has moved on: `post` refreshes before
 * it returns, so the Karta is settled, the kolejka has advanced, and a Karta
 * that placed itself (15.1) is out of the frame altogether.
 */
export interface Rolled {
  /**
   * What it was thrown for: a Karta's id, or `pole:<nazwa>` for an Obszar's own
   * table — the same naming a fight against a square's guardian uses.
   */
  cardId: string;
  /**
   * Nothing the face chose has happened yet.
   *
   * The face stays on the Obszar's frame until the Karta finishes, which
   * outlasts the wait: „Dalej" runs the row, and a row that opens a fight or
   * asks which Przedmiot goes leaves the number standing over the question it
   * raised. Only while this is true is the sheet *holding* the Karta — showing
   * the button, and refusing to let the turn move on around it.
   */
  held: boolean;
  face: number;
  /** What the app applied, as the command reported it. */
  did: string[];
}

/**
 * The face, and what it cost — standing where „Rzuć kostką" stood.
 *
 * Everything else under a Karta is pressed: you choose, and what follows is
 * what you chose. A die table is the opposite — the press is the whole of the
 * player's part, the app throws, and the face decides. Without this the turn
 * simply moved on: the Karta was gone, the next one was up, and the only record
 * that a 5 had cost a point of Życie was a line in the Dziennik nobody was
 * looking at and a number on the Karta Postaci that had quietly changed.
 *
 * It was a small dialog over the sheet first, and that was the wrong place: a
 * modal over the Karta hides the Karta, and what a player wants at that moment
 * is the six lines above the button — the ones saying what the faces mean —
 * with the one that came up read against them. So the outcome stands in the
 * button's own place, under its own list, and nothing else on the sheet moves.
 *
 * „Dalej" channels like every other button that cannot be taken back: the
 * kolejka goes on when it fires, and three seconds is how long this app gives
 * you to mean it. It is the one button in this corner that does *not* pass
 * `immediate` — the throw was not a decision and this is: it is the player
 * saying they have read the result.
 */
export function RollSaid({
  face,
  did,
  onDone,
}: {
  face: number;
  did: readonly string[];
  /**
   * „Dalej", where there is anything to press.
   *
   * Absent when the face asked something — „tracisz Przedmiot" and then the
   * pack to choose from — because answering *is* going on, and a „Dalej" beside
   * a question is a second way past it that settles nothing.
   */
  onDone?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-2 text-ochre">
          <span className="text-[11px] uppercase tracking-widest text-muted">Wypadło</span>
          {/**
           * `leading-snug`, and not the `leading-none` this had.
           *
           * Cinzel's ascent and descent do not fit a line box the height of its
           * own font size: at 36px the glyph's box stands 6px past the line,
           * and while nothing looks clipped — ink overflow paints outside its
           * box happily — those 6px are *scrollable* overflow, so the Karta's
           * column grew a scrollbar with half the panel standing empty above
           * it. Measured, not guessed: `leading-none` overflows by 6, the
           * default by 4, `leading-tight` by 1, and this by none.
           */}
          <span className="font-[family-name:var(--font-display)] text-4xl leading-snug tabular-nums">
            {face}
          </span>
          {/* The glyph off the button that threw it, so the two read as one act
              finishing rather than as a result arriving from somewhere else. */}
          <span className="text-ochre/70">
            <DieMark />
          </span>
        </p>
        {onDone && (
          <ActionButton weight="lead" size="lg" onClick={onDone}>
            Dalej
          </ActionButton>
        )}
      </div>
      {did.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {did.map((line, at) => (
            <li key={at} className="text-xs leading-snug text-ink">
              {/* A rule number in an outcome is a link like every other one —
                  „zamiana w Kamień na 3 tury (20.1)" comes through here. */}
              <WithRules text={line} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
