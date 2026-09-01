"use client";

/** One row of card squares, wherever the app draws a handful of them. */

/**
 * How a row is answering a card in the air, or null when it is not a target.
 *
 * The colour is the row's own: green and red are the pack saying whether 5.4
 * will have this card, and the Magia purple is the spell rack, which has no
 * second answer because nothing else can land there.
 */
export interface RowAnswer {
  colour: "verdigris" | "vermilion" | "magia";
  /** The pointer is inside, so the answer is being given rather than offered. */
  over: boolean;
}

const ANSWER: Record<RowAnswer["colour"], { over: string; near: string }> = {
  verdigris: {
    over: "border-solid border-verdigris bg-verdigris/25",
    near: "border-dashed border-verdigris/60 bg-verdigris/10",
  },
  vermilion: {
    over: "border-solid border-vermilion bg-vermilion/25",
    near: "border-dashed border-vermilion/60 bg-vermilion/10",
  },
  magia: {
    over: "border-solid border-magia bg-magia/25",
    near: "border-dashed border-magia/60 bg-magia/10",
  },
};

/**
 * The box four sections were each drawing for themselves, and differently.
 *
 * The Plecak, the Przyjaciele, the Zaklęcia and the Trofea all hold a wrapped
 * row of `ItemSlot`s, and all four had written out their own — `gap-2` against
 * `gap-3`, `p-1` against nothing, a border on two of them and not the others.
 * A transparent border still occupies its pixel, so the four rows started at
 * three different x positions down one column, which is exactly the sort of
 * thing that is invisible until you see it and then impossible to unsee.
 *
 * So the geometry lives here and the sections say only what is theirs: whether
 * a card can be dropped in, and what is inside.
 *
 * It outgrew the seat card. The roster, the Księga's shelf and the Obszar's
 * pile of Karty all drew the same row of the same 86px tiles and all three had
 * written out their own spacing — `gap-2` in two places and `gap-3` in the
 * other two — so the same eight cards sat differently depending on which panel
 * you were looking at them in. `size` and `columns` are what those three
 * needed that the seat card's four did not.
 *
 * **`overflow-hidden` is load-bearing**, and it is the pack's reason that
 * generalised. A card at the start of a wrapped row steps aside into nothing —
 * there is no room inside the rectangle to its left — so it leans out past the
 * edge, and clipped by anything further out it reads as a card floating over
 * the panel rather than one half out of the bag. The row's own border is the
 * right place to cut it. There is room for the tiles' hover ring inside the
 * padding, so nothing that should show gets cut with it.
 */
/**
 * The space a row leaves around its tiles, by what is in it.
 *
 * Two sizes of art tile in the whole app and one ratio between them: 8px
 * around an 86px card and 4px around a 40px mark are both a shade under a
 * tenth of the tile. A mark row given the card row's gap reads as a row with
 * something missing between its items, which is what it looked like beside a
 * name.
 */
export const TILE_GAP = {
  /** `TILE_WIDTH` — a Przedmiot, a Zaklęcie, a Karta on an Obszar. */
  card: "gap-2",
  /** `MARK_WIDTH` — an effect beside a name. */
  mark: "gap-1",
} as const;

export type TileSize = keyof typeof TILE_GAP;

export function TileRow({
  size = "card",
  columns,
  frame = true,
  answer = null,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onPointerMove,
  onPointerLeave,
  children,
}: {
  /** What is in the row, which is what decides how much space goes round it. */
  size?: TileSize;
  /**
   * A fixed number of columns instead of a wrapping row.
   *
   * The Księga's shelf is laid out for five across and says so in its headings,
   * and a wrapped row only fits five while the panel is wide enough — so every
   * pixel spent on padding or a scrollbar could take a column away. Columns of
   * `1fr` cannot lose one, and the leftover spreads between them rather than
   * pooling past the last tile.
   */
  columns?: number;
  /**
   * The inset and the border the seat card's rows carry.
   *
   * They are there to be a drop target: a card can be dragged into the Plecak
   * and the row lights up to say so. A shelf you only read wants the tiles
   * against the panel's own padding instead, so it turns this off — and with
   * it the border, which would otherwise be a rectangle round something that
   * cannot be dropped into.
   */
  frame?: boolean;
  answer?: RowAnswer | null;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  /**
   * The pack watches the pointer as well as the drag, because a card carried on
   * the cursor is not a drag and fires none of the drag events.
   */
  onPointerMove?: React.PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: React.PointerEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const tone = answer
    ? ANSWER[answer.colour][answer.over ? "over" : "near"]
    : // Transparent rather than absent: the pixel is reserved either way, so a
      // row does not jump sideways the moment a card leaves the deck.
      "border-transparent";
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      /**
       * Columns the width of a tile, and the leftover past the last one.
       *
       * `1fr` columns were the first try and they put the slack in the wrong
       * place: a column wider than its tile spaces the tiles apart, so the
       * shelf sat at 11px between cards while every other row in the app sat
       * at 8. `max-content` is the tile's own width — `CardTile` is a fixed
       * 86 — so the gap is the gap and the spare stays outside the block.
       *
       * `start`, and not `center`, which is where the spare went first. A
       * centred block reads perfectly while the row is full and wrongly the
       * moment it is not: two cards found by a search sat in the middle of the
       * panel, so the same card was in a different place depending on how many
       * came back with it. Every other row of cards in the app begins at the
       * left edge — they are `flex-wrap`, which has no choice — and a shelf
       * that agreed with them everywhere but the short rows was the odd one.
       *
       * It also takes the scrollbar out of the arithmetic. Columns of a fixed
       * width, anchored left, sit exactly where they sat whether or not the
       * panel is scrolling; centred, every tile stepped sideways by half a
       * scrollbar as you moved between a long shelf and a short one, which is
       * the whole reason the drawer used to reserve the room permanently.
       */
      style={
        columns
          ? { gridTemplateColumns: `repeat(${columns}, max-content)` }
          : undefined
      }
      className={`${columns ? "grid" : "flex flex-wrap"} ${TILE_GAP[size]} transition ${
        // The clip belongs to the frame, and only to it: it is there to cut a
        // card leaning out of the bag against the row's own border. Unframed
        // there is no border to cut against and no padding to keep a tile's
        // hover ring inside, so clipping would trim the ring off whichever
        // tile sits at an edge.
        frame ? `overflow-hidden rounded border p-1 ${tone}` : ""
      }`}
    >
      {children}
    </div>
  );
}
