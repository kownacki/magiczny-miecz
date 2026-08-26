"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { cardArtUrl } from "@/lib/view/cardImages";

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
      className="pointer-events-none fixed left-0 top-0 z-50 -ml-8 -mt-7 opacity-90"
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
