"use client";

import Image from "next/image";
import { CardMark } from "./card-mark";
import { Overlay } from "./overlay";
import { ChromeButton } from "./chrome";

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
   * Whether a watcher has folded this away.
   *
   * Only ever a watcher's: the player whose turn it is cannot put their own
   * fight in a corner, because it is the thing they are being asked to do and
   * the game does not go on without it. Which is why the sheet applies it
   * against `canAct` rather than trusting the flag.
   */
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  /** A refusal from the last thing pressed, said inside the sheet that hides it. */
  error: string | null;
}

export function DrawSheet({
  label,
  art,
  granted = false,
  canAct,
  watching,
  minimized,
  onMinimize,
  onRestore,
  error,
  wide = false,
  children,
}: SheetChrome & {
  label: string;
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
  children: React.ReactNode;
}) {
  // Folded away, a watcher gets a line at the foot of the screen instead of a
  // sheet over it. It still says what is going on — which is most of what the
  // modal was for — and the board is visible behind it again.
  if (minimized && !canAct) {
    return (
      <button
        onClick={onRestore}
        className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-ochre/50 bg-panel px-4 py-2 text-xs text-ink shadow-[0_4px_20px_rgba(0,0,0,0.6)] transition hover:border-ochre"
      >
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-ochre"
          aria-hidden
        />
        {watching} — <span className="text-ochre">pokaż</span>
      </button>
    );
  }

  return (
    // The undismissable one, and it says so rather than merely lacking the
    // handlers. This sheet is the game asking: a fight is not over because you
    // pressed Escape, and a Karta you drew is drawn whether or not you would
    // rather it were not. The ways out are the ones the rules have — fight it,
    // flee it (19.1), leave it lying there (16.8) — plus `przerwij walkę` while
    // testing, and folding it away if you are only watching.
    <Overlay label={label} onDismiss={null}>
      <div
        className={`flex max-h-[90vh] w-full flex-col gap-3 overflow-hidden rounded-lg border border-ochre/40 bg-panel p-4 shadow-[0_8px_40px_rgba(0,0,0,0.7)] ${
          wide ? "max-w-5xl" : "max-w-3xl"
        }`}
      >
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
              {label}
            </h2>
            {!canAct && (
              <span className="truncate text-[11px] uppercase tracking-wide text-muted">
                {watching} — oglądasz
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!canAct && (
              <ChromeButton
                glyph="minimise"
                title="Zwiń do paska — plansza znowu widoczna"
                onClick={onMinimize}
              />
            )}
          </div>
        </header>

        {/* Said here, because here is where it happened.

            A modal covers the panel that used to carry these, so anything
            refused while one is open was refused in silence: the dice would not
            move, the button that pressed them looked exactly as it had before,
            and the reason was written on a card behind the sheet. */}
        {error && (
          <p className="shrink-0 rounded border border-vermilion/50 bg-vermilion/10 px-2 py-1 text-xs text-vermilion">
            {error}
          </p>
        )}

        <div className="flex min-h-0 flex-1 gap-4">
          {art && (
            <div className="relative hidden shrink-0 self-start sm:block">
              <Image
                src={art}
                alt={label}
                width={300}
                height={500}
                className="h-auto w-[260px] rounded border border-edge"
                priority
                unoptimized
              />
              {/* A staged fight is a Wróg the deck never dealt, and this is the
                  card you are looking at while you decide whether to run from
                  it. On the picture, where every other view puts it. */}
              {granted && (
                <span className="absolute bottom-1 right-1 rounded bg-night/85 px-1 py-0.5">
                  <CardMark mark="granted" size={26} />
                </span>
              )}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </Overlay>
  );
}
