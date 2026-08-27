"use client";

import { Rules } from "./rule-ref";

/** The pack: what a character is carrying, in the order its owner put it in. */

import { useState } from "react";
import { orderWith } from "./pack-order";
import { asCharacterId, mayHaveFriends, startingKit } from "@/lib/engine/characters";
import { carriedCount, carryLimit, wandRefills } from "@/lib/engine/derive";
import { SLOTS, fitsIn, type Slot } from "@/lib/engine/slots";
import { USE_VERB, isUsable, usageOf } from "@/lib/engine/uses";
import { CardBack, type TileCard } from "./card-tile";
import { type Carried } from "./carry";
import { EquipButton } from "./equip-button";
import { Fold } from "./fold";
import { useRack } from "./rack";
import { ItemSlot } from "./item-slot";
import { DRAG_TYPE, startHoldingDrag } from "./slot-panel";
import { asHoldings, asNature, tileFor, type Seat, wornBySlot } from "./table";
import { forbiddenTo } from "@/lib/engine/holdings";

/**
 * What a seat is carrying.
 *
 * Another player's concealed spells never reach this component — the server
 * strips them and sends a count instead (9.3) — so there is nothing here that
 * could leak by rendering carelessly.
 */
export function Hand({
  seat,
  isMine,
  canAct,
  trophies,
  slotted,
  carried,
  moving,
  liftedHoldingId,
  onCarry,
  onDragging,
  onDrop,
  onTrade,
  onEquip,
  onUse,
  onWand,
  onReorder,
  onInspect,
}: {
  seat: Seat;
  isMine: boolean;
  canAct: boolean;
  slotted: boolean;
  trophies: number;
  /** The card on the cursor, if any. */
  carried: Carried | null;
  /** A card is in the air, however it was picked up — so nothing offers to be read. */
  moving: boolean;
  /** What is in the air, however it was picked up, so its place looks emptied. */
  liftedHoldingId: string | null;
  onCarry: (carried: Carried | null) => void;
  /** The card id being dragged out of the pack, or null when the drag ends. */
  onDragging: (moving: { cardId: string; holdingId: string } | null) => void;
  onDrop: (holdingId: string) => void;
  onTrade: () => void;
  onEquip: (holdingId: string, slot: Slot | null) => void;
  /** Spend a card by using it. Absent on somebody else's pack. */
  onUse?: (holdingId: string, cardId: string) => void;
  /** Takes a Zaklęcie on the Różdżka's terms, not 2.6's. */
  onWand?: () => void;
  /** The pack, in the order its owner wants it. Absent on somebody else's. */
  onReorder?: (holdingIds: string[]) => void;
  onInspect: (card: TileCard) => void;
}) {
  /** Something is being carried or dragged over the pack itself. */
  /**
   * Whether the pack is showing, the way the Zdolności below it fold away.
   *
   * Open to begin with, unlike the Zdolności: a pack is the half of a seat card
   * that changes, and one that started shut would have to be opened before the
   * card said anything at all. Folding it is for the seats you are not playing,
   * where four squares of somebody else's luggage is four squares between you
   * and the next thing you wanted to read.
   */
  const [showing, setShowing] = useState(true);

  /**
   * The Różdżka Zaklęć's condition, asked of the engine where its button is
   * drawn — the same question `drawSpellWithWand` refuses against.
   */
  const setupSpells = startingKit(asCharacterId(seat.character_id)).spells ?? 0;
  const wandReady = wandRefills(
    seat.holdings.filter((held) => held.kind === "spell").length,
    setupSpells,
  );

  const shown = seat.holdings.filter((held) => held.kind !== "spell");
  /**
   * Przyjaciele, kept out of the pack entirely.
   *
   * 6.3 gives them no limit — "Możesz posiadać dowolną ilość Przyjaciół" — and
   * `carriedCount` has always known it, counting only `kind === "item"`. So the
   * *number* over the pack was right the whole time while the *picture* under
   * it was not: a Rycerz sat in the row of squares that 5.4's four are drawn
   * as, inside a "2 / 4" he was not one of the two of. The console made exactly
   * this mistake once and it was a listing bug there too.
   *
   * They are not gear, so they do not go in the bag: they stand beside it, in a
   * section of their own with no denominator, because a tally is a thing to
   * check against a limit and this one has none.
   */
  const friends = shown.filter((held) => held.kind === "friend");
  // Counted through the engine rather than beside it, so what the pack says is
  // what `takeCard` and `equipCard` will actually allow. Still counted here and
  // not sent down ready-made: `mine.holdings` carries the optimistic slot a
  // drag has just asked for, and a number from the last poll would lag the
  // gesture it is describing.
  const cards = asHoldings(seat.holdings);
  const variant = slotted ? "slots" : "classic";
  const packed = carriedCount(cards, variant);
  const limit = carryLimit(cards, variant);

  /**
   * The pack as a row somebody arranges — the order, the gaps, the moves.
   *
   * All of it is `useRack`'s now, because none of it was ever about
   * Przedmioty: the hand of Zaklęcia is the same row with a different cap on
   * it. The rules underneath are still `pack-order.ts`'s, and the doc comments
   * that explain why each of them is the way it is are still there.
   */
  const inPack = shown
    .filter((held) => held.kind !== "friend")
    .filter((held) => !slotted || held.slot == null);
  const packOrder = inPack.map((held) => held.id);
  const {
    arranged,
    stepAt,
    lands,
    insertAt,
    setInsertAt,
    dragOver,
    setDragOver,
    moveWithin,
    itsOwnSquare,
    ask,
  } = useRack({ cards: inPack, liftedHoldingId, onReorder });

  /**
   * Takes a card off the body and puts it in the pack, where the pointer says.
   *
   * It used to land on the end however carefully you aimed, on the reasoning
   * that a card the pack has not seen before has no place in it yet. But the
   * pack is a row a player arranges, and coming off the body is the commonest
   * way a card enters it — so "anywhere you like, except where you were
   * pointing" was the one gesture that did not work.
   *
   * The two writes do not race. Where a card sits and whether it is worn are
   * different columns, and the order is written for whatever the seat holds
   * without asking where any of it is, so neither has to land first.
   */
  const dropIntoPack = (holdingId: string, beforeId: string | null) => {
    onEquip(holdingId, null);
    if (!onReorder) return;
    ask(orderWith(arranged, holdingId, beforeId));
  };

  /**
   * The pack is about to be dropped into, and whether it would take it.
   *
   * Lit while the pointer is inside it with a card in the air — the same answer
   * a place on the body gives, and given the same way: you are over me, and I
   * would take this. A card in the air is not enough on its own; it lit the
   * rectangle from the moment anything was picked up, so the pack claimed to be
   * the destination while you were aiming at a hand or the board.
   *
   * Being over one of the pack's own cards still counts as being inside it. The
   * two lights say different things and do not compete: the rectangle is *the
   * pack will take this*, and the gap is *here, exactly*.
   *
   * `refuses` is 5.4 — a card coming in from the body when there is no room for
   * it — and never a card already in the pack, which is only being moved about
   * inside a limit it already satisfies.
   */
  const landing = liftedHoldingId !== null;
  const refuses =
    landing && carried !== null && carried.from !== "plecak" && packed >= limit;

  // After the hooks, which have to run every render whatever is on show.
  //
  // Your own pack is always drawn, empty or not. It used to disappear until the
  // first card landed in it, which meant the places you drop things into did
  // not exist until you already had something to drop — and taking a card off
  // the body aims at nothing. Somebody else's empty pack is still hidden: that
  // one is information, and "nothing" is a whole row to say it in.
  if (!isMine && shown.length === 0 && seat.hidden_count === 0) return null;

  /**
   * A card in the air holds the pack open whatever the summary was last told,
   * because a place to put things down that is folded away is not a place to
   * put things down.
   *
   * Which is why `open` is driven from here and the browser's own toggling is
   * cancelled on the summary: two things setting one attribute agree right up
   * until they don't, and then the pack is shut with a card in the air and no
   * click will open it.
   */
  return (
    <>
    <Fold
      title="Plecak"
      /* What is in the pack, against what will fit. In the variant a place on
         the body is not the pack, so the number here is the one 5.4 is about —
         and seeing it beats finding out by being refused. Left visible when the
         pack is folded away: the count is the part worth keeping. */
      tally={
        <span className={packed >= limit ? "text-vermilion" : undefined}>
          {packed} / {Number.isFinite(limit) ? limit : "∞"}
        </span>
      }
      open={showing || landing}
      onToggle={() => setShowing(!showing)}
    >
      {/* Cards, as cards. A player at a table recognises their Miecz by its
          picture long before they read the word, and the ability text that used
          to sit under every line now lives one tap away in the detail view. */}
      {/* The pack is one place, and this rectangle is it.
          
          The free squares used to light up green one by one, which offered
          something the pack does not have: a card dropped in the fourth square
          does not go to the fourth square, it goes on the end, because the only
          positions a pack has are the ones its cards are in. The squares are
          how much room is left — 5.4's number, drawn — and nothing more.
          
          So the whole rectangle answers instead — for as long as a card is in
          the air, and the gap that opens under the pointer says where in it. */}
      <div
        onDragOver={(event) => {
          if (!canAct || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
          event.preventDefault();
          setDragOver(true);
        }}
        // Move rather than enter: a card is picked up by clicking one that is
        // already inside the pack, so the pointer never crosses the boundary
        // and `pointerenter` never fires. The guard keeps this from setting
        // state on every pixel.
        onPointerMove={() => {
          if (carried && !dragOver) setDragOver(true);
        }}
        onPointerLeave={() => {
          setDragOver(false);
          setInsertAt(null);
        }}
        onDragLeave={(event) => {
          // Only when the pointer leaves the pack itself, not on its way across
          // a card inside it.
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={(event) => {
          // Whatever gap is open is where it lands — dropping into the space
          // the row has made is the same gesture as dropping on the card that
          // made it. With none open this is the end of the queue, which is
          // where a card the pack has not seen before goes anyway.
          const before = insertAt === null ? null : lands(insertAt);
          setDragOver(false);
          setInsertAt(null);
          // The drop is the end of the drag, whatever `dragend` does about it.
          onDragging(null);
          if (!canAct) return;
          const holdingId = event.dataTransfer.getData(DRAG_TYPE);
          if (!holdingId) return;
          event.preventDefault();
          if (packOrder.includes(holdingId)) moveWithin(holdingId, before);
          else dropIntoPack(holdingId, before);
        }}
        // Clicking the pack with something on the cursor puts it there, which
        // is how a worn card comes off without aiming at a particular card —
        // and how a card already in the pack is sent to the back of it.
        onClick={(event) => {
          if (!carried) return;
          event.stopPropagation();
          // Wherever the gap happens to be, this is the pack itself: the end.
          const before = insertAt === null ? null : lands(insertAt);
          setInsertAt(null);
          if (carried.from === "plecak") {
            moveWithin(carried.holdingId, before);
            return onCarry(null);
          }
          dropIntoPack(carried.holdingId, before);
          onCarry(null);
        }}
        // The same two strengths every place on the body uses (see `TONE`):
        // dashed and faint for somewhere the card could go, solid and filled in
        // for where it would go. Red is 5.4 — no room — said while the card is
        // still in the air rather than as a refusal after it lands.
        // Clipped to itself, because a card at the start of a wrapped row steps
        // aside into nothing: there is no room inside the rectangle to its
        // left, so it leans out past the edge and was being cut off by the
        // panel behind, several pixels further out and in the wrong colour.
        // Cut by the pack's own border it reads as a card half out of the bag.
        className={`flex flex-wrap gap-2 overflow-hidden rounded border p-1 transition ${
          !landing
            ? "border-transparent"
            : refuses
              ? dragOver
                ? "border-solid border-vermilion bg-vermilion/25"
                : "border-dashed border-vermilion/60 bg-vermilion/10"
              : dragOver
                ? "border-solid border-verdigris bg-verdigris/25"
                : "border-dashed border-verdigris/60 bg-verdigris/10"
        }`}
      >
        {/* Your own Zaklęcia are not repeated here: they have their own panel
            above, face up and with the cast controls on them. What belongs on a
            seat card is what the *table* can see. */}
        {arranged.map((held, index) => (
          <ItemSlot
            key={held.id}
            // The same component the body is built from: a card in the pack and
            // a card being worn are the same object to a player, so picking one
            // up feels the same either way and both are the same size.
            item={{
              holdingId: held.id,
              cardId: held.cardId,
              card: tileFor(held),
              granted: held.granted,
              // 5.3, in the pack as on the body: a card this Natura may not
              // hold lends nothing anywhere, and the pack is where somebody
              // would drop it from.
              inert: forbiddenTo(held.cardId, asNature(seat.nature)),
            }}
            label={tileFor(held).name}
            eqMode={slotted ? "slots" : "classic"}
            nature={asNature(seat.nature)}
            tone="filled"
            // A card would land in front of this one, so this and everything
            // after it steps aside to show the space it is going into. Said
            // with a gap rather than by tinting the card under the pointer,
            // which reads as "this one is about to be replaced".
            step={stepAt(index)}
            // Reading and moving are different modes: no Karta opens over the
            // place you are aiming at while a card is in the air.
            quiet={moving}
            // The test mark comes off the card itself — see `ItemSlot`.
            marks={held.kind === "trophy" ? ["trofeum"] : []}
            // Up onto the body, mirroring the arrow down that takes a card
            // off it. Only where there is one place it could go: with two
            // hands to choose between, an arrow would be choosing for you, and
            // the pair of named buttons below is the whole point.
            corner={
              canAct && slotted && wearsInOnePlace(held.cardId) ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCarry(null);
                    const slot = SLOTS.find((place) => fitsIn(held.cardId, place))!;
                    // Where the two change places, say where the displaced one
                    // is going before the server does: it takes this card's
                    // square, and waiting to be told that means watching it
                    // arrive at the back of the pack and then jump.
                    const displaced = wornBySlot(seat)[slot];
                    if (displaced && onReorder) {
                      const order = arranged
                        .map((card) => card.id)
                        .filter((id) => id !== held.id);
                      order.splice(index, 0, displaced.holdingId);
                      ask(order);
                    }
                    onEquip(held.id, slot);
                  }}
                  title={
                    wornBySlot(seat)[SLOTS.find((slot) => fitsIn(held.cardId, slot))!]
                      ? "Załóż — to, co tam jest, wraca na to miejsce w plecaku"
                      : "Załóż"
                  }
                  className="absolute right-0 top-0 z-10 rounded-bl bg-night/85 px-1.5 leading-none text-muted transition hover:text-ochre"
                >
                  <span className="block pb-0.5 text-[14px]">↑</span>
                </button>
              ) : null
            }
            // The one on the cursor is not also in the pack.
            lifted={held.id === liftedHoldingId}
            dimmed={held.kind === "trophy"}
            disabled={!canAct}
            // One click picks it up; the next puts down whatever is on the
            // cursor, in front of the card it lands on. Clicking moves things;
            // hovering reads them.
            //
            // Everything in the pack can be picked up, not only what could be
            // worn. It used to be the wearables alone, which made the pack an
            // inventory in a game where three quarters of what you carry has no
            // place on the body — a Graal, an Eliksir and a trophy could not be
            // moved at all, so a pack could not be arranged.
            //
            // It used to open the card as a fallback, so the same gesture meant
            // "pick this up" on one card and "let me look at that" on the next —
            // and a modal landed on top of the pack you were in the middle of
            // rearranging. Reading is what the hover is for, and it is always
            // available without disturbing anything.
            onClick={(event) => {
              if (!canAct) return;
              event.stopPropagation();
              if (carried) {
                setInsertAt(null);
                // From the pack: it goes in front of this card. From the body:
                // it is being taken off, which lands it at the end.
                if (carried.from === "plecak") {
                  // Its own square is putting it back, which is the pack left
                  // exactly as it was.
                  if (!itsOwnSquare(held.id)) {
                    moveWithin(carried.holdingId, lands(held.id));
                  }
                  return onCarry(null);
                }
                // Off the body, and in front of this card rather than on the
                // end of the row.
                dropIntoPack(carried.holdingId, lands(held.id));
                return onCarry(null);
              }
              // Picked up from inside the pack, so the pointer is inside it —
              // said now rather than waiting for the first move, or the
              // rectangle stays dark until the hand twitches.
              setDragOver(true);
              onCarry({
                holdingId: held.id,
                cardId: held.cardId,
                name: tileFor(held).name,
                from: "plecak",
              });
            }}
            // Two clicks put a card on — and where there is nothing to put it
            // on, two clicks spend it instead. Never both for the same card:
            // the Różdżka Przeznaczenia is worn *and* spent, and it keeps the
            // gesture the other nine wearables have, with its "użyj" on the
            // button below. A gesture that meant one thing on this card and
            // another on the next would be worse than no gesture.
            onDoubleClick={() => {
              if (!canAct || held.kind !== "item") return;
              const place = slotted
                ? SLOTS.find((slot) => fitsIn(held.cardId, slot))
                : undefined;
              if (place) {
                onCarry(null);
                return onEquip(held.id, place);
              }
              if (onUse && isUsable(held.cardId)) onUse(held.id, held.cardId);
            }}
            // Dragged onto a place to put it on — the same journey the
            // "załóż" button makes, for people who reach for the card — or onto
            // another card in the pack, which is how the pack is arranged.
            draggable={canAct}
            onDragStart={(event) => {
              startHoldingDrag(event, held.id);
              onDragging({ cardId: held.cardId, holdingId: held.id });
            }}
            onDragEnd={() => {
              setInsertAt(null);
              onDragging(null);
            }}
            onDragOver={(event) => {
              if (!canAct || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
              // Taken here rather than left to the pack behind it, so the card
              // lands where the pointer is instead of at the end.
              event.stopPropagation();
              event.preventDefault();
              // The same two squares that mean "put it back" under the pointer
              // mean it under a drag.
              if (!itsOwnSquare(held.id)) setInsertAt(held.id);
            }}
            // No onDragLeave: unlike pointerleave, it fires on the way into a
            // child as well as on the way out, so a drag crossing the picture
            // inside this box would keep closing the gap it had just opened.
            // Leaving the pack clears it, and the next card claims it.
            onDrop={(event) => {
              setInsertAt(null);
              setDragOver(false);
              onDragging(null);
              if (!canAct) return;
              const holdingId = event.dataTransfer.getData(DRAG_TYPE);
              if (!holdingId || holdingId === held.id) return;
              event.stopPropagation();
              event.preventDefault();
              // A card off the body is being taken off; one already in the pack
              // is being moved within it.
              const before = lands(held.id);
              if (packOrder.includes(holdingId)) moveWithin(holdingId, before);
              else dropIntoPack(holdingId, before);
            }}
            /**
             * A carried card has no drag events behind it, so hovering is
             * watched directly for the same answer to show.
             *
             * Both halves of it: coming to a card opens the gap in front of it
             * and going away closes it again, wherever you go — onto the pack's
             * own margin, onto the body, off the panel. For a while only the
             * first half was safe, because the gap used to be made of layout
             * and opening it slid this card out from under the pointer, which
             * fired the leave, which closed the gap, which slid the card back.
             * The card shivered and the gap strobed, so the leave was simply
             * not listened for and the gap stayed open until something else
             * claimed it.
             *
             * The gap is drawn rather than laid out now (see `ItemSlot`) and
             * this box does not move, so leaving it means the pointer really
             * has left.
             */
            onPointerEnter={() => {
              if (!carried) return;
              // Its own square is not a place to put it, so nothing is open
              // while the pointer is there — said rather than left to the leave
              // of whatever was hovered before, which does not always come.
              // A card that has stepped aside is standing over its neighbour's
              // square, so coming back to the square you lifted from can mean
              // arriving under the very card that stepped, with no boundary
              // crossed to fire anything.
              setInsertAt(itsOwnSquare(held.id) ? null : held.id);
            }}
            // Only this card's own gap: moving straight to the next card sets
            // the new one in the same breath, and React keeps the last word.
            onPointerLeave={() => setInsertAt((at) => (at === held.id ? null : at))}
          >
            {canAct && (
              <span className="flex items-center gap-2">
                {/* Only where there is something to decide. A card with one
                    place has the arrow in its corner and needs no word for the
                    same act; a card with two hands to go in needs the two
                    named buttons, which is what this is. */}
                {slotted && held.kind === "item" && !wearsInOnePlace(held.cardId) && (
                  <EquipButton
                    cardId={held.cardId}
                    worn={wornBySlot(seat)}
                    onEquip={(slot) => onEquip(held.id, slot)}
                  />
                )}
                {/* Always drawn where a card has a use, whether or not the
                    double-click reaches it — a gesture nobody can see is not
                    an offer. In ochre because it costs you the card, unlike
                    "odrzuć", which leaves it lying on the Obszar (5.5). */}
                {onUse && isUsable(held.cardId) && (
                  <button
                    onClick={() => onUse(held.id, held.cardId)}
                    title={usageOf(held.cardId)?.co}
                    className="text-[9px] text-ochre underline hover:text-ink"
                  >
                    {USE_VERB}
                  </button>
                )}
                {/* The Różdżka's refill, on the Różdżka. Drawn whenever the
                    card is held and greyed when the hand is still above its
                    setup size, rather than appearing and vanishing: an offer
                    that comes and goes is one nobody learns the shape of, and
                    the shape is the whole rule the card carries. */}
                {onWand && held.cardId === "rozdzka-zaklec" && (
                  <button
                    disabled={!wandReady}
                    onClick={onWand}
                    title={
                      wandReady
                        ? "Weź nowe Zaklęcie — Różdżka pozwala, gdy masz tyle, co na początku gry, lub mniej"
                        : `Różdżka da nowe Zaklęcie, gdy będziesz mieć najwyżej ${setupSpells}`
                    }
                    className="text-[9px] text-magia underline hover:text-ink disabled:text-muted/50 disabled:no-underline"
                  >
                    dobierz Zaklęcie
                  </button>
                )}
                <button
                  onClick={() => onDrop(held.id)}
                  className="text-[9px] text-muted underline hover:text-vermilion"
                >
                  odrzuć
                </button>
              </span>
            )}
          </ItemSlot>
          ))}
        {/* Free places, built from the same component and wearing the same
            colours as the body's: green while a card that would fit is in the
            air, red when nothing more will. An empty place is a place, so it
            has no business being a differently-sized span with a highlight of
            its own. */}
        {(() => {
          // How much room is left, drawn. Not places to aim at — see the
          // rectangle above — so they never light up and never take a click of
          // their own; one lands on the pack, which is the thing they are part
          // of. No limit still shows one, so the row does not collapse.
          const free = Number.isFinite(limit) ? Math.max(0, limit - packed) : 1;
          return Array.from({ length: free }, (_, i) => (
            <ItemSlot
              key={`wolne-${i}`}
              item={null}
              label="wolne"
              glyph="+"
              tone="empty"
              disabled
              // Past the last card is the end of the queue, which is what a
              // free square means: not a position of its own, just the room
              // 5.4 has left.
              onPointerEnter={() => setInsertAt(null)}
              onDragOver={() => setInsertAt(null)}
            />
          ));
        })()}
        {seat.hidden_count > 0 && <CardBack count={seat.hidden_count} />}
      </div>

      {isMine && trophies > 0 && (
        <button
          onClick={onTrade}
          className="mt-2 rounded border border-edge px-2 py-1 text-[11px] text-ink transition hover:border-ochre"
        >
          Wymień trofea na punkty Miecza (1.4)
        </button>
      )}
    </Fold>
    <FriendsHeld
      friends={friends}
      seat={seat}
      isMine={isMine}
      moving={moving}
      onInspect={onInspect}
    />
    </>
  );
}

/**
 * Przyjaciele, in a section of their own beside the pack.
 *
 * They were in the pack for a long time and looked exactly like gear there,
 * which was wrong in the one way a player would act on: 5.4's four are drawn as
 * a row of squares with a "2 / 4" over them, and a Rycerz standing in that row
 * looks like one of the four things you may carry. He is not. 6.3 is explicit —
 * "Możesz posiadać dowolną ilość Przyjaciół" — and the engine has always agreed
 * (`carriedCount` counts `kind === "item"` and nothing else), so the count over
 * the pack was never wrong. Only the picture was.
 *
 * So: no denominator on the tally. Every other count in this app is "so many of
 * so many" because every other count is against a limit; this one is a number
 * of things you have, and writing "3 / ∞" would be inventing a limit to
 * reassure somebody there isn't one.
 *
 * Nothing here is draggable and nothing has a place on the body. A Przyjaciel
 * is not put on, not swapped, and not arranged — he follows you until he dies
 * for you (6.4) or you pay him off. Clicking one opens its Karta, which is the
 * only thing there is to do with it, and is why this does not take the pack's
 * pick-up machinery.
 */
function FriendsHeld({
  friends,
  seat,
  isMine,
  moving,
  onInspect,
}: {
  friends: readonly Seat["holdings"][number][];
  seat: Seat;
  /** Whose card this is. The empty state is addressed to its owner. */
  isMine: boolean;
  /** Something is in the air over the pack; no Karta opens while it is. */
  moving: boolean;
  onInspect: (card: TileCard) => void;
}) {
  // Somebody else's empty section is not drawn. Both of the things an empty one
  // says — where your friends will go, and that you may have any number — are
  // said to the person deciding, and neither is worth a row on each of five
  // opponents. The same reasoning that hides another player's empty pack.
  if (!isMine && friends.length === 0) return null;

  // 8.2 lets a Charakterystyka override the general rules, and the ŁOTR's does
  // it flatly: "Nie możesz mieć żadnych Przyjaciół." He still gets the section,
  // with the rule in it instead of a list — hiding it would answer the question
  // "where do my friends go" with silence, which reads as a missing feature
  // rather than as a card doing what it says.
  const barred = !mayHaveFriends(asCharacterId(seat.character_id));

  // The ban is a *note*: nothing in the app refuses to hand a ŁOTR a
  // Przyjaciel, and the test console can grant anybody anything. So the two
  // halves are drawn independently — what the card says, and what the seat
  // actually holds — because a UI that hides a card on the grounds that the
  // rules forbid it is lying about the game to defend a rule it is not
  // enforcing.
  const tiles = (
    <div className="flex flex-wrap gap-2 p-1">
      {friends.map((held) => (
        <ItemSlot
          key={held.id}
          item={{
            holdingId: held.id,
            cardId: held.cardId,
            card: tileFor(held),
            granted: held.granted,
            // 5.3 is about Przedmioty and a Przyjaciel is not one, so nothing
            // here goes inert on a Natura. The field is on the shape either
            // way and saying so is cheaper than wondering later.
            inert: false,
          }}
          label={tileFor(held).name}
          eqMode={slottedIrrelevant}
          nature={asNature(seat.nature)}
          tone="filled"
          quiet={moving}
          onClick={() => onInspect(tileFor(held))}
        />
      ))}
    </div>
  );

  // Drawn whether or not anything is in it. A player looking for where friends
  // go should find the place before they have one, the way the pack is there
  // before anything is in it — and this is where 6.3's "dowolną liczbę" is
  // stated, which is worth reading when you are deciding whether to take a
  // second one.
  return (
    <Fold title="Przyjaciele" tally={friends.length}>
      {barred && (
        <p className="p-1 text-[11px] leading-snug text-vermilion/90">
          Nie możesz mieć żadnych Przyjaciół — tak mówi twoja Karta Postaci
          {friends.length > 0 ? ", a mimo to ktoś z tobą idzie" : ""} (8.2).
        </p>
      )}
      {!barred && friends.length === 0 && (
        <p className="p-1 text-[11px] leading-snug text-muted">
          <Rules>
            Nikt z tobą nie idzie. Przyjaciół możesz mieć dowolną liczbę i nie liczą się do
            czterech Przedmiotów (6.3).
          </Rules>
        </p>
      )}
      {friends.length > 0 && tiles}
    </Fold>
  );
}

/**
 * A Przyjaciel is the same object in both variants.
 *
 * `ItemSlot` takes an `eqMode` because a Przedmiot's tile changes with it —
 * there are places on the body in one and not the other. Nothing about a friend
 * does, so this names the fact rather than threading a prop through to have it
 * ignored.
 */
const slottedIrrelevant = "classic" as const;

/**
 * Putting a Przedmiot on.
 *
 * One button when there is one place it can go, and a choice of two when it is
 * a weapon and both hands are places it could go — which is the only real
 * decision the variant offers, so it is the only one worth a second button.
 */
/** Somewhere to put it, and only one somewhere — so no choice to offer. */
function wearsInOnePlace(cardId: string): boolean {
  return SLOTS.filter((slot) => fitsIn(cardId, slot)).length === 1;
}
