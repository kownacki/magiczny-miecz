/** The things a Przyjaciel does that are not a fight (6.1-6.4, and the cards' own text). */

import { carriesSpell, sellsPoints } from "@/lib/engine/abilities";
import { afterBreakout, heldByARoll } from "@/lib/engine/status";
import { inEffect } from "@/lib/engine/holdings";
import { cardName } from "@/lib/engine/polish";
import { apply, merge, mergeAll, type CommandPorts, type Outcome, type Snapshot } from "../change";
import { activeSeat, eqModeOf, seatById, seatView } from "./seat";
import { addEffect, keepOnly, statusesOf } from "./turn";
import { castSpell, type Cast, type CastSpell } from "./fight";
import { asReturnable, putOnPile } from "./piles";

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

/**
 * Has the Przyjaciel who carries a Zaklęcie speak it.
 *
 * Two cards do this and they ask different prices. The Krzyżowiec "użyje, gdy
 * sobie tego zażyczysz" and stays. The Gnom "wypowie Zaklęcie, gdy ofiarujesz
 * mu 1 Sztukę Złota, a następnie zniknie zabierając swoją zapłatę - należy
 * odłożyć jego Kartę i złoto" — so his fee buys one casting and costs you the
 * friend as well as the coin.
 *
 * The casting itself is `castSpell`'s, reached with `viaFriend` because a
 * carried card is not in the hand and the ordinary path must not find it: the
 * whole of the Gnom's bargain is that the spell cannot be had for nothing.
 */
export async function speakCarriedSpell(
  snapshot: Snapshot,
  command: { seatId?: string; target?: CastSpell["target"] },
  ports: CommandPorts,
): Promise<Outcome<Cast>> {
  const seat = command.seatId ? seatById(snapshot, command.seatId) : activeSeat(snapshot);
  const carried = snapshot.holdings.find(
    (h) => h.seat_id === seat.id && h.kind === "carried",
  );
  if (!carried || carried.carried_by === null) {
    throw new Error("Żaden twój Przyjaciel nie nosi Zaklęcia.");
  }

  const friend = snapshot.holdings.find(
    (h) => h.seat_id === seat.id && h.card_id === carried.carried_by,
  );
  const terms = carriesSpell([carried.carried_by]);
  if (!friend || !terms) throw new Error("Żaden twój Przyjaciel nie nosi Zaklęcia.");

  const name = cardName(carried.carried_by);
  if (seat.gold < terms.cena) {
    throw new Error(`Za mało złota: ${name} chce ${terms.cena} Sz. Z.`);
  }

  const spoken = await castSpell(
    snapshot,
    { seatId: seat.id, holdingId: carried.id, target: command.target, viaFriend: true },
    ports,
  );

  // "zniknie zabierając swoją zapłatę - należy odłożyć jego Kartę i złoto."
  // The coin leaves the game with him rather than going back to the bank, which
  // is the same thing as far as a purse is concerned, and his Karta joins the
  // used Karty Zdarzeń like any other friend who is gone (6.4).
  const paid =
    terms.cena > 0 ? { seats: [{ id: seat.id, patch: { gold: seat.gold - terms.cena } }] } : {};
  if (!terms.znika) return { writes: merge(spoken.writes, paid), result: spoken.result };

  const soFar = mergeAll(spoken.writes, paid, { holdings: { delete: [friend.id] } });
  const back = putOnPile(apply(snapshot, soFar), "events", [asReturnable(friend)]);
  return {
    writes: mergeAll(soFar, back, {
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "discarded",
          payload: { cardId: friend.card_id, kind: "friend" },
        },
      ],
    }),
    result: spoken.result,
  };
}

/**
 * Throws for your freedom, where something is holding you in place.
 *
 * Both Świątynie end their ninth row this way: "zostałeś opętany, pozostaniesz
 * tu, dopóki nie wyrzucisz podczas swojej tury 1, 2 lub 3 oczek (na 1 kostce)."
 *
 * One throw a turn, read by every status waiting on a die — the board asks for
 * a roll, not a roll per affliction, and a character unlucky enough to be held
 * by both Świątynie is not made to throw twice.
 *
 * Explicit rather than folded into the start of a turn, because the roll needs
 * the port and starting a turn is pure. It is the same bargain `roll` makes: a
 * die a player can see being asked for.
 */
export async function breakFree(
  snapshot: Snapshot,
  command: { seatId?: string },
  ports: CommandPorts,
): Promise<Outcome<{ die: number; freed: string[] }>> {
  const seat = command.seatId ? seatById(snapshot, command.seatId) : activeSeat(snapshot);
  const held = statusesOf(snapshot, seat.id);
  if (!heldByARoll(held)) throw new Error("Nic cię tu nie trzyma.");

  const die = await ports.random.rollD6("opętanie: rzut o wolność");
  const left = afterBreakout(held, die);
  const freed = held.filter((was) => !left.some((still) => still.id === was.id));

  return {
    writes: mergeAll(keepOnly(snapshot, seat.id, left), {
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "effect",
          payload: {
            source: "opętanie",
            label: freed.length > 0 ? `uwolniony (${die})` : `nadal opętany (${die})`,
            ends: { kind: "rzut", upTo: 3 },
          },
        },
      ],
    }),
    result: { die, freed: freed.map((one) => one.label) },
  };
}
