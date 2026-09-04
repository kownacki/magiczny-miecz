/** How much of a card the app actually handles, so nobody has to guess whether it is watching. */

import { ABILITIES } from "./abilities";
import { SCRIPTS } from "./cardScript";
import { SPELLS } from "./spells";
import { USES } from "./uses";
import type { CardId } from "@/data/ids";

/**
 * A referee that silently does nothing is worse than no referee.
 *
 * Most of the deck is encoded now, which creates a new hazard: a player who has
 * seen the app resolve twenty cards will assume it is resolving the twenty-first
 * too. For the cards it cannot read, and for the clauses it has only half read,
 * it has to say so — otherwise the quiet ones look identical to the handled
 * ones and rules get dropped.
 *
 * Three states, and only three:
 *
 * - `pelne` — everything the card says is encoded.
 * - `czesciowe` — the app handles part of it and names the rest.
 * - `brak` — the app is not helping with this card at all; read it and apply it.
 */
export type Coverage = "pelne" | "czesciowe" | "brak";

/**
 * What the app does NOT do, for cards it only partly understands.
 *
 * Every entry here corresponds to a clause deliberately left unencoded, and the
 * wording is what a player needs to *do*, not what the type system is missing.
 * Keeping these next to each other rather than in comments beside each entry is
 * what lets the interface show them.
 *
 * An entry existing is itself a claim — it marks the card as only half handled.
 * So a note that merely reassures ("the app already does this") does not belong
 * here: it would tell a table to watch something the referee is watching for
 * them, which is the same wasted vigilance as no referee at all.
 */
const MANUAL: Readonly<Partial<Record<CardId, string>>> = {
  // --- equipment and magic items -------------------------------------------
  //
  // ARONDIGHT, the TOPÓR and the RELIKWIARZ were here, and all three were
  // stale — the same fault the ALCHEMIK's note had. The two blades' "a w walce
  // z Wilkołakiem 2 punkty" is `przeciw`, applied through `insteadAgainst` in
  // `againstThese`; the Relikwiarz's "pokonuje wszystkie Demony bez walki" is
  // `pokonuje-bez-walki`, applied in `beginFight`. All three have had tests in
  // `modifiers.test.ts` the whole time. A note that tells a table to watch
  // something the referee is already watching is the same wasted vigilance as
  // no referee at all.
  // The KOŃ, the MUŁ and the ZAPRZĘG were here for "Przedmioty te pozostaną na
  // Obszarze, na którym utraciłeś Konia", and all three were stale. Losing the
  // transport drops `carryLimit`, `refuseWhileOverLimit` stops the turn at its
  // next door until the excess is shed (5.6), and `dropCard` lays what goes
  // down face up on the Obszar the character is standing on (5.5). What the app
  // declines to do is *choose* which Przedmioty go, and that is 5.4's answer,
  // not a gap. Pinned in `carrying.test.ts`.
  //
  // The ŁÓDŹ and the LATARNIA keep a note, but a narrower one than they had:
  // "przeprawa dopiero w następnej turze" is `ends: { turns: 1 }` and "potem
  // odłóż Kartę" is `disposition: odloz` with `consumed: true`, both applied on
  // the way in. Only the destination is still the table's.
  lodz: "Przeprawa wysadza na Obszarze, na który wychodzi przeprawa — jeśli chcecie sąsiadującego z tym, z którego wszedłeś, przestawcie figurę sami.",
  latarnia: "Przeprawa wysadza na Obszarze, na który wychodzi przeprawa — jeśli chcecie sąsiadującego z tym, z którego wszedłeś, przestawcie figurę sami.",
  // The MAGICZNA SAKWA and the TRAGARZ were here too, for "Utrata Sakwy
  // oznacza jednocześnie utratę wszystkich niesionych w niej Przedmiotów" and
  // the Tragarz's own version of it — and both were stale in the opposite
  // direction from the KOŃ/MUŁ/ZAPRZĘG note above them: those three leave
  // what they carried on the Obszar, and these two do not. `giniePrzyUtracie`
  // on their `udzwig` ability is what tells them apart in `overflow.ts`; the
  // frame that opens when either is lost carries `because: container-lost`,
  // `waysUnder` turns `odrzuc` into `zniszcz` for the surplus, and `dropCard`
  // sends it to the used pile through `putOnPile` instead of the Obszar.
  // Pinned in `overflow.test.ts`.

  // --- friends --------------------------------------------------------------
  // The ALCHEMIK was here for "zamiana jest nieodwracalna", which is not
  // something the table has to do — `sellHolding` deletes the holding and
  // `putOnPile` sends the Karta back, so the app *is* the irreversibility. The
  // Lichwiarz makes the identical trade with no note against his name, and one
  // of the two had to be wrong. A warning about a click belongs on the click.

  // --- cards whose disposition is handled but whose body is not -------------
  //
  // The MGŁA was the other one, and is no longer: „przez 2 tury… 1 Obszar na
  // turę" is a `move-max` of 1 on every seat, which is the modifier the console
  // has been able to conjure under that Karta's own name since `EFFECTS.fog`
  // was written.
  //
  // UKŁAD PLANET moved to `pelne` the same way: the number now has somewhere
  // to live — `magia-x2` on every Demon's `field_cards` row, one round out —
  // and `fight.ts`'s `beginFight` reads it back before the dice are thrown.
  // `resolveDrawnCard` (`commands/resolving.ts`) applies it bespoke to the one
  // card id, the same choice `landSpell` makes for the Władca Gromu, because
  // "every Demon on the board" has nowhere to fit in `cardScript.ts`'s
  // seat-only op tree.

  // --- Zaklęcia the app carries out in part ---------------------------------
  //
  // Each of these applies the half that has a seat to land on. What is left is
  // what the model has nowhere to put: a state on a Karta lying on an Obszar,
  // or a distinction the deck does not record.
  //
  // The Krąg Płomieni and the Władca Gromu both moved to `pelne`: a Wróg lying
  // on an Obszar now carries `unieruchomiony` the same way a Postać carries
  // `frozen` (`seat_effects.field_card_id`), so `beginFight` and `sendRaider`
  // refuse him, the kolejka lets a turn walk past him rather than holding it
  // open, and `liftFieldCards` leaves his row exactly where it is rather than
  // lifting it, so a status put on him outlasts whoever visits next.
  //
  // One clause of the Krąg's stays here, and only one: „dopóki ktoś nie zdejmie
  // Kręgu" needs something to *lift* it, and the only card that lifts anything
  // is the Władca Zaklęć — which only ever reads a status off the seat that
  // spoke it (`castSpell`'s own "nothing in the air" branch). Nobody has a
  // seat to speak Władca Zaklęć *at* a Wróg, so a table freeing one still does
  // it by hand — a manual override, the same door every tracked value has.
  "krag-plomieni":
    "Dopóki ktoś nie zdejmie Kręgu, nikt nie zdejmuje go w aplikacji — Władca Zaklęć nie ma jak trafić w Kartę na Obszarze. Rzucić go można na Wroga leżącego na Obszarze albo w trakcie walki; nie na dopiero co dobranego, zanim walka się zacznie.",
  /**
   * Narrowed rather than cleared: rzucony na Wroga leżącego na Obszarze teraz
   * ratuje go od śmierci — `applyCardEfekt` (od 740c2e8) kładzie `ocalenie` na
   * jego rząd, i `resolveFight` (`commands/spoils.ts`) wydaje ten status
   * zamiast jego zgonu, gdy walkę wygrywa Postać: Karta zostaje, trofeum nie
   * ma. To samo ograniczenie co Krąg Płomieni — nie na Wroga dopiero co
   * dobranego, zanim ma swój rząd.
   *
   * Co zostaje: rzucony na Przyjaciela ratuje go od śmierci — Przyjaciel jest
   * kartą przy graczu, nie na Obszarze, i ten drugi cel nie ma jeszcze swojego
   * gniazda. I użyty w trakcie walki czyni jej wynik nierozstrzygniętym — to
   * zmiana wyniku rzuconych już kości, którą aplikacja jeszcze czyta jako
   * zwykłą wygraną albo przegraną.
   */
  ocalony:
    "Rzucony na Przyjaciela ratuje go od śmierci — to wciąż wasze. Użyty w walce, by uczynić jej wynik nierozstrzygniętym — też wasze.",
};

export function coverageOf(cardId: string): Coverage {
  /**
   * All four registries, because a card is encoded in whichever one fits its
   * shape and the player does not care which.
   *
   * This asked only two of them for a long time, and the answer for the other
   * two was "brak" — printed under the card as "rozpatrzcie sami, aplikacja jej
   * nie prowadzi". It was not true of the five Przedmioty that live in `USES`,
   * and it was not true of the twenty-seven Zaklęcia that live in `SPELLS`,
   * which is the *first shelf of the Księga* — so the commonest thing to open
   * in the whole app was a card the referee carries, disclaiming it.
   *
   * The same fault had already been patched once, downstream, where a Karta
   * Postaci was given a special case in `card-tile.tsx` for printing the same
   * false line. Two registries missing from one condition, found twice, in two
   * places, is the argument for fixing it here rather than a third time.
   */
  const known =
    cardId in SCRIPTS || cardId in ABILITIES || cardId in USES || cardId in SPELLS;
  if (!known) return "brak";
  return cardId in MANUAL ? "czesciowe" : "pelne";
}

/** The clause the players have to apply themselves, if there is one. */
export function manualNote(cardId: string): string | null {
  return MANUAL[cardId as CardId] ?? null;
}

/**
 * What to tell a player about a card the app is not resolving.
 *
 * Phrased as an instruction rather than an apology. "Rozpatrzcie sami" is
 * something a table can act on; "not implemented" is a bug report.
 */
export const NOT_HANDLED = "Tę Kartę rozpatrzcie sami — aplikacja jej nie prowadzi.";
