"use client";

/**
 * The whole card, big enough to read, while the pointer is on something.
 *
 * Shared by every place a card is shown small — the pack, the body, the shelf —
 * so that hovering means the same thing everywhere and the card comes up the
 * same size wherever it is.
 *
 * It is rendered into `document.body`. Hands and shelves sit inside scrolling,
 * clipping containers, and a preview drawn beside the thing it describes is cut
 * off by the first `overflow-hidden` above it; the body's own equipment panel
 * had exactly that bug. Fixed to the viewport, nothing clips it.
 *
 * It sits above everything, deliberately. The overlays in this app are z-50 and
 * so was this, which is a tie — and a tie is settled by document order, so the
 * card came up *behind* the modal that had just offered it. A thing that
 * describes what is under the pointer has to be on top of whatever that is.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { cardImageUrl } from "@/lib/engine/cardImages";
import type { TileCard } from "./card-tile";

/** Readable width for the enlarged card. The scans are 629x780. */
const PREVIEW_WIDTH = 400;
const CARD_RATIO = 780 / 629;
const GAP = 12;

/**
 * Hover plumbing for one small card.
 *
 * Returns handlers to spread onto whatever the pointer lands on, and the
 * preview to render. The anchor is captured on enter rather than tracked on
 * every move: the card sits beside the thing it belongs to, so it does not need
 * to chase the cursor, and not chasing it means no work per mousemove.
 */
export function useCardPreview(card: TileCard | null, imageless = false) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const handlers = {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) =>
      setAnchor(event.currentTarget.getBoundingClientRect()),
    onMouseLeave: () => setAnchor(null),
    // A dragged element leaves no mouseleave behind it, and a preview left
    // hanging over the board during a drag hides where the card is going.
    onPointerDown: () => setAnchor(null),
  };

  const preview =
    anchor && card ? <CardPreview card={card} anchor={anchor} imageless={imageless} /> : null;
  return { handlers, preview, hovering: anchor !== null };
}

export function CardPreview({
  card,
  anchor,
  imageless = false,
}: {
  card: TileCard;
  anchor: DOMRect;
  /**
   * There is no picture of this and there should be no lookup for one.
   *
   * A field is not a card, and its id can collide with a card's — asking for
   * the picture of "kurhan" could hand back a Miejsce card that merely shares
   * the name. Its printed instruction is what there is to show.
   */
  imageless?: boolean;
}) {
  // Hovering implies a mounted client, but the guard keeps this honest during
  // any server render of the tree.
  if (typeof document === "undefined") return null;

  const width = PREVIEW_WIDTH;
  const height = Math.round(width * CARD_RATIO);
  // Prefer the right, flip when the viewport edge is nearer than the card is
  // wide, and never hang off the top or bottom.
  const room = window.innerWidth - anchor.right;
  const left =
    room > width + GAP ? anchor.right + GAP : Math.max(GAP, anchor.left - width - GAP);
  const top = Math.min(
    Math.max(GAP, anchor.top + anchor.height / 2 - height / 2),
    Math.max(GAP, window.innerHeight - height - GAP),
  );
  const src = imageless ? null : cardImageUrl(card.cardId, card.ref);

  return createPortal(
    <div
      role="tooltip"
      style={{ left, top, width }}
      // Never under the pointer: a preview that can be hovered flickers.
      className="pointer-events-none fixed z-[100] overflow-hidden rounded-lg border border-ochre/40 bg-night shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
    >
      {src ? (
        <Image src={src} alt={card.name} width={width} height={height} className="block h-auto w-full" />
      ) : (
        // No scan in this checkout. The transcription is always there, and it is
        // what the picture was standing in for anyway.
        <div className="flex flex-col gap-2 p-3">
          <p className="font-[family-name:var(--font-display)] text-sm text-ochre">{card.name}</p>
          {card.kindLabel && <p className="text-[11px] text-muted">{card.kindLabel}</p>}
          {card.text && (
            <p className="whitespace-pre-line text-xs leading-relaxed text-ink">{card.text}</p>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
