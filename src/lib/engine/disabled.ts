/** What is out of the game because the app cannot run it yet (not because a rule says so). */

import type { CardId, CharacterId } from "@/data/ids";
import { cardName } from "./polish";

/**
 * Why something is out. Internal, and deliberately never shown.
 *
 * A player who opens the Księga and finds a Karta crossed out is told
 * „Niedostępne" and nothing else. The reason belongs in this file and in
 * docs/TASKS.md, where somebody deciding what to build next reads it — not on
 * the card, where it would be the app apologising for itself in the middle of
 * a game. The one thing worse than a missing feature is a running commentary
 * about the missing feature, and there is a whole convention against editorial
 * text in the UI already.
 *
 * This is not `coverage.ts`. That says "the app carries part of this card, and
 * here is the clause you must apply yourself" — the Karta is in the deck and
 * will be drawn. This says "the Karta is not in the box at all this game".
 */
export type Parked =
  /** Postać przeciw Postaci: 17.6-10, 18.1b and 19.1-2's escape from a Postać. */
  "pvp";

/**
 * Kartas that are not in any pile, cannot be drawn, and cannot be conjured.
 *
 * A card here is *gone*: `freshDecks` never shuffles it in, the console
 * refuses to place or stack or grant it, and the Księga shows it struck
 * through. That is stronger than every other way a card can be absent —
 * `characters_out` holds Postacie somebody is playing, a used pile holds cards
 * that will come back — and it is deliberately the only list with that
 * meaning, so "why is this not in the game" has one place to look.
 */
export const PARKED_CARDS: Readonly<Partial<Record<CardId, Parked>>> = {
  // „Możesz wyzwać na pojedynek każdą Postać" — the whole card is a duel, so
  // there is nothing left of it once duels are out.
  "turniej-rycerski": "pvp",
};

/**
 * Printed clauses on a Karta Postaci that cannot fire, by their index in the
 * character's own `abilities` array.
 *
 * A character is never parked — all 27 stay pickable — because a Charakterystyka
 * is several abilities and losing one is not losing the Postać. The Kat and the
 * Łotr lose two of their four and are weaker for it; that is a balance cost
 * taken knowingly rather than a reason to shorten the roster. Nobody loses
 * everything.
 *
 * Indices into transcribed prose are exactly the sort of reference that rots
 * silently, so `disabled.test.ts` pins the opening words of every clause named
 * here. Re-transcribe a Karta Postaci and the test says which index moved
 * rather than the game quietly dimming the wrong sentence.
 */
export const PARKED_ABILITIES: Readonly<Partial<Record<CharacterId, readonly number[]>>> = {
  // „Jeżeli zaatakujesz inną Postać ... zaatakować ją po raz drugi."
  barbarzynca: [2],
  // „Jeżeli zwyciężysz inną Postać w walce magicznej..."
  demon: [3],
  // Beheading, and choosing the kind of fight — the second says „Atakując
  // Postać" outright, so unlike the Rycerz Ciemności's it is a duel and only
  // a duel.
  kat: [2, 3],
  // „Ilekroć pokonasz inną Postać", and fighting dishonestly against one.
  lotr: [2, 3],
  // „W czasie walki z Postacią, której całkowity Miecz przewyższa twój..."
  // His [0], stepping past an occupied Obszar, is not a fight and stays.
  olbrzym: [1],
  // Only the Turniej clause. His „Atakując możesz wybrać formę walki" says
  // nothing about a Postać and is 18.1b's own permission — it is how he
  // attacks a Wróg with Magia, which still happens — so it stays. Getting
  // this one wrong would have taken away the ability the character is for.
  "rycerz-ciemnosci": [3],
  // „Po wygraniu zwykłej walki możesz odebrać pokonanej Postaci 2 punkty Życia."
  zdobywca: [2],
  // The BŁĘDNY RYCERZ keeps everything, and is here to say so. His refight is
  // „jeżeli przegrasz walkę" — any fight, a Wróg's included — and taking a
  // Krzyżowiec off „każdej napotkanej Postaci" is 13.3's other branch, which
  // is not a fight at all.
};

/** Whether this Karta is out of the game entirely. */
export function parkedCard(cardId: string): Parked | null {
  return PARKED_CARDS[cardId as CardId] ?? null;
}

/** Whether this printed clause of a Charakterystyka cannot fire. */
export function parkedAbility(characterId: string | null, index: number): boolean {
  if (!characterId) return false;
  return (PARKED_ABILITIES[characterId as CharacterId] ?? []).includes(index);
}

/**
 * What a player is told, and the whole of it.
 *
 * One word, in red, on the Karta and on the clause alike — see `Parked`'s note
 * for why it does not say more.
 */
export const PARKED_SAID = "Niedostępne";

/**
 * The one refusal, for every door a named Karta can come in by.
 *
 * No rule number: „niedostępne" is not something the Instrukcja says, it is
 * this app declining to run a rule it has not built. CLAUDE.md keeps numbers
 * off plumbing refusals for exactly that reason, and a citation here would
 * point a reader at a rule that is perfectly fine.
 */
export function refuseIfParked(cardId: string): void {
  if (parkedCard(cardId)) throw new Error(`${cardName(cardId)} — ${PARKED_SAID.toLowerCase()}.`);
}

/**
 * Postać przeciw Postaci, parked whole.
 *
 * The same shape `COMPANION_PARKED` uses in `game/modes.ts`, for the same
 * reason and with the same promise: nothing is deleted, and flipping this to
 * false brings the feature back. What it switches off is 17.6-10, 18.1b and
 * 19.1-2's escape from a Postać — one attack door, so one refusal covers all
 * of them. 13.3's *other* branch is untouched: meeting a Postać to use an
 * ability on her (the Wiedźma's urok, the Spryciarz's shilling, the Błędny
 * Rycerz taking a Krzyżowiec) is not a fight, and neither is any Zaklęcie
 * spoken at another player.
 *
 * The Karta that has no other purpose goes with it, through `PARKED_CARDS`,
 * and the printed clauses that cannot fire are dimmed through
 * `PARKED_ABILITIES` rather than being hidden — a Karta Postaci is a
 * transcription of a real card, and a card in the box says what it says.
 */
export const PVP_PARKED = true;

/** The one door into a duel, and so the one place this has to be said. */
export function refuseIfPvpParked(): void {
  if (PVP_PARKED) {
    throw new Error(`Walka między Postaciami — ${PARKED_SAID.toLowerCase()}.`);
  }
}
