"use client";

import { useState } from "react";
import { SLOT_LABEL, fitsIn, type Slot } from "@/lib/engine/slots";
import { USE_VERB, isUsable, usageOf } from "@/lib/engine/uses";
import { ItemSlot, SLOT_WIDTH, type SlotOccupant, type SlotTone } from "./item-slot";

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
/**
 * What is in a place on the body.
 *
 * The same shape the pack's places take, and deliberately the same: a card
 * worn and a card carried are one object to a player, and two structurally
 * identical types would have drifted the first time either gained a field —
 * which is exactly what happened when the test mark was added.
 */
export type SlotItem = SlotOccupant;

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
  ring: "1 / 1 / 2 / 2",
  head: "1 / 2 / 2 / 3",
  amulet: "1 / 3 / 2 / 4",
  "main-hand": "2 / 1 / 3 / 2",
  body: "2 / 2 / 3 / 3",
  "off-hand": "2 / 3 / 3 / 4",
  gloves: "3 / 1 / 4 / 2",
  pouch: "3 / 2 / 4 / 3",
  mount: "3 / 3 / 4 / 4",

  // Off to the side, past a gap, in a column of their own. They are not gear —
  // neither does anything in a fight — so they do not belong among the places
  // that hold it, and standing apart says that without a caption.
  "magiczny-miecz": "1 / 5 / 2 / 6",
  "tarcza-tolimana": "2 / 5 / 3 / 6",
};

/**
 * How many places the body draws, for whoever has to count them elsewhere.
 *
 * Off `LAYOUT` rather than off `SLOTS`, so the number in a tally is the number
 * of squares on screen. The two relics are in it because the panel draws them:
 * they are not gear and they cannot be chosen, only found, but a "3 / 11" over
 * eleven boxes is a sum somebody can check, and a "3 / 9" over eleven is one
 * they cannot.
 */
export const PLACES_ON_THE_BODY = Object.keys(LAYOUT).length;

/**
 * Drawn in the empty places, so a gap says which gap it is.
 *
 * Silhouettes from game-icons.net (CC BY 3.0 — see README), used as masks so
 * they take the slot's own colour. They were Unicode glyphs, which meant a
 * helmet where the font happened to have a helmet, a chess knight standing in
 * for a horse and a shaded square standing in for a bag. These are drawings of
 * the eleven things.
 *
 * Deliberately not the cards' own illustrations, though every one of them is
 * exported and to hand: those are white-on-black hatched engravings, and a
 * ghost of one reads as a card already in the place rather than as the shape of
 * the place itself.
 */
const ICON: Record<Slot, string> = {
  head: "/slots/glowa.svg",
  amulet: "/slots/amulet.svg",
  body: "/slots/tulow.svg",
  "main-hand": "/slots/reka-glowna.svg",
  "off-hand": "/slots/reka-pomocnicza.svg",
  gloves: "/slots/rekawice.svg",
  ring: "/slots/pierscien.svg",
  mount: "/slots/wierzchowiec.svg",
  pouch: "/slots/sakwa.svg",
  "magiczny-miecz": "/slots/magiczny-miecz.svg",
  "tarcza-tolimana": "/slots/tarcza-tolimana.svg",
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
              : // A card that is worn and forbidden is drawn the way a place
                // that would refuse a card is: red where an offer is green.
                // The same two colours the panel already speaks in, saying the
                // same thing about a card rather than about a place.
                item?.inert
                ? "rejects"
                : item
                  ? "filled"
                  : "empty";

        return (
          <div key={slot} style={{ gridArea: LAYOUT[slot] }}>
            <ItemSlot
              // The paper doll only exists in slotowy, so anything on it is
              // worn by definition.
              eqMode="slots"
              // Nothing offers to be read while a card is in the air: the Karta
              // used to open over the very place the pointer had to be.
              quiet={movingCardId !== null}
              item={item ?? null}
              // The place says what it is for while it is empty, and what is in
              // it once it is filled.
              label={item ? item.card.name : SLOT_LABEL[slot]}
              icon={ICON[slot]}
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
                // The drop is the end of the drag: `dragend` fires on the card
                // that was picked up, which a landing drop has just unmounted.
                onDragging(null);
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
                    title="Zdejmij — wraca do plecaka"
                    className="absolute right-0 top-0 z-10 rounded-bl bg-night/85 px-1.5 text-[13px] leading-none text-muted transition hover:text-ochre disabled:opacity-40"
                  >
                    {/* Down into the pack, which is where it goes and where the
                        pack is drawn. A cross means "gone" everywhere else in
                        this app — it is what the shop shows for a card the
                        Wyposażenie has run out of, and what an unwearable card
                        gets — and taking your Zbroja off does not destroy it.
                        Hence ochre on hover rather than red: nothing is lost. */}
                    <span className="block pb-0.5 text-[14px]">↓</span>
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
