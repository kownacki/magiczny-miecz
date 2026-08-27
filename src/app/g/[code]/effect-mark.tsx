/** What a character is under, beside its name. */

import Image from "next/image";
import { type Nature } from "@/data/types";
import { CARD_NAMES, CARD_TEXTS, type Seat } from "./table";
import { cardArtUrl } from "@/lib/view/cardImages";
import { useCardPreview } from "./card-preview";
import { type TileCard } from "./card-tile";
import { SLOT_ART_HEIGHT, SLOT_WIDTH } from "./item-slot";

/** Twice what it was, and the shape every other card in the app is drawn in. */
const MARK_WIDTH = 40;


/**
 * The three tone marks, drawn rather than typed.
 *
 * `▲ ▼ ■` as characters are three glyphs from a font, and a font sizes them for
 * reading rather than for standing beside each other: the square came out
 * visibly smaller than the triangles and sat lower on the line. No amount of
 * CSS fixes that reliably, because it is the typeface's own metrics.
 *
 * Drawn, they are one shape language: the same box, the same optical area — a
 * triangle of base 8 and height 7 covers 28, so the square is 5.2 a side rather
 * than the 6 that would make it the heavier of the two — and `currentColor`, so
 * whatever colours the count colours the mark.
 */
export function ToneGlyph({ shape }: { shape: "up" | "down" | "square" }) {
  return (
    <svg
      viewBox="0 0 10 10"
      aria-hidden
      className="mr-0.5 inline-block h-[0.7em] w-[0.7em] align-[-0.05em]"
      fill="currentColor"
    >
      {shape === "up" && <path d="M5 1.5 L9 8.5 H1 Z" />}
      {shape === "down" && <path d="M5 8.5 L1 1.5 H9 Z" />}
      {shape === "square" && <rect x="2.4" y="2.4" width="5.2" height="5.2" />}
    </svg>
  );
}

export 
function EffectMark({
  mark,
  nature,
}: {
  mark: Seat["effects"][number];
  nature: Nature | null;
}) {
  const name = CARD_NAMES.get(mark.source);
  const card: TileCard | null = name
    ? {
        cardId: mark.source,
        name,
        text: CARD_TEXTS.get(mark.source),
        kindLabel: mark.title,
      }
    : null;
  const { handlers, preview } = useCardPreview(card, false, "classic", nature);
  const art = cardArtUrl(mark.source);
  // The shape a card is drawn in everywhere else: the illustration export is
  // 240x155 and every slot in the pack and on the body takes that ratio, so a
  // mark that took it too stopped needing to crop. A square was cutting the
  // sides off an Eliksir to make it fit a shape nothing else here uses.
  const height = Math.round(MARK_WIDTH * (SLOT_ART_HEIGHT / SLOT_WIDTH));
  const ring =
    mark.tone === "dobry"
      ? "border-verdigris text-verdigris"
      : mark.tone === "zly"
        ? "border-vermilion text-vermilion"
        : "border-edge text-muted";

  return (
    <>
      <span
        {...handlers}
        // The native tooltip only where there is no Karta to open instead: two
        // things appearing at once over the same mark is one too many.
        title={card ? undefined : mark.title}
        style={{ width: MARK_WIDTH, height }}
        className={`flex shrink-0 cursor-help items-center justify-center overflow-hidden rounded border leading-none ${ring}`}
      >
        {art ? (
          <Image
            src={art}
            alt=""
            width={MARK_WIDTH}
            height={height}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <span className="text-[15px]">{mark.glyph}</span>
        )}
      </span>
      {preview}
    </>
  );
}
