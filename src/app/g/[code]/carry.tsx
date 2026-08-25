"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { cardArtUrl } from "@/lib/engine/cardImages";

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

export function CarriedCard({ carried }: { carried: Carried | null }) {
  const box = useRef<HTMLDivElement>(null);

  // Positioned by hand rather than through state: this fires on every pointer
  // move, and re-rendering the seat card for each pixel would make the card lag
  // behind the cursor it is supposed to be stuck to.
  useEffect(() => {
    if (!carried) return;
    const follow = (event: PointerEvent) => {
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
      ref={box}
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
