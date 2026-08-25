"use client";

import Image from "next/image";
import { cardImageUrl } from "@/lib/engine/cardImages";
import { SLOT_LABEL, type Slot } from "@/lib/engine/slots";
import type { TileCard } from "./card-tile";

/**
 * What a character is wearing, laid out like a body.
 *
 * The arrangement is the point. A list of nine labelled rows says the same
 * things and answers none of the questions a player actually has — what is in
 * my off hand, is anything on my head, what happens if I put this on — because
 * those are questions about a shape. So the places sit where they sit on a
 * person: head above the body, hands either side of it, the mount and the bag
 * underneath where the load goes.
 *
 * Only in the slotted variant. In klasyczny play there is no body to lay out:
 * the rulebook has one kind of possession and one limit (5.4).
 */
export interface SlotItem {
  holdingId: string;
  cardId: string;
  card: TileCard;
}

/** Where each place sits in the three-column grid, by CSS grid area. */
const LAYOUT: Record<Slot, string> = {
  glowa: "1 / 2 / 2 / 3",
  amulet: "1 / 3 / 2 / 4",
  "reka-glowna": "2 / 1 / 4 / 2",
  tulow: "2 / 2 / 3 / 3",
  "reka-pomocnicza": "2 / 3 / 4 / 4",
  rekawice: "3 / 2 / 4 / 3",
  pierscien: "4 / 1 / 5 / 2",
  wierzchowiec: "4 / 2 / 5 / 3",
  sakwa: "4 / 3 / 5 / 4",
};

/** Drawn in the empty places, so a gap says which gap it is. */
const GLYPH: Record<Slot, string> = {
  glowa: "⛑",
  amulet: "◈",
  tulow: "⛊",
  "reka-glowna": "⚔",
  "reka-pomocnicza": "⛨",
  rekawice: "✋",
  pierscien: "◯",
  wierzchowiec: "🐴",
  sakwa: "🎒",
};

export function SlotPanel({
  worn,
  canAct,
  busy,
  onInspect,
  onTakeOff,
}: {
  /** What is in each place; missing keys are empty places. */
  worn: Partial<Record<Slot, SlotItem>>;
  canAct: boolean;
  busy: boolean;
  onInspect: (card: TileCard) => void;
  onTakeOff: (holdingId: string) => void;
}) {
  return (
    // Twice the size it started at. At 44 pixels a Hełm was a brown smudge and
    // the empty places were indistinguishable from one another, which is the
    // one thing a paper doll is for. Fixed rather than a fraction of the card:
    // a share of the width made the four rows taller than the panel had any
    // business being.
    <div
      className="grid shrink-0 gap-1.5"
      style={{
        gridTemplateColumns: "repeat(3, 84px)",
        gridAutoRows: "84px",
      }}
    >
      {(Object.keys(LAYOUT) as Slot[]).map((slot) => {
        const item = worn[slot];
        const src = item ? cardImageUrl(item.cardId) : null;
        return (
          <div
            key={slot}
            style={{ gridArea: LAYOUT[slot] }}
            className={`relative overflow-hidden rounded border ${
              item ? "border-ochre/60 bg-raised" : "border-dashed border-edge/70 bg-night/40"
            }`}
            title={item ? `${SLOT_LABEL[slot]}: ${item.card.name}` : SLOT_LABEL[slot]}
          >
            {item ? (
              <button
                type="button"
                onClick={() => onInspect(item.card)}
                className="block h-full w-full"
              >
                {src ? (
                  <Image
                    src={src}
                    alt={item.card.name}
                    width={110}
                    height={155}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="flex h-full items-center justify-center p-1 text-center text-[11px] leading-tight text-ink">
                    {item.card.name}
                  </span>
                )}
              </button>
            ) : (
              <span className="flex h-full items-center justify-center text-[26px] text-muted/30">
                {GLYPH[slot]}
              </span>
            )}

            {/* Taking it off is a corner, not a row of its own: nine places
                each with a button underneath is a form, and this is a paper
                doll. */}
            {item && canAct && (
              <button
                type="button"
                onClick={() => onTakeOff(item.holdingId)}
                disabled={busy}
                title="Zdejmij"
                className="absolute right-0 top-0 rounded-bl bg-night/85 px-1.5 text-[13px] leading-tight text-muted transition hover:text-vermilion disabled:opacity-40"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
