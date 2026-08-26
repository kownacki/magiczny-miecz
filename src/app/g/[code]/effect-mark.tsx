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
