/** What a card does while you are holding it, as a typed vocabulary rather than prose to be re-read every time. */

import type { Nature } from "@/data/types";
import type { FieldId } from "./board";
import type { CardId } from "@/data/ids";

/**
 * Why this exists, and why it is not one big "effect" type.
 *
 * Reading the corpus, cards fall into three quite different shapes. A Spotkanie
 * happens once and is gone. A Miejsce sits on a field and offers something to
 * whoever arrives. And a Przedmiot or Przyjaciel is a *standing rule* that
 * changes how the other rules evaluate — "nie musisz wykonywać rzutów kostką w
 * Wieży Przeznaczenia", "nie będziesz musiał płacić 1 Sztuki Złota za
 * Przeprawę", "Koń może nieść 8 twoich Przedmiotów".
 *
 * Only the third shape is modelled here, because only the third shape is
 * something the engine has to consult while resolving something else. Trying to
 * cover all three with one union produced a type where most cases were
 * meaningless in most contexts.
 *
 * The vocabulary below was derived from the printed text, not invented: every
 * variant is there because at least one card needs it, and the parameters are
 * the ones the cards actually vary. Hełm, Tarcza and Zbroja differ only in how
 * high a roll saves you, so they are one variant with a number.
 */
/**
 * What an escape is being attempted *from* (19.1, 19.2).
 *
 * The rulebook keeps these apart and so must the code: 19.2 permits fleeing
 * "każdą istotą (lub Postacią)", but the two are reached by different means.
 * Every printed ability covers Wrogowie only; a Postać is the Krąg Płomieni's
 * business, and on the Kamienny Most 19.3 allows nothing else.
 */
export type EscapeTarget = "wrog" | "postac";

export type Ability =
  /**
   * Points a held card lends its owner (1.5, 2.5).
   *
   * `tylkoWalka` is the difference between the two figures the rulebook quotes
   * for the same character. Its worked example under 1.5 gives the Troll a
   * "parametr Miecza równy 8" and "podczas walki 11 punktom" — the Miecz card
   * and the Krzyżowiec count in a fight and nowhere else, and the printed text
   * says so in as many words ("podczas walki", "podczas każdej walki").
   *
   * It matters off the battlefield too: 14.5 has the Pułapka subtract "wartość
   * swojego parametru Miecza", which is the 8.
   */
  | { kind: "punkty"; miecz?: number; magia?: number; tylkoWalka?: true }
  /**
   * A save against the point of Życie a lost fight costs: Hełm on a 1, Tarcza on
   * 1-2, Zbroja on 1-3. The fight is still lost either way.
   */
  | { kind: "oslona"; upTo: number }
  /**
   * The Kryształ Magów: its owner "nie może rzucać ani używać Zaklęć" and is
   * "całkowicie odporny" to the six named ones, and an opponent may not use
   * Odrodzenie against them.
   *
   * Both halves of one bargain, so both live on one ability: give up magic
   * entirely and nothing magical touches you.
   */
  | { kind: "bez-zaklec"; odpornyNa: readonly string[]; przeciwnikBez: readonly string[] }
  /**
   * Passes a named field without what it normally does to you. `rzut` skips a
   * field's die roll entirely (Opiekun, Przewodnik); `life` keeps the point it
   * would cost (Rękawice on Ruchome Skały); `utrata` keeps the Przedmiot or
   * Przyjaciel it would take (Kij i Sznur on Bagna).
   */
  | {
      kind: "bezpieczny";
      fields: readonly FieldId[];
      from: "rzut" | "life" | "utrata";
      /**
       * Some protections are conditional on who is holding them: the Relikwiarz
       * spares a Dobra Postać at the Czarci Młyn and a Zła one at the Studnia
       * Wieczności, and nobody at the other. Without this the card would have to
       * be encoded as sparing everyone at both fields, or not at all.
       */
      natura?: readonly Nature[];
    }
  /**
   * Reliably slips away on named fields (Elf, Hobgoblin, Obbol, Elflin, Rusałka).
   *
   * `przed` is *what* may be fled, and it defaults to Wrogowie because every
   * card that grants this says so in as many words — "możesz wymykać się
   * **Wrogom** na Równinach". 19.1 and 19.2 both also allow fleeing another
   * Postać, and nothing printed on a character or a friend does it: that is the
   * Krąg Płomieni's alone. Without this the check could not tell the two apart,
   * and an Elf standing on a Równina escaped a duel on the strength of an
   * ability about monsters.
   */
  | { kind: "ucieczka"; fields: readonly FieldId[]; przed?: readonly EscapeTarget[] }
  /**
   * Raises the four-Przedmiot limit of 5.4 by a stated amount — Koń eight, Muł
   * and Tragarz four apiece, Magiczna Sakwa five. Only the Zaprzęg is actually
   * unbounded ("możesz przewozić dowolną liczbę Przedmiotów"), which is why
   * that is a separate value rather than a very large number.
   */
  | { kind: "udzwig"; items: number | "bez-limitu" }
  /** Zaprzęg adds one to the movement roll; Wierzchowiec one to three. */
  | { kind: "ruch-bonus"; min: number; max: number }
  /** Bojowy Rumak: "do punktów Miecza możesz dodać swoje punkty Magii". */
  | { kind: "magia-do-miecza" }
  /**
   * Dies in your place rather than you losing the point — the Bojowy Rumak
   * whenever you are beaten, the Giermek on a roll of one.
   *
   * `onlyWhenRaiding` is the Poszukiwacz Przygód, who is different in kind: he
   * dies only on the raid *he* was sent out on, not in your own fights. Without
   * the flag the engine would offer his life every time anyone lost anything,
   * which is a good deal more friend than the card describes.
   */
  | { kind: "ginie-zamiast-ciebie"; onRollUpTo?: number; onlyWhenRaiding?: boolean }
  /** A key rather than a bonus: no Magiczny Miecz, no Kamienny Most. */
  | { kind: "wymagany"; place: "most" | "zamek-bestii" }
  /**
   * Passes a field's toll without paying it. The Przewoźnik waives the
   * ferryman's Sztuka Złota; the Karzeł walks past the Strażnik Magicznych Wrót
   * without buying his way through. One shape, two tolls.
   */
  | { kind: "bez-oplaty"; fields: readonly FieldId[] }
  /** Cards this character may not hold at all — the Pustelnik bears no blade. */
  | { kind: "zakazane"; cardIds: readonly string[] }
  /**
   * Shifts a die roll, either at named fields or in a kind of fight.
   *
   * Seven cards want this and they vary along exactly two axes: what the roll is
   * for, and by how much. The Talizman Ognia adds one in an ordinary fight and
   * the Talizman Powietrza in a magical one; the Gliniana Tabliczka takes two
   * off the Pułapka. The Jabłko Natchnienia is the odd one that lets the holder
   * choose the sign, and is eaten in the using.
   */
  | {
      kind: "modyfikator-rzutu";
      gdzie:
        | { na: "pola"; fields: readonly FieldId[] }
        | { na: "walke"; rodzaj: "ordinary" | "magical" };
      delta: number;
      /** "odjąć lub dodać 1 ... jeśli taka jest wola gracza" — the holder picks. */
      dowolnyZnak?: boolean;
      /** "Karta Jabłka może być wykorzystana tylko raz". */
      jednorazowy?: boolean;
    }
  /**
   * Raises the spell limit of 2.6 by a stated amount, exactly as `udzwig` raises
   * the item limit of 5.4. Only the Różdżka Zaklęć does it.
   */
  | { kind: "zaklecia-ponad-limit"; count: number }
  /** Rusałka: one die at the Trzęsawiska instead of the usual two. */
  | { kind: "przeprawa-kostki"; obstacle: "trzesawiska"; dice: number }
  /**
   * A Lichwiarz you carry with you: the Alchemik turns any Przedmiot into gold,
   * one for one, wherever the character happens to be standing.
   *
   * Same shape as the Gród's desk, and deliberately so — "proces ten jest
   * nieodwracalny" is exactly what selling a card means, and there is no reason
   * for the app to have two ways of doing it.
   */
  | { kind: "skup"; cena: number }
  /**
   * Łódź and Latarnia: cross anywhere rather than only at the two legal places
   * (11.2, 11.6). Both are consumed whether or not they are used.
   */
  | { kind: "przeprawa-wszedzie"; obstacle: "trzesawiska" | "lodowy-las" }
  /** Księżniczka at the Zamek, Władca at the Twierdza: up to two Życia a visit. */
  | { kind: "uzdrowienie"; field: FieldId; upTo: number }
  /** Rycerz fights in your place, with his own points and none of your things. */
  | { kind: "walczy-za-ciebie"; miecz: number; magia: number }
  /** The Magiczny Miecz cannot be picked up in the lower ring. */
  | { kind: "niedostepny"; region: "dolny" }
  /**
   * May change Natura at will, rather than only when something changes it.
   *
   * 7.2 describes what happens *when* a Nature changes, not a choice anybody
   * gets to make: cards change it. Magog is the exception, and this is what
   * separates the one character who may reach for it from the twenty-six who
   * may not — so that in simulation the control can exist for him and for
   * nobody else, instead of being a hand-editing button for everyone.
   *
   * Still bounded by 7.3: once per turn.
   */
  | { kind: "natura-dowolna" }
  /**
   * Only these Natures may possess the card (5.3).
   *
   * A requirement rather than a bonus, and the only one the base game states.
   * It was being read out of the card's prose by regex, which looked for
   * "jedynie" and "tylko" — and every card that has this restriction phrases it
   * the other way round, as a prohibition: "Włóczni nie mogą posiadać Złe
   * Postacie". So the search found nothing on all three of them and 5.3 went
   * unenforced on exactly the cards it exists for.
   *
   * Stated as who MAY hold it rather than who may not, because that is the
   * shorter list on all three and the one a player wants read out.
   */
  | { kind: "tylko-natura"; natury: readonly Nature[] }
  /**
   * Beats a whole class of enemy without fighting it at all.
   *
   * "Postać mająca Relikwiarz pokonuje wszystkie Demony, bez konieczności walki
   * z nimi." Not a combat bonus — no dice are thrown — so `punkty` and
   * `modyfikator-rzutu` both say the wrong thing about it.
   */
  | { kind: "pokonuje-bez-walki"; kogo: "demony" }
  /**
   * A different bonus against particular enemies.
   *
   * Arondight and the Topór both add one point of Miecz, "a w walce z
   * Wilkołakiem - 2 punkty" — so this REPLACES the standing bonus against the
   * named foe rather than stacking with it. Two points in total, not three.
   *
   * `modyfikator-rzutu` cannot say this: its `gdzie` knows fields and the kind
   * of fight, never who is being fought.
   */
  | { kind: "przeciw"; komu: readonly string[]; miecz?: number; magia?: number };

/**
 * Rules the typed vocabulary cannot hold, written out instead.
 *
 * Same bargain `CHARACTER_NOTES` makes, for the same reason: the app says what
 * a card does either way, and is honest about which half it is enforcing. A
 * rule stated here is one the players apply themselves.
 *
 * The point of writing them at all is that the scan stops being load-bearing.
 * A fresh checkout has no card pictures, and a player should still be able to
 * read what they are holding.
 */
export const CARD_NOTES: Readonly<Partial<Record<CardId, readonly string[]>>> = {
  excalibur: ["po każdej wygranej walce zabierasz pokonanemu 1 punkt Życia"],
  "czarodziejska-kosc": ["+1 Miecza lub Magii w Pułapce i Magicznej Pułapce — wybierasz"],
  "poszukiwacz-przygod": ["atakuje Postać lub Wroga do 3 Obszarów stąd, po twoim ruchu"],
  "diament-krolow": [
    "sprzedasz w Zamku za 5 Sz. Z.",
    "przegraną walkę z Postacią płacisz Diamentem, nie punktem Życia",
  ],
  "tajemna-sakwa": [
    "1 Przedmiot włożony do Sakwy jest nie do odebrania — zabierze go tylko Pan Bogactwa",
  ],
  "eliksir-sily": ["+2 Miecza na 1 turę, potem odłóż Kartę"],
  "krysztal-losu": [
    "w walce rzut: 1 — tracisz 1 Życie; 2 — Kryształ niszczeje; 3 — nic; 4, 5, 6 — +1, +2, +3 do rzutu w tej walce",
  ],
  "owoc-jarzebiny-wiedzy": [
    "przed ciągnięciem Kart: ciągniesz o 1 więcej i odrzucasz jedną; raz",
  ],
  "rozdzka-przeznaczenia": [
    "napotkany Wróg staje się Przyjacielem na jedną walkę i dodaje swoje punkty; potem odłóż",
  ],
  "zwierciadlo-zniszczenia": [
    "innej Postaci −2 Miecza lub Magii, albo −1 i −1 — tylko z jej własnych punktów; raz",
  ],
};

/**
 * Which cards have which standing rules.
 *
 * Keyed by card id, so all four printed Magiczne Miecze share one entry — they
 * are the same card and the deck holds four of them on purpose.
 *
 * Absence is not an error and never blocks play. A card with no entry keeps
 * working exactly as it did before this file existed: its text is shown and the
 * players apply it. That is the same progressive-enhancement bargain the rest of
 * the card data makes.
 */
export const ABILITIES: Readonly<Partial<Record<CardId, readonly Ability[]>>> = {
  // --- equipment ------------------------------------------------------------
  // "Miecz podczas walki dodaje właścicielowi 1 punkt Miecza."
  miecz: [{ kind: "punkty", miecz: 1, tylkoWalka: true }],
  // "Sztylet podczas walki dodaje właścicielowi 1 punkt Miecza."
  sztylet: [{ kind: "punkty", miecz: 1, tylkoWalka: true }],
  helm: [{ kind: "oslona", upTo: 1 }],
  tarcza: [{ kind: "oslona", upTo: 2 }],
  zbroja: [{ kind: "oslona", upTo: 3 }],
  rekawice: [
    { kind: "bezpieczny", fields: ["ruchome-skaly-1", "ruchome-skaly-2"], from: "life" },
  ],
  "kij-i-sznur": [
    { kind: "bezpieczny", fields: ["bagna-1", "bagna-2"], from: "utrata" },
  ],
  kon: [{ kind: "udzwig", items: 8 }],
  mul: [{ kind: "udzwig", items: 4 }],
  zaprzeg: [
    { kind: "udzwig", items: "bez-limitu" },
    { kind: "ruch-bonus", min: 1, max: 1 },
  ],
  wierzchowiec: [{ kind: "ruch-bonus", min: 1, max: 3 }],
  "magiczna-sakwa": [{ kind: "udzwig", items: 5 }],
  // "Właściciel Kryształu nie może rzucać ani używać Zaklęć. Jest całkowicie
  // odporny na Zaklęcia: Krąg Płomieni, Fatum, Magia i Miecz, Golem, Pan
  // Bogactwa i Pan Przyjaciół. Przeciwnik właściciela Kryształu nie może
  // walcząc z nim użyć Zaklęcia Odrodzenie."
  "krysztal-magow": [
    {
      kind: "bez-zaklec",
      odpornyNa: [
        "krag-plomieni",
        "fatum",
        "magia-i-miecz",
        "golem",
        "pan-bogactwa",
        "pan-przyjaciol",
      ],
      przeciwnikBez: ["odrodzenie"],
    },
  ],
  "bojowy-rumak": [{ kind: "magia-do-miecza" }, { kind: "ginie-zamiast-ciebie" }],
  lodz: [{ kind: "przeprawa-wszedzie", obstacle: "trzesawiska" }],
  latarnia: [{ kind: "przeprawa-wszedzie", obstacle: "lodowy-las" }],
  "magiczny-miecz": [
    { kind: "wymagany", place: "most" },
    { kind: "niedostepny", region: "dolny" },
  ],
  "tarcza-tolimana": [{ kind: "wymagany", place: "zamek-bestii" }],

  // --- magic items ----------------------------------------------------------
  //
  // Several of these print an ownership restriction as well — the Miecz Chaosu
  // is closed to a Dobra Postać, the Graal and the Włócznia to a Zła one, the
  // Topór to a Chaotyczna. There is no variant for "who may hold this", so that
  // line stays on the card where the players can read it; what is encoded here
  // is only what the card does once it is held.
  //
  // The Arondight and the Topór print a second line too: two points of Miecza
  // rather than one when the fight is against a Wilkołak. The bonus below is
  // the one that applies in every other fight; the exception is left to the
  // text rather than half-encoded.
  arondight: [
    { kind: "punkty", miecz: 1 },
    { kind: "przeciw", komu: ["wilkolak"], miecz: 2 },
  ],
  // "nie może być w posiadaniu Chaotycznych Postaci" — a 5.3 restriction the
  // prose-reading version never found, because it is phrased differently again.
  "topor-swiatla-i-ciemnosci": [
    { kind: "tylko-natura", natury: ["good", "evil"] },
    { kind: "punkty", miecz: 1 },
    { kind: "przeciw", komu: ["wilkolak"], miecz: 2 },
  ],
  /** Excalibur also takes a point of Życie off each beaten opponent — not encodable. */
  excalibur: [{ kind: "punkty", miecz: 1 }],
  // "Włóczni nie mogą posiadać Złe Postacie."
  "swieta-wlocznia": [
    { kind: "tylko-natura", natury: ["good", "chaotic"] },
    { kind: "punkty", miecz: 1 },
  ],
  // "Miecza Chaosu nie może posiadać Dobra Postać."
  "miecz-chaosu": [
    { kind: "tylko-natura", natury: ["evil", "chaotic"] },
    { kind: "punkty", miecz: 2 },
  ],
  "pierscien-mocy": [{ kind: "punkty", magia: 2 }],
  "srebrna-strzala": [{ kind: "punkty", miecz: 1, magia: 1 }],
  /** "zyskuje 1 punkt Magii i nie traci 1 Życia przechodząc przez Ruchome Skały" — the second half is the Rękawice's rule. */
  // "Graala nie może posiadać Zła Postać."
  "swiety-graal": [
    { kind: "tylko-natura", natury: ["good", "chaotic"] },
    { kind: "punkty", magia: 1 },
    { kind: "bezpieczny", fields: ["ruchome-skaly-1", "ruchome-skaly-2"], from: "life" },
  ],
  /** The same key as the Tarcza Tolimana, printed again on the Zdarzenia sheets. */
  "tarcza-boga-tolimana": [{ kind: "wymagany", place: "zamek-bestii" }],
  "gliniana-tabliczka": [
    { kind: "modyfikator-rzutu", gdzie: { na: "pola", fields: ["pulapka"] }, delta: -2 },
  ],
  "magiczny-manuskrypt": [
    {
      kind: "modyfikator-rzutu",
      gdzie: { na: "pola", fields: ["magiczna-pulapka"] },
      delta: -2,
    },
  ],
  // Only the second half of the Kość fits a kind. Its first half — a point of
  // Miecza or Magii in the two Pułapki, chosen by the player — is written out
  // in CARD_NOTES instead of being left on the card.
  "czarodziejska-kosc": [
    {
      kind: "modyfikator-rzutu",
      gdzie: {
        na: "pola",
        fields: [
          "wejscie-na-most-a",
          "gra-ze-smiercia",
          "demon-zaglady",
          "zamek-bestii",
          "monstrum",
          "cerber",
          "wejscie-na-most-b",
        ],
      },
      delta: 1,
    },
  ],
  /** The immunity to Krąg Płomieni is a spell rule, and stays on the card. */
  "talizman-ognia": [
    { kind: "modyfikator-rzutu", gdzie: { na: "walke", rodzaj: "ordinary" }, delta: 1 },
  ],
  /** Likewise its immunity to Siedem Wichrów and Władca Gromu. */
  "talizman-powietrza": [
    { kind: "modyfikator-rzutu", gdzie: { na: "walke", rodzaj: "magical" }, delta: 1 },
  ],
  "jablko-natchnienia": [
    {
      kind: "modyfikator-rzutu",
      gdzie: {
        na: "pola",
        fields: ["swiatynia-bogini-nemed", "swiatynia-tolimana"],
      },
      delta: 1,
      dowolnyZnak: true,
      jednorazowy: true,
    },
  ],
  // Two protections in one card, each for the opposite Natura. The third
  // clause — beating every Demon without a fight — has no variant and stays on
  // the card.
  relikwiarz: [
    { kind: "bezpieczny", fields: ["czarci-mlyn"], from: "life", natura: ["good"] },
    { kind: "bezpieczny", fields: ["studnia-wiecznosci"], from: "life", natura: ["evil"] },
    // "pokonuje wszystkie Demony, bez konieczności walki z nimi" — the third of
    // its three rules, and the only one the card was not carrying.
    { kind: "pokonuje-bez-walki", kogo: "demony" },
  ],
  "rozdzka-zaklec": [{ kind: "zaklecia-ponad-limit", count: 1 }],

  // --- friends --------------------------------------------------------------
  // "1 Przedmiot zamienia się w 1 Sztukę cennego kruszcu."
  alchemik: [{ kind: "skup", cena: 1 }],
  pasterz: [{ kind: "punkty", miecz: 1, magia: 1 }],
  strzyga: [{ kind: "punkty", magia: 1 }],
  chochlik: [{ kind: "punkty", magia: 2 }],
  giermek: [
    // "będzie dodawał ci 2 punkty Miecza podczas każdej walki".
    { kind: "punkty", miecz: 2, tylkoWalka: true },
    { kind: "ginie-zamiast-ciebie", onRollUpTo: 1 },
  ],
  // "będzie dodawał ci 2 punkty Miecza podczas każdej walki" — and the 1.5
  // example counts him only in the fight figure.
  krzyzowiec: [{ kind: "punkty", miecz: 2, tylkoWalka: true }],
  tragarz: [{ kind: "udzwig", items: 4 }],
  przewoznika: [{ kind: "bez-oplaty", fields: ["przeprawa-1", "przeprawa-2"] }],
  rycerz: [{ kind: "walczy-za-ciebie", miecz: 3, magia: 3 }],
  /**
   * Deliberately no `punkty`: the Poszukiwacz "posiada 3 punkty Miecza" of his
   * own and spends them on the raid you send him on, unlike the Giermek and the
   * Krzyżowiec who "dodają ci" theirs. And no `walczy-za-ciebie` either — he
   * does not stand in for you in your fights, he goes out up to three Obszary
   * and attacks something, which nothing here can say. What is left, and what
   * the printed text is unambiguous about, is that his failure costs him rather
   * than you.
   */
  "poszukiwacz-przygod": [
    // "posiada 3 punkty Miecza" — the strength it raids with, which nothing said.
    { kind: "walczy-za-ciebie", miecz: 3, magia: 0 },
    { kind: "ginie-zamiast-ciebie", onlyWhenRaiding: true },
  ],
  opiekun: [
    { kind: "bezpieczny", fields: ["wieza-przeznaczenia", "urwisko-1", "urwisko-2"], from: "rzut" },
  ],
  przewodnik: [
    {
      kind: "bezpieczny",
      fields: ["krag-mocy", "wilczy-parow", "krypta-upiorow"],
      from: "rzut",
    },
  ],
  elflin: [
    { kind: "bezpieczny", fields: ["urwisko-1", "urwisko-2"], from: "rzut" },
    {
      kind: "ucieczka",
      fields: ["bezdroza", "wrzosowiska", "rownina-samotnych-skal", "kamienny-las"],
    },
  ],
  rusalka: [
    { kind: "bezpieczny", fields: ["kurhan"], from: "rzut" },
    { kind: "ucieczka", fields: ["mokradla-1", "mokradla-2", "las-blednych-ogni"] },
    { kind: "przeprawa-kostki", obstacle: "trzesawiska", dice: 1 },
  ],
  ksiezniczka: [{ kind: "uzdrowienie", field: "zamek", upTo: 2 }],
  wladca: [{ kind: "uzdrowienie", field: "twierdza-strzegaca-drog", upTo: 2 }],
};

export function abilitiesOf(cardId: string): readonly Ability[] {
  // The registry's *keys* are checked — a typo in one of the ~250 card names
  // above is a compile error, which is the whole point. The lookup itself takes
  // a plain string on purpose: it is fed card ids that came off the wire or out
  // of the database, and its contract is already "nothing, if I do not know it".
  // Narrowing every caller instead would move a runtime miss into a runtime
  // miss with more ceremony.
  return ABILITIES[cardId as CardId] ?? [];
}

/** Every standing rule a seat is currently holding. */
export function heldAbilities(cardIds: readonly string[]): Ability[] {
  return cardIds.flatMap((cardId) => abilitiesOf(cardId));
}

/**
 * Whether a field's die roll can simply be skipped.
 *
 * Deliberately narrow: this answers only "does the roll happen", never "what
 * would it have given". A character with the Opiekun walks past the Wieża
 * Przeznaczenia; it does not roll and then ignore the result, because some of
 * those tables do things a skipped roll should not do.
 */
export function skipsRollAt(abilities: readonly Ability[], fieldId: FieldId): boolean {
  return abilities.some(
    (ability) =>
      ability.kind === "bezpieczny" &&
      ability.from === "rzut" &&
      ability.fields.includes(fieldId),
  );
}

/** Whether a field's automatic cost is waived — the point, or the thing taken. */
export function isSpared(
  abilities: readonly Ability[],
  fieldId: FieldId,
  from: "life" | "utrata",
  /** The holder's Natura, for the protections that depend on it. */
  natura?: Nature | null,
): boolean {
  return abilities.some(
    (ability) =>
      ability.kind === "bezpieczny" &&
      ability.from === from &&
      ability.fields.includes(fieldId) &&
      (!ability.natura || (natura != null && ability.natura.includes(natura))),
  );
}

/**
 * How much a character may shift a die roll here.
 *
 * Returns the total and whether the holder may choose its sign. Modifiers add:
 * nothing in the texts says two of them cannot apply at once, and the two
 * Talizmany are for different kinds of fight anyway.
 */
export function rollModifier(
  abilities: readonly Ability[],
  at: { fieldId?: FieldId; walka?: "ordinary" | "magical" },
): { delta: number; dowolnyZnak: boolean } {
  let delta = 0;
  let dowolnyZnak = false;
  for (const ability of abilities) {
    if (ability.kind !== "modyfikator-rzutu") continue;
    const applies =
      ability.gdzie.na === "pola"
        ? at.fieldId !== undefined && ability.gdzie.fields.includes(at.fieldId)
        : at.walka !== undefined && ability.gdzie.rodzaj === at.walka;
    if (!applies) continue;
    delta += ability.delta;
    if (ability.dowolnyZnak) dowolnyZnak = true;
  }
  return { delta, dowolnyZnak };
}

/** Extra Zaklęcia allowed over the limit rule 2.6 sets from Magia. */
export function spellsOverLimit(abilities: readonly Ability[]): number {
  return abilities.reduce(
    (extra, ability) =>
      ability.kind === "zaklecia-ponad-limit" ? extra + ability.count : extra,
    0,
  );
}

/**
 * Whether a Charakterystyka or a held card gets you away from this, here (19.1).
 *
 * Two questions, not one. The field has to be named — every escape in the game
 * is bound to particular ground, and the Obbol who slips Wrogom on the Mokradła
 * fights them everywhere else. And what is being fled has to match: `przed`
 * defaults to a Wróg because that is what all of them say.
 */
export function canEscapeAt(
  abilities: readonly Ability[],
  fieldId: FieldId,
  przed: EscapeTarget = "wrog",
): boolean {
  return abilities.some(
    (ability) =>
      ability.kind === "ucieczka" &&
      ability.fields.includes(fieldId) &&
      (ability.przed ?? WROGOWIE_ONLY).includes(przed),
  );
}

/** What a printed escape covers when its card does not say otherwise. */
const WROGOWIE_ONLY: readonly EscapeTarget[] = ["wrog"];

/** Whether this character walks past the toll charged on a given field. */
export function tollIsWaived(abilities: readonly Ability[], fieldId: FieldId): boolean {
  return abilities.some(
    (ability) => ability.kind === "bez-oplaty" && ability.fields.includes(fieldId),
  );
}

/** Cards this character may never hold (its own Charakterystyka, 8.1). */
export function isForbidden(abilities: readonly Ability[], cardId: string): boolean {
  return abilities.some(
    (ability) => ability.kind === "zakazane" && ability.cardIds.includes(cardId),
  );
}

/**
 * How many dice this character throws at a crossing.
 *
 * Rusałka's whole point is that she halves the odds — one die against your
 * Magia instead of two — so this is asked rather than assumed wherever the
 * Trzęsawiska are rolled for.
 */
export function crossingDice(
  abilities: readonly Ability[],
  obstacle: string,
  fallback: number,
): number {
  const aid = abilities.find(
    (ability) => ability.kind === "przeprawa-kostki" && ability.obstacle === obstacle,
  );
  return aid && aid.kind === "przeprawa-kostki" ? aid.dice : fallback;
}

/**
 * How many Przedmioty may be carried, over rule 5.4's four.
 *
 * The bonuses add up: nothing in any of these texts says a character may not
 * lead a Koń and employ a Tragarz at once, and each states its own capacity.
 *
 * That capacity is the point. The engine used to read 5.4's "unless the
 * character has transport" as *unlimited* for any of them, which is far more
 * generous than what the cards say — the Koń carries eight, the Muł and the
 * Tragarz four each. Only the Zaprzęg is truly unbounded.
 */
/**
 * The best save a character has against the point of Życie a lost fight costs
 * (17.4: "może temu zapobiec użycie Przedmiotu lub Zaklęcia").
 *
 * The three cards that grant it are cumulative in reach rather than in number —
 * a Hełm saves on a 1, a Tarcza on 1-2, a Zbroja on 1-3 — so wearing all three
 * is one roll against the widest of them, not three rolls. Returns 0 when there
 * is nothing to roll for.
 */
/** Whether this character has given up magic entirely (Kryształ Magów). */
export function cannotUseSpells(abilities: readonly Ability[]): boolean {
  return abilities.some((ability) => ability.kind === "bez-zaklec");
}

/** Spells this character is immune to, and spells an opponent may not use on it. */
export function spellWards(abilities: readonly Ability[]): {
  immune: Set<string>;
  deniedToOpponent: Set<string>;
} {
  const immune = new Set<string>();
  const deniedToOpponent = new Set<string>();
  for (const ability of abilities) {
    if (ability.kind !== "bez-zaklec") continue;
    for (const id of ability.odpornyNa) immune.add(id);
    for (const id of ability.przeciwnikBez) deniedToOpponent.add(id);
  }
  return { immune, deniedToOpponent };
}

export function bestShield(abilities: readonly Ability[]): number {
  let best = 0;
  for (const ability of abilities) {
    if (ability.kind === "oslona" && ability.upTo > best) best = ability.upTo;
  }
  return best;
}

export function carryLimit(abilities: readonly Ability[], base: number): number {
  let limit = base;
  for (const ability of abilities) {
    if (ability.kind !== "udzwig") continue;
    if (ability.items === "bez-limitu") return Infinity;
    limit += ability.items;
  }
  return limit;
}

/** The most a Wierzchowiec or Zaprzęg may add to a movement roll. */
export function moveBonusRange(
  abilities: readonly Ability[],
): { min: number; max: number } | null {
  const bonuses = abilities.filter((a) => a.kind === "ruch-bonus");
  if (bonuses.length === 0) return null;
  return {
    min: Math.min(...bonuses.map((a) => (a.kind === "ruch-bonus" ? a.min : 0))),
    max: bonuses.reduce((sum, a) => sum + (a.kind === "ruch-bonus" ? a.max : 0), 0),
  };
}

export function opensTheWayTo(
  abilities: readonly Ability[],
  place: "most" | "zamek-bestii",
): boolean {
  return abilities.some((ability) => ability.kind === "wymagany" && ability.place === place);
}

/* --------------------------------------------------------------------------
 * Przyjaciele (6.1-6.4), and the two things a friend does that no item does.
 *
 * The rulebook's own chapter on friends is about custody only — how you gain
 * one, that it lies face up, that you may hold any number, and how you lose
 * one. It never says a friend fights, adds points, or takes a hit for you.
 * Every one of those is printed on the individual card, which is why they are
 * read here off the ability registry rather than out of a numbered rule.
 * ----------------------------------------------------------------------- */

/**
 * The friend who fights in your place, with its own points (Rycerz).
 *
 * "Rycerz będzie walczył zamiast ciebie w każdej walce (również magicznej). Nie
 * może jednak używać twoich Zaklęć ani Przedmiotów." So this REPLACES the
 * character's combat figure rather than adding to it — the whole of it, own
 * points included, because the Rycerz is the one swinging.
 *
 * Null when nobody is standing in, which is the ordinary case.
 */
export function fightsForYou(
  abilities: readonly Ability[],
): { miecz: number; magia: number } | null {
  const stand = abilities.find((ability) => ability.kind === "walczy-za-ciebie");
  return stand && stand.kind === "walczy-za-ciebie"
    ? { miecz: stand.miecz, magia: stand.magia }
    : null;
}

/** Bojowy Rumak: "do punktów Miecza możesz dodać swoje punkty Magii". */
export function addsMagiaToMiecz(abilities: readonly Ability[]): boolean {
  return abilities.some((ability) => ability.kind === "magia-do-miecza");
}

/**
 * Who will die rather than let you lose the point of Życie, in the order asked.
 *
 * Two cards do this and they are not the same offer. The Bojowy Rumak is
 * certain — "Jeżeli zostaniesz pokonany zginie tylko twój Rumak, ty zaś nie
 * utracisz punktu Życia" — while the Giermek is a one-in-six: "rzuć kostką.
 * Wynik równy 1 oznacza, że zginął Giermek, ty zaś nie utraciłeś punktu."
 *
 * The rolled ones are offered first, and that ordering is a real decision
 * rather than an accident of iteration. Neither card is optional, so holding
 * both means one of them dies whatever happens; asking the Giermek first is the
 * literal reading of its trigger (the point is not yet saved when it rolls) and
 * it is the only order under which the Giermek can ever be the one to go.
 *
 * `raiding` is the Poszukiwacz Przygód, who is different in kind: he is spent
 * on the raid you send him out on and stands in for nothing at home. Without
 * the flag he would offer his life every time you lost a fight of your own.
 */
export function diesForYou(
  cardIds: readonly string[],
  { raiding = false }: { raiding?: boolean } = {},
): { cardId: string; onRollUpTo?: number }[] {
  const offers: { cardId: string; onRollUpTo?: number }[] = [];
  for (const cardId of cardIds) {
    for (const ability of abilitiesOf(cardId)) {
      if (ability.kind !== "ginie-zamiast-ciebie") continue;
      // A raider dies only on his own raid, and everyone else only off it.
      if ((ability.onlyWhenRaiding ?? false) !== raiding) continue;
      offers.push({ cardId, onRollUpTo: ability.onRollUpTo });
    }
  }
  return [
    ...offers.filter((offer) => offer.onRollUpTo !== undefined),
    ...offers.filter((offer) => offer.onRollUpTo === undefined),
  ];
}
