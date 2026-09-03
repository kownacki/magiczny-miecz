"use client";

/**
 * A player's name, with „(ty)" where it is the reader's own.
 *
 * One component because the same two words are drawn in two places that must
 * agree: the Gracze drawer, which is the list you check yourself against, and
 * the sheet's actor column, which says whose turn is being played. A list that
 * marks you and a panel that does not is a panel you have to read the name of.
 *
 * The dot is each caller's own. It sits inline in one and beside a two-line
 * block in the other, and a component that owned it would have to be told which
 * — one prop to save four characters of markup.
 */
export function PlayerName({
  name,
  mine = false,
}: {
  name: string;
  /** Whether this is the seat this device drives. */
  mine?: boolean;
}) {
  return (
    <>
      {name}
      {mine && <span className="ml-1 text-[11px] text-ochre">(ty)</span>}
    </>
  );
}
