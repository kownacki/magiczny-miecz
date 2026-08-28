"use client";

/** One row of card squares, wherever the seat card draws a handful of them. */

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
 * **`overflow-hidden` is load-bearing**, and it is the pack's reason that
 * generalised. A card at the start of a wrapped row steps aside into nothing —
 * there is no room inside the rectangle to its left — so it leans out past the
 * edge, and clipped by anything further out it reads as a card floating over
 * the panel rather than one half out of the bag. The row's own border is the
 * right place to cut it. There is room for the tiles' hover ring inside the
 * padding, so nothing that should show gets cut with it.
 */
export function TileRow({
  answer = null,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onPointerMove,
  onPointerLeave,
  children,
}: {
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
      className={`flex flex-wrap gap-2 overflow-hidden rounded border p-1 transition ${tone}`}
    >
      {children}
    </div>
  );
}
