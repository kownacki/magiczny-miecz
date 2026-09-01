/** A pile of identical tokens, overlapped to fit a box — the rail's gold, and an Obszar's. */

import Image from "next/image";
import { coinOverlap, pileColumns } from "@/lib/view/tokens";

/**
 * The two colours printed on a żeton, read off the scans rather than guessed:
 * the field it is printed on and the ink of the numeral standing on it.
 *
 * `MoreThanFits` is the one square on a pile that is drawn instead of
 * photographed, and this is what keeps it from announcing the fact.
 */
export const TOKEN_INK: Record<string, { field: string; ink: string }> = {
  sword: { field: "#ff4f14", ink: "#fff300" },
  magic: { field: "#404491", ink: "#f0f8f1" },
  life: { field: "#009640", ink: "#fff508" },
  // The coin is the one with nothing to copy: it carries no numeral, so it has
  // no ink of its own and the dots take a dark gold — the colour a stamp on a
  // coin would be, against the yellow the rest of the stack is.
  gold: { field: "#fff300", ink: "#6f5300" },
};

/**
 * The last square of a pile that has outgrown its room.
 *
 * A pile filled to its ceiling used to look exactly like a pile that merely
 * happened to be full: fifteen żetony of four read as sixty whether the seat
 * had sixty or nine hundred, and the only thing that knew the difference was
 * the numeral underneath. The picture had stopped counting without admitting
 * it.
 *
 * So the last token stands down and says there is more. One square of picture
 * is a cheap price at a size where nobody is counting the pile anyway, and
 * anybody who misses the mark still has the exact figure printed beside it.
 *
 * Kept from a screen reader: the first token in the pile already announces the
 * parameter and its value, and this adds nothing a listener does not have.
 *
 * Drawn as a żeton and not as a control. It was a dashed outline over the panel
 * for a while, which is the costume every button in this app wears — so the one
 * square on the rail that does nothing was the one square that looked like it
 * did. It wears the pile's own field and ink instead: last in the row, plainly
 * part of it, and plainly not a number.
 */
export function MoreThanFits({
  stat,
  size,
  /** The overlap a coin in a stack sits at, so the mark stacks like one. */
  lift,
}: {
  stat: string;
  size: number;
  lift?: number;
}) {
  const { field, ink } = TOKEN_INK[stat] ?? TOKEN_INK.sword;
  /**
   * Three dots, drawn rather than typed.
   *
   * A "…" is text, and text on a line sits on its baseline: centring the line
   * box in the square leaves the ink four and a half pixels low, because an
   * ellipsis is all descender-less and hugs the bottom of the em. Measured, not
   * guessed — but the correction is a share of Inter's own metrics, and a
   * magic percentage that quietly stops being right if the font ever falls back
   * is a worse thing to leave behind than three circles.
   *
   * Sized off `size` so they stay the same dots at whatever a żeton is drawn
   * at, and heavy enough to read as the printed ink rather than as punctuation.
   */
  const dot = Math.max(2, Math.round(size * 0.18));
  const gap = Math.max(1, Math.round(size * 0.07));
  return (
    <span
      style={{ width: size, height: size, marginTop: lift, background: field }}
      aria-hidden
      // The coins carry a shadow because they overlap and a stack needs its
      // edges; the żetony sit apart and do not. Whichever pile this ends, it
      // is drawn the way the pictures above it are.
      className={`flex items-center justify-center rounded-[2px] ${
        lift === undefined ? "" : "shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
      }`}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          style={{
            width: dot,
            height: dot,
            background: ink,
            marginLeft: index === 0 ? 0 : gap,
          }}
          className="rounded-full"
        />
      ))}
    </span>
  );
}

/**
 * A number of identical tokens, drawn as the pile they are.
 *
 * # Why this is one component and not two
 *
 * It was two, and they were the same component. The rail beside a Karta Postaci
 * draws a seat's Sztuki Złota; the Obszar's window draws the ones lying on a
 * square (12.1). Different sizes, different boxes, different ceilings — and
 * character for character the same twenty lines: columns filled one at a time,
 * every token after the first lifted by its overlap, a mark on the end when the
 * pile outgrew its room. The second was written by reading the first, which is
 * the arrangement where a fix to one of them is a fix to one of them.
 *
 * What actually varies is four numbers and a picture, so those are the props
 * and everything else is settled here.
 *
 * # Why only the gold uses it
 *
 * Because only the gold is identical. There is one gold denomination in the
 * box, so a hoard is that many copies of one coin and overlapping them loses
 * nothing — a stack of chips is recognised from across a table, where a row of
 * identical coins has to be counted. The Miecz, Magia and Życie żetony come in
 * four denominations (1.3, 2.3, 4.1) and which ones they are is half the
 * reading, so those sit apart with their faces showing and are not this.
 *
 * The name says coin for that reason. Nothing here forbids another square
 * picture, but a caller reaching for it with tokens that have faces is making
 * the mistake this comment is here to name.
 */
export function CoinStack({
  count,
  src,
  size,
  perStack,
  maxColumns,
  gap,
  stat = "gold",
  title,
  alt = "",
}: {
  count: number;
  /** The one picture every token in the pile is a copy of. */
  src: string;
  /** How wide and tall one token is drawn. They are square. */
  size: number;
  /** How deep one column stands before the next is started. */
  perStack: number;
  /** How wide the pile may grow before it stops counting and says so. */
  maxColumns: number;
  /** Between columns. The rail's piles nearly touch; an Obszar's take a tile's gap. */
  gap: number;
  /** Whose colours the "more than fits" mark wears. */
  stat?: string;
  title?: string;
  /**
   * Read once, by the very first token, or not at all.
   *
   * A pile is one fact — a number — and giving every copy of one picture a
   * label has a screen reader count the stack aloud. Callers that print the
   * figure beside the pile pass nothing and hide the whole thing instead.
   */
  alt?: string;
}) {
  const overlap = coinOverlap(size);
  const lift = overlap - size;
  const { columns, drawn, cut } = pileColumns(count, perStack, maxColumns);

  return (
    <span
      className="flex shrink-0 items-start"
      style={{ gap }}
      title={title}
      aria-hidden={alt === "" ? true : undefined}
    >
      {Array.from({ length: columns }, (_, column) => (
        <span key={column} className="flex flex-col items-center">
          {Array.from({ length: Math.min(perStack, drawn - column * perStack) }, (_, at) => (
            <Image
              key={at}
              src={src}
              alt={column === 0 && at === 0 ? alt : ""}
              width={size}
              height={size}
              // The top token stands whole; every one under it is lifted onto
              // the one before, leaving `overlap` of it showing.
              style={at > 0 ? { marginTop: lift } : undefined}
              className="rounded-[2px] shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
              unoptimized
            />
          ))}
          {cut && column === columns - 1 && <MoreThanFits stat={stat} size={size} lift={lift} />}
        </span>
      ))}
    </span>
  );
}
