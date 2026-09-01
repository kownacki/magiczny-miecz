/** Putting cards back where they came from — "stos zużytych Kart Zdarzeń", and the spells' own (9.5, 9.6, 4.4, 1.4, 6.4, 16.6, 20.2). */

import { discardTo, returningRef, stackOnTop } from "@/lib/engine/deck";
import { fromTheShop } from "@/lib/engine/stock";
import { BY_REF, EVENT_COPIES, SPELL_BY_REF, SPELL_COPIES, decksOf } from "../decks";
import type { Changeset, Outcome, Snapshot } from "../change";
import { trophyModeOf } from "./seat";

/**
 * All a pile ever looks at.
 *
 * Narrower than a whole `Snapshot` on purpose: the decks live on the games row,
 * so saying so lets the parts of the store that have not moved across yet reuse
 * this with the single row they already hold, instead of reading the table
 * again to satisfy a type.
 */
type Reads = Pick<Snapshot, "game">;

/** What a card needs to say about itself to be put away. */
export interface Returnable {
  cardId: string;
  /** Conjured by a test: it belongs to no pile and joins none. */
  granted?: boolean;
}

/** A row from either table, as the thing that has to be put away. */
/**
 * Sztuki Złota put down on an Obszar, added to whatever is already lying there.
 *
 * One row per Obszar, so this is an insert or a patch and never a second row
 * for the same square. Read through the snapshot it is handed, which is what
 * lets two writes in one turn add up: a caller chaining through
 * `apply(snapshot, soFar)` sees the first one's total.
 *
 * The żetony are unlimited — the engine models no supply to draw down, which
 * is the one part of 3.4 it leaves to the table.
 */
export function dropGold(snapshot: Snapshot, fieldId: string, gold: number): Changeset {
  if (gold <= 0) return {};
  const already = snapshot.fieldGold.find((row) => row.field_id === fieldId);
  return already
    ? { fieldGold: { patch: [{ id: already.id, patch: { gold: already.gold + gold } }] } }
    : { fieldGold: { insert: [{ field_id: fieldId, gold }] } };
}

/**
 * Sztuki Złota taken off an Obszar, and the row gone when there is none left.
 *
 * Deleted rather than left at zero, so "is there gold here" is a row and not a
 * number to compare — an empty purse on a square is no purse.
 */
export function takeGold(snapshot: Snapshot, fieldId: string, gold: number): Changeset {
  const already = snapshot.fieldGold.find((row) => row.field_id === fieldId);
  if (!already || gold <= 0) return {};
  const left = Math.max(0, already.gold - gold);
  return left === 0
    ? { fieldGold: { delete: [already.id] } }
    : { fieldGold: { patch: [{ id: already.id, patch: { gold: left } }] } };
}

export function asReturnable(row: { card_id: string; granted: boolean }): Returnable {
  return { cardId: row.card_id, granted: row.granted };
}

/**
 * Puts cards on the used pile.
 *
 * One door for all of it, because the rulebook keeps sending cards through it
 * from seven different chapters and every one of those used to end in a bare
 * `delete`. A card that is deleted has not been "odłożona na stos zużytych" —
 * it has left the game, and 9.5 can never bring it back.
 *
 * Simulation only: at a physical table the pile is a pile.
 *
 * 21.2: the Wyposażenie is a stock, not a deck. "Kart Przedmiotów zakupionych
 * nie należy jednak odrzucać (umieszcza się je powtórnie w stosie Kart
 * zakupów) ponieważ możliwe jest ponowne dokonanie ich zakupu." A Hełm that
 * leaves a hand goes back to the pile it can be bought from again, and
 * `stockLeft` puts it there by arithmetic the moment it stops being in play —
 * so there is nothing to do here but stay out of the way. This is why it needs
 * saying at all: eleven of the twelve Wyposażenie cards are *also* in the event
 * deck, and pushing a sold Hełm onto the used pile would hand the deck a
 * thirteenth Hełm and the shop its own back at once.
 *
 * A granted card is kept out for the opposite reason: the deck never gave it
 * up, so it has nothing to give back. Putting one on the pile is how a table
 * ends up with two Cyklopy — the conjured one on the used pile and the real one
 * still waiting in the draw.
 */
export function putOnPile(
  snapshot: Reads,
  pile: "events" | "spells",
  cards: readonly Returnable[],
): Changeset {
  const real = cards.filter((card) => !card.granted).map((card) => card.cardId);
  return pushOntoPile(
    snapshot,
    pile,
    pile === "events" ? real.filter((cardId) => !fromTheShop(cardId)) : real,
  );
}

/**
 * The same, for cards already known to belong to the pile.
 *
 * An id with no copies is not an error. The Wyposażenie is a stock and not a
 * deck (21.2), so a Hełm handed back has nowhere here to go and is counted by
 * `shopStock` instead.
 */
export function pushOntoPile(
  snapshot: Reads,
  pile: "events" | "spells",
  cardIds: readonly string[],
): Changeset {
  if (cardIds.length === 0) return {};
  if (snapshot.game.mode !== "simulation") return {};

  const copies = pile === "events" ? EVENT_COPIES : SPELL_COPIES;
  const decks = decksOf(snapshot.game);
  let deck = decks[pile];
  let any = false;

  for (const cardId of cardIds) {
    const mine = copies.get(cardId);
    if (!mine) continue;
    const ref = returningRef(deck, mine);
    if (!ref) continue;
    any = true;
    // Folded in as we go, so two copies of the same card in one call take two
    // different refs rather than both taking the first free one.
    deck = discardTo(deck, [ref]);
  }

  if (!any) return {};
  return { game: { deck: { ...decks, [pile]: deck } } };
}

/**
 * Puts a named card on top of its pile, so the next lawful draw is that card.
 *
 * Test mode's answer to "I want to see what this Karta does". The three doors
 * that already conjure a card all step round the machinery that makes a card
 * interesting: `give` puts it straight in a hand, `place` lays it face up on an
 * Obszar and `summon` opens a fight with a Wróg. None of them runs 15.2's
 * ordering, the card's own `disposition`, or the journal line that says where
 * it went — so a script could be wrong in exactly the way a test table exists
 * to catch. This puts the card back in the deck's own path and lets `draw` find
 * it, which means what happens next is what would have happened anyway.
 *
 * A move rather than an insertion, so the box keeps the number of copies it was
 * printed with — and a card in a hand or lying on a field is not in a pile to
 * be moved, which is a refusal and not a second copy.
 */
export function stackForDraw(
  snapshot: Snapshot,
  command: { seatId: string; cardId: string },
): Outcome<"events" | "spells"> {
  const { seatId, cardId } = command;
  const pile = EVENT_COPIES.has(cardId) ? "events" : SPELL_COPIES.has(cardId) ? "spells" : null;
  if (!pile) throw new Error("Ta Karta nie jest w żadnej talii.");

  const decks = simulatedDecks(snapshot);
  for (const ref of (pile === "events" ? EVENT_COPIES : SPELL_COPIES).get(cardId) ?? []) {
    const after = stackOnTop(decks[pile], ref);
    if (after) return wroteStack(snapshot, seatId, pile, decks, after, cardId);
  }
  throw new Error("Każdy egzemplarz tej Karty jest w grze — nie ma czego położyć na wierzchu.");
}

/**
 * The same, for a card picked off the pile by where it lies rather than by name.
 *
 * The other half of `pile`, which prints the draw order numbered from the top:
 * having read the list, `stack 10` is how you say "that one". By position it
 * can only ever name a card that is *in* the pile, so the refusal `stackForDraw`
 * needs — every copy already in play — cannot arise here.
 *
 * One-based, because the list it answers is one-based. `stack 1` is a no-op
 * rather than an error: the card is already on top, which is what was asked
 * for.
 */
export function stackAt(
  snapshot: Snapshot,
  command: { seatId: string; pile: "events" | "spells"; at: number },
): Outcome<string> {
  const { seatId, pile, at } = command;
  const decks = simulatedDecks(snapshot);
  const draw = decks[pile].draw;
  if (!Number.isInteger(at) || at < 1 || at > draw.length) {
    throw new Error(
      draw.length === 0
        ? "Ta talia jest pusta."
        : `W tej talii jest ${draw.length} Kart — wybierz od 1 do ${draw.length}.`,
    );
  }
  const ref = draw[at - 1];
  const after = stackOnTop(decks[pile], ref);
  // `ref` came off this very pile, so `stackOnTop` cannot fail to find it.
  if (!after) throw new Error("Nie ma tej Karty w talii.");
  const card = pile === "events" ? BY_REF.get(ref) : SPELL_BY_REF.get(ref);
  const cardId = card?.id ?? ref;
  return { ...wroteStack(snapshot, seatId, pile, decks, after, cardId), result: cardId };
}

/** The decks, or the reason there are none to arrange. */
function simulatedDecks(snapshot: Snapshot) {
  if (snapshot.game.mode !== "simulation") {
    throw new Error("Talia jest na stole, nie w aplikacji.");
  }
  return decksOf(snapshot.game);
}

/** The one write both forms make, so the journal line cannot come out twice-shaped. */
function wroteStack(
  snapshot: Snapshot,
  seatId: string,
  pile: "events" | "spells",
  decks: ReturnType<typeof decksOf>,
  after: ReturnType<typeof stackOnTop>,
  cardId: string,
): Outcome<"events" | "spells"> {
  return {
    writes: {
      game: { deck: { ...decks, [pile]: after } },
      journal: [
        { seatId, round: snapshot.game.round, kind: "test-stack", payload: { cardId }, manual: true },
      ],
    },
    result: pile,
  };
}

/**
 * Trophy Karty back on the stos zużytych — in the mode where they ever left it.
 *
 * „Karty pokonanych" hoards the Karta until it is spent, so every way of losing
 * a trophy sends it to the pile: 1.4's trade, putting it down, dying, walking
 * out of the realm.
 *
 * „Punkty" already sent it, at the moment the Wróg died. What stays on the seat
 * is a copy of him — the trophy — and the deck has its card back and can deal
 * it to somebody else. So the same four ways of losing that trophy must return
 * nothing at all, or a box holding one Wilkołak ends the evening holding two.
 *
 * Four callers and one rule, which is the whole reason this is a function.
 * Written out four times, three of them would be right.
 */
export function trophiesToPile(
  snapshot: Snapshot,
  trophies: readonly { card_id: string; granted: boolean }[],
): Changeset {
  if (trophies.length === 0) return {};
  if (trophyModeOf(snapshot.game) === "points") return {};
  return putOnPile(snapshot, "events", trophies.map(asReturnable));
}
