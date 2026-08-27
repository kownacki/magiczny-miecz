/** The things a Przyjaciel does that are not a fight (6.1-6.4, and the cards' own text). */

import { sellsPoints } from "@/lib/engine/abilities";
import { inEffect } from "@/lib/engine/holdings";
import { cardName } from "@/lib/engine/polish";
import { merge, type Outcome, type Snapshot } from "../change";
import { activeSeat, eqModeOf, seatById, seatView } from "./seat";
import { addEffect } from "./turn";

/**
 * Why the friend mechanics are in two places.
 *
 * The ones that happen inside a fight — standing in for you, dying in your
 * place, being sent out on a raid — live in `fight.ts`, next to the machinery
 * they interrupt. This is for the rest, and at the moment the rest is one card.
 */

/**
 * Pays the Najemnik for a turn of his sword.
 *
 * "Jako Przyjaciel, Najemnik dodaje ci na jedną turę 3 punkty Miecza, ilekroć
 * zapłacisz mu 1 Sztukę Złota. Płacić Najemnikowi można tylko raz na turę."
 *
 * The points are an effect rather than a held-card bonus, because they are not
 * true of the character while the card is held — they are true of the character
 * for a turn, having been bought. `seat_effects` is where 1.2-1.5 already keep
 * that sort of thing, so the Eliksir Siły and this one expire the same way and
 * neither is ever written into own points.
 *
 * The once-a-turn rule needs nothing stored. The effect lasts exactly the turn
 * it was bought in, so an effect from this card already sitting on the seat *is*
 * the record of having paid: no column, and nothing to reset when a turn ends.
 */
export function payFriend(snapshot: Snapshot, command: { seatId?: string }): Outcome<string> {
  const seat = command.seatId ? seatById(snapshot, command.seatId) : activeSeat(snapshot);
  const view = seatView(snapshot, seat.id);
  const terms = sellsPoints(
    inEffect(view.holdings, eqModeOf(snapshot.game), view.nature).map((held) => held.cardId),
  );
  if (!terms) throw new Error("Nie masz Przyjaciela, któremu można zapłacić.");

  const name = cardName(terms.cardId);
  if (terms.razNaTure && view.statuses.some((status) => status.source === terms.cardId)) {
    throw new Error(`${name} dostał już zapłatę w tej turze.`);
  }
  if (seat.gold < terms.cena) {
    throw new Error(`Za mało złota: ${name} bierze ${terms.cena} Sz. Z.`);
  }

  const gained = [
    terms.miecz ? `+${terms.miecz} Miecza` : null,
    terms.magia ? `+${terms.magia} Magii` : null,
  ]
    .filter(Boolean)
    .join(" i ");

  return {
    writes: merge(
      {
        seats: [{ id: seat.id, patch: { gold: seat.gold - terms.cena } }],
        journal: [
          {
            seatId: seat.id,
            turn: snapshot.game.turn,
            kind: "paid-friend",
            payload: { cardId: terms.cardId, price: terms.cena },
          },
        ],
      },
      addEffect(snapshot, {
        seatId: seat.id,
        effect: {
          // The card, so the once-a-turn check above has something to recognise
          // and the hover can draw the Najemnik beside his own effect.
          source: terms.cardId,
          label: gained,
          modifier: { kind: "points", miecz: terms.miecz, magia: terms.magia },
          ends: { kind: "turns", turns: 1 },
        },
      }),
    ),
    result: terms.cardId,
  };
}
