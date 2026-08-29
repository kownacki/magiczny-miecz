/** When a Zaklęcie may be cast, at what, and what casting it does (9.1, 9.6). */
import type { SpellId } from "@/data/ids";
import type { Effect } from "./cardScript";
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
  /**
   * What the spell does, where the effect vocabulary can say it.
   *
   * `effect` above is the sentence a player acts on and every spell has one;
   * this is the same rule written in the terms the engine already carries out
   * for Karty and Obszary, and only some spells have it. A spell with `stosuje`
   * is applied; a spell without is announced, which is what all thirty used to
   * be.
   *
   * The ones deliberately left announced are the ones the model cannot hold: a
   * Zwierciadło reflects whatever was cast a moment ago and a Władca Zaklęć
   * negates it, which needs a spell to be *pending* rather than resolved — and
   * nothing here is pending. Ocalony is the same shape from the other side: it
   * answers a loss that is about to happen. Those wait for a response model,
   * and saying so in the data is better than half-applying them.
   */
  stosuje?: Effect;
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
    // "Należy odłożyć Karty Przedmiotów biorąc za każdą z nich 1 Sztukę Złota"
    // — the Lichwiarz's own trade, at the Lichwiarz's own rate.
    stosuje: { op: "sprzedaj", cena: 1 },
  },
    /**
   * Announced. `frozen` exists and nothing enforces it.
   *
   * "Nie może zrobić nic poza użyciem Władcy Zaklęć" is a `frozen` modifier
   * ending `dispelled`, and both words are already in `status.ts` — but
   * `frozen()` is read by no command, so setting it would change nothing. The
   * work is making it real at the doors an action comes through, which is the
   * same shape as `refuseWhileOverLimit`, not the spell.
   *
   * The other half is done: "ofiary nie można zaatakować" is exactly what
   * `refuseAgainstStone` does for 20.5, and wants generalising rather than
   * writing again.
   */
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
    /**
     * "Zaklęciem tym możesz posłużyć się tylko w jednej walce" — so it ends
     * with the fight, however the fight ends, which is what `Ends.fight` is.
     * The Bojowy Rumak does the same thing as a held card; a character with
     * both folds its Magia in once.
     */
    stosuje: {
      op: "efekt",
      label: "Magia i Miecz — Magia liczy się do Miecza",
      modifier: { kind: "magia-as-miecz" },
      ends: { kind: "fight" },
    },
  },
  "magiczna-wedrowka": {
    timing: ["zamiast-ruchu"],
    target: "siebie",
    effect: "Przenieś się na dowolny Obszar w tym Kręgu. Nie działa na Kamiennym Moście.",
    // "natychmiastowe przeniesienie się do dowolnego Obszaru w tym samym
    // Kręgu". The bar on using it on the Kamienny Most is `timing`'s, not this.
    stosuje: { op: "przenies", to: { kind: "dowolne-w-kregu" } },
  },
  /**
   * Announced, and it is three cards in one.
   *
   * "Dla Postaci oznacza ocalenie przed stratą punktu Życia" is a status
   * consumed at `spendLife`, which is a single door and would be easy. "Dla
   * innych — ocalenie przed śmiercią" spares a Przyjaciel or a Wróg instead,
   * and "użyty w walce sprawia, że rezultat starcia pozostanie
   * nierozstrzygnięty" forces a draw. Three mechanisms, one card.
   *
   * Deliberately not part-built. `coverageOf` reports whether a card has a
   * script and not whether the script does what the card says, so applying
   * only the first third would make this read `pelne` while two thirds of it
   * sat on the table — which is the Eremita's mistake with a bigger card.
   */
  ocalony: {
    timing: ["dowolna-chwila", "w-walce"],
    target: "postac-lub-wrog",
    effect:
      "Postać nie traci punktu Życia; Przyjaciel lub Wróg nie ginie. Użyty w walce — remis.",
  },
  /**
   * Applied. It needed an op that reaches back into the turn's own stack, and
   * `wymien-karte` is it: every other effect acts on a seat, a field or a pile.
   *
   * „Jednej z wyciągniętych" needs no picker, because 15.2 already put the
   * drawn cards in an order and this may only be spoken „natychmiast po wzięciu
   * Karty" — so the one it acts on is the one in front of the player, which is
   * the one the sheet is showing.
   */
  "odmiana-losu": {
    timing: ["po-karcie"],
    target: "siebie",
    effect: "Odrzuć jedną z wyciągniętych Kart i wyciągnij w zamian inną.",
    stosuje: { op: "wymien-karte" },
  },
  odrodzenie: {
    timing: ["dowolna-chwila"],
    target: "siebie-lub-postac",
    effect: "Przywraca Życie do 4 punktów z początku gry.",
    // "przywraca punkty Życia z początku rozgrywki (czyli 4 punkty)" — the card
    // states the number the rulebook's 4.7 would have given anyway.
    stosuje: { op: "uzdrow", upTo: 4 },
  },
  /**
   * Applied, and „w tajemnicy" is kept by where the answer goes.
   *
   * The note here used to say this wanted a per-seat secret in the envelope,
   * because the draw pile deliberately never leaves the server — shipping it
   * was a real bug once. That was looking at the wrong channel. The envelope is
   * what every device polls and can hold no secrets; what a *command* returns
   * is the response to the one device that asked, which is exactly one seat.
   * So the five cards come back in `Cast.did`, the journal line says only which
   * Zaklęcie was spoken, and nothing is written to the game at all.
   */
  olsnienie: {
    timing: ["przed-ruchem"],
    target: "siebie",
    effect: "Obejrzyj w tajemnicy 5 pierwszych Kart Zdarzeń ze stosu.",
    stosuje: { op: "podejrzyj", count: 5 },
  },
  "pan-bogactwa": {
    timing: ["dowolna-chwila"],
    target: "postac",
    effect: "Zabierz ofierze 1 Przedmiot albo 1 Sztukę Złota.",
    // "Pozwala zabrać wybranej Postaci jeden Przedmiot lub jedną Sztukę Złota."
    // The coin is the fallback: a victim with nothing to carry still has a purse.
    stosuje: { op: "zabierz", co: "przedmiot-lub-zloto" },
  },
  "pan-przyjaciol": {
    timing: ["dowolna-chwila"],
    target: "postac",
    effect: "Zabierz ofierze 1 Przyjaciela i dołącz go do swoich.",
    // "zabrać wybranej Postaci jednego z Przyjaciół i dołączyć go do swoich" —
    // changing hands rather than being destroyed, which is why this is not a
    // `strata`.
    stosuje: { op: "zabierz", co: "przyjaciel" },
  },
  /**
   * Announced for the reason 11.2 is ◐: crossing anywhere is not wired.
   *
   * "Przebyć w dowolnym miejscu Trzęsawiska" is the card half of "except by
   * Łódź, or by field and card effects". The Łódź is encoded as an ability and
   * the crossing points are the board's; a crossing from an arbitrary square is
   * the missing piece, and it is the same piece the Władca Lodu wants.
   */
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
    /**
     * "Zabija natychmiast każdego Wroga (oprócz Demonów), a Postaci odbiera 2
     * punkty Życia."
     *
     * Only the half aimed at a Postać, and only when one was named: the guard
     * in `castSpell` refuses an unnamed victim rather than letting two points
     * land on the caster. Killing a Wróg outright is the other half and stays
     * prose — the creature is a Karta in a turn's stack, not a seat, and
     * `stosuje` reaches seats.
     */
    stosuje: { op: "punkty", stat: "life", delta: -2 },
  },
  "siedem-wichrow": {
    timing: ["dowolna-chwila"],
    target: "postac",
    effect: "Rzuć kostką za każdy Przedmiot ofiary: 1 niszczy go. Tylko w tej samej Krainie.",
    /**
     * "Rzuć raz kostką dla każdego Przedmiotu będącego w posiadaniu ofiary.
     * Jeśli wynikiem jest 1, Wichry niszczą Przedmiot."
     *
     * The same shape as the Urwisko's roll for each Przyjaciel, one number
     * apart, and aimed at the victim rather than the caster — which is what
     * `target: "postac"` and the seat it names are for.
     */
    stosuje: { op: "rzut-za-kazdego", co: "przedmiot", gubiPrzy: 1 },
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
    /**
     * "Najpierw należy zdecydować, kto padnie ofiarą Szaleństwa, a dopiero
     * następnie obejrzeć Zaklęcia i wybrać jedno z nich."
     *
     * The choice is the caster's, against 5.6's default — and it is the one
     * place in the box where a hand held face down under 9.3 is opened to
     * somebody else.
     */
    stosuje: { op: "zabierz", co: "zaklecie", wybiera: "rzucajacy" },
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
    /**
     * Announced, and the target is why.
     *
     * "Wszystkie istoty w tym Obszarze (także Postacie) tracą następną turę" is
     * expressible — `wszyscy-tutaj` was added for it — but the Obszar is one
     * the caster points at, "w Kręgu, po którym wędrujesz", and a cast carries
     * no field to point with. Resolved against the caster's own square it would
     * reliably cost them the turn they were trying to take from somebody else,
     * which is worse than leaving the sentence to the table.
     *
     * It wants a field on `CastSpell.target`, which is the browser's question
     * as much as the engine's — the same shape as a Zaklęcie aimed at a Karta
     * on the board.
     */
  },
  /** Announced, and blocked on exactly what the Pan Trzęsawisk is — 11.6's half of it. */
  "wladca-lodu": {
    timing: ["zamiast-ruchu"],
    target: "siebie-lub-postac",
    effect: "Przebądź Lodowy Las w dowolnym miejscu, w obie strony.",
  },
  /**
   * Announced. There is no moment for it to happen in.
   *
   * "Neguje działanie każdego innego Zaklęcia, rzuconego bezpośrednio przed
   * nim" is a reaction, and a cast resolves in one commit — there is no window
   * in which another player is asked whether they answer. That window is the
   * work, and the Zwierciadło wants the same one.
   */
  "wladca-zaklec": {
    timing: ["dowolna-chwila"],
    target: "zaklecie",
    reactive: true,
    effect: "Neguje działanie Zaklęcia rzuconego bezpośrednio przed nim — każdego, bez wyjątku.",
  },
  /**
   * Applied. Half of it already existed — the Siewca takes a Karta off the
   * board through `applies: "zdejmuje-karte"` — and this one takes it off *and
   * puts it down again*, which wanted an Obszar to point at.
   *
   * That is the destination every card offering „dowolny Obszar w tym Kręgu"
   * already asks for: the effect comes back owed, the interface asks, and the
   * answer arrives as `Decisions.destination`. Both ends of it are the
   * player's — which Karta, and which Obszar — which is why `przenies-karte` is
   * never settled.
   */
  "wladca-zdarzen": {
    timing: ["poczatek-tury", "po-ruchu"],
    target: "karta-na-planszy",
    effect:
      "Przenieś odkrytą Kartę Zdarzeń na inny, nie zajęty Obszar w tym samym Kręgu.",
    stosuje: { op: "przenies-karte" },
  },
  /**
   * Announced. Every status this game has is on a seat.
   *
   * "Żaden gracz, łącznie z tobą, nie będzie mógł używać Zaklęć i Magicznych
   * Przedmiotów" is a fact about the table for a while, and `seat_effects` has
   * nowhere to put one. Writing it onto all six seats would be six rows to
   * expire separately and a seventh player joining mid-spell would miss it.
   */
  "wojna-zywiolow": {
    timing: ["przed-ruchem"],
    target: "brak",
    effect:
      "Nikt, łącznie z tobą, nie używa Zaklęć ani Magicznych Przedmiotów do początku twojej następnej tury.",
  },
  /**
   * Announced. Wants the Władca Zaklęć's reaction window, and then some.
   *
   * "Odbije ono każde inne Zaklęcie rzucone na Postać na tego, kto je rzucił" —
   * so besides the window it has to re-aim a spell that has already chosen its
   * target, which nothing here can do.
   */
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
    /**
     * The one spell that is a die table and nothing else, so the whole of it
     * fits the vocabulary. Face 2 takes "całe złoto" — a number rather than a
     * count of cards, and `adjustSeat` floors a purse at nothing, so asking for
     * more than anyone could hold is how "all of it" is said.
     */
    stosuje: {
      op: "rzut",
      faces: {
        1: { op: "kamien" },
        2: { op: "punkty", stat: "gold", delta: -99 },
        3: { op: "punkty", stat: "sword", delta: -1 },
        4: { op: "punkty", stat: "magic", delta: -1 },
        5: {
          op: "wybor",
          options: [
            { label: "+1 Miecza", effect: { op: "punkty", stat: "sword", delta: 1 } },
            { label: "+1 Magii", effect: { op: "punkty", stat: "magic", delta: 1 } },
          ],
        },
        6: { op: "punkty", stat: "life", delta: 1 },
      },
    },
  },
  /**
   * Announced. The turn order has no word for taking one twice.
   *
   * "Wykorzystanie 3 kolejnych tur zamiast jednej" needs `nextSeat` to come
   * back to the same seat, and every rule about turns here is written as
   * *losing* them — `turns_lost` counts down, and there is no counting up.
   */
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
    /**
     * "prędkość Postaci (twoja lub kogokolwiek innego) podwoi się" — cast on
     * anybody, which is why it is `siebie-lub-postac` and why the doubling is a
     * status on the seat rather than a fact about the caster.
     */
    stosuje: {
      op: "efekt",
      label: "Formuła Przestrzeni — podwójny rzut na ruch",
      modifier: { kind: "move-x2" },
      ends: { kind: "turns", turns: 1 },
    },
  },
  /**
   * Applied, and it was the nearest of the fourteen to buildable.
   *
   * "Golem (Miecz 3) atakuje wybraną Postać lub Wroga (w granicach Kręgu)…
   * Ofiara musi walczyć na zwykłych zasadach" is a fight the caster is not in,
   * against a target at a distance, settled on the ordinary rules — which is
   * what the Poszukiwacz Przygód's raid already is (`raidsForYou`, `sendRaider`
   * and `fight.raid`). What differed is that the attacker is conjured rather
   * than held, and that a beaten Wróg is removed rather than kept (1.4); both
   * are now `przyzwij` and `Fight.raid.summoned`.
   *
   * The rest of the card needs no encoding, because it is what a lost fight
   * already costs: „Gdy przegra, Postać traci jedno Życie" is 17.4's own point,
   * and „a Wróg jest zdejmowany z planszy" is `beatenOffTheBoard`.
   */
  golem: {
    timing: ["przed-ruchem"],
    target: "postac-lub-wrog",
    effect:
      "Golem (Miecz 3) atakuje cel w tym Kręgu. Przegrana ofiara traci 1 Życie; Wróg znika z planszy.",
    stosuje: { op: "przyzwij", nazwa: "GOLEM", miecz: 3 },
  },
  /** The Golem with Miecz 5, and it was blocked on the same one thing. */
  homunculus: {
    timing: ["przed-ruchem"],
    target: "postac-lub-wrog",
    effect:
      "Homunculus (Miecz 5) atakuje cel w tym Kręgu. Przegrana ofiara traci 1 Życie; Wróg znika z planszy.",
    stosuje: { op: "przyzwij", nazwa: "HOMUNCULUS", miecz: 5 },
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
      state.phase === "fight" &&
      (state.fight.playerRoll !== null || state.fight.enemyRoll !== null),
    cardJustDrawn: state.phase === "field" && state.drawn.length > 0,
    meeting:
      state.phase === "field" && state.drawn.some((entry) => entry.cardClass === "foe"),
  });
}

/** Every window the turn is in at once — a moment can be more than one. */
export function momentsOf(at: TurnMoment): SpellTiming[] {
  const now: SpellTiming[] = ["dowolna-chwila"];
  switch (at.phase) {
    case "roll":
      // Nothing has happened yet: the start of the turn, and everything that
      // has to come before the move.
      now.push("poczatek-tury", "przed-ruchem", "zamiast-ruchu");
      break;
    case "move":
      now.push("przed-ruchem");
      break;
    case "field":
      now.push("po-ruchu");
      if (at.cardJustDrawn) now.push("po-karcie");
      if (at.meeting) now.push("spotkanie", "przed-walka");
      break;
    case "fight":
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
