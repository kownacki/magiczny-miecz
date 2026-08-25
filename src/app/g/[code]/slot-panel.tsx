"use client";

import { useState } from "react";
import Image from "next/image";
import { cardArtUrl, cardImageUrl } from "@/lib/engine/cardImages";
import { SLOT_LABEL, fitsIn, type Slot } from "@/lib/engine/slots";
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
 * The pictures are the illustrations cut off the cards, not the cards
 * themselves. A whole card at this size is a title four pixels tall over a grey
 * smear of prose; the illustration is the half of it that survives being small,
 * and it is what a player recognises anyway. The whole card is a hover away.
 *
 * Only in the slotted variant. In klasyczny play there is no body to lay out:
 * the rulebook has one kind of possession and one limit (5.4).
 */
export interface SlotItem {
  holdingId: string;
  cardId: string;
  card: TileCard;
}

/**
 * Where each place sits, as a body.
 *
 * Nine places fit a three-by-three exactly, which is what they get: the head in
 * the middle of the top row with the amulet and the ring either side of it, the
 * two hands either side of the torso, and the load along the bottom — gloves
 * under the hand that wears them, then the mount and the bag.
 *
 * The hands used to be double-height, which made them the only places shaped
 * differently from everything else and from the pictures that go in them.
 */
const LAYOUT: Record<Slot, string> = {
  amulet: "1 / 1 / 2 / 2",
  glowa: "1 / 2 / 2 / 3",
  pierscien: "1 / 3 / 2 / 4",
  "reka-glowna": "2 / 1 / 3 / 2",
  tulow: "2 / 2 / 3 / 3",
  "reka-pomocnicza": "2 / 3 / 3 / 4",
  rekawice: "3 / 1 / 4 / 2",
  wierzchowiec: "3 / 2 / 4 / 3",
  sakwa: "3 / 3 / 4 / 4",
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

/** What a drag carries: the id of the holding being moved. */
export const DRAG_TYPE = "application/x-magiczny-miecz-holding";

/**
 * Starts a drag, with the card itself stuck to the cursor.
 *
 * Left alone the browser drags a translucent snapshot of whatever was grabbed,
 * anchored wherever inside it the pointer happened to be — so a card picked up
 * by its corner trails behind the cursor at arm's length and does not read as
 * being carried. The picture already on screen is the drag image, centred, so
 * it goes where the hand goes.
 */
export function startHoldingDrag(event: React.DragEvent, holdingId: string): void {
  event.dataTransfer.setData(DRAG_TYPE, holdingId);
  event.dataTransfer.effectAllowed = "move";
  const picture = event.currentTarget.querySelector("img");
  if (picture instanceof HTMLImageElement && picture.complete) {
    event.dataTransfer.setDragImage(
      picture,
      picture.offsetWidth / 2,
      picture.offsetHeight / 2,
    );
  }
}

export function SlotPanel({
  worn,
  canAct,
  busy,
  carrying,
  movingCardId,
  liftedHoldingId,
  onDragging,
  onPickUp,
  onTakeOff,
  onDropInto,
}: {
  /** What is in each place; missing keys are empty places. */
  worn: Partial<Record<Slot, SlotItem>>;
  canAct: boolean;
  busy: boolean;
  /** A card is on the cursor, so a click on a place puts it there. */
  carrying: boolean;
  /** Announces the card id a drag has picked up, and null when it ends. */
  onDragging: (cardId: string | null) => void;
  /** Which card is being moved, dragged or carried — so a place can say whether
      it would take it before the player finds out by being refused. */
  movingCardId: string | null;
  /** The card currently on the cursor, so the place it came from looks empty. */
  liftedHoldingId: string | null;
  onPickUp: (item: SlotItem, from: Slot) => void;
  onTakeOff: (holdingId: string) => void;
  /** Something was put into a place — dropped, or carried there and clicked. */
  onDropInto: (holdingId: string, slot: Slot) => void;
}) {
  /** The place a drag is over, so it can say it will take it. */
  const [over, setOver] = useState<Slot | null>(null);

  return (
    // Twice the size it started at. At 44 pixels a Hełm was a brown smudge and
    // the empty places were indistinguishable from one another, which is the
    // one thing a paper doll is for.
    <div
      className="grid shrink-0 gap-1.5"
      // Shaped like what goes in them. The illustration cut off a card is 370
      // by 323 — a shade wider than tall — so a square place either letterboxed
      // the picture or cropped it, and every card in the box has the same
      // proportions.
      style={{ gridTemplateColumns: "repeat(3, 96px)", gridAutoRows: "84px" }}
    >
      {(Object.keys(LAYOUT) as Slot[]).map((slot) => {
        const item = worn[slot];
        // On the cursor: drawn faintly where it came from rather than removed.
        //
        // Removing it broke the double-click that takes a card straight off,
        // because a double-click is two clicks *on the same element* — and the
        // first click emptied the place, so the second landed on a different
        // button and the browser never called it a double-click at all. A ghost
        // says the same thing and stays put.
        const lifted = item !== undefined && item.holdingId === liftedHoldingId;
        return (
          <div
            key={slot}
            style={{ gridArea: LAYOUT[slot] }}
            onDragOver={(event) => {
              if (!canAct) return;
              event.preventDefault();
              setOver(slot);
            }}
            onDragLeave={() => setOver((current) => (current === slot ? null : current))}
            // A carried card has no drag events behind it, so hovering has to
            // be watched directly for the same answer to show.
            onPointerEnter={() => carrying && setOver(slot)}
            onPointerLeave={() => setOver((current) => (current === slot ? null : current))}
            onDrop={(event) => {
              setOver(null);
              if (!canAct) return;
              const holdingId = event.dataTransfer.getData(DRAG_TYPE);
              if (!holdingId) return;
              event.preventDefault();
              onDropInto(holdingId, slot);
            }}
            className={`group relative overflow-hidden rounded border transition ${
              over === slot && movingCardId
                ? // Green if it would go here, red if it would not. Said while
                  // the card is still in the air, rather than as a refusal
                  // after the fact.
                  fitsIn(movingCardId, slot)
                  ? "border-verdigris bg-verdigris/25"
                  : "border-vermilion bg-vermilion/25"
                : movingCardId && fitsIn(movingCardId, slot)
                  ? // Somewhere it could go, marked faintly while it is moving.
                    "border-verdigris/50 bg-verdigris/5"
                  : item
                    ? "border-ochre/60 bg-raised"
                    : "border-dashed border-edge/70 bg-night/40"
            }`}
            title={item && !lifted ? undefined : SLOT_LABEL[slot]}
          >
            {item ? (
              <WornCard
                item={item}
                canAct={canAct}
                lifted={lifted}
                onDragging={onDragging}
                // While something is on the cursor, a click puts it down —
                // including onto the place it was lifted from, which is how you
                // change your mind. Otherwise a click picks this one up, and
                // two take it straight off.
                onPickUp={() => (carrying ? onDropInto("", slot) : onPickUp(item, slot))}
                onTakeOff={() => onTakeOff(item.holdingId)}
              />
            ) : (
              <button
                type="button"
                disabled={!canAct || !carrying}
                onClick={(event) => {
                  // Kept from the window, which is listening for a click
                  // anywhere else in order to put the card back.
                  event.stopPropagation();
                  onDropInto("", slot);
                }}
                title={SLOT_LABEL[slot]}
                className="flex h-full w-full items-center justify-center text-[26px] text-muted/30 disabled:cursor-default"
              >
                {GLYPH[slot]}
              </button>
            )}

            {/* Taking it off is a corner, not a row of its own: nine places
                each with a button underneath is a form, and this is a paper
                doll. Dragging it to the pack does the same thing. */}
            {item && canAct && (
              <button
                type="button"
                onClick={() => onTakeOff(item.holdingId)}
                disabled={busy}
                title="Zdejmij"
                className="absolute right-0 top-0 z-10 rounded-bl bg-night/85 px-1.5 text-[13px] leading-tight text-muted transition hover:text-vermilion disabled:opacity-40"
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

/**
 * One worn card: its illustration, draggable, with the whole card on hover.
 *
 * The hover card escapes its box on purpose. Scaling a card to fit inside an
 * 84-pixel square would give back exactly the unreadable thing the illustration
 * was cut out to replace.
 */
function WornCard({
  item,
  canAct,
  lifted,
  onDragging,
  onPickUp,
  onTakeOff,
}: {
  item: SlotItem;
  canAct: boolean;
  /** It is on the cursor; this is the hollow it left. */
  lifted: boolean;
  onDragging: (cardId: string | null) => void;
  onPickUp: () => void;
  onTakeOff: () => void;
}) {
  const art = cardArtUrl(item.cardId);
  const full = cardImageUrl(item.cardId);

  return (
    <>
      <button
        type="button"
        draggable={canAct}
        onDragStart={(event) => {
          onDragging(item.cardId);
          startHoldingDrag(event, item.holdingId);
        }}
        onDragEnd={() => onDragging(null)}
        onClick={(event) => {
          event.stopPropagation();
          onPickUp();
        }}
        onDoubleClick={onTakeOff}
        title={item.card.name}
        className={`block h-full w-full cursor-grab active:cursor-grabbing ${
          lifted ? "opacity-25" : ""
        }`}
      >
        {art ? (
          <Image
            src={art}
            alt={item.card.name}
            width={110}
            height={96}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <span className="flex h-full items-center justify-center p-1 text-center text-[11px] leading-tight text-ink">
            {item.card.name}
          </span>
        )}
      </button>

      {full && !lifted && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 hidden -translate-x-1/2 group-hover:block">
          <Image
            src={full}
            alt={item.card.name}
            width={200}
            height={333}
            className="max-w-none rounded border border-ochre shadow-[0_4px_24px_rgba(0,0,0,0.85)]"
            unoptimized
          />
        </span>
      )}
    </>
  );
}
