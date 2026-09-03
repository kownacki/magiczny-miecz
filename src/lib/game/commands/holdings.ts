/** What a character is carrying: picking it up (12.1, 16.6, 21.1), putting it down (5.5, 6.4, 9.4), and the two test shortcuts that conjure a card. Where it is worn is ./wearing. */

import items from "@/data/items.json";
import { CARD_CLASS_LABEL } from "@/data/types";
import type { CardClass, EventCard, Item, Nature } from "@/data/types";
import { forbiddenNatures } from "@/lib/engine/abilityText";
import { abilitiesOf, carriesSpell, entryPrice, unavailableIn } from "@/lib/engine/abilities";
import { barredFromFriends } from "@/lib/engine/status";
import { refuseWhileQueued, storedStatuses } from "./turn";
import { refuseWhileOverflow } from "./overflow";
import { FIELDS, requireFieldId, type FieldId } from "@/lib/engine/board";
import { drawFrom } from "@/lib/engine/deck";
import { isConsumedOnResolve, scriptFor, type Effect } from "@/lib/engine/cardScript";
import { carriedCount, carryLimit, mayHold } from "@/lib/engine/derive";
import {
  CLASS_NAME,
  kindForCard,
  slotOnArrival,
  whyFoeStandsHere,
  whyNotCollectHere,
  whyPackIsFull,
} from "@/lib/engine/holdings";
import { type Slot } from "@/lib/engine/slots";
import { fromTheShop, stockLeft } from "@/lib/engine/stock";
import { EVENTS, SPELLS, SPELL_BY_REF, decksOf, shuffleFor } from "../decks";
import { apply, merge, mergeAll, type Changeset, type Outcome, type Snapshot } from "../change";
import type { HoldingRow, SeatRow } from "../store";
import { asReturnable, dropGold, pushOntoPile, putOnPile, takeGold, trophiesToPile } from "./piles";
import { eqModeOf, holdingsOf, seatById, seatView } from "./seat";
import { cardName } from "@/lib/engine/polish";
import { replaceTop, requireTop, top, topIf } from "@/lib/engine/stack";

/* --------------------------------------------------------------------------
 * The small pure things these commands need, which the store keeps as queries.
 * ----------------------------------------------------------------------- */

/**
 * Which Natury a card refuses, as `mayHold` wants it.
 *
 * The rulebook states these the other way round, as a prohibition — "Włóczni
 * nie mogą posiadać Złe Postacie" — so it is data in the ability registry
 * rather than a field on the card, and the rule and the hover cannot disagree.
 */
function forbiddenFor(card: EventCard): ("good" | "evil" | "chaotic")[] | undefined {
  const forbidden = forbiddenNatures(card.id);
  return forbidden ? [...forbidden] : undefined;
}

/**
 * Takes a card off the turn's own stack once somebody has claimed it.
 *
 * What is still listed when the turn ends is exactly what nobody took, which is
 * what 16.8 leaves lying there for the next character. A card that was never on
 * the stack — gear lifted off the Obszar, a conjured one — simply is not found,
 * and nothing is written.
 */
export function liftOffField(snapshot: Snapshot, cardId: string): Changeset {
  const state = topIf(snapshot.game.turn_state, "field");
  if (!state) return {};
  const at = state.drawn.findIndex((entry) => entry.cardId === cardId);
  if (at === -1) return {};
  return {
    game: {
      turn_state: replaceTop(snapshot.game.turn_state, {
        ...state,
        drawn: state.drawn.filter((_, index) => index !== at),
      }),
    },
  };
}

/**
 * How many copies of a card are anywhere in the game — held by anybody, or
 * lying face up on a field where somebody left it (12.1, 16.8).
 *
 * This is the denominator for 21.2: every copy in play is one that is not on
 * the pile to be bought.
 */
function copiesInPlay(snapshot: Snapshot, cardId: string): number {
  return (
    snapshot.holdings.filter((held) => held.card_id === cardId).length +
    snapshot.fieldCards.filter((card) => card.card_id === cardId).length
  );
}

/* --------------------------------------------------------------------------
 * Taking a card.
 * ----------------------------------------------------------------------- */

export interface TakeCard {
  seatId: string;
  cardId: string;
  /** Set when this card came off a field that was holding a granted one. */
  granted?: boolean;
  /**
   * The caller writes the journal line, so this one does not.
   *
   * One act gets one line. A purchase is `bought` under 21.1 and the take
   * inside it is not a second event — it used to write „zdobywa: MIECZ (16.6)"
   * directly above „kupuje: MIECZ za 2 Sztuki Złota (21.1)", the same thing
   * said twice under two rules, and 16.6 is the wrong one anyway: it is about
   * picking a Karta up off the Obszar, which buying off a shelf is not.
   *
   * Only for callers that write their own line. A take with this set and
   * nothing in its place is a take the journal never saw.
   */
  silent?: boolean;
}

export interface Taken {
  /** Which pile it joined, or null when the card resolved instead of being kept. */
  kind: HoldingRow["kind"] | null;
  /**
   * What a card that resolves-and-goes still owes, for the caller to apply.
   *
   * The one thing in here that is not a write. A Sztuka Złota is not luggage —
   * its own script turns it into a coin — and applying a script means walking
   * `Effect`, which is `applyEffect`'s job and has a database inside it. So the
   * effect comes back out instead of being carried out here: this command
   * refuses to guess at a rule it does not own, and the caller finishes the
   * card the same way every other card is finished.
   */
  resolve: { effect: Effect; reason: string } | null;
}

/**
 * Takes a drawn card into a seat's keeping.
 *
 * Which pile it joins comes from its class (16.6, 1.4), not from the caller, so
 * a defeated Wróg cannot be filed as equipment and start adding its Miecz to
 * its killer. Spells are the only kind held concealed (9.3) — and none is ever
 * taken this way, because a Zaklęcie is dealt rather than found.
 */
/**
 * The Zaklęcie that arrives with the Przyjaciel who walks around with one.
 *
 * "weź Kartę Zaklęcia i połóż ją z Kartą Krzyżowca" — drawn the moment he
 * joins, off the same pile as any other, so an exhausted one reshuffles under
 * 9.5. It goes in as `carried` rather than `spell`: it lies with his card and
 * not in the hand, so 2.6 never counts it and nothing that takes "your
 * Zaklęcia" reaches it.
 *
 * Shared with `grantCard` on purpose. A conjured Krzyżowiec with empty hands is
 * a Krzyżowiec who does not work, and the point of the test shortcut is to
 * reach the state that playing would have reached.
 *
 * Silently nothing when the pile is empty and has nothing left to recycle,
 * which is a table with every Zaklęcie already in play: refusing the friend
 * over that would be stranger than his turning up empty-handed.
 */
function escortFor(
  snapshot: Snapshot,
  seatId: string,
  cardId: string,
  granted: boolean,
): Changeset {
  if (!carriesSpell([cardId])) return {};

  const decks = decksOf(snapshot.game);
  // The game's own shuffle, so a reshuffled pile comes out the same on a replay
  // as it did the first time (`prng.ts`).
  const { deck: after, drawn, recycled } = drawFrom(decks.spells, 1, shuffleFor(snapshot.game));
  if (drawn.length === 0) return {};
  // The pile holds refs, not ids — `zaklecia#4` is where a card sits on the
  // sheet, and a holding stores what the card *is*.
  const spell = SPELL_BY_REF.get(drawn[0]);
  if (!spell) return {};

  return {
    game: { deck: { ...decks, spells: after } },
    holdings: {
      insert: [
        {
          seat_id: seatId,
          card_id: spell.id,
          kind: "carried",
          // 9.3: concealed from the others either way. Whether its owner may
          // look is the card's own business, and `carriesSpell` asks it.
          face: "hidden",
          carried_by: cardId,
          granted,
        },
      ],
    },
    journal: [
      ...(recycled
        ? [
            {
              seatId: null,
              round: snapshot.game.round,
              kind: "reshuffle" as const,
              payload: { pile: "zaklecia" },
            },
          ]
        : []),
      {
        seatId,
        round: snapshot.game.round,
        kind: "carried-spell" as const,
        payload: { cardId, spellId: spell.id },
      },
    ],
  };
}

/**
 * Whether the copy of this card on the table was conjured by the test console.
 *
 * Two places a card can be taken from, and both carry the mark: the turn's own
 * drawn list, and the Obszar it is lying on. See `granted` in db/schema.sql —
 * the deck never gave a conjured copy up, so it must not reach a pile as
 * though it had.
 */
function grantedHere(snapshot: Snapshot, seatId: string, cardId: string): boolean {
  const state = top(snapshot.game.turn_state);
  if (state.phase === "field" && state.drawn.some((one) => one.cardId === cardId && one.granted)) {
    return true;
  }
  const seat = snapshot.seats.find((row) => row.id === seatId);
  return snapshot.fieldCards.some(
    (row) => row.field_id === seat?.field_id && row.card_id === cardId && row.granted,
  );
}

/**
 * Whether this Karta is one of the things lying on the Obszar you are standing
 * on — which is what 12.1 is about, and nothing else.
 *
 * "zabrać **leżące** złoto, Przedmioty lub Przyjaciół". A card bought at a
 * Targowisko, the Tarcza the Władca hands over for a finished errand, one a
 * Karta's own `otrzymaj` grants — none of those is lying here, and none of them
 * is what 12.1's two exceptions are holding back.
 *
 * Both lists, for the reason `refuseOverAFoe` reads both: arriving lifts every
 * `field_cards` row into the turn's frame and the end of the turn writes back
 * what nobody took, so which list a Karta is in says nothing a player can see.
 */
function lyingHere(snapshot: Snapshot, seatId: string, cardId: string): boolean {
  const seat = snapshot.seats.find((one) => one.id === seatId);
  const state = top(snapshot.game.turn_state);
  const inTurn = state.phase === "field" ? state.drawn : [];
  return (
    inTurn.some((entry) => entry.cardId === cardId) ||
    snapshot.fieldCards.some((row) => row.field_id === seat?.field_id && row.card_id === cardId)
  );
}

/**
 * 12.1a, asked of both places a Karta can be lying on an Obszar.
 *
 * "W wymienionych przypadkach należy najpierw pokonać Wrogów albo im uciec" —
 * the loot waits until the fight is settled, and 16.4 says the same thing from
 * the ordering side.
 *
 * # Why it reads two lists
 *
 * A Karta lies in one of two places depending on nothing a player can see:
 * arriving lifts every `field_cards` row into the turn's frame
 * (`liftFieldCards`) and the end of the turn writes back whatever nobody took
 * (`leaveCardsBehind`). This rule was written twice, once against each, and so
 * fired in exactly the half of the game the other one covered:
 *
 * - `takeCard` read `state.drawn` and refused a Przedmiot over a Wilk's head,
 *   which is right on the turn you land there and blind afterwards.
 * - `refuseUnlessCollectable` read `snapshot.fieldCards`, which is empty for
 *   the square you are standing on — so taking **gold** over that same Wilk's
 *   head was allowed, every time.
 *
 * That is the app's filing system leaking into the game, the same leak
 * `clearField` has a note about. One rule, both lists, and the two acts 12.1
 * names in one breath cannot come apart again.
 *
 * `exempt` is the Wróg himself: beating one is how you take his Karta (16.2),
 * so he cannot be the reason you may not.
 */
function refuseOverAFoe(snapshot: Snapshot, seatId: string, exempt?: string): void {
  const seat = snapshot.seats.find((one) => one.id === seatId);
  const state = top(snapshot.game.turn_state);
  const inTurn = state.phase === "field" ? state.drawn : [];
  const settled = state.phase === "field" ? (state.fought ?? []) : [];
  const onBoard = snapshot.fieldCards.filter((row) => row.field_id === seat?.field_id);

  // The sentence is the engine's, because the browser says the same one before
  // it draws a shop it knows is shut. 12.1a *only*: owing and the kolejka are
  // asked separately below, both of them silent outside a field frame where
  // this one is not, because a Wróg still standing is attacking you (16.2)
  // wherever the card you are reaching for came from.
  const why = whyFoeStandsHere(
    [...inTurn, ...onBoard.map((row) => ({ cardId: row.card_id }))].filter(
      (entry) => entry.cardId !== exempt,
    ),
    settled,
  );
  if (why) throw new Error(why);
}

/**
 * 12.1b: nothing is picked up while the Obszar still owes Karty.
 *
 * "b) Jest to Obszar, na który ciągnięte są Karty (13.4)." The remedy 12.1
 * names is to draw them and read them, and `draw` is what is *still* owed —
 * see `afterMove`. A Karta the console `place`d on the square counts off the
 * tally when the turn lifts it (`dealtInto`), so this only fires where the
 * Obszar genuinely has more coming.
 *
 * Silent outside a field frame, which is the difference from
 * `refuseUnlessCollectable`: spoils after a fight, a starting kit and a card
 * effect that hands you something are not somebody collecting off a square,
 * and none of them has a field frame on top to be owed anything.
 */
function refuseWhileOwing(snapshot: Snapshot): void {
  const state = top(snapshot.game.turn_state);
  if (state.phase !== "field") return;
  const why = whyNotCollectHere([], [], state.draw);
  if (why) throw new Error(why);
}

export function takeCard(snapshot: Snapshot, command: TakeCard): Outcome<Taken> {
  const { seatId, cardId } = command;
  /**
   * The test-mode mark is read off the table, not taken on trust.
   *
   * It used to be the caller's to pass, and two of the three callers did not:
   * the console's `take` and the browser's both handed over a bare `cardId`,
   * so a Karta conjured by `deal` and then picked up arrived in the Plecak as
   * an ordinary one. The journal said „tryb testowy" on the line above and the
   * card carried no wrench — which is the worst version of this, because the
   * mark exists precisely so a conjured card cannot be mistaken for a real one
   * later, and the moment it is picked up is the moment it starts looking like
   * one.
   *
   * `takeFromField` did pass it, so the same Karta kept its mark or lost it
   * depending on whether it was still in the turn's drawn list or had settled
   * onto the Obszar — a distinction no player can see.
   *
   * So it is derived here, from wherever this card is being taken from, and
   * `||` rather than `??`: a caller that knows may add the mark and can never
   * remove one the table is already carrying.
   */
  const granted = command.granted || grantedHere(snapshot, seatId, cardId);

  // Both decks. 21.1 has a character take the Wyposażenie card for a Magiczny
  // Miecz or a Tarcza Tolimana, and 21.3 lets either be left on the board like
  // anything else — but the Tarcza Tolimana exists *only* on the equipment
  // sheet, so looking in the event deck alone made the one card the Zamek
  // Bestii requires impossible to pick up.
  const card = EVENTS.find((c) => c.id === cardId);
  const equipment = card ? null : (items as Item[]).find((i) => i.id === cardId);
  if (!card && !equipment) throw new Error(`Nieznana karta: ${cardId}`);

  /**
   * 12.1's two exceptions, before anything is picked up — including the money.
   *
   * They used to sit below the branch that resolves a Sztuka Złota, so the one
   * card in the box that *is* gold could be taken over an unfought Wilk's head
   * while the loose coins beside it were refused. Same rule, same square, two
   * answers, decided by which of the two shapes the money happened to be in.
   *
   * Above 5.3's Natura check as well: whether you may be picking anything up at
   * all comes before which card it is.
   */
  refuseOverAFoe(snapshot, seatId, cardId);
  if (lyingHere(snapshot, seatId, cardId)) {
    refuseWhileOwing(snapshot);
    refuseWhileQueued(snapshot, seatId);
  }

  // Everything on the Wyposażenie sheet is a Przedmiot; only the event deck
  // needs its class read to tell an item from a friend from a trophy.
  const kind = card ? kindForCard(card) : "item";
  if (!kind) throw new Error("Tej Karty nie można zabrać ze sobą (16.6).");

  /**
   * Money is not luggage.
   *
   * A Sztuka Złota prints V, so `kindForCard` calls it an item and it went
   * into the pack with a discard button under it — where it also ate one of the
   * four places 5.4 allows. But the card *is* the gold: its script turns it
   * into a coin and puts it on the used pile, and nothing survives to carry.
   *
   * So taking one resolves it. The card still leaves the field's stack the same
   * way anything taken does, which is what 16.8 counts at the end of the turn.
   */
  if (isConsumedOnResolve(cardId)) {
    const script = scriptFor(cardId);
    return {
      writes: merge(liftOffField(snapshot, cardId), {
        journal: command.silent ? [] : [
          {
            seatId,
            round: snapshot.game.round,
            kind: "taken",
            // The card's own kind, not the Sztuka Złota's. Three cards are
            // consumed on the way in now and only one of them is money.
            payload: { cardId, kind },
          },
        ],
      }),
      result: {
        kind: null,
        resolve: script ? { effect: script.effect, reason: cardName(cardId) } : null,
      },
    };
  }

  // Looked up leniently, exactly as the store did: an unseated taker has no
  // Natura and so forbids nothing, and nothing else below reads the row.
  const taker = snapshot.seats.find((s) => s.id === seatId);

  // 5.3: "Żadna Postać nie może posiadać Przedmiotów, którymi na mocy zasad nie
  // wolno się jej posługiwać. Kartę takiego Przedmiotu należy położyć odkrytą
  // na Obszarze, na którym Przedmiot ten został znaleziony." So it is not that
  // you take it and then discover you may not — you never take it, and it stays
  // where it lies.
  if (card && !mayHold({ forbiddenTo: forbiddenFor(card) }, (taker?.nature ?? null) as Nature | null)) {
    throw new Error(`${card.name} — twoja Natura nie pozwala ci tego nieść (5.3).`);
  }


  /**
   * "Miecza nie można otrzymać w Krainie Dolnego Kręgu."
   *
   * A refusal rather than a silent nothing, because the card is a key: 11.3
   * bars the Kamienny Most without it, and a player who thinks they picked one
   * up in the Dolny Krąg walks to the bridge and finds out there.
   */
  const barred = unavailableIn(cardId);
  if (barred !== null) {
    const seat = snapshot.seats.find((s) => s.id === seatId);
    const where = seat?.field_id ? FIELDS.get(seat.field_id)?.region : undefined;
    if (where === barred) {
      throw new Error(`${cardName(cardId)} — tej Karty nie można otrzymać w Krainie Dolnego Kręgu.`);
    }
  }

  /**
   * "Nie możesz zdobywać nowych Przyjaciół, dopóki nie uwolnisz się od niego,
   * odwiedzając Pustelnię."
   *
   * The Zły Duch is the only card that bars a whole kind from being picked up,
   * and it bars *gaining* rather than holding: the Przyjaciele you kept — which
   * is the Południca and nobody else, since he sent the rest away — stay where
   * they are.
   */
  if (kind === "friend") {
    const bearer = snapshot.seats.find((one) => one.id === seatId);
    if (bearer && barredFromFriends(storedStatuses(snapshot, bearer.id))) {
      throw new Error(`${cardName(cardId)} — Zły Duch nie pozwala ci zdobywać Przyjaciół.`);
    }
  }

  /**
   * Worn if it can be, in the pack if it cannot — the one answer every route
   * to a Przedmiot asks for. See `slotOnArrival`.
   *
   * Decided before 5.4's limit is asked, because the limit is the pack's and a
   * card going onto the body never touches it.
   */
  const worn = slotOnArrival({
    cardId,
    kind,
    eqMode: eqModeOf(snapshot.game),
    nature: (taker?.nature ?? null) as Nature | null,
    worn: holdingsOf(snapshot, seatId).map((one) => one.slot as Slot | null),
  });

  // Rule 5.4: four Przedmioty at a time unless the character has transport.
  // Friends and trophies are not Przedmioty and do not count (6.3 puts no limit
  // on Friends at all), and Sztuki Złota never count (3.5).
  if (kind === "item") {
    const mine = holdingsOf(snapshot, seatId);

    // 21.2: the Wyposażenie pile is finite. A Magiczny Miecz that four other
    // characters are already carrying is "w danej chwili nieosiągalny", and
    // 16.6 makes a drawn one the same card rather than a fifth — which is why
    // counting what is in play is the same answer as keeping a tally.
    if (
      fromTheShop(cardId) &&
      stockLeft(cardId, copiesInPlay(snapshot, cardId), snapshot.game.endless_stock) <= 0
    ) {
      throw new Error(`${cardName(cardId)} — nie ma już ani jednej w Wyposażeniu (21.2).`);
    }

    /**
     * 5.4's four, asked only of what is actually going into the Plecak.
     *
     * In slotowy the limit is on the pack alone — what a character is wearing
     * hangs on the character — so a full pack must not stop a Hełm reaching an
     * empty head. It used to, because picking a card up always put it in the
     * pack, and the variant's own claim is that wearing is not carrying.
     */
    const variant = eqModeOf(snapshot.game);
    // The sentence and the three subtleties behind it are `whyPackIsFull`'s, so
    // the shop greys its `kup` on exactly what this throws. It re-asks
    // `slotOnArrival` rather than reading `worn` above, which is the same
    // question and the one thing that must not be answered twice differently.
    const full = whyPackIsFull(
      { cardId, kind, eqMode: variant, nature: (taker?.nature ?? null) as Nature | null },
      mine,
      { carried: carriedCount(mine, variant), limit: carryLimit(mine, variant) },
    );
    if (full) throw new Error(full);
  }

  /**
   * 16.6 and 21.1: what you take is the Wyposażenie card, not the one you drew.
   *
   * "Jeżeli Postać wyciągnie Magiczny Miecz lub Tarczę Tolimana musi je zamienić
   * na identyczne z Wyposażenia, a wyciągnięte odłożyć na stos zużytych." The
   * exchange happens here, at the moment of taking, which is what makes the
   * rest of the app consistent: from now on this is a stock card, it occupies
   * one of `PRINTED_STOCK`'s slots, and when it leaves a hand it returns to the
   * shop rather than to the deck.
   *
   * `card` is set only when the id was found in the event deck — a Tarcza
   * Tolimana picked up off a field has no drawn copy to give back, and a
   * granted one has none either: the deck never gave that copy up. The push is
   * `pushOntoPile` rather than `putOnPile` because this is the one case that
   * runs the other way — the drawn copy *did* come off the deck, so the deck is
   * exactly where it goes, shop card or not.
   */
  const discarded =
    card && fromTheShop(cardId) && !granted
      ? pushOntoPile(snapshot, "events", [cardId])
      : {};

  /**
   * What the friend charges to join you at all.
   *
   * Three cards ask a price up front — the Najemnik and the Tragarz a Sztuka
   * Złota, the Chochlik a point of Życie — and taking the card *is* agreeing to
   * it. There is no third state between paying and walking away, and walking
   * away is already what leaving a card on the Obszar means; what each of them
   * does when you walk away is `cena-przyjecia`'s `bezZaplaty`, read at the end
   * of the turn by `leaveCardsBehind`.
   *
   * Refused rather than allowed on credit. The Chochlik's point of Życie is
   * refused when it is your last one as well: 15.5 kills a Postać at zero, and
   * no card in the box asks you to die in order to make a friend.
   */
  const price = kind === "friend" ? entryPrice(abilitiesOf(cardId)) : null;
  const paid: Changeset = {};
  if (price && taker) {
    const zloto = price.zloto ?? 0;
    const zycie = price.zycie ?? 0;
    if (taker.gold < zloto) {
      throw new Error(`${cardName(cardId)} bierze ${zloto} Sz. Z. — za mało złota.`);
    }
    if (zycie > 0 && taker.life - zycie < 1) {
      throw new Error(
        `${cardName(cardId)} chce ${zycie} punkt Życia, a to ostatni — 15.5 nie pozwala.`,
      );
    }
    paid.seats = [
      { id: taker.id, patch: { gold: taker.gold - zloto, life: taker.life - zycie } },
    ];
    paid.journal = [
      {
        seatId,
        round: snapshot.game.round,
        kind: "paid-friend",
        payload: { cardId, price: zloto, life: zycie, joining: true },
      },
    ];
  }

  const kept: Changeset = mergeAll(
    {
      holdings: {
        insert: [
          {
            seat_id: seatId,
            card_id: cardId,
            kind,
            face: "open",
            granted,
            ...(worn !== null ? { slot: worn } : {}),
          },
        ],
      },
    },
    paid,
    escortFor(snapshot, seatId, cardId, granted),
  );

  // Chained: the lift writes `game.turn_state` while the discard writes
  // `game.deck`, and reading the discard's snapshot keeps the two from being
  // decided against different tables even though today they touch different
  // keys.
  const lifted = liftOffField(apply(snapshot, mergeAll(discarded, kept)), cardId);

  return {
    writes: mergeAll(discarded, kept, lifted, {
      journal: command.silent
        ? []
        : [{ seatId, round: snapshot.game.round, kind: "taken", payload: { cardId, kind } }],
    }),
    result: { kind, resolve: null },
  };
}

/* --------------------------------------------------------------------------
 * Putting one down.
 * ----------------------------------------------------------------------- */

/**
 * Drops a held card.
 *
 * Rule 5.5 lets a character discard an item at any moment, and 5.6 forces it
 * when over the carrying limit. Where it then goes is 5.5, 6.4 and 21.3: "na
 * Obszarze, na którym aktualnie się znajduje", face up, for whoever stops there
 * next. 12.1's own worked example is built on gear waiting on a field.
 *
 * A holding that is not there is not an error, which is the store's own
 * behaviour kept: the journal still records that somebody pressed the button,
 * and nothing is written.
 */
export function dropCard(
  snapshot: Snapshot,
  command: { holdingId: string },
): Outcome<void> {
  const held = snapshot.holdings.find((h) => h.id === command.holdingId);

  // 9.4: Zaklęcia are not discarded at will — "Postać nie może odrzucać
  // Zaklęć, chyba, że posiada ich więcej, niż wynika to z jej parametru Magii".
  // A hand you can throw away is a hand you can tidy into whatever you wanted,
  // and the limit of 2.6 is meant to bite.
  if (held?.kind === "spell") {
    const seat = snapshot.seats.find((s) => s.id === held.seat_id);
    if (seat) {
      const view = seatView(snapshot, seat.id);
      const spells = view.holdings.filter((h) => h.kind === "spell");
      const allowed = view.spellCapacity;
      if (spells.length <= allowed) {
        throw new Error(
          `Zaklęć nie odrzuca się, dopóki nie masz ich więcej niż ${allowed} (9.4, 2.6).`,
        );
      }
    }
  }

  const seat = snapshot.seats.find((s) => s.id === held?.seat_id);
  /**
   * What the card was carrying leaves with it (6.4).
   *
   * The Krzyżowiec put down on an Obszar is a Krzyżowiec with a Zaklęcie, and
   * the Zaklęcie is not a thing the next character finds lying there — 5.5 and
   * 6.4 leave the *Karta* behind, and 9.6 is where a Zaklęcie goes. So his card
   * lies on the field and the spell he was holding goes to the used pile.
   */
  const escorted = held
    ? snapshot.holdings.filter(
        (h) => h.seat_id === held.seat_id && h.kind === "carried" && h.carried_by === held.card_id,
      )
    : [];

  const gone: Changeset = held
    ? { holdings: { delete: [held.id, ...escorted.map((h) => h.id)] } }
    : {};
  const escortBack =
    escorted.length > 0
      ? putOnPile(apply(snapshot, gone), "spells", escorted.map(asReturnable))
      : {};
  const lies =
    held &&
    held.kind !== "spell" &&
    held.kind !== "trophy" &&
    held.kind !== "carried" &&
    seat?.field_id;

  let placed: Changeset = {};
  if (held && lies && seat?.field_id) {
    placed = {
      fieldCards: {
        insert: [
          {
            field_id: seat.field_id,
            card_id: held.card_id,
            // Travels with it. Picked up by somebody else, a granted card would
            // otherwise be a real one from then on, and reach a pile the next
            // time it was put down.
            granted: held.granted,
          },
        ],
      },
    };
  } else if (held) {
    // The two that do not lie on a board. A shed Zaklęcie goes where 9.6 sends
    // a spoken one, and a trophy nobody wants goes where 1.4 sends a traded
    // one — both to the used pile, which until now they reached by being
    // deleted, which is not the same place at all.
    placed =
      held.kind === "trophy"
        ? // In „Punkty" his Karta went back at the kill and this is a copy of
          // him, so putting the copy down puts nothing anywhere.
          trophiesToPile(apply(snapshot, gone), [held])
        : putOnPile(
            apply(snapshot, gone),
            held.kind === "spell" || held.kind === "carried" ? "spells" : "events",
            [asReturnable(held)],
          );
  }

  return {
    writes: mergeAll(gone, escortBack, placed, {
      journal: [
        {
          seatId: held?.seat_id ?? null,
          round: snapshot.game.round,
          kind: "discarded",
          payload: {
            cardId: held?.card_id,
            kind: held?.kind,
            onField:
              held?.kind !== "spell" && held?.kind !== "trophy" ? seat?.field_id : null,
          },
        },
      ],
    }),
    result: undefined,
  };
}

/* --------------------------------------------------------------------------
 * Reaching for what is already lying on the Obszar.
 * ----------------------------------------------------------------------- */

/**
 * The three things 12.1 asks before anything on an Obszar may be picked up.
 *
 * Shared, because gold is picked up under the same sentence as the Karty:
 * "może odwiedzić znajdującego się tam Nieznajomego, zabrać leżące złoto,
 * Przedmioty (5.4.) lub Przyjaciół" — one rule, one set of conditions, and two
 * copies of them would be two chances to let one drift.
 *
 * **Your move has to have ended here.** 12.1 grants this to "Postać, której
 * ruch KOŃCZY SIĘ na danym Obszarze", and only "aż do końca swojej tury". The
 * Obszar you begin a turn standing on is the one you finished the last turn on,
 * and that window has closed — 13.1 says it from the other side, "ani wogóle
 * podejmować żadnych czynności na Obszarze, z którego rozpoczynają ruch". Its
 * own worked example is exactly this: the Książę leaves the Sztylet, the
 * Rękawice and the Srebrna Strzała on the Ruchome Skały, standing on them, and
 * they wait "na Postać, która zakończy tutaj ruch".
 *
 * **a) and b).** Nothing here is reachable while a Wróg is standing on it or
 * while the Obszar still owes Karty — "W wymienionych przypadkach należy
 * najpierw pokonać Wrogów albo im uciec lub rozpatrzeć treść wyciągniętych
 * Kart."
 */
export function refuseUnlessSettledHere(snapshot: Snapshot, seat: SeatRow, why: string): void {
  // 10.1, first, because it is the answer to a different question than the
  // other three: those say "not yet", this says "not you".
  if (seat.seat_index !== snapshot.game.active_seat) throw new Error("To nie twoja tura (10.1).");

  /**
   * The opening clause. 12.1 is about a Postać "której ruch kończy się na danym
   * Obszarze" and 13.1 is blunter still — "w żadnym przypadku nie mogą nikogo
   * spotkać ani wogóle podejmować żadnych czynności na Obszarze, z którego
   * rozpoczynają ruch". Outside a field frame nothing here has happened yet.
   *
   * The sentence is the caller's because the two doors are refusing different
   * acts, and a player pressing „weź" and a player pressing „kup" should be
   * told which one they cannot do and under which rule. Everything the guard
   * *checks* is the same.
   */
  requireTop(snapshot.game.turn_state, "field", why);

  refuseOverAFoe(snapshot, seat.id);
  refuseWhileOwing(snapshot);
  refuseWhileQueued(snapshot, seat.id);
}

/** 12.1's own sentence, for the two doors that take things off a square. */
export const NOT_COLLECTED_YET =
  "Zabierać można tylko po zakończeniu ruchu na tym Obszarze (12.1).";

function refuseUnlessCollectable(snapshot: Snapshot, seat: SeatRow): void {
  refuseUnlessSettledHere(snapshot, seat, NOT_COLLECTED_YET);
}

/**
 * Sztuki Złota picked up off an Obszar, as many as the player says (12.1).
 *
 * "zabrać leżące złoto" carries no number, and Talisman's 12:1 — the sentence
 * this one is adapted from — reads "**any** Gold Counters […] may be taken by
 * any Character whose Move ends on that Space". Permissive twice over: nothing
 * compels the take, and nothing makes it all or nothing. So the amount is the
 * player's, and `weź wszystko` is a convenience rather than the rule.
 *
 * Which is not a way to put gold down. There is no rule anywhere letting a
 * Postać drop a Sztuka Złota — 5.5 grants it for a Przedmiot and 6.4 for a
 * Przyjaciel and chapter 3 grants nothing of the kind — so gold leaves a purse
 * only by being spent (3.3), taken by a Karta or an Obszar, or lost to the
 * winner of a fight (17.9). Declining to pick some up is the one moment a
 * player chooses how much they carry.
 *
 * 5.4's limit never applies: 3.5 keeps gold out of the Przedmiot count, and
 * says so twice.
 */
export function takeFieldGold(
  snapshot: Snapshot,
  command: { seatId: string; gold: number },
): Outcome<{ took: number }> {
  const seat = seatById(snapshot, command.seatId);
  if (!seat.field_id) throw new Error("Postać nie stoi na żadnym Obszarze.");
  // Whether you may be taking anything at all, before what there is to take:
  // "there is no gold here" is a strange thing to be told on somebody else's
  // turn.
  refuseUnlessCollectable(snapshot, seat);

  const lying = snapshot.fieldGold.find((row) => row.field_id === seat.field_id);
  if (!lying || lying.gold <= 0) throw new Error("Nie ma tu złota.");

  const want = Math.floor(command.gold);
  if (!Number.isFinite(want) || want < 1) throw new Error("Podaj, ile Sztuk Złota zabierasz.");
  if (want > lying.gold) {
    throw new Error(`Leży tu tylko ${lying.gold} — tyle najwyżej możesz zabrać (12.1).`);
  }

  return {
    writes: mergeAll(takeGold(snapshot, seat.field_id, want), {
      seats: [{ id: seat.id, patch: { gold: seat.gold + want } }],
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "gold-taken" as const,
          payload: { gold: want, fieldId: seat.field_id },
        },
      ],
    }),
    result: { took: want },
  };
}

export function takeFromField(
  snapshot: Snapshot,
  command: { seatId: string; fieldCardId: string },
): Outcome<Taken> {
  const seat = seatById(snapshot, command.seatId);
  refuseUnlessCollectable(snapshot, seat);

  const lying = snapshot.fieldCards.find((row) => row.id === command.fieldCardId);
  if (!lying) throw new Error("Tej Karty już tam nie ma.");
  if (lying.field_id !== seat.field_id) {
    throw new Error("Można zabierać tylko z Obszaru, na którym się stoi (12.1).");
  }

  // Off the field first, so the carrying limit and 21.2's stock — both of which
  // count copies in play — do not see the same card twice. A refusal from
  // `takeCard` throws out of here with nothing written, which is the card still
  // lying where it was (5.3): the store had to put it back by hand.
  const lifted: Changeset = { fieldCards: { delete: [lying.id] } };
  const taken = takeCard(apply(snapshot, lifted), {
    seatId: command.seatId,
    cardId: lying.card_id,
    granted: lying.granted,
  });

  return { writes: merge(lifted, taken.writes), result: taken.result };
}

/**
 * Takes everything lying on an Obszar off it.
 *
 * `place`'s inverse, and the gap it fills is that there was none: nothing in
 * the game removes a Karta from a field except the lawful ways — taking it
 * (16.6), beating it (16.2), or arriving and lifting it into your turn. A test
 * table that put three Targowiska on the Wrzosowiska had no way to put the
 * board back.
 *
 * The Karty go where 16.8's leftovers always go — the stos zużytych, through
 * `putOnPile`, which knows to keep a `granted` card out of a deck that never
 * gave it up and a Wyposażenie card out of a deck it does not belong to
 * (21.2). Deleting them would take them out of the box, and 9.5 refills from
 * that pile.
 */
function sweepGold(
  snapshot: Snapshot,
  fieldId: FieldId,
  want: number | "all",
  seatId: string,
): Outcome<{ cards: string[]; gold: number }> {
  const lying = snapshot.fieldGold.find((row) => row.field_id === fieldId);
  if (!lying || lying.gold <= 0) throw new Error("Nie ma tu złota.");

  const gone = want === "all" ? lying.gold : Math.floor(want);
  if (!Number.isFinite(gone) || gone < 1) throw new Error("Ile Sztuk Złota?");
  if (gone > lying.gold) {
    throw new Error(`Leży tu tylko ${lying.gold} — tyle najwyżej możesz zdjąć.`);
  }

  return {
    writes: mergeAll(takeGold(snapshot, fieldId, gone), {
      journal: [
        {
          seatId,
          round: snapshot.game.round,
          kind: "override" as const,
          // The same row a full sweep writes, with no Karty in it. One line for
          // one act, so a reader following the board does not have to learn
          // that the console has two ways of taking things off a square.
          payload: { what: "clear-field", fieldId, cards: [], gold: gone },
          manual: true,
        },
      ],
    }),
    result: { cards: [], gold: gone },
  };
}

export function clearField(
  snapshot: Snapshot,
  command: {
    seatId: string;
    fieldId: FieldId;
    cardId?: string;
    gold?: number | "all";
    /**
     * Whole kinds at a time — `clear strangers, places`, and `enemies` for both
     * numerals of Wróg at once.
     *
     * A third way of saying *what*, beside one named Karta and the lot. Empty
     * is "not asked", which is what the other two forms send.
     */
    classes?: readonly CardClass[];
  },
): Outcome<{ cards: string[]; gold: number }> {
  const classes = command.classes ?? [];
  const byKind = classes.length > 0;

  /**
   * The money on its own, which is a different sweep and not a filter on this
   * one: it takes no Karty, so none of the turn-frame surgery below applies.
   *
   * "all" is what bare `clear gold` means, the way bare `take gold` does. A
   * number takes that much and leaves the rest, which is the only way to put a
   * square *back* to a particular amount — `place gold` can only add.
   *
   * Not when kinds were named beside it. `clear strangers, gold` is one sweep
   * that takes both, and routing it here would have taken the coins and left
   * the Nieznajomi standing — which is the command doing less than it said.
   */
  if (command.gold !== undefined && !byKind) {
    return sweepGold(snapshot, command.fieldId, command.gold, command.seatId);
  }

  const here = snapshot.fieldCards.filter((row) => row.field_id === command.fieldId);

  /**
   * And what the turn standing on it is holding face up, which is on the
   * Obszar just as much (16.8).
   *
   * A Karta lies in one of two places depending on nothing a player can see:
   * arriving lifts every row into the turn's frame (`liftFieldCards`) and the
   * end of the turn writes back whatever nobody took (`leaveCardsBehind`). So
   * „clear SIDH" on the square SIDH is drawn on found nothing and answered „Na
   * tym Obszarze nic nie leży" — with the Obszar's own window listing it two
   * inches away. That is the app's filing system leaking into the game.
   *
   * The frame is searched for rather than read off the top, the way the cut in
   * `placeSeat` searches: a `script` or `fight` frame can be standing over the
   * field, and the Karty underneath are still lying there.
   */
  const stack = snapshot.game.turn_state.stack;
  const at = stack.map((frame) => frame.phase).lastIndexOf("field");
  const frame = at === -1 ? null : stack[at];
  const inTurn =
    frame?.phase === "field" && frame.fieldId === command.fieldId ? frame.drawn : [];

  /**
   * The loose Sztuki Złota, which are on the Obszar as much as the Karty are
   * (12.1 names them in the same breath) and were not swept with them.
   *
   * Only by a bare `clear`. `clear MIECZ` names one thing and takes that one
   * thing; sweeping the money along with it would be the command doing
   * something nobody typed, and the coins have no name to type.
   */
  const coins =
    command.cardId || (byKind && command.gold === undefined)
      ? undefined
      : snapshot.fieldGold.find((row) => row.field_id === command.fieldId);

  if (here.length === 0 && inTurn.length === 0 && !coins) {
    throw new Error("Na tym Obszarze nic nie leży.");
  }

  /**
   * Which Karty a kind takes, asked of the class the card prints.
   *
   * The rows on the board carry only an id, so the class comes off the deck;
   * the ones in the turn's frame carry `cardClass` already, because that is
   * what 15.2 sorted them by. A card the deck has never heard of matches
   * nothing, which is the same answer `scriptFor` gives about one.
   */
  const wanted = (cardId: string): boolean => {
    const card = EVENTS.find((one) => one.id === cardId);
    return card !== undefined && classes.includes(card.cardClass);
  };

  /**
   * One Karta, or the lot.
   *
   * Named, it takes a single copy and not every one of that card: a field can
   * hold two Targowiska and „take that one off" is the likelier wish. Sweeping
   * them all is `clear` with no name, which is the same distinction `place`
   * draws going the other way — one card at a time down, one card or all of
   * them up.
   *
   * A row on the board goes before a card in the turn, so the two halves are
   * ordered rather than raced. Nothing turns on which — they are the same
   * Karta on the same square — but a rule that is written down is one nobody
   * has to work out from the outcome.
   */
  const lying = command.cardId
    ? here.filter((row) => row.card_id === command.cardId).slice(0, 1)
    : byKind
      ? here.filter((row) => wanted(row.card_id))
      : here;
  const takenFromTurn = ((): readonly number[] => {
    if (!command.cardId) {
      // Every copy of the kind, unlike a named Karta: „take the Nieznajomi off"
      // means all of them, and asking for one of a kind has no way to say which.
      const indices = inTurn.map((_, index) => index);
      return byKind ? indices.filter((index) => classes.includes(inTurn[index].cardClass)) : indices;
    }
    if (lying.length > 0) return [];
    const found = inTurn.findIndex((card) => card.cardId === command.cardId);
    return found === -1 ? [] : [found];
  })();

  /**
   * A kind that is not here is worth saying, the way a named Karta that is not
   * here is.
   *
   * Silent when the money was asked for too and there is some — `clear
   * strangers, gold` on a square with coins and no Nieznajomi did what it could
   * and there is a line to show for it.
   */
  if (byKind && lying.length === 0 && takenFromTurn.length === 0 && !coins) {
    // The names the *cards* print, not the console's English keys: you typed
    // `strangers` and the Karta says „Nieznajomy", and a refusal is where the
    // two should be seen to be the same thing.
    throw new Error(
      `${classes.map((one) => CARD_CLASS_LABEL[one]).join(", ")} — nic z tego tu nie leży.`,
    );
  }

  // Only a named Karta can be missing. A bare sweep has already been let
  // through by the guard above, which knows about the gold — and this one did
  // not, so a square holding nothing but coins refused with the name of the
  // card nobody had asked for: „undefined nie leży na tym Obszarze".
  if (command.cardId && lying.length === 0 && takenFromTurn.length === 0) {
    throw new Error(`${cardName(command.cardId)} nie leży na tym Obszarze.`);
  }

  const swept = new Set(takenFromTurn);
  const kept = inTurn.filter((_, index) => !swept.has(index));
  const left = new Set(kept.map((card) => card.cardId));
  /**
   * The lists beside `drawn` name cards by id, so a card that has gone must go
   * out of them too — a `resolved` id with no Karta behind it is a card the
   * turn thinks it has dealt with and the reader cannot find.
   *
   * Only where the last copy went: two Targowiska are one entry in `resolved`.
   */
  const without = (ids: readonly string[] | undefined) =>
    ids === undefined ? undefined : ids.filter((cardId) => left.has(cardId));
  const edited: Changeset["game"] =
    frame?.phase === "field" && takenFromTurn.length > 0
      ? {
          turn_state: {
            stack: [
              ...stack.slice(0, at),
              {
                ...frame,
                drawn: kept,
                ...(frame.resolved ? { resolved: without(frame.resolved) } : {}),
                ...(frame.fought ? { fought: without(frame.fought) } : {}),
                ...(frame.beaten ? { beaten: without(frame.beaten) } : {}),
              },
              ...stack.slice(at + 1),
            ],
          },
        }
      : undefined;

  const taken = [
    ...lying.map(asReturnable),
    ...takenFromTurn.map((index) => ({
      cardId: inTurn[index].cardId,
      granted: inTurn[index].granted ?? false,
    })),
  ];
  const gone: Changeset = {
    ...(lying.length > 0 ? { fieldCards: { delete: lying.map((row) => row.id) } } : {}),
    ...(coins ? { fieldGold: { delete: [coins.id] } } : {}),
    ...(edited ? { game: edited } : {}),
  };
  return {
    writes: merge(
      gone,
      merge(putOnPile(apply(snapshot, gone), "events", taken), {
        journal: [
          {
            seatId: command.seatId,
            round: snapshot.game.round,
            kind: "override" as const,
            payload: {
              what: "clear-field",
              fieldId: command.fieldId,
              cards: taken.map((card) => card.cardId),
              // Named only when there was some, so every line that swept only
              // Karty reads exactly as it did.
              ...(coins ? { gold: coins.gold } : {}),
            },
            manual: true,
          },
        ],
      }),
    ),
    result: { cards: taken.map((card) => card.cardId), gold: coins?.gold ?? 0 },
  };
}

/* --------------------------------------------------------------------------
 * The test console's two shortcuts.
 * ----------------------------------------------------------------------- */

/**
 * Puts a card on an Obszar, by fiat.
 *
 * Not a Zaklęcie. 9.6 sends a spent spell to the used pile and nothing in the
 * box puts one on the board; `dropCard` makes the same exception, and a
 * Zaklęcie lying on a field would be a card the field modal knows how to draw
 * and no rule knows how to pick up.
 *
 * `granted` travels with it, as everywhere else: picked up by somebody, a card
 * that appeared by fiat must not re-enter the game as a real one and reach a
 * pile the next time it is put down.
 */
export function placeCard(
  snapshot: Snapshot,
  command: { seatId: string; cardId: string; target: FieldId | null },
): Outcome<FieldId> {
  const seat = snapshot.seats.find((s) => s.id === command.seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  const fieldId = command.target ?? seat.field_id;
  if (!fieldId) throw new Error("Ta Postać nigdzie nie stoi — podaj Obszar.");

  if (SPELLS.some((card) => card.id === command.cardId)) {
    throw new Error("Zaklęcia nie leżą na Obszarze (9.6).");
  }
  const known =
    EVENTS.some((card) => card.id === command.cardId) ||
    (items as Item[]).some((i) => i.id === command.cardId);
  if (!known) throw new Error(`Nie wiem, czym jest: ${command.cardId}`);

  return {
    writes: {
      fieldCards: {
        insert: [{ field_id: fieldId, card_id: command.cardId, granted: true }],
      },
      journal: [
        {
          seatId: command.seatId,
          round: snapshot.game.round,
          kind: "test-card-field",
          payload: { cardId: command.cardId, fieldId },
          manual: true,
        },
      ],
    },
    result: fieldId,
  };
}
/**
 * Puts Sztuki Złota on an Obszar, by fiat.
 *
 * `placeCard`'s sibling and not a special case of it, because a coin is not a
 * Karta. The box has two gold *cards* — „1 SZTUKA ZŁOTA", „2 SZTUKI ZŁOTA" —
 * and `place 1 SZTUKA ZŁOTA` still lays one of those down: it is a Przedmiot
 * that lies on the Obszar until somebody takes it, and taking it is what turns
 * it into money ("Zamień tę Kartę na 1 Sztukę Złota, a następnie ją odłóż").
 * Loose gold has already been through that, or never was a card at all — 4.4's
 * purse spilled where a Postać died, a Karta that paid out onto a square — and
 * 12.1 lets it be picked up an arbitrary amount at a time, which no card does.
 *
 * So the console needs both, and they are two words apart: `place gold 5`
 * against `place 2 SZTUKI ZŁOTA`.
 *
 * No `granted` and nothing to carry it: a coin conjured by the console is
 * indistinguishable from a coin that was won, because a Sztuka Złota *is*
 * indistinguishable from a Sztuka Złota. `granted` exists so a card that
 * appeared by fiat cannot re-enter a finite pile (21.2) as a real one, and
 * money has no pile to re-enter — 3.1 has the bank hand out as much as it is
 * asked for.
 */
export function placeGold(
  snapshot: Snapshot,
  command: { seatId: string; gold: number; target: FieldId | null },
): Outcome<{ fieldId: FieldId; gold: number }> {
  const seat = snapshot.seats.find((one) => one.id === command.seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  const fieldId = command.target ?? seat.field_id;
  if (!fieldId) throw new Error("Ta Postać nigdzie nie stoi — podaj Obszar.");

  const gold = Math.floor(command.gold);
  if (!Number.isFinite(gold) || gold < 1) throw new Error("Ile Sztuk Złota?");

  return {
    writes: mergeAll(dropGold(snapshot, fieldId, gold), {
      journal: [
        {
          seatId: command.seatId,
          round: snapshot.game.round,
          kind: "test-gold-field" as const,
          payload: { gold, fieldId },
          manual: true,
        },
      ],
    }),
    result: { fieldId: requireFieldId(fieldId), gold },
  };
}

/**
 * Puts a card straight into a seat's hand, out of nowhere.
 *
 * For testing, and only that. It skips every check taking a card normally makes
 * — 5.3's Natura restriction, 5.4's carrying limit, 21.2's finite Wyposażenie
 * pile — because the point is to reach a state quickly rather than to reach it
 * legally.
 *
 * Only the three kinds anybody actually holds. A Wróg is a trophy you have to
 * beat, and Spotkania, Nieznajomi and Miejsca are resolved and set aside; none
 * of them are things a hand can contain, so granting one would put a row in the
 * holdings table that no rule knows how to read.
 *
 * Journalled as a manual override, because that is exactly what it is: the
 * journal draws those differently and says so, and a card that appeared by
 * magic should not be indistinguishable from one that was won.
 */
export function grantCard(
  snapshot: Snapshot,
  command: { seatId: string; cardId: string },
): Outcome<void> {
  const { seatId, cardId } = command;

  /**
   * The one check it does not skip: a surplus already on the stack.
   *
   * Everything above is about the rules this shortcut is *for* stepping round —
   * 5.3's Natura, 5.4's limit, 21.2's finite pile — and stepping round them is
   * the point. A surplus frame is not one of those. It is 5.6's „natychmiast"
   * made into a state the whole table is waiting on, and this walked straight
   * past it: `deal OLŚNIENIE` opened the frame and `deal FATUM` and `deal GOLEM`
   * both landed on top of it, so the console dug the hole it was standing in
   * and the only refusal anybody saw came two cards later.
   *
   * `refuseWhileOverflow` is the sentence every other verb already owes the
   * frame, and it is the one worth having here: it counts how many have to go,
   * cites the rule that is actually being enforced (5.6 for the pack, 2.6 for
   * the hand), and names the three ways back under.
   */
  refuseWhileOverflow(snapshot, seatId);
  const spell = SPELLS.find((card) => card.id === cardId);
  const equipment = (items as Item[]).find((item) => item.id === cardId);
  const event = EVENTS.find((card) => card.id === cardId);

  const kind = spell ? "spell" : equipment ? "item" : event ? kindForCard(event) : null;
  /**
   * Three ways to be ungiveable, and they used to be two messages, one of them
   * a small lie.
   *
   * "Nie wiem, czym jest" was said to a Spotkanie, which the app knows exactly
   * what it is — it simply is not a thing anybody holds. Now that `stack` and
   * `summon` exist, both refusals can say which door the card does go through
   * instead of only which one it does not, and the genuinely unknown id gets
   * its own message back.
   */
  if (kind === null && event) {
    throw new Error(
      `${event.name} to ${CLASS_NAME[event.cardClass] ?? "Karta"} — nikt jej nie trzyma. ` +
        `Połóż ją na wierzchu talii: \`stack ${event.name}\`, potem \`draw\`.`,
    );
  }
  if (kind === null) throw new Error(`Nie wiem, czym jest: ${cardId}`);
  if (kind === "trophy") {
    throw new Error(
      `Wroga trzeba pokonać, nie wziąć (16.2). \`summon ${event?.name ?? cardId}\`, ` +
        "a potem `settle won` — trofeum liczy się wtedy w obu wariantach (1.4).",
    );
  }

  /**
   * Conjured gear arrives the same way found gear does.
   *
   * The console hands a card out by fiat and the rest of the game then treats
   * it as an ordinary holding, so a Miecz given at the prompt that sat in the
   * Plecak while a Miecz picked up off the board went onto the arm would be two
   * different games depending on where the card came from. It is a test
   * shortcut for putting a card *in play*, not for putting one in a bag.
   *
   * `slotOnArrival` still refuses what `equip` would refuse — a Natura that may
   * not use it (5.3) among them — so this cannot conjure a state `equip` could
   * not have reached.
   */
  const bearer = snapshot.seats.find((one) => one.id === seatId);
  const worn = slotOnArrival({
    cardId,
    kind,
    eqMode: eqModeOf(snapshot.game),
    nature: (bearer?.nature ?? null) as Nature | null,
    worn: holdingsOf(snapshot, seatId).map((one) => one.slot as Slot | null),
  });

  return {
    writes: merge(escortFor(snapshot, seatId, cardId, true), {
      holdings: {
        insert: [
          {
            seat_id: seatId,
            card_id: cardId,
            kind,
            // 9.3 keeps a Zaklęcie face down even when it arrived by fiat.
            face: kind === "spell" ? "hidden" : "open",
            ...(worn !== null ? { slot: worn } : {}),
            // Not a card from the box. The deck keeps its own copy and can
            // still deal it; this one belongs to no pile and joins none when it
            // goes.
            granted: true,
          },
        ],
      },
      journal: [
        {
          seatId,
          round: snapshot.game.round,
          kind: "test-card",
          payload: { cardId, kind },
          manual: true,
        },
      ],
    }),
    result: undefined,
  };
}
