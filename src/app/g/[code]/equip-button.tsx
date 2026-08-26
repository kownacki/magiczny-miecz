"use client";

/** The little "załóż" under a Przedmiot: where this card can go, if anywhere. */

import { SLOTS, fitsIn, type Slot } from "@/lib/engine/slots";
import type { SlotItem } from "./slot-panel";

export function EquipButton({
  cardId,
  worn,
  onEquip,
}: {
  cardId: string;
  worn: Partial<Record<Slot, SlotItem>>;
  onEquip: (slot: Slot) => void;
}) {
  const places = SLOTS.filter((slot) => fitsIn(cardId, slot));
  if (places.length === 0) return null;

  if (places.length === 1) {
    return (
      <button
        onClick={() => onEquip(places[0])}
        className="text-[9px] text-ochre/80 underline hover:text-ochre"
      >
        {worn[places[0]] ? "zamień" : "załóż"}
      </button>
    );
  }
  // Both hands. Named rather than numbered, because "gł." and "pom." is what
  // somebody staring at the two boxes either side of the body will read them as.
  return (
    <span className="flex items-center gap-1 text-[9px]">
      <span className="text-muted">załóż:</span>
      {places.map((slot) => (
        <button
          key={slot}
          onClick={() => onEquip(slot)}
          title={slot === "main-hand" ? "Ręka główna" : "Ręka pomocnicza"}
          className="text-ochre/80 underline hover:text-ochre"
        >
          {slot === "main-hand" ? "gł." : "pom."}
        </button>
      ))}
    </span>
  );
}
