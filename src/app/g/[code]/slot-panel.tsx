"use client";

import { useState } from "react";
import { SLOT_LABEL, fitsIn, type Slot } from "@/lib/engine/slots";
import { ItemSlot, SLOT_WIDTH, type SlotTone } from "./item-slot";
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
  // A row of their own, under the body. They are not worn in any sense a
  // person would recognise — they are the two things you must have found — so
  // they sit apart from the places that hold real gear.
  "magiczny-miecz": "4 / 1 / 5 / 2",
  "tarcza-tolimana": "4 / 3 / 5 / 4",
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
  "magiczny-miecz": "✦",
  "tarcza-tolimana": "✧",
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
    <div
      className="grid shrink-0 gap-1.5"
      // One width for every place, and the same one the pack uses: a card is
      // the same object wherever it sits, so it is the same size wherever it
      // sits. Rows size themselves, because the name under the picture is part
      // of the place now.
      style={{ gridTemplateColumns: `repeat(3, ${SLOT_WIDTH}px)` }}
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
        const tone: SlotTone =
          over === slot && movingCardId
            ? fitsIn(movingCardId, slot)
              ? "accepts"
              : "rejects"
            : movingCardId && fitsIn(movingCardId, slot)
              ? "candidate"
              : item
                ? "filled"
                : "empty";

        return (
          <div key={slot} style={{ gridArea: LAYOUT[slot] }}>
            <ItemSlot
              // The paper doll only exists in slotowy, so anything on it is
              // worn by definition.
              eqMode="slotowy"
              item={item ?? null}
              // The place says what it is for while it is empty, and what is in
              // it once it is filled.
              label={item ? item.card.name : SLOT_LABEL[slot]}
              glyph={GLYPH[slot]}
              tone={tone}
              lifted={lifted}
              draggable={canAct && item !== undefined}
              disabled={!canAct || (item === undefined && !carrying)}
              // One rule for both halves of the panel: a click puts down what
              // is on the cursor, or picks up what is here. Dragging is the
              // same journey with the button held, and neither is a special
              // case of the other.
              onClick={(event) => {
                event.stopPropagation();
                if (carrying) return onDropInto("", slot);
                if (item) onPickUp(item, slot);
              }}
              onDoubleClick={item ? () => onTakeOff(item.holdingId) : undefined}
              onDragStart={(event) => {
                if (!item) return;
                onDragging(item.cardId);
                startHoldingDrag(event, item.holdingId);
              }}
              onDragEnd={() => onDragging(null)}
              onDragOver={(event) => {
                if (!canAct) return;
                event.preventDefault();
                setOver(slot);
              }}
              onDragLeave={() => setOver((current) => (current === slot ? null : current))}
              onDrop={(event) => {
                setOver(null);
                if (!canAct) return;
                const holdingId = event.dataTransfer.getData(DRAG_TYPE);
                if (!holdingId) return;
                event.preventDefault();
                onDropInto(holdingId, slot);
              }}
              // A carried card has no drag events behind it, so hovering has to
              // be watched directly for the same answer to show.
              onPointerEnter={() => carrying && setOver(slot)}
              onPointerLeave={() => setOver((current) => (current === slot ? null : current))}
              corner={
                // Taking it off is a corner, not a row of its own: nine places
                // each with a button underneath is a form, and this is a paper
                // doll. Dragging it to the pack does the same thing.
                item && canAct ? (
                  <button
                    type="button"
                    onClick={() => onTakeOff(item.holdingId)}
                    disabled={busy}
                    title="Zdejmij"
                    className="absolute right-0 top-0 z-10 rounded-bl bg-night/85 px-1.5 text-[13px] leading-tight text-muted transition hover:text-vermilion disabled:opacity-40"
                  >
                    ×
                  </button>
                ) : null
              }
            />
          </div>
        );
      })}
    </div>
  );
}
