/** Putting cards back where they came from — "stos zużytych Kart Zdarzeń", and the spells' own (9.5, 9.6, 4.4, 1.4, 6.4, 16.6, 20.2). */

import { discardTo, returningRef } from "@/lib/engine/deck";
import { fromTheShop } from "@/lib/engine/stock";
import { EVENT_COPIES, SPELL_COPIES, decksOf } from "../decks";
import type { Changeset, Snapshot } from "../change";

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
