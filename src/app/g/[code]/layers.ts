/** What paints over what, and which things a modal is not allowed to bury. */

/**
 * The stack, named once.
 *
 * It had grown a layer at a time and stopped being an order: the Karty library
 * opened at `z-40`, *under* the fight modal at `z-50`, so the one screen you
 * might open mid-fight to look a card up was the one the fight painted over.
 * The console had already worked this out and said so in its own comment —
 * "a way out that the thing you are escaping paints over is not a way out" —
 * and then sat alone at 110 while everything else stayed muddled.
 *
 * The rule the order encodes: **a modal owns the game, not the table.** What a
 * fight may cover is the board and the panels, because those are the game and
 * the fight is the part of it happening now. What it may not cover is anything
 * about the *table* — who is at it, what cards exist, the join code, the way
 * out. Those answer questions a player has *while* stuck in a fight, and half
 * of them exist to unstick it.
 *
 * The bar sits above the modals, and the drawers begin *below* it rather than
 * fighting it for the same strip — they are laid inside the layout's content
 * row, which already starts under it (`table-layout.tsx`). Ranking the two
 * against each other was the first way of getting this wrong: with the bar on
 * top it sliced the search box and the `zamknij` off the Karty library, and
 * with the drawer on top the roster hid Karty and the console behind it.
 *
 * Anything added here belongs above `modal` if somebody would want it while a
 * modal is open, and below if they would not.
 */
export const LAYER = {
  /** Sits on the board or in a panel: a journal, a badge, a card's corner. */
  onPage: "z-10",
  /** Said across the top of the page — an error, a banner. */
  banner: "z-30",
  /** The game happening: a fight, a drawn card, a field, a question. */
  modal: "z-50",
  /**
   * The table's own bar: code, decks, the Księga, Gracze, the way out.
   *
   * Above every sheet, which is the rule this file opens with — what a modal
   * may cover is the game, and the bar is the table. It sat at 60, under the
   * Karta at 90, so opening a card buried the one strip that is never about the
   * card: the way out, the counts, the drawer you were about to open next. The
   * Obszar never had the problem because it sits at 50, and the two behaved
   * differently for no reason anybody chose.
   *
   * It was low because drawers used to run the full height and fight it for the
   * same pixels — the bar on top sliced the search box off the Księga. They are
   * laid inside the layout's content row now, which begins *below* the bar, so
   * the two cannot overlap and the ordering between them costs nothing.
   */
  bar: "z-[100]",
  /**
   * The table's own surfaces, laid over a column: who is playing, and every
   * card in the box. One layer because they are one component (`drawer.tsx`)
   * and because they sit down opposite sides — the only way to see both at
   * once is to open both, and then neither is in the other's way.
   */
  drawer: "z-[70]",
  /**
   * One card, opened to be read.
   *
   * Above the drawers because it is usually opened *from* one — a shelf in the
   * library, somebody's pack in the roster — and a drawer that covers the card
   * it just handed you is a drawer that ate the answer. It was `modal` until
   * the library became a drawer, which on a narrower window put half the
   * picture behind the shelf it was picked from.
   */
  card: "z-[90]",
  /**
   * "Are you sure?", which must cover whatever asked it.
   *
   * It was `modal`, level with the fight and the Obszar, so the order came
   * down to which happened to be written first in `page.tsx` — and the
   * confirmations were. That cost nothing while every question was raised by a
   * control on the page itself; the moment an Obszar's shop asked one, the
   * answer to "spend 2 Sz. Z.?" was painted over by the shop that asked it,
   * leaving a darkened board and no way to say yes.
   *
   * Above `card` too: a Karta opened to be read is one of the things a player
   * decides to drop or use *from*.
   *
   * Below the console, which is the one thing this must not bury — it is the
   * way out of everything, and a way out you cannot reach because a dialog is
   * over it is not a way out.
   */
  confirm: "z-[95]",
  /** The test console, which exists to escape everything above. */
  console: "z-[110]",
  /**
   * The hover, which is not a place but a description of whatever is under the
   * pointer — so it is above everything that can be hovered, including the
   * drawer and the bar.
   */
  hover: "z-[130]",
  /**
   * The card stuck to the pointer, which is above even that.
   *
   * It is not a description of anything: it is a thing the player is holding,
   * and a held thing that goes behind a panel has been dropped as far as the
   * eye is concerned. It sat at `z-50` — level with the modals, under the bar
   * and every drawer — from before this file existed.
   */
  carried: "z-[140]",
} as const;
