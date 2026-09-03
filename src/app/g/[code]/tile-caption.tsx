"use client";

/**
 * A card's name, and the things you can do to it in the same place.
 *
 * Every tile in this app was three things stacked: the picture, the name under
 * it, and a row of words under that. Which is fine for one card and is not what
 * a hand of twenty-nine Zaklęcia looks like — the screen becomes a wall of
 * „odrzuć", one per card, all identical, none of them the thing a player is
 * reading the row for. The names are what you scan; the controls are what you
 * reach for once you have found the one you want.
 *
 * So they share a line. The name is there at rest, and the pointer replaces it
 * with the controls for the card it is over — which is the card those controls
 * belong to, so the swap says whose they are more clearly than a caption under
 * them ever did. Nothing is hidden that was not already implied: a control that
 * only appears under the pointer is the same offer, made at the moment somebody
 * is asking.
 *
 * **Not a toggle and not a click.** Hover, plus `focus-within` so the keyboard
 * reaches everything the mouse does — tabbing into a card's „odrzuć" brings it
 * into view along with it. A slow turn-based game does not need a switch to
 * hide its own controls.
 *
 * The controls are absolutely placed over the caption's line, so the row's
 * height is the name's whether or not anything is showing and no tile moves
 * under the pointer that is about to press it. A control set tall enough to
 * spill — the Różdżka's „dobierz Zaklęcie" beside the rest — spills downward
 * over its own tile's gap rather than pushing the grid about.
 */
export function TileCaption({
  width,
  name,
  title,
  tone = "text-muted",
  children,
}: {
  width: number;
  name: React.ReactNode;
  /** The whole name, for a caption that had to be truncated to fit. */
  title?: string;
  /** Dimmer where the card is not the reader's to act on — `ItemSlot`'s call. */
  tone?: string;
  /** What may be done to this card, or nothing. */
  children?: React.ReactNode;
}) {
  return (
    <div className="relative" style={{ width }}>
      <figcaption
        title={title}
        className={`truncate text-center text-[9px] leading-tight ${tone} ${
          children ? "group-hover/tile:invisible group-focus-within/tile:invisible" : ""
        }`}
      >
        {name}
      </figcaption>
      {/* A little more room underneath to be pointing at.
      
          The controls sit on the name's own line, which is eleven pixels tall,
          and a pointer drifting a hair below it lost them mid-reach — the
          shorter the target the more often that is the pointer on its way *to*
          the target. This is that line's apron: transparent, inside the figure
          so it keeps `group-hover` alive, and exactly the row's own `gap-2`
          tall so it fills the space between this tile and the one below
          without ever reaching it. Nothing is laid out by it, so no tile moves.

          Only where there is something to reach for. An apron under a card
          with no controls would be eight pixels of nothing, quietly answering
          for its neighbour. */}
      {children ? <span aria-hidden className="absolute inset-x-0 top-full h-2" /> : null}
      {children ? (
        /* The caption's own typography, because these two take turns on one
           line: `text-[9px] leading-tight` is what the name is set in, and
           without it the controls inherited the panel's 24px line-height and
           sat a whole half-line below the word they replace.

           The pixel up is an *optical* correction and not a geometric one —
           the boxes were already flush. Measured: caption and controls both sit
           at top 88 with a height of 11.25px, on the same baseline, and the
           controls still read low. A card's name is set in capitals, so its ink
           fills the cap height and stops at the baseline; „odrzuć" is lowercase
           with nothing above the x-height and an underline hanging below it, so
           the same baseline puts noticeably more of the word underneath the
           line than above it. Their optical centres are about 1.7px apart. One
           whole pixel takes most of that back and stays crisp, which 1.5 does
           not. */
        <div className="absolute inset-x-0 top-0 z-10 hidden -translate-y-px flex-col items-center text-[9px] leading-tight group-hover/tile:flex group-focus-within/tile:flex">
          {children}
        </div>
      ) : null}
    </div>
  );
}
