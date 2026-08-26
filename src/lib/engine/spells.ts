/** When a Zaklęcie may be cast, at what, and what casting it does (9.1, 9.6). */
import type { SpellId } from "@/data/ids";
import type { TurnPhase } from "./turn";

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
  /**
   * The three exceptions to `CAST_IS_ANNOUNCED`, marked in the data rather than
   * hidden in a branch somewhere.
   *
   * Both of these take *cards out of play*, and that is the whole reason they
   * are exceptions. Announcing them and leaving the table to it means nobody
   * puts the cards on the used pile — the app is the only thing here that knows
   * where the pile is — and 9.5 refills the deck from that pile. A card
   * announced and not collected is a card gone from the game.
   *
   * Nothing else is applied: what a Zwierciadło reflects or a Wojna Żywiołów
   * suspends stays the table's, exactly as before.
   */
  applies?:
    /** Władca Czarów: the victim's whole hand, "należy odłożyć ich Karty". */
    | "gasi-zaklecia"
    /** Siewca Spustoszenia: one face-up Karta Zdarzeń, off the board. */
    | "zdejmuje-karte";
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

/**
 * …with two exceptions, and they are exceptions for a reason that is not
 * "these ones were easy".
 *
 * Everything above is about *effects* the app would have to adjudicate. These
 * two are about *cards*, and cards are the app's own bookkeeping: where they
 * came from, which pile they go back to, and what 9.5 has left to reshuffle.
 * The Władca Czarów's own text ends "należy odłożyć ich Karty" — a table can
 * read that and do it, but the app is the only one here holding the pile, so
 * announcing and stepping back means the cards leave the game rather than the
 * deck. The Przesilenie says the same of every hand at once and is an event
 * card, so it goes through `strata` with the rest of them.
 */
export function appliedByTheApp(script: SpellScript | null): boolean {
  return script?.applies !== undefined;
}

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
    applies: "zdejmuje-karte",
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
    applies: "gasi-zaklecia",
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
export function castableNow(
  script: SpellScript,
  moment: SpellTiming | readonly SpellTiming[],
): boolean {
  if (script.reactive) return true;
  if (script.timing.includes("dowolna-chwila")) return true;
  const open = typeof moment === "string" ? [moment] : moment;
  return script.timing.some((when) => open.includes(when));
}

/**
 * What the turn is currently in the middle of.
 *
 * More than the phase, because the phase alone cannot tell four of these
 * windows apart. A fight before the dice and a fight after the first die are
 * both `walka` and are not the same moment — 17.3 puts the spells before the
 * roll, and a spell that changes a roll has to come after it. A field with a
 * card just turned over is `pole`, and so is a field with nothing left on it.
 *
 * This existed as `phase + hasMoved` and produced four of the nine windows;
 * `w-walce`, `po-karcie`, `spotkanie` and `zamiast-ruchu` could never happen,
 * so the spells timed to them were never castable at all. A spell that is never
 * castable is a spell that is not implemented.
 */
export interface TurnMoment {
  phase: string;
  /** A fight that has begun rolling is past the point 17.3 talks about. */
  diceRolled?: boolean;
  /** A Karta Zdarzeń turned over and not yet dealt with. */
  cardJustDrawn?: boolean;
  /** Another character on this field, or a Wróg standing on it. */
  meeting?: boolean;
}

/**
 * Every window a turn is in, read straight off its state.
 *
 * Taking a `TurnPhase` apart into the four facts `momentsOf` asks about used to
 * happen in the page component and nowhere else — so the server, which holds
 * the same turn state and is the only thing that can actually refuse a spell,
 * had no way to ask the question and did not ask it. 9.1 was enforced by a
 * disabled button, which is not enforcement.
 */
export function momentsIn(state: TurnPhase): SpellTiming[] {
  return momentsOf({
    phase: state.phase,
    diceRolled:
      state.phase === "walka" &&
      (state.fight.playerRoll !== null || state.fight.enemyRoll !== null),
    cardJustDrawn: state.phase === "pole" && state.drawn.length > 0,
    meeting:
      state.phase === "pole" && state.drawn.some((entry) => entry.cardClass === "wrog"),
  });
}

/** Every window the turn is in at once — a moment can be more than one. */
export function momentsOf(at: TurnMoment): SpellTiming[] {
  const now: SpellTiming[] = ["dowolna-chwila"];
  switch (at.phase) {
    case "rzut":
      // Nothing has happened yet: the start of the turn, and everything that
      // has to come before the move.
      now.push("poczatek-tury", "przed-ruchem", "zamiast-ruchu");
      break;
    case "ruch":
      now.push("przed-ruchem");
      break;
    case "pole":
      now.push("po-ruchu");
      if (at.cardJustDrawn) now.push("po-karcie");
      if (at.meeting) now.push("spotkanie", "przed-walka");
      break;
    case "walka":
      // Before the dice both windows are open; once one is thrown, 17.3 has
      // passed and only the spells that act on a roll are left.
      now.push(at.diceRolled ? "w-walce" : "przed-walka", "spotkanie");
      break;
  }
  return now;
}

/** The single window that best describes the moment, for labelling it. */
export function momentOf(at: TurnMoment): SpellTiming {
  const [, first] = momentsOf(at);
  return first ?? "dowolna-chwila";
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
