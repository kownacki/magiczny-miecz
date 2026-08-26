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
  /** The table's own bar: code, decks, Karty, Gracze, the way out. */
  bar: "z-[60]",
  /**
   * The table's own surfaces, laid over a column: who is playing, and every
   * card in the box. One layer because they are one component (`drawer.tsx`)
   * and because they sit down opposite sides — the only way to see both at
   * once is to open both, and then neither is in the other's way.
   */
  drawer: "z-[70]",
  /** The test console, which exists to escape everything above. */
  console: "z-[110]",
  /**
   * The hover, which is not a place but a description of whatever is under the
   * pointer — so it is above everything that can be hovered, including the
   * drawer and the bar.
   */
  hover: "z-[130]",
} as const;
