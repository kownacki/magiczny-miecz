/** What a character is carrying: picking it up (12.1, 16.6, 21.1), putting it down (5.5, 6.4, 9.4), wearing it, and the two test shortcuts that conjure a card. */

import events from "@/data/events.json";
import items from "@/data/items.json";
import type { EventCard, Item, Nature } from "@/data/types";
import { forbiddenNatures } from "@/lib/engine/abilityText";
import type { FieldId } from "@/lib/engine/board";
import { combatValueOf } from "@/lib/engine/cards";
import { isConsumedOnResolve, scriptFor, type Effect } from "@/lib/engine/cardScript";
import {
  BASE_CARRY_LIMIT,
  carriedCount,
  carryLimit,
  mayHold,
} from "@/lib/engine/derive";
import { kindForCard } from "@/lib/engine/holdings";
import { SLOT_LABEL, fitsIn, isWearable, type Slot } from "@/lib/engine/slots";
import { fromTheShop, stockLeft } from "@/lib/engine/stock";
import { EVENTS, SPELLS, SPELL_BY_ID } from "../decks";
import {
  apply,
  merge,
  mergeAll,
  type Changeset,
  type Outcome,
  type Snapshot,
} from "../change";
import type { HoldingRow } from "../store";
import { asReturnable, pushOntoPile, putOnPile } from "./piles";
import { eqModeOf, holdingsOf, seatById, seatView } from "./seat";

/* --------------------------------------------------------------------------
 * The small pure things these commands need, which the store keeps as queries.
 * ----------------------------------------------------------------------- */

/** A card's printed name, for messages a player reads. */
export function cardName(cardId: string): string {
  return (
    (events as EventCard[]).find((card) => card.id === cardId)?.name ??
    (items as Item[]).find((item) => item.id === cardId)?.name ??
    // Zaklęcia are cards too, and are named on the one occasion the app says
    // so out loud: 12.5 has a cast spoken, and the console reports a draw.
    SPELL_BY_ID.get(cardId)?.name ??
    cardId
  );
}

/**
 * Which Natury a card refuses, as `mayHold` wants it.
 *
 * The rulebook states these the other way round, as a prohibition — "Włóczni
 * nie mogą posiadać Złe Postacie" — so it is data in the ability registry
 * rather than a field on the card, and the rule and the hover cannot disagree.
 */
function forbiddenFor(card: EventCard): ("dobra" | "zla" | "chaotyczna")[] | undefined {
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
function liftOffField(snapshot: Snapshot, cardId: string): Changeset {
  const state = snapshot.game.turn_state;
  if (state.phase !== "pole") return {};
  const at = state.drawn.findIndex((entry) => entry.cardId === cardId);
  if (at === -1) return {};
  return {
    game: {
      turn_state: { ...state, drawn: state.drawn.filter((_, index) => index !== at) },
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
export function takeCard(snapshot: Snapshot, command: TakeCard): Outcome<Taken> {
  const { seatId, cardId } = command;
  const granted = command.granted ?? false;

  // Both decks. 21.1 has a character take the Wyposażenie card for a Magiczny
  // Miecz or a Tarcza Tolimana, and 21.3 lets either be left on the board like
  // anything else — but the Tarcza Tolimana exists *only* on the equipment
  // sheet, so looking in the event deck alone made the one card the Zamek
  // Bestii requires impossible to pick up.
  const card = EVENTS.find((c) => c.id === cardId);
  const equipment = card ? null : (items as Item[]).find((i) => i.id === cardId);
  if (!card && !equipment) throw new Error(`Nieznana karta: ${cardId}`);

  // Everything on the Wyposażenie sheet is a Przedmiot; only the event deck
  // needs its class read to tell an item from a friend from a trophy.
  const kind = card ? kindForCard(card) : "item";
  if (!kind) throw new Error("Tej karty nie można zabrać ze sobą.");

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
        journal: [
          {
            seatId,
            turn: snapshot.game.turn,
            kind: "zabranie",
            payload: { cardId, kind: "gold" },
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

  // 12.1a: nothing is picked up while a Wróg is still standing on the field.
  // "W wymienionych przypadkach należy najpierw pokonać Wrogów albo im uciec" —
  // the loot waits until the fight is settled.
  const state = snapshot.game.turn_state;
  if (state.phase === "pole") {
    const settled = state.fought ?? [];
    const standing = state.drawn.find((entry) => {
      const foe = EVENTS.find((c) => c.id === entry.cardId);
      return foe && combatValueOf(foe) && !settled.includes(entry.cardId);
    });
    if (standing && standing.cardId !== cardId) {
      const foe = EVENTS.find((c) => c.id === standing.cardId);
      throw new Error(`Najpierw ${foe?.name ?? standing.cardId} — dopiero potem zbieranie (12.1).`);
    }
  }

  // Rule 5.4: four Przedmioty at a time unless the character has transport.
  // Friends and trophies are not Przedmioty and do not count (6.3 puts no limit
  // on Friends at all), and Sztuki Złota never count (3.5).
  if (kind === "item") {
    // In slotowy the limit is on the pack alone — what a character is wearing
    // hangs on the character. Picking a card up always puts it in the pack, so
    // this is the pack's question either way.
    const mine = holdingsOf(snapshot, seatId);

    // 21.2: the Wyposażenie pile is finite. A Magiczny Miecz that four other
    // characters are already carrying is "w danej chwili nieosiągalny", and
    // 16.6 makes a drawn one the same card rather than a fifth — which is why
    // counting what is in play is the same answer as keeping a tally.
    if (fromTheShop(cardId) && stockLeft(cardId, copiesInPlay(snapshot, cardId)) <= 0) {
      throw new Error(`${cardName(cardId)} — nie ma już ani jednej w Wyposażeniu (21.2).`);
    }

    const variant = eqModeOf(snapshot.game);
    if (carriedCount(mine, variant) >= carryLimit(mine, variant)) {
      throw new Error(
        `Postać może nieść najwyżej ${BASE_CARRY_LIMIT} Przedmioty (5.4). Odrzuć coś najpierw.`,
      );
    }
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

  const kept: Changeset = {
    holdings: {
      insert: [{ seat_id: seatId, card_id: cardId, kind, face: "open", granted }],
    },
  };

  // Chained: the lift writes `game.turn_state` while the discard writes
  // `game.deck`, and reading the discard's snapshot keeps the two from being
  // decided against different tables even though today they touch different
  // keys.
  const lifted = liftOffField(apply(snapshot, mergeAll(discarded, kept)), cardId);

  return {
    writes: mergeAll(discarded, kept, lifted, {
      journal: [
        { seatId, turn: snapshot.game.turn, kind: "zabranie", payload: { cardId, kind } },
      ],
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
  const gone: Changeset = held ? { holdings: { delete: [held.id] } } : {};
  const lies = held && held.kind !== "spell" && held.kind !== "trophy" && seat?.field_id;

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
    placed = putOnPile(
      apply(snapshot, gone),
      held.kind === "spell" ? "spells" : "events",
      [asReturnable(held)],
    );
  }

  return {
    writes: mergeAll(gone, placed, {
      journal: [
        {
          seatId: held?.seat_id ?? null,
          turn: snapshot.game.turn,
          kind: "odrzucenie",
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
 * Arranging what is already held.
 * ----------------------------------------------------------------------- */

/**
 * Puts a seat's pack in the order its owner wants it in.
 *
 * Not a rule — 5.4 counts what you carry and has no opinion about the order it
 * sits in — but a pack of four cards you cannot arrange is one you have to read
 * every time instead of recognising. The order has to be the server's, or the
 * next two-second poll would put the cards back where they were.
 *
 * Every id is checked against the seat that claims them, and only those ids are
 * written: a request naming somebody else's card renumbers nothing, rather than
 * quietly reaching into their pack.
 *
 * Not journalled. The journal is what the *table* is allowed to read, and the
 * order of somebody's own pack is not something the rules or anybody else at
 * the table has a stake in.
 */
export function reorderPack(
  snapshot: Snapshot,
  command: { seatId: string; holdingIds: readonly string[] },
): Outcome<void> {
  const mine = new Set(
    snapshot.holdings
      .filter((held) => held.seat_id === command.seatId)
      .map((held) => held.id),
  );
  const order = command.holdingIds.filter((id) => mine.has(id));
  if (order.length === 0) return { writes: {}, result: undefined };

  return {
    writes: {
      // One-based, so a card that has never been arranged — which is null, and
      // sorts last — cannot collide with the first arranged one.
      holdings: {
        patch: order.map((id, index) => ({ id, patch: { ordinal: index + 1 } })),
      },
    },
    result: undefined,
  };
}

/**
 * Puts a Przedmiot on, or takes it off (the slotowy variant only).
 *
 * `slot` of null takes the card off and puts it back in the pack. Anything
 * already in the place being filled comes off in the same breath, which is what
 * a player means by putting on a different sword.
 *
 * Nothing is journalled here, deliberately. Gear moves around constantly — a
 * card is picked up, tried in a place, put back, swapped for a better one — and
 * a line for each would bury the turn it happened in. What the table needs to
 * see is a character *gaining* something ("zabranie"), which is the event with
 * consequences; where it then hangs on the body is arrangement.
 */
export function equipCard(
  snapshot: Snapshot,
  command: { holdingId: string; slot: Slot | null },
): Outcome<void> {
  if (snapshot.game.eq_mode !== "slotowy") {
    throw new Error("Ten stół gra klasycznym ekwipunkiem — nie ma miejsc na przedmioty.");
  }

  const held = snapshot.holdings.find((h) => h.id === command.holdingId);
  if (!held) throw new Error("Nie ma takiej karty.");
  if (held.kind !== "item") throw new Error("Zakładać można tylko Przedmioty.");

  if (command.slot === null) {
    // Taking something off puts it in the pack, and the pack is still the four
    // of 5.4. A character with four things already carried has nowhere to put
    // its helmet, and the rulebook's answer to being over the limit is to drop
    // something (5.6) — so it says so rather than quietly making a fifth place.
    const mine = holdingsOf(snapshot, held.seat_id);
    if (carriedCount(mine, "slotowy") >= carryLimit(mine, "slotowy")) {
      throw new Error("Plecak jest pełny — najpierw coś wyrzuć (5.4, 5.6).");
    }
    // Nothing to write when the card is already there: the client sends this
    // whenever a card is dropped, including onto the pack it was picked up
    // from.
    if (held.slot === null) return { writes: {}, result: undefined };
    return {
      writes: { holdings: { patch: [{ id: held.id, patch: { slot: null } }] } },
      result: undefined,
    };
  }

  if (!fitsIn(held.card_id, command.slot)) {
    // Two different refusals wearing one sentence. "It does not go there" is
    // useful when there is somewhere it does go; when there is nowhere at all,
    // it reads as a puzzle about which place to try next.
    const name = cardName(held.card_id);
    throw new Error(
      isWearable(held.card_id)
        ? `${name} nie pasuje w to miejsce (${SLOT_LABEL[command.slot]}).`
        : `${name} to nie jest rzecz do noszenia — zostaje w plecaku.`,
    );
  }

  /**
   * One thing per place, and the thing already there goes back in the pack
   * rather than vanishing. Only this seat's — everybody else's Miecz stays on.
   *
   * It goes back into the square the new one is leaving, so the two change
   * places. Landing on the end of the row instead was the tidy answer and the
   * wrong one: a player swapping a Miecz for an Excalibur has not decided
   * anything about where the Miecz should sit, and finding it at the back of a
   * pack of sixteen is a small punishment for an ordinary move.
   */
  const occupant = snapshot.holdings.find(
    (h) => h.seat_id === held.seat_id && h.slot === command.slot && h.id !== held.id,
  );

  const patch = [
    ...(occupant
      ? [{ id: occupant.id, patch: { slot: null, ordinal: held.ordinal } }]
      : []),
    ...(held.slot !== command.slot
      ? [{ id: held.id, patch: { slot: command.slot } }]
      : []),
  ];

  return {
    writes: patch.length > 0 ? { holdings: { patch } } : {},
    result: undefined,
  };
}

/* --------------------------------------------------------------------------
 * Reaching for what is already lying on the Obszar.
 * ----------------------------------------------------------------------- */

/**
 * Picks up a card that was lying on the field a character is standing on.
 *
 * Distinct from `takeCard`, which lifts something out of the turn's own stack —
 * a card just drawn. This one reaches for what was already lying there: gear a
 * dead character left, something a previous visitor dropped, a Przedmiot nobody
 * could carry. Every rule about *whether* you may have it is `takeCard`'s, so
 * this establishes the right to reach and then defers.
 *
 * "Postać, której ruch kończy się na danym Obszarze" — you must be standing on
 * it, and it must be your turn, because 13.1 is explicit that nothing happens
 * on a field you merely passed through.
 */
export function takeFromField(
  snapshot: Snapshot,
  command: { seatId: string; fieldCardId: string },
): Outcome<Taken> {
  const seat = seatById(snapshot, command.seatId);
  if (seat.seat_index !== snapshot.game.active_seat) throw new Error("To nie twoja tura.");

  const lying = snapshot.fieldCards.find((row) => row.id === command.fieldCardId);
  if (!lying) throw new Error("Tej Karty już tam nie ma.");
  if (lying.field_id !== seat.field_id) {
    throw new Error("Można zabierać tylko z Obszaru, na którym się stoi (12.1).");
  }

  /**
   * 12.1 grants this to "Postać, której ruch KOŃCZY SIĘ na danym Obszarze", and
   * only "aż do końca swojej tury". The Obszar you begin a turn standing on is
   * the one you finished the last turn on, and that window has closed — 13.1
   * puts it as a prohibition from the other side, "ani wogóle podejmować
   * żadnych czynności na Obszarze, z którego rozpoczynają ruch".
   *
   * 12.1's own worked example is exactly this: the Książę leaves the Sztylet,
   * the Rękawice and the Srebrna Strzała on the Ruchome Skały, standing on
   * them, and they wait "na Postać, która zakończy tutaj ruch".
   */
  const state = snapshot.game.turn_state;
  if (state.phase !== "pole") {
    throw new Error("Zabierać można tylko po zakończeniu ruchu na tym Obszarze (12.1).");
  }

  // 12.1 a) and b): what is lying here is not reachable while a Wróg is on it
  // or while the Obszar still owes Karty. "W wymienionych przypadkach należy
  // najpierw pokonać Wrogów albo im uciec lub rozpatrzeć treść wyciągniętych
  // Kart."
  const fought = state.fought ?? [];
  const guarded = snapshot.fieldCards.some(
    (row) =>
      row.field_id === seat.field_id &&
      EVENTS.find((card) => card.id === row.card_id)?.cardClass === "wrog" &&
      !fought.includes(row.card_id),
  );
  if (guarded) throw new Error("Najpierw pokonaj Wrogów albo im ucieknij (12.1a).");
  if (state.draw > state.drawn.length) {
    throw new Error("Najpierw wyciągnij Karty, które ten Obszar każe ciągnąć (12.1b).");
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
          turn: snapshot.game.turn,
          kind: "test-karta-obszar",
          payload: { cardId: command.cardId, fieldId },
          manual: true,
        },
      ],
    },
    result: fieldId,
  };
}

/** Hands a seat a card that came from nowhere, for testing what it then does. */
export function grantCard(
  snapshot: Snapshot,
  command: { seatId: string; cardId: string },
): Outcome<void> {
  const { seatId, cardId } = command;
  const spell = SPELLS.find((card) => card.id === cardId);
  const equipment = (items as Item[]).find((item) => item.id === cardId);
  const event = EVENTS.find((card) => card.id === cardId);

  const kind = spell ? "spell" : equipment ? "item" : event ? kindForCard(event) : null;
  if (kind === null) throw new Error(`Nie wiem, czym jest: ${cardId}`);
  if (kind === "trophy") throw new Error("Wroga trzeba pokonać, nie wziąć.");

  return {
    writes: {
      holdings: {
        insert: [
          {
            seat_id: seatId,
            card_id: cardId,
            kind,
            // 9.3 keeps a Zaklęcie face down even when it arrived by fiat.
            face: kind === "spell" ? "hidden" : "open",
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
          turn: snapshot.game.turn,
          kind: "test-karta",
          payload: { cardId, kind },
          manual: true,
        },
      ],
    },
    result: undefined,
  };
}
