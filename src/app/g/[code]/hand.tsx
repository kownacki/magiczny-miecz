"use client";

/** The pack: what a character is carrying, in the order its owner put it in. */

import { useState } from "react";
import { asCharacterId, startingKit } from "@/lib/engine/characters";
import { carriedCount, carryLimit, wandRefills } from "@/lib/engine/derive";
import { SLOTS, fitsIn, type Slot } from "@/lib/engine/slots";
import { USE_VERB, isUsable, usageOf } from "@/lib/engine/uses";
import { CardBack, type TileCard } from "./card-tile";
import { type Carried } from "./carry";
import { EquipButton } from "./equip-button";
import { ItemSlot } from "./item-slot";
import { DRAG_TYPE, startHoldingDrag } from "./slot-panel";
import { asHoldings, asNature, tileFor, type Seat, wornBySlot } from "./table";

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
  const [dragOver, setDragOver] = useState(false);
  /** The card a reordering drag is currently over, so it can show where it lands. */
  const [insertAt, setInsertAt] = useState<string | null>(null);
  /**
   * The order this device has just asked for and the server has not confirmed.
   *
   * Without it a card dragged across the pack snaps back for as long as the
   * round trip takes, which for a gesture that is *about* where the card ends
   * up reads as the drag having failed. Never cleared: once the server agrees,
   * sorting by it is a no-op, and the moment a card is gained or lost it stops
   * matching the pack and is ignored.
   */
  const [wanted, setWanted] = useState<string[] | null>(null);

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
  // Counted through the engine rather than beside it, so what the pack says is
  // what `takeCard` and `equipCard` will actually allow. Still counted here and
  // not sent down ready-made: `mine.holdings` carries the optimistic slot a
  // drag has just asked for, and a number from the last poll would lag the
  // gesture it is describing.
  const cards = asHoldings(seat.holdings);
  const variant = slotted ? "slotowy" : "klasyczny";
  const packed = carriedCount(cards, variant);
  const limit = carryLimit(cards, variant);

  /**
   * The pack, in the order it should be drawn.
   *
   * The server's order is the truth; `wanted` overrides it only while it still
   * describes exactly this set of cards. A stale one — from before a card was
   * taken or lost — is simply ignored rather than cleared, which keeps this a
   * derivation and not a thing that has to be kept in step.
   */
  const inPack = shown.filter((held) => !slotted || held.slot == null);
  const packOrder = inPack.map((held) => held.id);
  const arranged =
    wanted !== null &&
    wanted.length === packOrder.length &&
    packOrder.every((id) => wanted.includes(id))
      ? [...inPack].sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id))
      : inPack;

  /**
   * The one square that is not a place to put a card: the square it came from.
   *
   * No gap opens there, because the hollow left behind is already the answer —
   * and dropping there used to do worse than nothing. It asked the row to put
   * the card in front of itself, which stops being a position the moment the
   * card is lifted out of the row to look for one, so it fell through to "no
   * position given", which means the end of the queue. A card picked up and put
   * straight back down came to rest at the back of the pack.
   *
   * The square *after* it is a place, even though landing there leaves the card
   * exactly where it started. It was quiet for a while on the reasoning that a
   * gap is a promise something will change — but every other square in the row
   * answers, so the one next door staying dark reads as a hole in the
   * interface rather than as an argument about identity. Nothing is written
   * when nothing moves; that belongs on the write, not on the gap.
   */
  const liftedIndex = arranged.findIndex((held) => held.id === liftedHoldingId);
  const itsOwnSquare = (id: string) => id === liftedHoldingId;

  /**
   * Which way each card steps aside, and how few of them have to.
   *
   * A card leaves a hollow where it was, and the row closes over it from
   * whichever side the card is going. Aim to your left and the cards between
   * there and the hollow step right, the way a hand opens a place. Aim to your
   * right and they step *left* instead, into the hollow, because that is the
   * direction they will really travel — everything from the target rightwards
   * stays exactly where it is, since nothing past the landing place moves.
   *
   * Stepping one way for both was the wrong picture in half the cases: dropping
   * on the far end pushed the whole tail of the pack sideways to make a place
   * that was already there, five squares back.
   *
   * A card off the body leaves no hollow, so there is nothing to close and the
   * row opens in front of the target as before.
   *
   * The gap is drawn by moving pictures and not by moving boxes (see
   * `ItemSlot`): laying it out would slide the row sideways under the pointer
   * and take the card you were aiming at with it.
   */
  /**
   * Where the gap is, and nowhere when nothing is in the air.
   *
   * The insertion point is a hover, and a hover outlives what it was for: put
   * the card down with Escape or a click on the board and the pointer has not
   * moved, so nothing tells the row to close. It used to stay open — and open
   * far wider than it had been, because with no card in the air the rule that
   * decides which way each one steps reads the row as a card arriving from the
   * body, and the whole tail steps aside for it. Fourteen cards stepped and
   * twelve places drawn, for a card that was already back in the pack.
   *
   * Read from what is actually in the air rather than from what was last
   * hovered, and the row cannot be left open by anything at all.
   */
  const insertIndex =
    insertAt === null || liftedHoldingId === null
      ? -1
      : arranged.findIndex((held) => held.id === insertAt);
  const stepFor = (index: number): -1 | 0 | 1 => {
    if (insertIndex < 0) return 0;
    if (liftedIndex < 0) return index >= insertIndex ? 1 : 0;
    if (insertIndex < liftedIndex) return index >= insertIndex && index < liftedIndex ? 1 : 0;
    return index > liftedIndex && index <= insertIndex ? -1 : 0;
  };

  /**
   * The card a landing card goes in front of, given the square you aimed at.
   *
   * You aim at a square and the card takes it. Coming from the left that means
   * going in front of the card *after* the one under the pointer, not in front
   * of that one — which is the same square counted from the other end, and
   * counting it from the wrong end put the card down one place short of where
   * it was aimed. Point at the fifth square and the fourth card was the one
   * that moved.
   *
   * Coming from the right, and for a card off the body with no place in the row
   * yet, the square you aim at is the one you go in front of.
   */
  const landsBefore = (targetId: string): string | null => {
    const target = arranged.findIndex((held) => held.id === targetId);
    if (target < 0 || liftedIndex < 0 || target < liftedIndex) return targetId;
    return arranged[target + 1]?.id ?? null;
  };

  /** The pack's order with one card put before another, or on the end. */
  const orderWith = (holdingId: string, beforeId: string | null) => {
    const without = arranged.map((held) => held.id).filter((id) => id !== holdingId);
    const at = beforeId === null ? -1 : without.indexOf(beforeId);
    without.splice(at < 0 ? without.length : at, 0, holdingId);
    return without;
  };

  /**
   * Moves a card already in the pack to sit before another, or on the end.
   *
   * A move that changes nothing writes nothing. Dropping a card in front of the
   * one that already follows it is a real aim at a real place, and the place
   * happens to be the one it is in — so it is allowed, and answered with
   * silence rather than with a round trip that reorders the pack into the order
   * it is already in.
   */
  const moveWithin = (holdingId: string, beforeId: string | null) => {
    if (!onReorder) return;
    if (!arranged.some((held) => held.id === holdingId)) return;
    const order = orderWith(holdingId, beforeId);
    if (order.every((id, index) => arranged[index]?.id === id)) return;
    setWanted(order);
    onReorder(order);
  };

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
    const order = orderWith(holdingId, beforeId);
    setWanted(order);
    onReorder(order);
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

  return (
    <div className="mt-3 border-t border-edge pt-3">
      {/* What is in the pack, against what will fit. In the variant a place on
          the body is not the pack, so the number here is the one 5.4 is about —
          and seeing it beats finding out by being refused. */}
      <p className="mb-2 text-[11px] uppercase tracking-widest text-muted">
        Plecak{" "}
        <span className={packed >= limit ? "text-vermilion" : "text-muted/70"}>
          {packed} / {Number.isFinite(limit) ? limit : "∞"}
        </span>
      </p>
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
          const before = insertAt === null ? null : landsBefore(insertAt);
          setDragOver(false);
          setInsertAt(null);
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
          const before = insertAt === null ? null : landsBefore(insertAt);
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
            }}
            label={tileFor(held).name}
            eqMode={slotted ? "slotowy" : "klasyczny"}
            nature={asNature(seat.nature)}
            tone="filled"
            // A card would land in front of this one, so this and everything
            // after it steps aside to show the space it is going into. Said
            // with a gap rather than by tinting the card under the pointer,
            // which reads as "this one is about to be replaced".
            step={stepFor(index)}
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
                      const order = arranged.map((card) => card.id).filter((id) => id !== held.id);
                      order.splice(index, 0, displaced.holdingId);
                      setWanted(order);
                      onReorder(order);
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
                    moveWithin(carried.holdingId, landsBefore(held.id));
                  }
                  return onCarry(null);
                }
                // Off the body, and in front of this card rather than on the
                // end of the row.
                dropIntoPack(carried.holdingId, landsBefore(held.id));
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
              if (!canAct) return;
              const holdingId = event.dataTransfer.getData(DRAG_TYPE);
              if (!holdingId || holdingId === held.id) return;
              event.stopPropagation();
              event.preventDefault();
              // A card off the body is being taken off; one already in the pack
              // is being moved within it.
              const before = landsBefore(held.id);
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
                    "wyrzuć", which leaves it lying on the Obszar (5.5). */}
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
                  wyrzuć
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
    </div>
  );
}

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
