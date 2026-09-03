"use client";

import { useState } from "react";
import { SLOT_LABEL, fitsIn, type Slot } from "@/lib/engine/slots";
import { SLOT_ICON } from "@/lib/view/slotIcons";
import { USE_VERB, isUsable, usageOf } from "@/lib/engine/uses";
import { cornerClass } from "./card-mark";
import { ItemSlot, SLOT_WIDTH, type SlotOccupant, type SlotTone } from "./item-slot";
import { TILE_GAP } from "./tile-row";

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

  // Under the two of them, in the corner the grid already had and nothing was
  // in. Not among the body's nine, because it is not somewhere on a character
  // — it is inside a Karta the character is holding, and it comes and goes
  // with that Karta.
  "tajemna-sakwa": "3 / 5 / 4 / 6",
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
  mayPut,
  onPickUp,
  onTakeOff,
  onUse,
  onDrop,
  onDropInto,
  places,
  layout = "doll",
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
  /**
   * Whether this card may go in this place (5.3), asked of both.
   *
   * The panel knows where a card *fits*; whose it is and what their Natura
   * allows is the seat card's. Both answers are the same colour to a player —
   * red means "not there" — so they are asked together and drawn once.
   *
   * The slot is part of the question because 5.3 is about using a card, and
   * one of these places is not a place a card is used: what is in the Tajemna
   * Sakwa is put away, not worn. See `forbiddenIn`.
   */
  mayPut?: (cardId: string, slot: Slot) => boolean;
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
  /** Straight from the body to the Obszar, without the stop in the plecak. */
  onDrop?: (holdingId: string) => void;
  onDropInto: (holdingId: string, slot: Slot) => void;
  /**
   * Which places to draw. Every one of them, unless told otherwise.
   *
   * A subset is still laid out on the doll — `LAYOUT` gives each place fixed
   * coordinates, so leaving one out leaves a gap where it was rather than
   * reshuffling the rest. The Tajemna Sakwa's square is the only one that ever
   * comes and goes, and it is off in the corner where a gap is a gap.
   */
  places?: readonly Slot[];
  /**
   * The doll, or a plain row of squares.
   *
   * Two separate questions, and they were one prop for a few hours with the
   * predictable result: passing a subset of the body silently un-shaped the
   * doll into a row of eleven. Which squares to draw and how to arrange them
   * have nothing to do with each other, so they are asked separately.
   *
   * `row` exists for the klasyczny table, which has no body at all and draws
   * the Sakwa's inside on its own.
   */
  layout?: "doll" | "row";
}) {
  /** The place a drag is over, so it can say it will take it. */
  const [over, setOver] = useState<Slot | null>(null);
  const doll = layout === "doll";
  const drawn = places ?? (Object.keys(LAYOUT) as Slot[]);

  return (
    <div
      // `TILE_GAP.card`, not a number of its own. This is a grid rather than a
      // `TileRow` — three columns of body, a gutter, then the two relics — but
      // it holds the same 86px tiles as the Plecak directly underneath it, and
      // it was spacing them at 6px against the pack's 8. Two rows of the same
      // card, one above the other, packed differently.
      className={`grid shrink-0 ${TILE_GAP.card}`}
      // One width for every place, and the same one the pack uses: a card is
      // the same object wherever it sits, so it is the same size wherever it
      // sits. Rows size themselves, because the name under the picture is part
      // of the place now.
      // Three columns of body, a gutter, then the two that only have to be
      // found.
      style={{
        gridTemplateColumns: doll
          ? `repeat(3, ${SLOT_WIDTH}px) 1.5rem ${SLOT_WIDTH}px`
          : `repeat(${drawn.length}, ${SLOT_WIDTH}px)`,
      }}
    >
      {drawn.map((slot) => {
        const item = worn[slot];
        // On the cursor: drawn faintly where it came from rather than removed.
        //
        // Removing it broke the double-click that takes a card straight off,
        // because a double-click is two clicks *on the same element* — and the
        // first click emptied the place, so the second landed on a different
        // button and the browser never called it a double-click at all. A ghost
        // says the same thing and stays put.
        const lifted = item !== undefined && item.holdingId === liftedHoldingId;
        // Fits *and* may be used: two rules, one answer, because a place that
        // lights up green and then refuses the drop is worse than one that
        // never lit up.
        const takes = (cardId: string) =>
          fitsIn(cardId, slot) && (mayPut?.(cardId, slot) ?? true);
        const tone: SlotTone =
          over === slot && movingCardId
            ? takes(movingCardId)
              ? "accepts"
              : "rejects"
            : movingCardId && takes(movingCardId)
              ? "candidate"
              : // Unavailable is `ItemSlot`'s to draw — the card carries the
                // fact and every place that holds one says it the same way.
                item
                ? "filled"
                : "empty";

        return (
          // The doll's own coordinates when the doll is what is being drawn —
          // whether or not every square is in it. A row has no shape to keep,
          // so its cells flow.
          <div key={slot} style={doll ? { gridArea: LAYOUT[slot] } : undefined}>
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
              icon={SLOT_ICON[slot]}
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
                    title="Ściągnij — wraca do plecaka"
                    /* The corner box from `card-mark.tsx`, on the control
                       itself rather than round it: wrapping a button in a
                       positioned span moves the padding off the control and
                       shrinks what you can hit. `z-10` is this one's own — it
                       sits over a picture that can be dragged. */
                    className={`${cornerClass("top-right")} z-10 text-[13px] leading-none text-muted transition hover:text-ochre disabled:opacity-40`}
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
              {/* The words for what the corner arrow and a drag already do.
              
                  „Nine places each with a button underneath is a form, and this
                  is a paper doll" is why taking a card off was a corner in the
                  first place, and that is still true of the *arrow*. It is not
                  true of the two acts themselves: an arrow can say „off" and
                  cannot say *where to*, and the difference between the two
                  destinations is the whole thing a player is deciding. So the
                  words go where the Plecak's words are, in the same size and
                  the same order — what it does, then where it goes.
                  
                  „ściągnij" and not „zdejmij", which was the tooltip's word:
                  one verb for one act, and this is the one the button says.

                  `gap-x-1` and not the `gap-2` the Plecak uses, which is the
                  whole difference between an even doll and a ragged one.
                  Measured rather than guessed: at 8px between them „użyj
                  ściągnij upuść" is 95px against an 86px square and wraps to
                  two lines — 29px tall where every other square is 15.5px, so
                  the one row holding a usable worn card grows and the grid
                  stops lining up. At 4px the three fit on one line. The Plecak
                  keeps its 8px because „użyj załóż upuść" is 87px and already
                  fits. */}
              {item && canAct ? (
                <span className="flex flex-wrap items-center justify-center gap-x-1">
                  {onUse && isUsable(item.cardId) ? (
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
                  <button
                    type="button"
                    onClick={() => onTakeOff(item.holdingId)}
                    disabled={busy}
                    title="Wraca do plecaka — nic nie tracisz"
                    className="text-[9px] text-muted underline transition hover:text-ochre disabled:opacity-40"
                  >
                    ściągnij
                  </button>
                  {onDrop ? (
                    <button
                      type="button"
                      onClick={() => onDrop(item.holdingId)}
                      disabled={busy}
                      title="Zostaje na Obszarze, odkryta — kto się tu zatrzyma, może ją wziąć (5.5, 12.1)"
                      className="text-[9px] text-muted underline transition hover:text-vermilion disabled:opacity-40"
                    >
                      upuść
                    </button>
                  ) : null}
                </span>
              ) : null}
            </ItemSlot>
          </div>
        );
      })}
    </div>
  );
}
