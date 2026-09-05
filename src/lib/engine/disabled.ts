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
 * A Postać's own powers, parked whole — everything but the starting kit.
 *
 * Same shape and same promise as `PVP_PARKED` and `COMPANION_PARKED`: no code
 * is deleted and one flip brings them back. `abilitiesOfCharacter` is the only
 * door a character's typed abilities come through, so returning nothing from
 * it while this stands switches off all sixteen of them — the six field
 * safeties, the three escapes, the three roll modifiers, `bez-oplaty`,
 * `magia-do-miecza`, `zakazane` and `natura-dowolna` — without touching a
 * single reader.
 *
 * Why all of them and not only the unbuilt ones: 89 clauses are printed across
 * the 27 Kartas Postaci and the app ran 34. A Karta that keeps sixteen of its
 * promises and breaks fifty-five is harder to play with than one that keeps
 * none of them and says so, because a player cannot tell which sixteen. So the
 * line is drawn where it can be stated in a sentence — the app deals your kit,
 * and everything else on the card is yours to apply.
 */
export const CHARACTER_POWERS_PARKED = true;

/**
 * The clauses that are *not* dimmed: the starting kit, and nothing else.
 *
 * Stated as what is live rather than as what is parked, because the live list
 * is a third the length and because it is the honest sentence — "these are the
 * ones the app carries" — rather than its complement. Everything absent from
 * here is struck through on the Karta.
 *
 * These are the clauses `STARTING_KIT` (characters.ts) actually deals, matched
 * by hand to their index in each Postać's printed `abilities` array. The
 * KSIĄŻĘ has two, his gold and his gear; his gear clause also promises he may
 * always replace what he loses, and *that* half is not carried — a clause the
 * app half keeps is kept, on the grounds that striking it through would deny
 * the kit it does deal.
 *
 * Indices into transcribed prose rot in silence, so `disabled.test.ts` pins
 * every one of them by words only that clause contains.
 */
export const LIVE_ABILITIES: Readonly<Partial<Record<CharacterId, readonly number[]>>> = {
  "bledny-rycerz": [0],
  czarodziej: [0],
  demon: [0],
  hummit: [0],
  kaplan: [0],
  kaplanka: [0],
  karzel: [0],
  // His [0] is choosing a Natura at setup, which nothing carries yet.
  kat: [1],
  krasnolud: [0],
  // Gold and gear, the only Postać with two.
  ksiaze: [0, 1],
  lotr: [0],
  mag: [0],
  magog: [0],
  quark: [0],
  "rycerz-ciemnosci": [0],
  wiedzma: [0],
  zdobywca: [0],
};

/** Whether this Karta is out of the game entirely. */
export function parkedCard(cardId: string): Parked | null {
  return PARKED_CARDS[cardId as CardId] ?? null;
}

/**
 * Whether this printed clause of a Charakterystyka cannot fire.
 *
 * The inverse of `LIVE_ABILITIES`, so a clause nobody has listed as carried is
 * parked by default. That direction matters: a new Postać, or a clause the app
 * learns to run, has to be *added* to be shown live — the failure mode is a
 * card that under-promises, which a player can check against the paper, rather
 * than one that over-promises, which they discover mid-fight.
 */
export function parkedAbility(characterId: string | null, index: number): boolean {
  if (!characterId) return false;
  if (!CHARACTER_POWERS_PARKED) return false;
  return !(LIVE_ABILITIES[characterId as CharacterId] ?? []).includes(index);
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
 * The Karta that has no other purpose goes with it, through `PARKED_CARDS`.
 * The duel clauses printed on eight Kartas Postaci are dimmed rather than
 * hidden, but not by anything of this feature's own: since 2026-09-05
 * `CHARACTER_POWERS_PARKED` dims every clause outside the starting kit, and
 * the duel ones were never carried anyway. A Karta Postaci is a transcription
 * of a real card, and a card in the box says what it says.
 */
export const PVP_PARKED = true;

/** The one door into a duel, and so the one place this has to be said. */
export function refuseIfPvpParked(): void {
  if (PVP_PARKED) {
    throw new Error(`Walka między Postaciami — ${PARKED_SAID.toLowerCase()}.`);
  }
}
