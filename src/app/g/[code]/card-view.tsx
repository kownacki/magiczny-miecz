"use client";

import Image from "next/image";
import { cardImageUrl } from "@/lib/engine/cardImages";
import { CARD_CLASS_LABEL, type CardClass } from "@/data/types";

export interface ShownCard {
  cardId: string;
  cardClass: string;
  ref?: string;
  name: string;
}

/**
 * The cards in play this turn, as pictures.
 *
 * In simulation this is the only way to see what you drew. At a physical table
 * it settles "what does this one do again?" without the card being passed round
 * four people — and it shows the whole stack at once, which is the bit that is
 * genuinely awkward in real life when Płaskowyż Mgieł makes you draw three.
 */
export function CardView({ cards }: { cards: ShownCard[] }) {
  if (cards.length === 0) return null;

  return (
    <aside className="flex flex-col gap-3">
      <h3 className="text-xs uppercase tracking-widest text-muted">
        {cards.length === 1 ? "Wyciągnięta karta" : `Wyciągnięte karty (${cards.length})`}
      </h3>
      {cards.map((card, position) => (
        <CardImage key={`${card.cardId}-${position}`} card={card} position={position} total={cards.length} />
      ))}
    </aside>
  );
}

function CardImage({
  card,
  position,
  total,
}: {
  card: ShownCard;
  position: number;
  total: number;
}) {
  const url = cardImageUrl(card.cardId, card.ref);
  const label = CARD_CLASS_LABEL[card.cardClass as CardClass] ?? card.cardClass;

  return (
    <figure className="overflow-hidden rounded-lg border border-edge bg-panel">
      {url ? (
        <Image
          src={url}
          alt={card.name}
          width={420}
          height={700}
          className="h-auto w-full"
          // The cards are the point of the panel, so the first one should not
          // wait its turn behind anything else on the page.
          priority={position === 0}
          unoptimized
        />
      ) : (
        // A checkout without the generated images still plays; the transcribed
        // text is already shown beside this panel.
        <div className="px-3 py-6 text-center text-xs text-muted">
          brak skanu tej karty
        </div>
      )}
      <figcaption className="flex items-baseline justify-between gap-2 border-t border-edge px-3 py-2">
        <span className="text-sm text-ink">{card.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {total > 1 ? `${position + 1}. ` : ""}
          {label}
        </span>
      </figcaption>
    </figure>
  );
}
