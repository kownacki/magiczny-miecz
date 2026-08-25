/** The cards you spend by using them, and what spending one buys. */

import type { CardId } from "@/data/ids";

/**
 * Why this is a list of its own.
 *
 * `abilities.ts` says what a card does *while you hold it* — a standing rule
 * the engine consults while resolving something else. Nothing there ever ends.
 * These nine are the opposite shape: holding them does nothing at all, and the
 * whole card is one act you take once, after which the Karta goes on the used
 * pile. "Po użyciu Kartę należy odłożyć" is printed on most of them in those
 * words.
 *
 * That makes using one irreversible in the way the poczekalnia's three
 * irreversible things are irreversible, which is why it is asked about before
 * it happens rather than offered as one more small button among the others.
 *
 * Every card in here is spent, so there is no flag saying so — the module *is*
 * the flag. A card that had a use and survived it would not belong here.
 */
export interface Use {
  /** What using it buys, in one line, for the question before it happens. */
  co: string;
  /**
   * The window the card names, or null for "w dowolnym momencie".
   *
   * Not enforced. Four of these are used inside somebody else's turn — the
   * Kryształ in a fight you did not start, the Zwierciadło against whoever
   * needs it — so a check would have to model moments the turn state does not
   * have yet. Naming the window puts it where the decision is made instead,
   * which is what the Zaklęcia panel already does with `TIMING_LABEL`.
   */
  kiedy: string | null;
  /**
   * Who works out the result.
   *
   * `aplikacja` means the app throws the die and applies the outcome, the same
   * as a field's table. `stol` means it cannot yet, and says so rather than
   * pretending: the app still spends the card and tells the table, which is
   * exactly the bargain the Zaklęcia panel makes ("skutek rozpatrzcie sami").
   */
  rozpatruje: "aplikacja" | "stol";
}

export const USES: Readonly<Partial<Record<CardId, Use>>> = {
  /**
   * The one the app can settle by itself: six faces, and `PRZEDMIOTY` already
   * carries the script. "Rzuć kostką, by określić, co znalazłeś w środku, a
   * następnie odłóż Kartę."
   */
  "tajemnicza-szkatula": {
    co: "rzut kostką decyduje, co jest w środku",
    kiedy: null,
    rozpatruje: "aplikacja",
  },

  // "Po wypiciu Eliksiru, Postać zyskuje na 1 turę dodatkowe 2 punkty Miecza."
  // Nothing here can hold a bonus for a turn yet — that is `status.ts`, which
  // is written and not yet wired — so the table carries it.
  "eliksir-sily": {
    co: "+2 Miecza na 1 turę",
    kiedy: null,
    rozpatruje: "stol",
  },
  "jablko-natchnienia": {
    co: "odejmij albo dodaj 1 do wyniku rzutu — jak wolisz",
    kiedy: "przed rzutem w Świątyni Bogini Nemed lub Świątyni Tolimana",
    rozpatruje: "stol",
  },
  "owoc-jarzebiny-wiedzy": {
    co: "ciągniesz o 1 Kartę więcej i odrzucasz tę, która ci nie odpowiada",
    kiedy: "przed ciągnięciem Kart Zdarzeń",
    rozpatruje: "stol",
  },
  "rozdzka-przeznaczenia": {
    co: "napotkany Wróg staje się Przyjacielem na jedną walkę i dodaje swoje punkty",
    kiedy: "przy napotkanym Wrogu",
    rozpatruje: "stol",
  },
  "zwierciadlo-zniszczenia": {
    co: "innej Postaci −2 Miecza lub Magii, albo −1 i −1 — tylko z jej własnych punktów",
    kiedy: null,
    rozpatruje: "stol",
  },
  /**
   * A die table the app cannot honestly throw.
   *
   * Three of its six faces are "dodaj N do wyniku rzutu w tej walce", and
   * nothing can carry a number into a fight roll yet. Encoding those faces as
   * `nic` so the app could roll would make it lie about half the card, which is
   * worse than handing the whole thing to the table.
   */
  "krysztal-losu": {
    co: "rzut kostką: 1 — tracisz 1 Życie; 2 — Kryształ niszczeje; 3 — nic; 4, 5, 6 — +1, +2, +3 do rzutu w tej walce",
    kiedy: "w walce",
    rozpatruje: "stol",
  },
  // "Bez względu na to, czy użyłeś Łodzi, czy też nie, odłóż tę Kartę."
  // Nothing else in the app discards these, so this is the only way one leaves
  // a pack it is doing nothing in.
  lodz: {
    co: "przeprawa przez Trzęsawiska na Obszar sąsiadujący z tym, z którego wyruszasz",
    kiedy: "w turze po znalezieniu",
    rozpatruje: "stol",
  },
  latarnia: {
    co: "przeprawa przez Lodowy Las na Obszar sąsiadujący z tym, z którego wchodzisz",
    kiedy: "w turze po znalezieniu",
    rozpatruje: "stol",
  },
};

/**
 * How this card is spent, or null when holding it is the whole of it.
 *
 * Not `useOf`, which reads better and which React's lint takes for a Hook
 * wherever it is called — including inside route handlers and journal
 * rendering, neither of which has ever seen a component.
 */
export function usageOf(cardId: string): Use | null {
  return USES[cardId as CardId] ?? null;
}

/**
 * The one word for all nine, on the button and in the journal.
 *
 * The cards each have their own idiom — a Szkatuła is opened, an Eliksir drunk,
 * a Jabłko eaten — and using them made the pack read like nine different
 * controls. It is one act, so it gets one word, and what the act actually is
 * stays where it belongs: in the question asked before it happens.
 */
export const USE_VERB = "użyj";
export const USE_VERB_PAST = "używa";

/** Whether this is a card you spend rather than one you keep. */
export function isUsable(cardId: string): boolean {
  return usageOf(cardId) !== null;
}

/**
 * The question asked before the card is spent.
 *
 * Built here rather than in the dialog so the words are the same wherever they
 * are shown, and so a test can read them.
 */
export function askAbout(name: string, use: Use): string {
  const when = use.kiedy ? ` Karta mówi: ${use.kiedy}.` : "";
  const who =
    use.rozpatruje === "aplikacja"
      ? " Aplikacja rzuci kostką i zastosuje wynik."
      : " Skutek rozpatrzcie sami.";
  return `${name}: ${use.co}. Karta przepada po użyciu.${when}${who}`;
}
