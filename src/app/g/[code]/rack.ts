"use client";

/**
 * A row of cards you arrange: the state around `pack-order.ts`'s rules.
 *
 * The Plecak grew all of this first — the order this device has asked for and
 * not been told about, which square the pointer is between, which way each card
 * steps aside to show where one is going — and none of it is about Przedmioty.
 * It is about a row of cards with an order somebody cares about, which the hand
 * of Zaklęcia is too: 2.6 caps it, a player arranges it, and until now it was
 * drawn as a bag of cards in whatever order the server happened to return.
 *
 * So the rules stay pure in `pack-order.ts`, the pictures stay in the two
 * components that draw them — a pack answers to 5.4 and a hand to 2.6, and they
 * say different things in their empty squares — and what sits between the two,
 * which is the part that was going to be copied, lives here.
 */

import { useState } from "react";
import {
  arrangedBy,
  insertIndexIn,
  landsBefore,
  orderWith,
  sameOrder,
  stepFor,
} from "./pack-order";

interface Card {
  id: string;
}

export interface Rack<T extends Card> {
  /** The row in the order it should be drawn. */
  arranged: T[];
  /** Which way the card at this index steps aside: -1, 1, or nothing. */
  stepAt: (index: number) => ReturnType<typeof stepFor>;
  /** The card a landing card goes in front of, given the square aimed at. */
  lands: (targetId: string) => string | null;
  /** The card the pointer is between, while one is in the air. */
  insertAt: string | null;
  setInsertAt: (id: string | null | ((was: string | null) => string | null)) => void;
  /** Whether a drag is over the row itself, for the colour it answers in. */
  dragOver: boolean;
  setDragOver: (over: boolean) => void;
  /** Moves a card already in the row to sit before another, or on the end. */
  moveWithin: (holdingId: string, beforeId: string | null) => void;
  /** Says an order was asked for, for a caller writing one of its own. */
  ask: (order: string[]) => void;
  /**
   * The one square that is not a place to put a card: the square it came from.
   *
   * No gap opens there, because the hollow left behind is already the answer —
   * and dropping there used to do worse than nothing. It asked the row to put
   * the card in front of itself, which stops being a position the moment the
   * card is lifted out to look for one, so it fell through to "no position
   * given", which means the end of the queue: a card picked up and put straight
   * back down came to rest at the back of the pack.
   */
  itsOwnSquare: (id: string) => boolean;
}

export function useRack<T extends Card>({
  cards,
  liftedHoldingId,
  onReorder,
}: {
  /** The row as the server has it. */
  cards: readonly T[];
  /** The card in the air, which leaves a hollow rather than a place. */
  liftedHoldingId: string | null;
  /** Absent where the row cannot be arranged; every move then writes nothing. */
  onReorder?: (holdingIds: string[]) => void;
}): Rack<T> {
  const [dragOver, setDragOver] = useState(false);
  /** The card a reordering drag is currently over, so it can show where it lands. */
  const [insertAt, setInsertAt] = useState<string | null>(null);
  /**
   * The order this device has just asked for and the server has not confirmed.
   *
   * Without it a card dragged across the row snaps back for as long as the
   * round trip takes, which for a gesture that is *about* where the card ends
   * up reads as the drag having failed. Never cleared: once the server agrees,
   * sorting by it is a no-op, and the moment a card is gained or lost it stops
   * matching the row and is ignored.
   */
  const [wanted, setWanted] = useState<string[] | null>(null);

  const arranged = arrangedBy(cards, wanted);
  const liftedIndex = arranged.findIndex((card) => card.id === liftedHoldingId);
  const insertIndex = insertIndexIn(arranged, insertAt, liftedHoldingId);

  return {
    arranged,
    stepAt: (index) => stepFor(index, { liftedIndex, insertIndex }),
    lands: (targetId) => landsBefore(arranged, targetId, liftedIndex),
    insertAt,
    setInsertAt,
    dragOver,
    setDragOver,
    /**
     * A move that changes nothing writes nothing. Dropping a card in front of
     * the one that already follows it is a real aim at a real place, and the
     * place happens to be the one it is in — so it is allowed, and answered
     * with silence rather than with a round trip that puts the row into the
     * order it is already in.
     */
    moveWithin: (holdingId, beforeId) => {
      if (!onReorder) return;
      if (!arranged.some((card) => card.id === holdingId)) return;
      const order = orderWith(arranged, holdingId, beforeId);
      if (sameOrder(order, arranged)) return;
      setWanted(order);
      onReorder(order);
    },
    itsOwnSquare: (id) => id === liftedHoldingId,
    ask: (order) => {
      setWanted(order);
      onReorder?.(order);
    },
  };
}
