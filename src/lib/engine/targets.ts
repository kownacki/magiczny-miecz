/** Who a card's effect lands on, when the card does not mean only the person who drew it. */

import type { Nature } from "@/data/types";
import { FIELDS, type FieldId } from "./board";
import type { Target } from "./cardScript";

export interface TargetSeat {
  seatIndex: number;
  characterId: string | null;
  fieldId: FieldId | null;
  nature: Nature | null;
  eliminated: boolean;
}

/**
 * The seats an effect hits right now, or null when that cannot be decided here.
 *
 * Null is not a failure. Two of the targets are genuinely not answerable at the
 * moment a card is resolved: `kazdy-kto-tu-trafi` belongs to a card that stays
 * on the board and catches whoever stops there later, and `inna-postac` is a
 * choice the holder has yet to make. Callers keep those pending, which is what
 * the effect pipeline already does with anything it cannot finish.
 *
 * Everything else is answerable, and was being treated as though it were not:
 * Burza Siedmiu Słońc, Zaćmienie Słońc and Zaklinacz Czasu all resolved to
 * nothing at all, because the applier only understood "ty".
 */
export function seatsTargeted(
  target: Target | undefined,
  seats: readonly TargetSeat[],
  actor: TargetSeat | undefined,
  /**
   * Characters the card names as exempt.
   *
   * Two of the five Zaklinacz Czasu names are expansion characters that are not
   * in this box, so they never match — which is correct, and why this is a
   * plain string list rather than CharacterId.
   */
  oprocz: readonly string[] = [],
): TargetSeat[] | null {
  // A dead character is not on the board to be hit (4.4).
  const playing = seats.filter((seat) => !seat.eliminated);
  const spared = (seat: TargetSeat) =>
    seat.characterId === null || !oprocz.includes(seat.characterId);

  const only = (chosen: readonly TargetSeat[]) => chosen.filter(spared);

  switch (target) {
    // No target named means the card is talking to whoever drew it.
    case undefined:
    case "ty":
      return actor && !actor.eliminated ? only([actor]) : [];

    case "wszyscy":
      return only(playing);

    case "wszyscy-w-kregu": {
      const ring = regionOf(actor?.fieldId ?? null);
      if (!ring) return [];
      return only(playing.filter((seat) => regionOf(seat.fieldId) === ring));
    }

    /**
     * One Obszar rather than a whole Kraina (Władca Gromu).
     *
     * Read off where the effect is landing, which for a Zaklęcie is the seat it
     * was aimed at — so a spell thrown at somebody else catches everyone
     * standing with them, and one thrown at your own feet catches you too. That
     * is what "także Postacie" is doing in the card's own sentence: it is
     * warning you.
     */
    case "wszyscy-tutaj": {
      const here = actor?.fieldId ?? null;
      if (!here) return [];
      return only(playing.filter((seat) => seat.fieldId === here));
    }

    case "w-dolnym-kregu":
      return only(playing.filter((seat) => regionOf(seat.fieldId) === "dolny"));
    case "w-srodkowym-kregu":
      return only(playing.filter((seat) => regionOf(seat.fieldId) === "srodkowy"));
    case "w-gornym-kregu":
      return only(playing.filter((seat) => regionOf(seat.fieldId) === "gorny"));

    case "dobrzy":
      return only(playing.filter((seat) => seat.nature === "good"));
    case "chaotyczni":
      return only(playing.filter((seat) => seat.nature === "chaotic"));
    case "zli":
      return only(playing.filter((seat) => seat.nature === "evil"));

    // Not answerable now: one waits for somebody to arrive, the other for
    // somebody to choose.
    case "kazdy-kto-tu-trafi":
    case "inna-postac":
      return null;
  }
}

/**
 * Which ring a field belongs to.
 *
 * The Kamienny Most belongs to none of them — it stands above the valley (p3),
 * and a card that hits "everyone in this Krąg" does not reach somebody up on
 * the bridge.
 */
function regionOf(fieldId: FieldId | null): "dolny" | "srodkowy" | "gorny" | null {
  if (!fieldId) return null;
  const region = FIELDS.get(fieldId)?.region;
  return region === "dolny" || region === "srodkowy" || region === "gorny" ? region : null;
}
