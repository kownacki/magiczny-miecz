/** The establishments: trading trophies for Miecz (1.4), and the desks that buy, sell and heal (21.2, 4.7). */

import { trophyPointsOf } from "@/lib/engine/trophies";
import { buyerFor } from "@/lib/engine/abilities";
import type { Effect } from "@/lib/engine/cardScript";
import { offerAmong } from "@/lib/engine/fieldScript";
import { HEAL_CEILING } from "@/lib/engine/derive";
import { goodsId } from "@/lib/engine/goods";
import type { FieldId } from "@/lib/engine/board";

import { apply, merge, mergeAll, type Changeset, type Outcome, type Snapshot } from "../change";
import type { SeatRow } from "../store";
import { asReturnable, putOnPile, trophiesToPile } from "./piles";
import { refuseUnlessSettledHere, takeCard, type Taken } from "./holdings";
import { top } from "@/lib/engine/stack";
import { cardName, plural } from "@/lib/engine/polish";
import { TROPHY_RATE, offerFor, offersFor } from "@/lib/engine/trophies";
import { pointsOf, seatById } from "./seat";

/**
 * 1.4's rate, and the search over a hand that spends it well.
 *
 * Both live in the engine — they are the rule, not this command's reading of
 * it, and the browser needs the same answer to draw the same choice. Re-exported
 * because everything above already reaches here for the rate.
 */
export { TROPHY_RATE, offerFor, offersFor };

/**
 * What this Obszar offers of a given kind — the board's own desks and whatever
 * has settled here.
 *
 * The walk itself is `offerAmong`'s, in the engine, so the browser can ask the
 * same question of the same square. What is left here is the half that reads a
 * snapshot, and it is the half with the trap in it.
 *
 * # Why it reads two lists
 *
 * The same reason `refuseOverAFoe` and `clearField` do, and with the sharpest
 * consequence of the three. Arriving lifts every `field_cards` row into the
 * turn's frame (`liftFieldCards`) and the end of the turn writes back what
 * nobody took, so a Karta on the square you are standing on is not in
 * `fieldCards` — it is in `drawn`.
 *
 * Reading only the board meant a TARGOWISKO answered "Na tym Obszarze nie ma
 * czego kupić" for the whole of the turn you land on it, and served anybody who
 * was merely passing by on some other turn. The shop worked in exactly the
 * window 13.1 forbids and shut in the one 12.1 grants — precisely inverted, and
 * invisible, because both halves are the same Karta lying on the same square.
 */
export function offerOn<K extends Effect["op"]>(
  snapshot: Snapshot,
  fieldId: FieldId,
  op: K,
): { from: string; effect: Extract<Effect, { op: K }> } | null {
  const state = top(snapshot.game.turn_state);
  const inTurn =
    state.phase === "field" && state.fieldId === fieldId
      ? state.drawn.map((one) => one.cardId)
      : [];
  const onBoard = snapshot.fieldCards
    .filter((c) => c.field_id === fieldId)
    .map((c) => c.card_id);

  return offerAmong(fieldId, [...onBoard, ...inTurn], op);
}

/**
 * A seat that may trade here, now.
 *
 * # What this used to ask, and what it left out
 *
 * "Does the seat exist and is it standing somewhere" — and nothing else. So a
 * character could shop in the `roll` phase, before moving at all, on the square
 * they were about to leave; and a player could shop on somebody else's turn,
 * which is reachable from a browser rather than merely in theory, the route
 * taking `body.seatId`. The taking commands next door were checking four things
 * this checked none of, on the same square, in the same window.
 *
 * # Why the same four
 *
 * Because 12.1 is one sentence: "Postać, której ruch kończy się na danym
 * Obszarze w każdej chwili, aż do końca swojej tury może **odwiedzić
 * znajdującego się tam Nieznajomego, zabrać leżące złoto, Przedmioty lub
 * Przyjaciół** z wyjątkiem sytuacji, w której: a) … b) …". Visiting and taking
 * are granted together and excepted together, and the remedy names both halves
 * — "należy najpierw pokonać Wrogów albo im uciec lub rozpatrzeć treść
 * wyciągniętych Kart". A Wilk does not wait politely while you haggle.
 *
 * 13.1 is blunter about the phase and is what the message cites: "w żadnym
 * przypadku nie mogą nikogo spotkać ani wogóle podejmować żadnych czynności na
 * Obszarze, z którego rozpoczynają ruch."
 *
 * So this is `refuseUnlessSettledHere`, the same guard the two taking doors go
 * through, with a sentence of its own. Everything it checks is the same, and
 * that is the point: the split is what let two rules run on one square.
 */
export function standingShopper(snapshot: Snapshot, seatId: string): SeatRow {
  const seat = snapshot.seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nie ma takiego miejsca.");
  if (!seat.field_id) throw new Error("Postać nie stoi jeszcze na Obszarze.");
  refuseUnlessSettledHere(
    snapshot,
    seat,
    "Handlować można dopiero po zakończeniu ruchu na tym Obszarze (13.1).",
  );
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
/**
 * What one beaten Wróg is worth towards 1.4's sevens.
 *
 * `mirror` is the Miecz of whoever is holding him, for the one Karta with no
 * number of its own: „Posiada zawsze tyle punktów Miecza, ile jego
 * przeciwnik", and the character holding a Sobowtór's Karta is the one who
 * made him. Every caller here has that seat in hand, which is why it is asked
 * for rather than defaulted — a trophy priced at zero because nobody said is
 * exactly the silent wrongness this avoids.
 */
export { trophyPointsOf };

/**
 * Every hoarded Karta back to the stos zużytych, for the whole table.
 *
 * The one conversion that can be made mid-game, and only in this direction.
 * Turning „Karty pokonanych" into „Punkty" takes nothing away from anybody —
 * every trophy stays exactly where it is and only the cardboard moves, which
 * is the entire difference between the two modes.
 *
 * Going back cannot be done, and the reason is unchanged by that: the Karty are
 * on the pile, 9.5 may have dealt some of them out again, and a referee that
 * pulled them back would be inventing copies of Wrogowie the table is already
 * meeting. The trophies would survive the trip; the cardboard cannot.
 */
export function convertTrophies(snapshot: Snapshot): Changeset {
  const held = snapshot.holdings.filter((one) => one.kind === "trophy");
  if (held.length === 0) return {};

  const bySeat = new Map<string, number>();
  for (const one of held) {
    const worth = trophyPointsOf(one.card_id, pointsOf(snapshot, one.seat_id, "parametr"));
    bySeat.set(one.seat_id, (bySeat.get(one.seat_id) ?? 0) + worth);
  }

  /**
   * Nobody loses a trophy here, and that is the whole change.
   *
   * This used to cash every hoard in and bank the points, because „Punkty" was
   * built as a pool and a Karta was the only place a trophy lived. It is not:
   * the trophy survives the switch and only its Karta moves. So the holdings
   * stay exactly as they are, the shelf is untouched, and the one thing that
   * happens is the cardboard going back to the stos zużytych — which is the
   * difference the player just asked for.
   *
   * A `granted` Karta reaches no pile, because the deck still holds its own
   * copy — the same rule `trophiesFrom` follows in a fight.
   */
  return mergeAll(
    putOnPile(
      snapshot,
      "events",
      held
        .filter((one) => one.granted !== true)
        .map((one) => ({ cardId: one.card_id, granted: false })),
    ),
    {
      journal: [...bySeat].map(([seatId, points]) => ({
        seatId,
        round: snapshot.game.round,
        kind: "override" as const,
        payload: { what: "trophy-mode", points, cards: held.filter((h) => h.seat_id === seatId).length },
      })),
    },
  );
}

/**
 * Refuses a count the hand cannot reach, saying what it can.
 *
 * "Nie da się" on its own leaves the player to work out the answer this
 * function has already computed. Throws rather than returns, so the caller
 * above reads as one expression.
 */
function refuseSwords(
  held: readonly { card_id: string }[],
  swords: number,
  mirror: { miecz: number },
): never {
  const can = offersFor(
    held.map((one) => ({ cardId: one.card_id, points: trophyPointsOf(one.card_id, mirror) })),
  );
  if (can.length === 0) {
    const points = held.reduce((sum, one) => sum + trophyPointsOf(one.card_id, mirror), 0);
    throw new Error(
      `Potrzeba ${TROPHY_RATE} punktów Miecza pokonanych Wrogów (1.4) — masz ${points}.`,
    );
  }
  const most = can[can.length - 1].swords;
  throw new Error(
    swords > most
      ? `Z tych trofeów kupisz najwyżej ${most} ${plural(most, "Miecz", "Miecze", "Mieczy")}.`
      : `Ile Mieczy? Podaj liczbę całkowitą.`,
  );
}

export function tradeTrophies(
  snapshot: Snapshot,
  /**
   * Three ways to say what you want, in order of precedence.
   *
   * `cardIds` names the Karty outright. `swords` names an outcome and lets
   * `offerFor` find the cheapest set that reaches it — the arithmetic 1.4
   * leaves to the player, which is worth doing properly and is not worth doing
   * on paper. Neither hands in everything, which is what a player cashing out
   * usually means.
   */
  command: { seatId: string; swords?: number; cardIds?: readonly string[] },
): Outcome<number> {
  const seat = seatById(snapshot, command.seatId);

  const held = snapshot.holdings.filter((h) => h.seat_id === seat.id && h.kind === "trophy");
  // Who the Sobowtór's Karta is worth as much as — see `trophyPointsOf`. Own
  // points and the cards' (1.5), not the fight's: this is a trade at a
  // Targowisko, not a fight.
  const mirror = pointsOf(snapshot, seat.id, "parametr");

  /**
   * An asked-for number of Miecze becomes a list of Karty here, so there is one
   * path below and not two: whatever the player said, by the time it is spent
   * it is a set of holdings.
   */
  const named: readonly string[] | undefined =
    command.cardIds ??
    (command.swords === undefined
      ? undefined
      : (
          offerFor(
            held.map((one) => ({ cardId: one.card_id, points: trophyPointsOf(one.card_id, mirror) })),
            command.swords,
          ) ?? refuseSwords(held, command.swords, mirror)
        ).cardIds);

  // Named cards are matched one holding each, so asking for two Cyklopy hands in
  // two rather than the same one twice.
  const left = [...held];
  const trophies = named
    ? named.map((cardId) => {
        const at = left.findIndex((h) => h.card_id === cardId);
        if (at === -1) throw new Error(`${cardName(cardId)} — nie masz takiego trofeum.`);
        return left.splice(at, 1)[0];
      })
    : held;

  const points = trophies.reduce(
    (sum, t) => sum + trophyPointsOf(t.card_id, mirror),
    0,
  );
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
  // here, when it is cashed in. In „Punkty" the Karta went back at the kill and
  // this trophy is a copy of him, which is what `trophiesToPile` knows.
  const returned = trophiesToPile(apply(snapshot, handed), trophies);

  return {
    writes: merge(merge(handed, returned), {
      seats: [{ id: seat.id, patch: { sword_own: seat.sword_own + gained } }],
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "trophies-traded",
          payload: { points, gained, lost: points - gained * TROPHY_RATE },
        },
      ],
    }),
    result: gained,
  };
}

/**
 * Sells a Przedmiot: to a buyer named on the card, at a desk, or to an Alchemik
 * walking beside you.
 *
 * The last two are the same trade at the same rate and the card says so. The
 * first is one Karta's own arrangement — "może zostać sprzedany w Zamku za 5
 * Sztuk Złota" — and the DIAMENT KRÓLÓW is the only thing in the box that has
 * one. It was a note in `CARD_NOTES` for the player to apply by hand, and the
 * Zamek has no desk, so the app's answer to somebody trying was "Nikt tu nie
 * skupuje Przedmiotów" — a refusal, on the square the card names, quoting a
 * rule the card overrides.
 *
 * Its own price is asked first, and only where the card names. At the Gród the
 * Diament is not the Zamek's business and falls through to the Lichwiarz, who
 * pays his flat 1 for it — a bad trade the rules plainly allow, and not this
 * command's place to prevent.
 */
export function sellHolding(
  snapshot: Snapshot,
  command: { seatId: string; holdingId: string },
): Outcome<void> {
  const seat = standingShopper(snapshot, command.seatId);
  const mine = snapshot.holdings.filter((h) => h.seat_id === seat.id);

  const held = mine.find((h) => h.id === command.holdingId);
  if (!held) throw new Error("Nie masz tej karty.");

  // Whose desk it is and what he pays is `buyerFor`'s, so the button the
  // browser draws and the sale this makes cannot disagree about the price.
  const deskHere = offerOn(snapshot, seat.field_id as FieldId, "sprzedaj");
  const buyer = buyerFor(
    held.card_id,
    seat.field_id as FieldId,
    deskHere?.effect.cena ?? null,
    mine.map((h) => h.card_id),
  );
  if (!buyer) throw new Error("Nikt tu nie skupuje Przedmiotów.");
  const price = buyer.price;
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
          round: snapshot.game.round,
          kind: "sold",
          payload: {
            cardId: held.card_id,
            price,
            fieldId: seat.field_id,
            // Whoever actually took it — the card's own named buyer, the
            // Obszar's desk, or an Alchemik in your own bag. `buyerFor` has
            // just decided between the three and the line should not guess.
            from: buyer.from === "obszar" ? deskHere?.from : null,
          },
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
  const desk = offerOn(snapshot, seat.field_id as FieldId, "uzdrow");
  if (!desk) throw new Error("Na tym Obszarze nikt nie leczy.");
  const cure = desk.effect;
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
          round: snapshot.game.round,
          kind: "healing",
          payload: { points: wanted, paid, fieldId: seat.field_id, from: desk.from },
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
  const desk = offerOn(snapshot, seat.field_id as FieldId, "kup");
  if (!desk) throw new Error("Na tym Obszarze nie ma czego kupić.");

  const entry = desk.effect.towar.find((t) => goodsId(t.co) === command.cardId);
  if (!entry) throw new Error(`${cardName(command.cardId)} nie jest tu na sprzedaż.`);
  if (seat.gold < entry.cena) {
    throw new Error(`Za mało złota: ${entry.co} kosztuje ${entry.cena} Sz. Z.`);
  }

  // Taking it and paying for it are one changeset. `takeCard` writes holdings,
  // the turn stack and possibly the deck, and none of those is the purse, so
  // there is nothing here for the merge to overwrite.
  //
  // `silent` because a purchase is one act and this is its line. `takeCard`
  // would otherwise write its own „zdobywa: MIECZ (16.6)" above „kupuje: MIECZ
  // za 2 Sztuki Złota (21.1)", which is the same event twice under two rules —
  // and the wrong rule at that: 16.6 is about picking a Karta up off the
  // Obszar, which buying one off a shelf is not.
  const taken = takeCard(snapshot, { seatId: seat.id, cardId: command.cardId, silent: true });
  return {
    writes: merge(taken.writes, {
      seats: [{ id: seat.id, patch: { gold: seat.gold - entry.cena } }],
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "bought",
          payload: {
            cardId: command.cardId,
            price: entry.cena,
            fieldId: seat.field_id,
            from: desk.from,
          },
        },
      ],
    }),
    result: taken.result,
  };
}
