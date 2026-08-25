"use client";

/**
 * One place a card can sit, whether that place is on the body or in the pack.
 *
 * The pack and the paper doll had grown apart: different sizes, different hover
 * behaviour, and clicking meant one thing in the pack and another on the body.
 * They are the same object to a player — a card you can pick up and put
 * somewhere else — so they are one component here, and anything that should
 * feel the same is the same code rather than two copies kept in step by hand.
 *
 * The picture is the illustration cut off the card, never the card itself: at
 * this size a whole card is a four-pixel title over a grey smear of prose. The
 * whole card is a hover away, and that hover is shared too.
 */

import Image from "next/image";
import { cardArtUrl } from "@/lib/engine/cardImages";
import { useCardPreview } from "./card-preview";
import type { TileCard } from "./card-tile";

/**
 * One size, everywhere.
 *
 * The illustration export cuts 240x155, so the picture box takes that shape.
 * Anything else either letterboxes the art or crops it, and every card in the
 * box has the same proportions, so one ratio serves all of them.
 */
export const SLOT_WIDTH = 96;
export const SLOT_ART_HEIGHT = Math.round(SLOT_WIDTH * (155 / 240));

export interface SlotOccupant {
  holdingId: string;
  cardId: string;
  card: TileCard;
}

/** How the place should look, which is mostly about what a moving card would do. */
export type SlotTone = "empty" | "filled" | "accepts" | "rejects" | "candidate";

const TONE: Record<SlotTone, string> = {
  // Green if it would go here, red if it would not — said while the card is
  // still in the air, rather than as a refusal after the fact.
  accepts: "border-verdigris bg-verdigris/25",
  rejects: "border-vermilion bg-vermilion/25",
  candidate: "border-verdigris/50 bg-verdigris/5",
  filled: "border-ochre/60 bg-raised",
  empty: "border-dashed border-edge/70 bg-night/40",
};

export function ItemSlot({
  item,
  label,
  glyph,
  tone,
  lifted = false,
  dimmed = false,
  badge,
  draggable = false,
  disabled = false,
  onClick,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onPointerEnter,
  onPointerLeave,
  corner,
  children,
}: {
  /** What is here, or null for an empty place. */
  item: SlotOccupant | null;
  /** Written under the picture: the card's name, or what the empty place is for. */
  label: string;
  /** Drawn in an empty place, so a gap says which gap it is. */
  glyph?: string;
  tone: SlotTone;
  /** It is on the cursor; this is the hollow it left. */
  lifted?: boolean;
  dimmed?: boolean;
  /** A short flag over the corner of the picture — a price, "trofeum". */
  badge?: string;
  draggable?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onDragStart?: (event: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  /** Drawn over the top-right of the picture, such as the take-off cross. */
  corner?: React.ReactNode;
  /** Controls under the name. */
  children?: React.ReactNode;
}) {
  // The hover is suppressed while the card is on the cursor: what is under the
  // pointer then is a hollow, and describing it as though it still held
  // something is a lie.
  const { handlers, preview } = useCardPreview(item && !lifted ? item.card : null);
  const art = item ? cardArtUrl(item.cardId) : null;

  return (
    <figure style={{ width: SLOT_WIDTH }} className="flex shrink-0 flex-col items-center gap-1">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        style={{ width: SLOT_WIDTH, height: SLOT_ART_HEIGHT }}
        className={`relative overflow-hidden rounded border transition ${TONE[tone]}`}
      >
        <button
          type="button"
          disabled={disabled}
          draggable={draggable}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          {...handlers}
          title={item ? item.card.name : label}
          className={`block h-full w-full transition ${
            draggable ? "cursor-grab active:cursor-grabbing" : disabled ? "cursor-default" : "cursor-pointer"
          } ${lifted ? "opacity-25" : dimmed ? "opacity-45" : ""}`}
        >
          {item && art ? (
            <Image
              src={art}
              alt={item.card.name}
              width={SLOT_WIDTH}
              height={SLOT_ART_HEIGHT}
              className="h-full w-full object-cover"
            />
          ) : item ? (
            // No scan in this checkout: the name is what the picture stood for.
            <span className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] leading-tight text-ink">
              {item.card.name}
            </span>
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[22px] text-muted/30">
              {glyph}
            </span>
          )}
        </button>

        {badge && !lifted && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-night/85 px-1 text-center text-[9px] leading-tight text-ochre">
            {badge}
          </span>
        )}
        {corner}
      </div>

      <figcaption
        style={{ width: SLOT_WIDTH }}
        title={label}
        className={`truncate text-center text-[9px] leading-tight ${
          item ? "text-muted" : "text-muted/50"
        }`}
      >
        {label}
      </figcaption>
      {children}
      {preview}
    </figure>
  );
}
