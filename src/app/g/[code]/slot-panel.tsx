"use client";

import { useState } from "react";
import { SLOT_LABEL, fitsIn, type Slot } from "@/lib/engine/slots";
import { USE_VERB, isUsable, usageOf } from "@/lib/engine/uses";
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
  // Head between the two things worn on it, hands either side of the torso, the
  // load along the bottom.
  pierscien: "1 / 1 / 2 / 2",
  glowa: "1 / 2 / 2 / 3",
  amulet: "1 / 3 / 2 / 4",
  "reka-glowna": "2 / 1 / 3 / 2",
  tulow: "2 / 2 / 3 / 3",
  "reka-pomocnicza": "2 / 3 / 3 / 4",
  rekawice: "3 / 1 / 4 / 2",
  sakwa: "3 / 2 / 4 / 3",
  wierzchowiec: "3 / 3 / 4 / 4",

  // Off to the side, past a gap, in a column of their own. They are not gear —
  // neither does anything in a fight — so they do not belong among the places
  // that hold it, and standing apart says that without a caption.
  "magiczny-miecz": "1 / 5 / 2 / 6",
  "tarcza-tolimana": "2 / 5 / 3 / 6",
};

/** Drawn in the empty places, so a gap says which gap it is. */
const GLYPH: Record<Slot, string> = {
  glowa: "\u26D1\uFE0E",
  amulet: "\u25C8",
  tulow: "\u26CA\uFE0E",
  "reka-glowna": "\u2694\uFE0E",
  "reka-pomocnicza": "\u26E8\uFE0E",
  rekawice: "\u270B\uFE0E",
  pierscien: "\u25EF",
  // A horse and a bag exist only as emoji, and no selector makes them line
  // drawings — so they are drawn as shapes like everything else instead.
  wierzchowiec: "\u265E",
  sakwa: "\u25A4",
  "magiczny-miecz": "\u2726",
  "tarcza-tolimana": "\u2727",
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
  onUse,
  onDropInto,
}: {
  /** What is in each place; missing keys are empty places. */
  worn: Partial<Record<Slot, SlotItem>>;
  canAct: boolean;
  busy: boolean;
  /** A card is on the cursor, so a click on a place puts it there. */
  carrying: boolean;
  /** Announces what a drag has picked up — the card, and the holding it is —
      and null when it ends. */
  onDragging: (moving: { cardId: string; holdingId: string } | null) => void;
  /** Which card is being moved, dragged or carried — so a place can say whether
      it would take it before the player finds out by being refused. */
  movingCardId: string | null;
  /** The card currently on the cursor, so the place it came from looks empty. */
  liftedHoldingId: string | null;
  onPickUp: (item: SlotItem, from: Slot) => void;
  onTakeOff: (holdingId: string) => void;
  /**
   * Spend a worn card by using it.
   *
   * One card in the box is both worn and spent — the Różdżka Przeznaczenia,
   * which goes in the main hand and goes on the used pile once the Wróg it
   * charmed has fought. Without this it would have to be taken off before it
   * could be used, which is not a step the card describes.
   */
  onUse?: (holdingId: string, cardId: string) => void;
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
      // Three columns of body, a gutter, then the two that only have to be
      // found.
      style={{ gridTemplateColumns: `repeat(3, ${SLOT_WIDTH}px) 1.5rem ${SLOT_WIDTH}px` }}
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
              // Nothing offers to be read while a card is in the air: the Karta
              // used to open over the very place the pointer had to be.
              quiet={movingCardId !== null}
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
                startHoldingDrag(event, item.holdingId);
                onDragging({ cardId: item.cardId, holdingId: item.holdingId });
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
            >
              {item && canAct && onUse && isUsable(item.cardId) ? (
                <button
                  type="button"
                  onClick={() => onUse(item.holdingId, item.cardId)}
                  disabled={busy}
                  title={usageOf(item.cardId)?.co}
                  className="text-[9px] text-ochre underline transition hover:text-ink disabled:opacity-40"
                >
                  {USE_VERB}
                </button>
              ) : null}
            </ItemSlot>
          </div>
        );
      })}
    </div>
  );
}
