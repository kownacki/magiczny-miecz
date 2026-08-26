/** The establishments: trading trophies for Miecz (1.4), and the desks that buy, sell and heal (21.2, 4.7). */

import { combatValueOf } from "@/lib/engine/cards";
import { heldAbilities } from "@/lib/engine/abilities";
import { scriptFor, type Effect } from "@/lib/engine/cardScript";
import { fieldScriptFor } from "@/lib/engine/fieldScript";
import { HEAL_CEILING } from "@/lib/engine/derive";
import type { FieldId } from "@/lib/engine/board";
import { EVENTS } from "../decks";
import { apply, merge, type Outcome, type Snapshot } from "../change";
import type { SeatRow } from "../store";
import { asReturnable, putOnPile } from "./piles";
import { seatById } from "./seat";

/** 1.4: seven points of beaten Wróg buy one point of Miecz. */
export const TROPHY_RATE = 7;

/**
 * What this Obszar offers of a given kind, counting the cards lying on it.
 *
 * A shop can be printed on the board or can have walked in as a Karta and
 * stayed (16.8), and 21.1 makes no distinction between them.
 */
export function offerOn<K extends Effect["op"]>(
  snapshot: Snapshot,
  fieldId: FieldId,
  op: K,
): Extract<Effect, { op: K }> | null {
  const found: Effect[] = [];
  const walk = (effect: Effect) => {
    if (effect.op === op) found.push(effect);
    if (effect.op === "po-kolei") effect.steps.forEach(walk);
    if (effect.op === "wybor") effect.options.forEach((o) => walk(o.effect));
  };

  for (const offer of fieldScriptFor(fieldId)?.offers ?? []) walk(offer.effect);

  for (const card of snapshot.fieldCards.filter((c) => c.field_id === fieldId)) {
    const script = scriptFor(card.card_id);
    if (script) walk(script.effect);
  }

  return (found[0] as Extract<Effect, { op: K }>) ?? null;
}

/** A seat that is actually standing somewhere, which every trade needs. */
export function standingShopper(snapshot: Snapshot, seatId: string): SeatRow {
  const seat = snapshot.seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nie ma takiego miejsca.");
  if (!seat.field_id) throw new Error("Postać nie stoi jeszcze na Obszarze.");
  return seat;
}

/**
 * Cashes in every beaten Wróg (1.4).
 *
 * Everything is handed in at once because the rule says points above a multiple
 * of seven are lost, not banked — so holding one back to add to it later is not
 * a thing the rule allows.
 */
export function tradeTrophies(
  snapshot: Snapshot,
  command: { seatId: string },
): Outcome<number> {
  const seat = seatById(snapshot, command.seatId);
  const trophies = snapshot.holdings.filter(
    (h) => h.seat_id === seat.id && h.kind === "trophy",
  );

  const points = trophies.reduce((sum, t) => {
    const card = EVENTS.find((c) => c.id === t.card_id);
    return sum + (combatValueOf(card ?? { cardClass: "wrog" })?.total ?? 0);
  }, 0);
  const gained = Math.floor(points / TROPHY_RATE);
  if (gained < 1) throw new Error(`Potrzeba ${TROPHY_RATE} punktów Miecza pokonanych Wrogów.`);

  const handed = {
    ...(trophies.length ? { holdings: { delete: trophies.map((t) => t.id) } } : {}),
  };
  // 1.4, said in as many words: "Po tego rodzaju wymianie, Kartę pokonanego
  // Wroga należy odłożyć na stos zużytych Kart Zdarzeń." A beaten Wróg is not
  // spent when it is beaten — that is what makes it a trophy — it is spent
  // here, when it is cashed in.
  const returned = putOnPile(apply(snapshot, handed), "events", trophies.map(asReturnable));

  return {
    writes: merge(merge(handed, returned), {
      seats: [{ id: seat.id, patch: { miecz_own: seat.miecz_own + gained } }],
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "wymiana-trofeow",
          payload: { points, gained, lost: points - gained * TROPHY_RATE },
        },
      ],
    }),
    result: gained,
  };
}

/**
 * Sells a Przedmiot, at a desk or to an Alchemik walking beside you.
 *
 * The two are the same trade at the same rate, and the card says so.
 */
export function sellHolding(
  snapshot: Snapshot,
  command: { seatId: string; holdingId: string },
): Outcome<void> {
  const seat = standingShopper(snapshot, command.seatId);
  const mine = snapshot.holdings.filter((h) => h.seat_id === seat.id);

  const desk = offerOn(snapshot, seat.field_id as FieldId, "sprzedaj");
  const alchemist = heldAbilities(mine.map((h) => h.card_id)).find(
    (ability) => ability.kind === "skup",
  );
  const price = desk?.cena ?? (alchemist?.kind === "skup" ? alchemist.cena : null);
  if (price === null) throw new Error("Nikt tu nie skupuje Przedmiotów.");

  const held = mine.find((h) => h.id === command.holdingId);
  if (!held) throw new Error("Nie masz tej karty.");
  // A Przyjaciel is a person and a trophy is a memory; neither is something the
  // Lichwiarz deals in. 5.4 counts only Przedmioty and so does he.
  if (held.kind !== "item") throw new Error("Lichwiarz kupuje tylko Przedmioty.");

  const gone = { holdings: { delete: [held.id] } };
  // 21.2 for a Wyposażenie card — back to the stock, by arithmetic — and the
  // used pile for anything the deck printed. `putOnPile` knows which.
  const returned = putOnPile(apply(snapshot, gone), "events", [asReturnable(held)]);

  return {
    writes: merge(merge(gone, returned), {
      seats: [{ id: seat.id, patch: { zloto: seat.zloto + price } }],
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "sprzedaz",
          payload: { cardId: held.card_id, price },
        },
      ],
    }),
    result: undefined,
  };
}

/** Buys back points of Życie, as many as the purse and 4.7 between them allow. */
export function payHealer(
  snapshot: Snapshot,
  command: { seatId: string; points: number },
): Outcome<{ healed: number; paid: number }> {
  const seat = standingShopper(snapshot, command.seatId);
  const cure = offerOn(snapshot, seat.field_id as FieldId, "uzdrow");
  if (!cure) throw new Error("Na tym Obszarze nikt nie leczy.");
  if (!Number.isInteger(command.points) || command.points < 1) throw new Error("Ile punktów?");

  const price = cure.cena ?? 0;
  const affordable = price > 0 ? Math.floor(seat.zloto / price) : command.points;
  const wanted = Math.min(command.points, affordable, Math.max(0, HEAL_CEILING - seat.zycie));
  if (wanted <= 0) {
    throw new Error(
      seat.zycie >= HEAL_CEILING
        ? `Życie jest już na poziomie początkowym (${HEAL_CEILING}) — 4.7 nie pozwala wyżej.`
        : "Za mało złota.",
    );
  }

  const paid = wanted * price;
  return {
    writes: {
      seats: [{ id: seat.id, patch: { zycie: seat.zycie + wanted, zloto: seat.zloto - paid } }],
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "leczenie",
          payload: { points: wanted, paid },
        },
      ],
    },
    result: { healed: wanted, paid },
  };
}
