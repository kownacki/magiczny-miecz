/** When a Zaklęcie may be cast, at what, and what casting it does (9.1, 9.6). */
import type { CardId, SpellId } from "@/data/ids";

/**
 * The third card shape, and the one the app had nothing at all for.
 *
 * Thirty Zaklęcia could be drawn, held and concealed, and none of them could be
 * *cast* — the single largest hole in the referee. Two combat rules hang off
 * casting (17.3, 17.7), and 17.7 is the rule that decided this game could not
 * be played asynchronously in the first place.
 *
 * Timing is the load-bearing field here, the way disposition was for the event
 * cards. Almost every spell opens with a clause about when it may be spoken —
 * "na początku tury jego posiadacza", "przed wykonaniem ruchu", "w dowolnej
 * chwili" — and getting that wrong is not a cosmetic error: a Magiczna
 * Wędrówka cast after moving, or an Odmiana Losu cast before drawing, is a
 * different spell. So the app offers a spell only in the windows its own card
 * allows.
 */
export type SpellTiming =
  /** "w dowolnej chwili" — the largest group, and the reason 17.7 exists. */
  | "dowolna-chwila"
  /** "na początku tury jego posiadacza". */
  | "poczatek-tury"
  /** "przed wykonaniem ruchu". */
  | "przed-ruchem"
  /** Spent *instead of* moving, not merely before it. */
  | "zamiast-ruchu"
  /** "po zakończeniu ruchu". */
  | "po-ruchu"
  /** Before the dice of a fight (17.3). */
  | "przed-walka"
  /** During a fight, once the dice are known. */
  | "w-walce"
  /** On meeting another character or a Wróg. */
  | "spotkanie"
  /** "natychmiast po wzięciu Karty Zdarzenia". */
  | "po-karcie";

/** What a spell is aimed at. */
export type SpellTarget =
  | "siebie"
  | "postac"
  | "siebie-lub-postac"
  | "wrog"
  | "postac-lub-wrog"
  | "obszar"
  /** A face-up Karta Zdarzenia lying on the board. */
  | "karta-na-planszy"
  /** Another spell — the two that answer spells rather than characters. */
  | "zaklecie"
  | "brak";

export interface SpellScript {
  timing: readonly SpellTiming[];
  target: SpellTarget;
  /**
   * What the table has to do once the spell is spoken, in the words a player
   * acts on. Every spell has one: none of these are applied automatically, and
   * saying so is the point — see the note on `CAST_IS_ANNOUNCED` below.
   */
  effect: string;
  /**
   * Answers another spell rather than a character, and so must be castable
   * after the fact (9.6's "rzuconego bezpośrednio przed nim").
   */
  reactive?: boolean;
}

/**
 * Casting is announced, not applied.
 *
 * The app takes the card out of the caster's hand, puts it on the used pile,
 * writes it to the journal and tells the table what was cast at whom. What the
 * spell *does* is left to the players, because these are the most
 * interconnected cards in the box — Zwierciadło reflects whatever was just
 * cast, Władca Zaklęć negates it, Wojna Żywiołów switches every spell and
 * magic item off until the caster's next turn — and a referee that got one of
 * those subtly wrong would be worse than one that stayed out of it.
 *
 * The bookkeeping the app *does* own is the part tables actually lose track of:
 * whose hand it left, that it is gone, and that everyone was told.
 */
export const CAST_IS_ANNOUNCED = true;

export const SPELLS: Readonly<Partial<Record<SpellId, SpellScript>>> = {
  "kamien-filozoficzny": {
    timing: ["poczatek-tury"],
    target: "siebie",
    effect: "Odłóż dowolną liczbę swoich Przedmiotów, biorąc 1 Sz. Z. za każdy.",
  },
  "krag-plomieni": {
    timing: ["dowolna-chwila"],
    target: "postac-lub-wrog",
    effect:
      "Ofiara nie może nic zrobić poza Władcą Zaklęć. Nie można jej atakować, można się jej wymknąć.",
  },
  "magia-i-miecz": {
    timing: ["przed-walka"],
    target: "siebie",
    effect: "W tej jednej walce (nie magicznej) dodajesz Magię do Miecza.",
  },
  "magiczna-wedrowka": {
    timing: ["zamiast-ruchu"],
    target: "siebie",
    effect: "Przenieś się na dowolny Obszar w tym Kręgu. Nie działa na Kamiennym Moście.",
  },
  ocalony: {
    timing: ["dowolna-chwila", "w-walce"],
    target: "postac-lub-wrog",
    effect:
      "Postać nie traci punktu Życia; Przyjaciel lub Wróg nie ginie. Użyty w walce — remis.",
  },
  "odmiana-losu": {
    timing: ["po-karcie"],
    target: "siebie",
    effect: "Odrzuć jedną z wyciągniętych Kart i wyciągnij w zamian inną.",
  },
  odrodzenie: {
    timing: ["dowolna-chwila"],
    target: "siebie-lub-postac",
    effect: "Przywraca Życie do 4 punktów z początku gry.",
  },
  olsnienie: {
    timing: ["przed-ruchem"],
    target: "siebie",
    effect: "Obejrzyj w tajemnicy 5 pierwszych Kart Zdarzeń ze stosu.",
  },
  "pan-bogactwa": {
    timing: ["dowolna-chwila"],
    target: "postac",
    effect: "Zabierz ofierze 1 Przedmiot albo 1 Sztukę Złota.",
  },
  "pan-przyjaciol": {
    timing: ["dowolna-chwila"],
    target: "postac",
    effect: "Zabierz ofierze 1 Przyjaciela i dołącz go do swoich.",
  },
  "pan-trzesawisk": {
    timing: ["zamiast-ruchu"],
    target: "siebie-lub-postac",
    effect: "Przebądź Trzęsawiska w dowolnym miejscu, w obie strony.",
  },
  "powiew-smierci": {
    timing: ["spotkanie"],
    target: "postac-lub-wrog",
    effect:
      "Zabija Wroga (oprócz Demonów) bez walki; Postaci odbiera 2 punkty Życia. Napadnięty może się wymknąć.",
  },
  "siedem-wichrow": {
    timing: ["dowolna-chwila"],
    target: "postac",
    effect: "Rzuć kostką za każdy Przedmiot ofiary: 1 niszczy go. Tylko w tej samej Krainie.",
  },
  "siewca-spustoszenia": {
    timing: ["poczatek-tury", "po-ruchu"],
    target: "karta-na-planszy",
    effect: "Zdejmij z planszy jedną odkrytą Kartę Zdarzeń.",
  },
  szalenstwo: {
    timing: ["dowolna-chwila"],
    target: "postac",
    effect: "Wskaż ofiarę, potem obejrzyj jej Zaklęcia i zabierz jedno.",
  },
  "wladca-czarow": {
    timing: ["dowolna-chwila"],
    target: "postac",
    effect: "Ofiara traci wszystkie swoje Zaklęcia.",
  },
  "wladca-gromu": {
    timing: ["dowolna-chwila"],
    target: "obszar",
    effect:
      "Wszystkie istoty na Obszarze sparaliżowane: nie wolno ich atakować, można się wymknąć. Postacie tracą następną turę.",
  },
  "wladca-lodu": {
    timing: ["zamiast-ruchu"],
    target: "siebie-lub-postac",
    effect: "Przebądź Lodowy Las w dowolnym miejscu, w obie strony.",
  },
  "wladca-zaklec": {
    timing: ["dowolna-chwila"],
    target: "zaklecie",
    reactive: true,
    effect: "Neguje działanie Zaklęcia rzuconego bezpośrednio przed nim — każdego, bez wyjątku.",
  },
  "wladca-zdarzen": {
    timing: ["poczatek-tury", "po-ruchu"],
    target: "karta-na-planszy",
    effect:
      "Przenieś odkrytą Kartę Zdarzeń na inny, nie zajęty Obszar w tym samym Kręgu.",
  },
  "wojna-zywiolow": {
    timing: ["przed-ruchem"],
    target: "brak",
    effect:
      "Nikt, łącznie z tobą, nie używa Zaklęć ani Magicznych Przedmiotów do początku twojej następnej tury.",
  },
  zwierciadlo: {
    timing: ["dowolna-chwila"],
    target: "zaklecie",
    reactive: true,
    effect: "Odbija rzucone na ciebie Zaklęcie na tego, kto je rzucił.",
  },
  fatum: {
    timing: ["dowolna-chwila"],
    target: "postac",
    effect:
      "Ofiara rzuca kostką: 1 — Kamień; 2 — całe złoto; 3 — 1 Miecza; 4 — 1 Magii; 5 — zyskuje 1 Miecza lub Magii; 6 — zyskuje 1 Życie.",
  },
  "formula-czasu": {
    timing: ["przed-ruchem"],
    target: "siebie",
    effect:
      "Wykorzystujesz 3 kolejne tury zamiast jednej. Inni mogą tylko walczyć, jeśli ich zaatakujesz.",
  },
  "formula-przestrzeni": {
    timing: ["dowolna-chwila"],
    target: "siebie-lub-postac",
    effect: "Wynik rzutu na ruch mnożysz przez 2.",
  },
  golem: {
    timing: ["przed-ruchem"],
    target: "postac-lub-wrog",
    effect:
      "Golem (Miecz 3) atakuje cel w tym Kręgu. Przegrana ofiara traci 1 Życie; Wróg znika z planszy.",
  },
  homunculus: {
    timing: ["przed-ruchem"],
    target: "postac-lub-wrog",
    effect:
      "Homunculus (Miecz 5) atakuje cel w tym Kręgu. Przegrana ofiara traci 1 Życie; Wróg znika z planszy.",
  },
};

export function spellScript(cardId: string): SpellScript | null {
  return SPELLS[cardId as SpellId] ?? null;
}

/**
 * Whether a spell may be spoken in the situation the turn is currently in.
 *
 * "dowolna chwila" is deliberately permissive — a third of the pile says it,
 * and 17.7's reaction window depends on it holding during somebody else's
 * fight. A reactive spell is always allowed for the same reason: it exists to
 * answer something that has just happened.
 */
export function castableNow(script: SpellScript, moment: SpellTiming): boolean {
  if (script.reactive) return true;
  if (script.timing.includes("dowolna-chwila")) return true;
  return script.timing.includes(moment);
}

/** The window the turn is in, from its phase. */
export function momentOf(phase: string, hasMoved: boolean): SpellTiming {
  switch (phase) {
    case "rzut":
      return hasMoved ? "przed-ruchem" : "poczatek-tury";
    case "ruch":
      return "przed-ruchem";
    case "pole":
      return "po-ruchu";
    case "walka":
      return "przed-walka";
    default:
      return "dowolna-chwila";
  }
}

export const TIMING_LABEL: Record<SpellTiming, string> = {
  "dowolna-chwila": "w dowolnej chwili",
  "poczatek-tury": "na początku tury",
  "przed-ruchem": "przed ruchem",
  "zamiast-ruchu": "zamiast ruchu",
  "po-ruchu": "po ruchu",
  "przed-walka": "przed walką",
  "w-walce": "w walce",
  spotkanie: "przy spotkaniu",
  "po-karcie": "po wyciągnięciu Karty",
};

export const TARGET_LABEL: Record<SpellTarget, string> = {
  siebie: "na siebie",
  postac: "na Postać",
  "siebie-lub-postac": "na siebie lub Postać",
  wrog: "na Wroga",
  "postac-lub-wrog": "na Postać lub Wroga",
  obszar: "na Obszar",
  "karta-na-planszy": "na odkrytą Kartę",
  zaklecie: "na Zaklęcie",
  brak: "—",
};
