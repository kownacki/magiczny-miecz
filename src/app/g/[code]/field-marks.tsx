"use client";

/** What a square is, in four silhouettes and a fan of Karty — the same row on the map and in the drawer. */

import { MARK_ICON, MARK_TITLE, type IconMark } from "@/lib/view/fieldMarks";
import { CARD_RATIO } from "@/lib/view/cardImages";

/**
 * The mark row, drawn in HTML.
 *
 * The map draws the same thing in SVG rather than reusing this — see
 * `board-map.tsx` — because a `foreignObject` inside a board that scales with
 * its viewBox is a second coordinate system to keep in step for no gain. What
 * they *do* share is `marksFor`, which is the part that could disagree: which
 * marks a square earns is a fact about the game, and how they are laid out is
 * each surface's own business.
 */
export function FieldMarks({
  marks,
  draw,
  /** Pixels. The drawer wants them at the height of a line of its own text. */
  size = 14,
}: {
  marks: readonly IconMark[];
  draw: number;
  size?: number;
}) {
  if (marks.length === 0 && draw === 0) return null;
  const backW = size / CARD_RATIO;
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {marks.map((mark) => (
        <span
          key={mark}
          title={MARK_TITLE[mark]}
          aria-label={MARK_TITLE[mark]}
          role="img"
          /* A mask, like every other silhouette in this app: the shape takes
             the colour it is standing in rather than carrying its own. */
          style={{
            width: size,
            height: size,
            backgroundColor: "currentColor",
            WebkitMaskImage: `url(${MARK_ICON[mark]})`,
            maskImage: `url(${MARK_ICON[mark]})`,
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
      ))}
      {draw > 0 && (
        <span
          className="inline-flex items-center gap-0.5"
          title={MARK_TITLE.karty}
          aria-label={`${draw} — ${MARK_TITLE.karty}`}
          role="img"
        >
          <span className="tnum" style={{ fontSize: size * 0.8 }}>
            {draw}×
          </span>
          <span className="inline-flex items-center">
            {Array.from({ length: draw }, (_, at) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={at}
                src="/cards/back-zdarzenie.jpg"
                alt=""
                className="rounded-[2px] border border-edge object-cover"
                /* Overlapped by half, the way the fan on the map is: several
                   Karty, in the width of two. */
                style={{
                  width: backW,
                  height: size,
                  marginLeft: at === 0 ? 0 : -backW / 2,
                }}
              />
            ))}
          </span>
        </span>
      )}
    </span>
  );
}
