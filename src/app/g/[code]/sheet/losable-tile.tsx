"use client";

/** One card of the pack, in the row a loss is chosen from. */

import { ItemSlot } from "../item-slot";
import { CARD_NAMES, tileFor, type Held } from "../table";
import type { EqMode } from "@/lib/engine/slots";

/**
 * One card of the pack, in the row a loss is chosen from.
 *
 * The Trofea's tile, in every respect that matters — `ItemSlot` with the name
 * under the picture, `chosen` for the one that is picked out, and the Karta a
 * hover away whether or not the click does anything. A loss is the same gesture
 * as a trade: a handful of cards, one of them going.
 */
export function LosableTile({
  held,
  picked,
  onPick,
  eqMode,
}: {
  held: Held;
  picked: boolean;
  onPick?: () => void;
  eqMode: EqMode;
}) {
  return (
    <ItemSlot
      item={{
        holdingId: held.id,
        cardId: held.cardId,
        card: tileFor({ cardId: held.cardId, kind: held.kind, granted: held.granted }),
        inert: false,
      }}
      label={CARD_NAMES.get(held.cardId) ?? held.cardId}
      eqMode={eqMode}
      tone={picked ? "chosen" : "filled"}
      disabled={!onPick}
      onClick={onPick}
    />
  );
}

