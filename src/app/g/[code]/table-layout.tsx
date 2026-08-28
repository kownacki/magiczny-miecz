"use client";

import { LAYER } from "./layers";
import type { SeatCharacter } from "@/lib/engine/characters";
import type { TileCard } from "./card-tile";

/**
 * The game screen: a board on the left, everything about you on the right.
 *
 * It does not scroll as a page. A board game is a thing you look *at* — the map,
 * your character and the choice in front of you have to be on screen together,
 * because deciding where to move means comparing all three. The old single
 * column put the board a scroll away from the buttons that acted on it, which is
 * the one arrangement that cannot work.
 *
 * So the frame is exactly the viewport, the two columns are independent, and only
 * the right-hand column scrolls — the board never moves out from under you.
 *
 * They are not halves. The board is square and sized by whichever of its two
 * axes runs out first, which on any laptop is the height — so half the width
 * was more than it could ever use, and the slack sat as empty gutter beside it
 * while the right-hand column, which holds the character, the holdings and
 * every button, scrolled. The split is the golden ratio instead, the larger
 * share to the right: 61.8 / 38.2.
 */
/**
 * The bar across the top of a table, in the poczekalnia and in the game.
 *
 * One component because it is one bar: the same name on the left, the same
 * doors on the right, and the same height — which is the part that showed. The
 * lobby had a copy of these classes with `gap-y-2` instead of `gap-y-1`, and a
 * join code three lines tall inside it, so the two screens were thirty pixels
 * apart and the whole page appeared to jump on starting the game.
 *
 * Height is left to the content on purpose. Both bars are `py-2` around a
 * `text-lg` title, so anything that stays on one line beside it keeps them
 * level; anything that does not is what makes them differ, which is the fault
 * to fix rather than a number to pin here.
 */
export function TableBar({ children }: { children: React.ReactNode }) {
  return (
    <header
      // Marked so a drawer can tell the bar apart from "elsewhere": clicking
      // the bar is never a way of being finished with a drawer, and clicking
      // it is usually a way of opening the other one. See `drawer.tsx`.
      data-table-bar
      className={`relative flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-edge bg-night px-4 py-2 ${LAYER.bar}`}
    >
      {children}
    </header>
  );
}

export function TableLayout({
  header,
  map,
  right,
  drawer,
}: {
  header: React.ReactNode;
  map: React.ReactNode;
  right: React.ReactNode;
  /** Laid over the columns, below the bar — see the note on the row below. */
  drawer?: React.ReactNode;
}) {
  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden">
      {/* Above the modals, and opaque.
          
          A fight owns the game; it does not own the table. The bar carries the
          join code, the decks, the way into every card in the box, who is
          sitting here and the way out — every one of those is a thing somebody
          wants *while* a modal has them stuck, and three of them exist to get
          them unstuck. It used to be dimmed and unclickable behind whatever was
          open, which made the fight the only thing on the screen at exactly the
          moment that is least true. `bg-night` because the modals' own backdrop
          would otherwise show through it. */}
      <TableBar>{header}</TableBar>
      {/* `relative`, so a drawer can be laid over the columns and start *below*
          the bar rather than beside it. Overlapping the two put the roster's
          own header level with the bar's right-hand end and hid Karty and the
          console behind it — the same mistake as the bar covering the Karty
          library, made the other way round. */}
      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* The short side of the ratio, and the board is sized to fill it
            rather than to a fixed width: on a laptop the height is what runs
            out first, so this is a ceiling the board rarely reaches. */}
        {/* No padding under this one: the journal is the last thing in it and
            sits on the bottom edge, so twelve pixels of panel below a panel is
            just a strip of nothing at the bottom of the screen. */}
        <section className="flex min-h-0 shrink-0 items-center justify-center border-edge px-3 pt-3 lg:h-full lg:w-[38.2%] lg:shrink lg:border-r">
          {map}
        </section>
        {/* Two things park over the foot of this column and both publish what
            they take: the console sets `--console-h` while it is open, and the
            turn's pill sets `--fab-h` while it is drawn (which is whenever every
            window is shut, so most of the time). Each is zero when its owner is
            not on screen, so this one line is right for all of the combinations
            without asking which.

            The console alone was not enough. It is docked to the bottom of this
            column and the pill is centred on the *window*, so on a wide screen
            the pill lands over this column too — a full pill's height above
            what the padding had allowed for, sitting on the last row of the
            seat card.

            Padding rather than a shorter column, so nothing reflows when either
            is resized: the panel keeps its height and its last row simply
            scrolls clear of what is parked over it. */}
        <section
          style={{
            paddingBottom: "calc(0.75rem + var(--console-h, 0px) + var(--fab-h, 0px))",
          }}
          className="min-h-0 flex-1 overflow-y-auto p-3 lg:w-[61.8%]"
        >
          {right}
        </section>
        {drawer}
      </div>
    </main>
  );
}

export interface PublicSeat {
  id: string;
  seatIndex: number;
  playerName: string | null;
  /**
   * Whoever is driving it, and null when nobody is.
   *
   * Carried because the host's controls act on a *person* — kicking somebody
   * and handing them the host role are both about them and not about the chair
   * — and a chair is what this object otherwise describes.
   */
  driverId: string | null;
  characterId: SeatCharacter | null;
  fieldName: string;
  /** The id behind that name, so the Obszar can be looked at rather than read. */
  fieldId: string | null;
  miecz: number;
  swordOwn: number;
  magia: number;
  magicOwn: number;
  life: number;
  gold: number;
  nature: string | null;
  eliminated: boolean;
  /**
   * Somebody is driving this chair.
   *
   * False is a Postać standing on the board with nobody speaking for it, which
   * is an ordinary mid-game state: the player closed their laptop, or gave the
   * seat up and stayed to watch. The figure keeps everything it owns.
   */
  driven: boolean;
  /** Device has gone quiet — a closed tab rather than a decision. */
  away: boolean;
  isHost: boolean;
  turnsLost: number;
  cards: TileCard[];
  hiddenSpells: number;
}
