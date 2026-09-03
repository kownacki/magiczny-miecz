"use client";

import Image from "next/image";
import { CardMark, Corner, MARK_SIZE } from "./card-mark";
import { Overlay } from "./overlay";
import { ChromeButton } from "./chrome";
import { seatColour } from "@/lib/view/boardMap";
import { CARD_RATIO, PICTURE_WIDTH } from "./card-preview";
import { CHARACTER_ART_RATIO, characterStandeeUrl } from "@/lib/view/cardImages";
import { WithRules } from "./rule-ref";

/**
 * The sheet every one of the turn's questions is asked on: the picture on the
 * left, what the app has to add on the right.
 */

/**
 * What the sheet wears whichever question is on it.
 *
 * Passed down whole rather than five props at a time because it is one idea —
 * whether this device is being asked or is only watching, and what it may do
 * about the sheet itself. Each situation used to spell the same three rules out
 * for itself, which is four chances for one of them to be spelled differently.
 */
export interface SheetChrome {
  /**
   * Whether this device may press anything.
   *
   * False for everyone but the player whose turn it is — including a player
   * whose own character has died and is watching the rest of the game. They see
   * the card, the dice as they land and the verdict; what they do not get is a
   * say in somebody else's turn.
   */
  canAct: boolean;
  /**
   * The seat whose turn is being played, for the edge.
   *
   * The sheet is the turn happening, and every other thing on the table that
   * belongs to one seat wears that seat's colour — the figure on the board, the
   * dot in the journal, the border of the Teraz box, the dot in the pill. This
   * is the largest of them and was the only one in the house ochre, so on a
   * four-player table nothing about it said whose turn you were watching.
   */
  seatIndex?: number;
  /**
   * Who is acting, drawn down the left of the sheet.
   *
   * The turn is a person as much as a Karta, and the sheet said so only in
   * small print across the top („Test ciągnie Kartę — oglądasz"), which the
   * player being asked never sees at all. A standee is what the box gives for
   * „me" — „Karty, na których znajduje się tylko ilustracja" — and it is what
   * a player points at on the board.
   */
  actor?: { name: string; characterName: string; characterId: string | null };
  /**
   * Whether this has been folded away.
   *
   * It used to be a watcher's only — the player being asked could not put their
   * own fight in a corner, because it is the thing the game is waiting on. That
   * was right about the danger and wrong about the cure: a player mid-turn has
   * things to do that are all behind this sheet, and being unable to move it is
   * not the same as being able to act.
   *
   * What makes it safe is `TurnFab`, which cannot be dismissed while it is your
   * turn and says what is owed. See the note there.
   */
  minimized: boolean;
  onMinimize: () => void;
  /** A refusal from the last thing pressed, said inside the sheet that hides it. */
  error: string | null;
}

export function DrawSheet({
  label,
  heading,
  seatIndex,
  actor,
  art,
  granted = false,
  canAct,
  watching,
  minimized,
  onMinimize,
  error,
  wide = false,
  footer,
  children,
}: SheetChrome & {
  label: string;
  /**
   * What the bar across the top says, when that is not the label.
   *
   * `label` is the thing on the sheet — it names the picture and is its `alt`.
   * The two came apart when the card's own name moved into the column beside
   * the scan: the bar then names the *window* („Karty do rozpatrzenia") while
   * the picture is still of the Wróżka, and a screen reader must be told the
   * second, not the first.
   */
  heading?: string;
  art: string | null;
  /** Staged by the test shortcut rather than drawn — marked on the card. */
  granted?: boolean;
  /**
   * What the player whose turn it is is doing — "Halina walczy".
   *
   * Said only to the people who are not doing it. Whoever is being asked knows
   * perfectly well, and the line is the sheet's way of telling everybody else
   * why they are looking at somebody else's dice.
   */
  watching: string;
  /** Room for a third column: the card, the fight, and a hand beside it. */
  wide?: boolean;
  /**
   * A strip across the foot of the sheet, under both columns.
   *
   * For what is *around* the Karta rather than about it — the Obszar's kolejka,
   * which is the row of Karty lying on the table while this one is in your
   * hand. In the right-hand column it was a third thing competing with the
   * card's own title for the top of the sheet, and it is not a third thing: it
   * is the setting the card is in.
   */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Folded away, this draws nothing: what replaces it is `TurnFab`, one pill
  // at the foot of every screen at the table, for the whole of every turn.
  //
  // This used to draw its own — "Halina walczy — pokaż" — for watchers only,
  // which made two buttons out of one idea and tied the way back in to whether
  // a sheet happened to be open. See the note on `TurnFab`.
  if (minimized) return null;

  return (
    // The undismissable one, and it says so rather than merely lacking the
    // handlers. This sheet is the game asking: a fight is not over because you
    // pressed Escape, and a Karta you drew is drawn whether or not you would
    // rather it were not. The ways out are the ones the rules have — fight it,
    // flee it (19.1), leave it lying there (16.8) — plus `przerwij walkę` while
    // testing, and folding it away if you are only watching.
    <Overlay label={label} onDismiss={null}>
      <div
        style={seatIndex === undefined ? undefined : { borderColor: seatColour(seatIndex) }}
        className={`relative flex max-h-[90vh] w-full flex-col gap-3 overflow-hidden rounded-lg border bg-panel p-4 shadow-[0_8px_40px_rgba(0,0,0,0.7)] ${
          seatIndex === undefined ? "border-ochre/40" : ""
        } ${wide ? "max-w-5xl" : "max-w-3xl"}`}
      >
        {/* The edge breathing in the seat's colour — `animate-pulse`, the same
            one the turn pill's dot uses and for the same reason: the table is
            waiting on one person and the largest thing on the screen should say
            whose. A ring of its own rather than the container's own border,
            because pulsing the container fades everything inside it. */}
        {seatIndex !== undefined && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-lg border motion-safe:animate-pulse"
            style={{ borderColor: seatColour(seatIndex) }}
          />
        )}
        {/*
          One header across the whole sheet.

          What is happening on the left, what you can do about the sheet itself
          on the right — folding it away, and the test hatch out of a fight.
          They belong together and above everything: they are not moves in the
          game, and putting them among the moves meant the abandon button
          floated in a corner of the spell column, which is not the column it
          has anything to do with.
        */}
        <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-edge/60 pb-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate font-[family-name:var(--font-display)] text-lg text-ochre">
              {heading ?? label}
            </h2>
            {!canAct && (
              <span className="truncate text-[11px] uppercase tracking-wide text-muted">
                {watching} — oglądasz
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {/* Foldable by whoever is looking at it, including the player
                being asked. What makes that safe on your own turn is the
                `TurnFab` it folds down to, which cannot be dismissed and says
                what you still owe. */}
            <ChromeButton
              glyph="shrink"
              title={
                canAct
                  ? "Zwiń — wróć przyciskiem na dole"
                  : "Zwiń do paska — plansza znowu widoczna"
              }
              onClick={onMinimize}
            />
          </div>
        </header>

        {/* Said here, because here is where it happened.

            A modal covers the panel that used to carry these, so anything
            refused while one is open was refused in silence: the dice would not
            move, the button that pressed them looked exactly as it had before,
            and the reason was written on a card behind the sheet. */}
        {error && (
          <p className="shrink-0 rounded border border-vermilion/50 bg-vermilion/10 px-2 py-1 text-xs text-vermilion">
            {/* A refusal that quotes a rule, like the ones in the corner: the
                number is the whole reason it names one. */}
            <WithRules text={error} />
          </p>
        )}

        <div className="flex min-h-0 flex-1 gap-4">
          {/* Whose turn this is, before the Karta it is about. Narrow on
              purpose: it is a label, and the space it takes comes out of the
              prose column rather than out of the sheet. */}
          {actor && (
            <div className="hidden w-[86px] shrink-0 flex-col gap-1.5 self-start sm:flex">
              {actor.characterId && characterStandeeUrl(actor.characterId) && (
                <Image
                  src={characterStandeeUrl(actor.characterId)!}
                  alt={actor.characterName}
                  width={86}
                  height={Math.round(86 / CHARACTER_ART_RATIO)}
                  style={{ width: 86, borderColor: seatColour(seatIndex ?? 0) }}
                  className="block h-auto rounded border"
                  unoptimized
                />
              )}
              <p className="truncate text-[11px] text-ink" title={actor.name}>
                {actor.name}
              </p>
              <p className="truncate font-[family-name:var(--font-display)] text-[11px] tracking-wide text-ochre">
                {actor.characterName}
              </p>
            </div>
          )}
          {art && (
            <div className="relative hidden shrink-0 self-start sm:block">
              {/* The size the Księga and every hover read a Karta at.
                  `PICTURE_WIDTH`, not a number of this sheet's own: it was 260
                  against their 208, so the one place a Karta is *being dealt
                  with* drew it bigger than the places you merely look one up,
                  and it pushed the sheet's own controls down the screen. */}
              <Image
                src={art}
                alt={label}
                width={PICTURE_WIDTH}
                height={Math.round(PICTURE_WIDTH * CARD_RATIO)}
                style={{ width: PICTURE_WIDTH }}
                className="block h-auto rounded border border-edge"
                priority
                unoptimized
              />
              {/* A staged fight is a Wróg the deck never dealt, and this is the
                  card you are looking at while you decide whether to run from
                  it. On the picture, where every other view puts it. */}
              {granted && (
                <Corner at="bottom-right" on="picture">
                  <CardMark mark="granted" size={MARK_SIZE.picture} />
                </Corner>
              )}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
            {children}
          </div>
        </div>
        {/* Under both columns and across the whole width, which is the shape of
            the thing it holds: a row of Karty on the table, with the one being
            dealt with above it. */}
        {footer && (
          <div className="shrink-0 border-t border-edge/60 pt-3">{footer}</div>
        )}
      </div>
    </Overlay>
  );
}
