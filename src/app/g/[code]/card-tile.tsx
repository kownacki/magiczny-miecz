"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { cardArtUrl, cardImageUrl } from "@/lib/engine/cardImages";
import { manualNote, coverageOf, NOT_HANDLED } from "@/lib/engine/coverage";

/**
 * One card, as a card.
 *
 * This is a board game and the app had turned everyone's possessions into a
 * list of words. A player who owns four Przedmioty and two Zaklęcia is holding
 * six *pictures* at the table, recognises them at a glance, and reaches for the
 * one with the sword on it — none of which a line of text supports.
 *
 * The image is the primary thing and the name is the fallback, not the other
 * way round: every card in the box has been exported, but a fresh checkout has
 * none of them until the asset pipeline is run, so a card must still be usable
 * as a labelled tile.
 */
export interface TileCard {
  cardId: string;
  name: string;
  /** The exact printed copy, where it is known (simulation mode). */
  ref?: string;
  text?: string;
  kindLabel?: string;
}

export function CardTile({
  card,
  size = "sm",
  dimmed = false,
  badge,
  onClick,
  onDoubleClick,
  draggable,
  onDragStart,
  onDragEnd,
  children,
}: {
  card: TileCard;
  size?: "sm" | "md";
  dimmed?: boolean;
  /** A short flag drawn over the corner — a price, a count, "zakryte". */
  badge?: string;
  onClick?: (event: React.MouseEvent) => void;
  /** Two clicks put it straight on, in the slotted variant. */
  onDoubleClick?: () => void;
  /** Draggable into an equipment place, in the slotted variant. */
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  onDragEnd?: () => void;
  /** Controls drawn under the card, such as a cast or drop button. */
  children?: React.ReactNode;
}) {
  // The illustration, not the whole card. A card shrunk to tile size is a grey
  // smear with a four-pixel title; the picture is the thing a player actually
  // recognises when reaching across a table. The whole card is one hover away.
  const src = cardArtUrl(card.cardId, card.ref);
  const width = size === "md" ? 132 : 92;
  // The art is cut 240x155, so the tile takes that shape rather than cropping
  // the picture back into a portrait box.
  const height = Math.round(width * (155 / 240));
  const [hovering, setHovering] = useState<DOMRect | null>(null);

  return (
    <figure className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        disabled={!onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMouseEnter={(event) => setHovering(event.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setHovering(null)}
        // A dragged tile leaves no mouseleave behind it.
        onPointerDown={() => setHovering(null)}
        title={card.name}
        style={{ width, height }}
        className={`relative overflow-hidden rounded border border-edge bg-raised transition ${
          draggable ? "cursor-grab active:cursor-grabbing" : onClick ? "cursor-pointer" : "cursor-default"
        } ${onClick ? "hover:border-ochre" : ""} ${dimmed ? "opacity-45" : ""}`}
      >
        {src ? (
          // Explicit dimensions rather than `fill`: the portraits elsewhere on
          // this page already work this way, and a filled image needs its
          // parent to establish a containing block, which a button styled by
          // utility classes does not reliably do.
          <Image
            src={src}
            alt={card.name}
            width={width}
            height={height}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] leading-tight text-ink">
            {card.name}
          </span>
        )}
        {/* Bottom edge, not the top: the top of every card in this game is its
            printed title, and covering that is covering the one thing a player
            scans for. */}
        {badge && (
          <span className="absolute inset-x-0 bottom-0 bg-night/85 px-1 py-0.5 text-center text-[9px] leading-tight text-ochre">
            {badge}
          </span>
        )}
      </button>
      {hovering && <CardPreview card={card} anchor={hovering} />}
      <figcaption
        style={{ width }}
        className="truncate text-center text-[9px] leading-tight text-muted"
        title={card.name}
      >
        {card.name}
      </figcaption>
      {children}
    </figure>
  );
}

/** Readable width for the enlarged card. The scans are 629x780. */
const PREVIEW_WIDTH = 400;
const CARD_RATIO = 780 / 629;
const GAP = 12;

/**
 * The whole card, big enough to read, while the pointer is on the tile.
 *
 * Rendered into `document.body` rather than beside the tile: hands and shelves
 * live inside scrolling, clipping containers, and a preview drawn in place gets
 * cut off by the first `overflow-hidden` above it. Fixed to the viewport, it is
 * clipped by nothing.
 *
 * Hover is an enhancement, not the only way in — clicking a tile still opens
 * `CardDetail`, which is what a touch screen gets, since it has no hover at all.
 */
function CardPreview({ card, anchor }: { card: TileCard; anchor: DOMRect }) {
  // Hovering implies a mounted client, but the guard keeps this honest during
  // any server render of the tree.
  if (typeof document === "undefined") return null;

  const width = PREVIEW_WIDTH;
  const height = Math.round(width * CARD_RATIO);
  // Prefer the right of the tile, flip when the viewport edge is closer than
  // the card is wide, and never let it hang off the top or bottom.
  const room = window.innerWidth - anchor.right;
  const left =
    room > width + GAP ? anchor.right + GAP : Math.max(GAP, anchor.left - width - GAP);
  const top = Math.min(
    Math.max(GAP, anchor.top + anchor.height / 2 - height / 2),
    Math.max(GAP, window.innerHeight - height - GAP),
  );
  const src = cardImageUrl(card.cardId, card.ref);

  return createPortal(
    <div
      role="tooltip"
      style={{ left, top, width }}
      // Never under the pointer: a preview that can be hovered flickers.
      className="pointer-events-none fixed z-50 overflow-hidden rounded-lg border border-ochre/40 bg-night shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
    >
      {src ? (
        <Image
          src={src}
          alt={card.name}
          width={width}
          height={height}
          className="block h-auto w-full"
        />
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

/**
 * A card the other players are not allowed to see (9.3).
 *
 * Drawn as a back rather than omitted, because how many spells a rival is
 * holding is public — the cards are visibly in their hand — and that count is
 * exactly the thing you weigh before attacking them.
 */
export function CardBack({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex h-[131px] w-[92px] items-center justify-center rounded border border-magia/40 bg-gradient-to-br from-panel to-night">
        <span className="font-[family-name:var(--font-display)] text-2xl text-magia/70">
          {count}
        </span>
      </div>
      <span className="text-[9px] text-muted">
        {count === 1 ? "zakryte Zaklęcie" : "zakryte Zaklęcia"}
      </span>
    </div>
  );
}

/**
 * The card, big, with everything printed on it and everything the app knows.
 *
 * Opened by tapping a tile. This is where the text lives now — off the seat
 * cards, which were carrying three lines of small print per possession and
 * became unreadable the moment anybody owned more than two things.
 */
export function CardDetail({ card, onClose }: { card: TileCard; onClose: () => void }) {
  const src = cardImageUrl(card.cardId, card.ref);
  const coverage = coverageOf(card.cardId);
  const note = manualNote(card.cardId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/85 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg border border-edge bg-panel p-4 sm:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
        {src && (
          <Image
            src={src}
            alt={card.name}
            width={260}
            height={369}
            className="shrink-0 self-center rounded"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="font-[family-name:var(--font-display)] text-lg text-ochre">
              {card.name}
            </h3>
            <button onClick={onClose} className="text-xs text-muted hover:text-ink">
              zamknij
            </button>
          </div>
          {card.kindLabel && (
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">
              {card.kindLabel}
            </p>
          )}
          {card.text && (
            <p className="whitespace-pre-line text-xs leading-relaxed text-muted">{card.text}</p>
          )}
          {coverage !== "pelne" && (
            <p
              className={`mt-3 rounded border-l-2 px-2 py-1 text-[11px] leading-snug ${
                coverage === "brak"
                  ? "border-vermilion/50 bg-vermilion/5 text-vermilion/90"
                  : "border-ochre/50 bg-ochre/5 text-ochre/90"
              }`}
            >
              {note ?? NOT_HANDLED}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
