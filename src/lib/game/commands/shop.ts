/** The establishments: trading trophies for Miecz (1.4), and the desks that buy, sell and heal (21.2, 4.7). */

import { combatValueOf } from "@/lib/engine/cards";
import { heldAbilities } from "@/lib/engine/abilities";
import { scriptFor, type Effect } from "@/lib/engine/cardScript";
import { fieldScriptFor } from "@/lib/engine/fieldScript";
import { HEAL_CEILING } from "@/lib/engine/derive";
import { goodsId } from "@/lib/engine/goods";
import type { FieldId } from "@/lib/engine/board";
import { EVENTS } from "../decks";
import { apply, merge, mergeAll, type Changeset, type Outcome, type Snapshot } from "../change";
import type { SeatRow } from "../store";
import { asReturnable, putOnPile } from "./piles";
import { takeCard, type Taken } from "./holdings";
import { cardName } from "@/lib/engine/polish";
import { seatById, trophyModeOf } from "./seat";

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
 * Cashes in beaten Wrogowie (1.4).
 *
 * The player chooses which. 1.4 says the Karty "w dowolnym momencie mogą zostać
 * wymienione" and never says all of them at once — so a character holding 6, 3,
 * 2 and 2 hands in seven of it and keeps the six, rather than burning the six
 * for nothing.
 *
 * This function used to take everything, reasoning that points above a multiple
 * of seven are lost so holding one back was not allowed. That does not follow:
 * the loss is what happens to what you *handed in*, not a rule against handing
 * in less. And the clause is not made dead by the choice — two Wrogowie are
 * worth ten apiece and a card cannot be split, so somebody holding a single
 * Smok still loses three or waits.
 *
 * Naming nothing still means everything, which is what a player asking to cash
 * out is usually after and what the console has always done.
 */
/** What one beaten Wróg is worth towards 1.4's sevens. */
export function trophyPointsOf(cardId: string): number {
  const card = EVENTS.find((one) => one.id === cardId);
  return (card ? combatValueOf(card)?.total : 0) ?? 0;
}

/**
 * Every held Wróg turned into the number printed on it, for the whole table.
 *
 * The one conversion that can be made mid-game, and only in this direction.
 * Each Karta already carries its value, so turning „Karty pokonanych" into
 * „Punkty" takes nothing away from anybody — the Karty go to the stos zużytych
 * and the seat keeps exactly what it was holding. Going back cannot be done at
 * all: the Wrogowie are on the pile and there is nothing to hand out again.
 *
 * A `granted` Karta scores and returns nothing, because the deck still holds
 * its own copy — the same rule `trophiesFrom` follows in a fight.
 */
export function convertTrophies(snapshot: Snapshot): Changeset {
  const held = snapshot.holdings.filter((one) => one.kind === "trophy");
  if (held.length === 0) return {};

  const bySeat = new Map<string, number>();
  for (const one of held) {
    bySeat.set(one.seat_id, (bySeat.get(one.seat_id) ?? 0) + trophyPointsOf(one.card_id));
  }

  const seats = [...bySeat].map(([id, points]) => {
    const seat = seatById(snapshot, id);
    return { id, patch: { trophy_points: seat.trophy_points + points } };
  });

  return mergeAll(
    { holdings: { delete: held.map((one) => one.id) } },
    { seats },
    putOnPile(
      snapshot,
      "events",
      held.map((one) => ({ cardId: one.card_id, granted: one.granted === true })),
    ),
    {
      journal: [...bySeat].map(([seatId, points]) => ({
        seatId,
        turn: snapshot.game.turn,
        kind: "override" as const,
        payload: { what: "trophy-mode", points, cards: held.filter((h) => h.seat_id === seatId).length },
      })),
    },
  );
}

export function tradeTrophies(
  snapshot: Snapshot,
  command: { seatId: string; cardIds?: readonly string[] },
): Outcome<number> {
  const seat = seatById(snapshot, command.seatId);

  /**
   * In `punkty` there are no Karty to choose between, so the fork 1.4 leaves
   * open does not arise: convert in sevens and keep the remainder.
   *
   * Keeping it rather than burning it is the same ruling as the printed mode's,
   * arrived at from the other side — a player who may hold cards back may hold
   * points back, and a variant that was harsher than the rule it replaces would
   * be changing the game rather than the bookkeeping.
   */
  if (trophyModeOf(snapshot.game) === "points") {
    const swords = Math.floor(seat.trophy_points / TROPHY_RATE);
    if (swords < 1) {
      throw new Error(
        `Potrzeba ${TROPHY_RATE} punktów Miecza pokonanych Wrogów (1.4) — masz ${seat.trophy_points}.`,
      );
    }
    const spent = swords * TROPHY_RATE;
    return {
      writes: {
        seats: [
          {
            id: seat.id,
            patch: {
              sword_own: seat.sword_own + swords,
              trophy_points: seat.trophy_points - spent,
            },
          },
        ],
        journal: [
          {
            seatId: seat.id,
            turn: snapshot.game.turn,
            kind: "trophies-traded",
            payload: { points: spent, gained: swords, lost: 0 },
          },
        ],
      },
      result: swords,
    };
  }

  const held = snapshot.holdings.filter((h) => h.seat_id === seat.id && h.kind === "trophy");

  // Named cards are matched one holding each, so asking for two Cyklopy hands in
  // two rather than the same one twice.
  const left = [...held];
  const trophies = command.cardIds
    ? command.cardIds.map((cardId) => {
        const at = left.findIndex((h) => h.card_id === cardId);
        if (at === -1) throw new Error(`${cardName(cardId)} — nie masz takiego trofeum.`);
        return left.splice(at, 1)[0];
      })
    : held;

  const points = trophies.reduce((sum, t) => {
    const card = EVENTS.find((c) => c.id === t.card_id);
    return sum + (combatValueOf(card ?? { cardClass: "foe" })?.total ?? 0);
  }, 0);
  const gained = Math.floor(points / TROPHY_RATE);
  // The count is worth saying: a player refused at five points wants to know it
  // was five, not that seven is the rate. Especially now they choose what to
  // offer — the refusal is about their choice, not about the rule.
  if (gained < 1) {
    throw new Error(
      `Potrzeba ${TROPHY_RATE} punktów Miecza pokonanych Wrogów (1.4) — masz ${points}.`,
    );
  }

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
      seats: [{ id: seat.id, patch: { sword_own: seat.sword_own + gained } }],
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "trophies-traded",
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
      seats: [{ id: seat.id, patch: { gold: seat.gold + price } }],
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "sold",
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
  const affordable = price > 0 ? Math.floor(seat.gold / price) : command.points;
  const wanted = Math.min(command.points, affordable, Math.max(0, HEAL_CEILING - seat.life));
  if (wanted <= 0) {
    throw new Error(
      seat.life >= HEAL_CEILING
        ? `Życie jest już na poziomie początkowym (${HEAL_CEILING}) — 4.7 nie pozwala wyżej.`
        : "Za mało złota.",
    );
  }

  const paid = wanted * price;
  return {
    writes: {
      seats: [{ id: seat.id, patch: { life: seat.life + wanted, gold: seat.gold - paid } }],
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "healing",
          payload: { points: wanted, paid },
        },
      ],
    },
    result: { healed: wanted, paid },
  };
}

/**
 * Buys from a shelf printed on the board (21.1).
 *
 * One change, which is the point of doing it here. The store took the card in
 * one write and then paid for it in another, against a purse it had read
 * before the take — so a coin spent in between was overwritten and the buyer
 * got the card for free. Every gold mutation in that file was an absolute
 * `gold: <computed>` for the same reason; this one is not.
 */
export function buyGoods(
  snapshot: Snapshot,
  command: { seatId: string; cardId: string },
): Outcome<Taken> {
  const seat = standingShopper(snapshot, command.seatId);
  const shop = offerOn(snapshot, seat.field_id as FieldId, "kup");
  if (!shop) throw new Error("Na tym Obszarze nie ma czego kupić.");

  const entry = shop.towar.find((t) => goodsId(t.co) === command.cardId);
  if (!entry) throw new Error(`${cardName(command.cardId)} nie jest tu na sprzedaż.`);
  if (seat.gold < entry.cena) {
    throw new Error(`Za mało złota: ${entry.co} kosztuje ${entry.cena} Sz. Z.`);
  }

  // Taking it and paying for it are one changeset. `takeCard` writes holdings,
  // the turn stack and possibly the deck, and none of those is the purse, so
  // there is nothing here for the merge to overwrite.
  const taken = takeCard(snapshot, { seatId: seat.id, cardId: command.cardId });
  return {
    writes: merge(taken.writes, {
      seats: [{ id: seat.id, patch: { gold: seat.gold - entry.cena } }],
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "bought",
          payload: { cardId: command.cardId, price: entry.cena },
        },
      ],
    }),
    result: taken.result,
  };
}
