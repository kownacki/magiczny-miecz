"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cardArtUrl } from "@/lib/view/cardImages";
import { LAYER } from "./layers";
import { dismissableOpen } from "./overlay";

/**
 * A card picked up and stuck to the pointer.
 *
 * This is the inventory interaction every player already knows: click a thing
 * to pick it up, click where you want it to go. It exists alongside dragging
 * rather than instead of it, and it is the one that works everywhere — a drag
 * needs a button held down across a journey, which a phone does not have and a
 * shaky hand loses halfway.
 *
 * Deliberately `pointer-events: none`: while a card is on the cursor it must
 * not be the thing the next click lands on, or it would catch its own drop.
 */
export interface Carried {
  holdingId: string;
  cardId: string;
  name: string;
  /** Where it came from, so putting it back is a no-op rather than a move. */
  from: string | null;
}

/**
 * Where the pointer was last seen.
 *
 * Module-level and not state, because it is read at the instant a card is
 * picked up and nothing should re-render when it changes. Kept up to date from
 * `pointerdown` as well as `pointermove`: a card is picked up by a click, the
 * click follows a `pointerdown`, and on a touchscreen that press is the only
 * position anybody has ever given us — there is no hovering finger to have left
 * a trail of moves behind it.
 */
const lastPointer = { x: 0, y: 0 };

export function CarriedCard({ carried }: { carried: Carried | null }) {
  const box = useRef<HTMLDivElement>(null);

  // Always listening, whether or not anything is being carried, because the
  // position has to be known *before* the pick-up rather than after it.
  useEffect(() => {
    const remember = (event: PointerEvent) => {
      lastPointer.x = event.clientX;
      lastPointer.y = event.clientY;
    };
    window.addEventListener("pointerdown", remember, { passive: true });
    return () => window.removeEventListener("pointerdown", remember);
  }, []);

  // Positioned by hand rather than through state: this fires on every pointer
  // move, and re-rendering the seat card for each pixel would make the card lag
  // behind the cursor it is supposed to be stuck to.
  useEffect(() => {
    if (!carried) return;
    const follow = (event: PointerEvent) => {
      lastPointer.x = event.clientX;
      lastPointer.y = event.clientY;
      const node = box.current;
      if (node) node.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    };
    window.addEventListener("pointermove", follow);
    return () => window.removeEventListener("pointermove", follow);
  }, [carried]);

  if (!carried) return null;
  const art = cardArtUrl(carried.cardId);

  return (
    <div
      // Placed as it mounts, not on the first move afterwards. Waiting for a
      // `pointermove` meant the card appeared in the top-left corner of the
      // window and stayed there until the hand twitched — so picking something
      // up looked like dropping it somewhere else.
      ref={(node) => {
        box.current = node;
        if (node) node.style.transform = `translate(${lastPointer.x}px, ${lastPointer.y}px)`;
      }}
      className={`pointer-events-none fixed left-0 top-0 ${LAYER.carried} -ml-8 -mt-7 opacity-90`}
      aria-hidden
    >
      {art ? (
        <Image
          src={art}
          alt=""
          width={64}
          height={56}
          className="rounded border border-ochre shadow-[0_2px_12px_rgba(0,0,0,0.7)]"
          unoptimized
        />
      ) : (
        <span className="rounded border border-ochre bg-panel px-2 py-1 text-[11px] text-ink">
          {carried.name}
        </span>
      )}
    </div>
  );
}

/**
 * Every carry on the page, so that one pointer holds one card.
 *
 * Two surfaces run the hook below — the Plecak and the hand of Zaklęcia — and
 * they have to be two: a Zaklęcie has nowhere on the body to land and a
 * Przedmiot has no business in a hand 2.6 counts separately, so the places that
 * light up are not the same places. What they must not be is two *pointers*.
 *
 * Nothing put the second card down. The click that picks one up is stopped by
 * the tile that handled it — a card in a row must not also count as a click on
 * the row — so it never reaches the window, and the other surface never hears
 * the click that would have ended its own gesture. With one of the two drawing
 * nothing on the cursor this was invisible; with both drawing, it is two cards
 * stacked on the same pointer.
 */
const carrying = new Set<() => void>();

/**
 * A card in the air, however it was picked up — the whole gesture, once.
 *
 * There are two ways to move a card and they are the same journey: a click
 * picks it up and the next click puts it down, or the button is held for the
 * length of it. What the table has to show is the same either way — the place
 * it came from looks emptied, the places it could go light up — so both feed
 * one `lifted` and one `movingCardId`, and putting it down clears both. A
 * surface that cleared one and not the other went on looking exactly like a
 * gesture still in progress.
 *
 * Written twice before this: the Plecak had all of it and the hand of Zaklęcia
 * had two thirds, which is how the hand ended up with no card on the cursor at
 * all. The parts it was missing were not decisions taken differently — they
 * were the parts nobody had got round to copying.
 */
export function useCarry(): {
  /** On the cursor, put there by a click. */
  carried: Carried | null;
  /** In the air under a held button, said a tick late — see `announceDrag`. */
  dragging: { cardId: string; holdingId: string } | null;
  /** The card that is not where it lives, whichever way it was lifted. */
  lifted: string | null;
  /** Which card it is, for the places that answer whether they would take it. */
  movingCardId: string | null;
  pickUp: (carried: Carried) => void;
  putDown: () => void;
  /** Says what a drag has picked up, and null when it ends. */
  announceDrag: (moving: { cardId: string; holdingId: string } | null) => void;
} {
  const [carried, setCarried] = useState<Carried | null>(null);
  /**
   * The card being dragged, by id.
   *
   * Kept in state because a `dragover` handler is not allowed to read what the
   * drag is carrying — only the drop is — so without this the place under the
   * pointer could not say whether it would accept before it was let go.
   */
  const [dragging, setDragging] = useState<{ cardId: string; holdingId: string } | null>(null);

  /**
   * Says what a drag has picked up — a tick after it picks it up.
   *
   * The browser takes its picture of the card being dragged at the end of the
   * `dragstart` handler, and the place the card came from is faded the moment
   * this lands. Fade it inside the handler and the picture on the cursor is the
   * faded one, which is the opposite of what a card in the air should look
   * like. Letting go cancels a pending fade rather than queueing behind it, so
   * a drag abandoned in the same breath cannot leave a hollow behind.
   */
  const timer = useRef<number | null>(null);
  const announceDrag = useCallback((moving: { cardId: string; holdingId: string } | null) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (!moving) return setDragging(null);
    timer.current = window.setTimeout(() => setDragging(moving), 0);
  }, []);

  /**
   * Nothing is in the air any more, whichever half was holding it.
   *
   * Onto the place it came from, a card is simply put back: nothing moved, so
   * nothing is sent. That is also what happens when it is dropped anywhere that
   * is not a place at all — a click on the board, or Escape — because a card
   * picked up and not put anywhere has not gone anywhere.
   */
  const putDown = useCallback(() => {
    setCarried(null);
    announceDrag(null);
  }, [announceDrag]);

  // A click anywhere that is not a place, or Escape, puts it back. The places
  // stop their own clicks from reaching the window, so this only hears the ones
  // that missed. Registered a tick late so the click that picked the card up
  // does not immediately put it down again.
  useEffect(() => {
    if (!carried) return;
    let cancel: (() => void) | undefined;
    const late = setTimeout(() => {
      const putBack = () => putDown();
      const onKey = (event: KeyboardEvent) => {
        // Not while a sheet is open over the table: Escape is the top one's.
        if (event.key === "Escape" && !dismissableOpen()) putDown();
      };
      window.addEventListener("click", putBack);
      window.addEventListener("keydown", onKey);
      cancel = () => {
        window.removeEventListener("click", putBack);
        window.removeEventListener("keydown", onKey);
      };
    }, 0);
    return () => {
      clearTimeout(late);
      cancel?.();
    };
  }, [carried, putDown]);

  /**
   * A drag ends when it ends, wherever that is.
   *
   * `dragend` fires on the element the drag started from — and a drop that
   * lands moves that card, so React has usually unmounted it by the time the
   * event would arrive. The handler on the card then never runs, `dragging`
   * stays set, and the table sits there with the origin faded and every place
   * it could go lit up: a gesture that finished minutes ago, still showing.
   *
   * Listening at the window catches all of it — the drop that landed, the one
   * that missed, the drag let go outside the window — and `drop` is here as
   * well as `dragend` because some card handlers stop propagation, so those
   * would otherwise arrive only as the `dragend` that goes missing.
   */
  useEffect(() => {
    if (!dragging) return;
    /**
     * A tick late, and for the same reason the announcement was.
     *
     * These listen in the capture phase, which is *before* React dispatches
     * the `drop` to the row the card was dropped on — and a state change here
     * is flushed at the microtask checkpoint between the two, so React would
     * be re-rendering the row in the middle of the browser's own dispatch to
     * it. The drop then never arrived: the Zaklęcia rack stopped reordering by
     * drag the moment it started using this hook, intermittently and more
     * often the further the card travelled. Deferring the clear lets the
     * dispatch finish first, and the gesture is over either way.
     */
    const done = () => window.setTimeout(() => announceDrag(null), 0);
    window.addEventListener("dragend", done, true);
    window.addEventListener("drop", done, true);
    return () => {
      window.removeEventListener("dragend", done, true);
      window.removeEventListener("drop", done, true);
    };
  }, [dragging, announceDrag]);

  /**
   * Going away puts the card down.
   *
   * A card on the cursor is a gesture half finished, and a gesture cannot be
   * left running in a tab nobody is looking at: you come back minutes later to
   * a card stuck to the pointer, having forgotten which card it was or where it
   * came from, and the first click anywhere puts it somewhere. Leaving the tab
   * ends it, and so does the window losing focus.
   *
   * Nothing is lost by being eager about this. Putting it down is not a move —
   * the card has not gone anywhere yet, and the row is exactly as it was.
   */
  useEffect(() => {
    if (!carried) return;
    const putBack = () => putDown();
    const onHidden = () => {
      if (document.hidden) putBack();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", putBack);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", putBack);
    };
  }, [carried, putDown]);

  // Registered so that anybody else's pick-up can end this one. See `carrying`.
  useEffect(() => {
    carrying.add(putDown);
    return () => {
      carrying.delete(putDown);
    };
  }, [putDown]);

  /** Picking one up puts down whatever else was in the air, anywhere. */
  const pickUp = useCallback(
    (taken: Carried) => {
      for (const other of carrying) if (other !== putDown) other();
      setCarried(taken);
    },
    [putDown],
  );

  return {
    carried,
    dragging,
    lifted: carried?.holdingId ?? dragging?.holdingId ?? null,
    movingCardId: carried?.cardId ?? dragging?.cardId ?? null,
    pickUp,
    putDown,
    announceDrag,
  };
}
