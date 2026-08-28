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
  // --- creatures whose fight has a clause the fight machinery cannot carry ---
  "przybysz-z-krainy-cieni":
    "Przeciw Przybyszowi nie wolno użyć Zaklęć, Magicznych Przedmiotów ani Broni — walczy się samym Mieczem Postaci.",
  "trogglowy-smok":
    "Trzy głowy po 2 punkty Miecza, po kolei. Przegrana odrasta wszystkie odcięte — walkę zaczyna się od nowa.",
  // --- equipment and magic items -------------------------------------------
  arondight: "Przeciw Wilkołakowi dodaje 2 punkty Miecza, nie 1.",
  "topor-swiatla-i-ciemnosci": "Przeciw Wilkołakowi dodaje 2 punkty Miecza, nie 1.",
  excalibur: "Po wygranej walce zyskujesz 1 Życie, odbierając je pokonanemu.",
  "czarodziejska-kosc":
    "W Pułapce i Magicznej Pułapce daje zamiast tego 1 punkt Miecza lub Magii.",
  relikwiarz: "Pokonuje wszystkie Demony bez walki.",
  "talizman-ognia": "Daje odporność na Zaklęcie Krąg Płomieni.",
  "talizman-powietrza": "Daje odporność na Siedem Wichrów i Władcę Gromu.",
  lodz: "Przeprawa dopiero w następnej turze, na Obszar sąsiadujący. Potem odłóż Kartę.",
  latarnia: "Przeprawa dopiero w następnej turze, na Obszar sąsiadujący. Potem odłóż Kartę.",
  kon: "Tracąc Konia, zostawiasz na Obszarze wszystko, czego sam nie uniesiesz.",
  mul: "Tracąc Muła, zostawiasz na Obszarze niesione przez niego Przedmioty.",
  zaprzeg: "Tracąc Zaprzęg, zostawiasz na Obszarze to, czego sam nie uniesiesz.",
  "magiczna-sakwa": "Utrata Sakwy to utrata wszystkiego, co w niej niesiono.",

  // --- friends --------------------------------------------------------------
  chochlik: "Kosztuje 1 punkt Życia na wstępie. Pozwala obejrzeć 2 Karty Zaklęć i wybrać.",
  // The per-turn hire is the app's now; joining you is not. Taking him is an
  // ordinary `take` and nothing charges the Sztuka Złota or leaves him standing
  // on the Obszar when you decline.
  najemnik: "Przyjmujesz go za 1 Sz. Z. — bez zapłaty zostaje na Obszarze i czeka.",
  alchemik: "Zamiana jest nieodwracalna — Karta Przedmiotu wraca na stos.",
  tragarz: "Bez zapłaty 1 Sz. Z. odchodzi. Tracąc go, tracisz też niesione Przedmioty.",

  // --- cards whose disposition is handled but whose body is not -------------

  sztukmistrz: "Kupno Zaklęcia rozliczcie sami, o ile pozwala na to Magia.",
  "kapliczka-nemed": "Rozpatrzcie modlitwę tak jak w Świątyni Bogini Nemed.",
  "kapliczka-tolimana": "Rozpatrzcie modlitwę tak jak w Świątyni Tolimana.",
  eremita: "Magiczny Miecz i Tarcza Tolimana są skończone — tylko jeśli jeszcze są.",
  lewiatan: "Połóż Kartę na wolnym Obszarze. Jeśli żaden nie jest wolny, odłóż ją.",
  zloczynca: "Płaci tylko ta Postać, która przegrała walkę.",
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
