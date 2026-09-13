/** When a Zaklęcie may be cast, at what, and what casting it does (9.1, 9.6). */
import { KARTY } from "./content/index";
import { spellsOf } from "./karta";
import { isSpellId, type CardId, type SpellId } from "@/data/ids";
import type { Effect } from "./cardScript";
import { isFoeClass } from "@/data/types";
import type { TurnPhase } from "./turn";
import { frozenBy, spellsHushed, type Status } from "./status";

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
  | "any-time"
  /** "na początku tury jego posiadacza". */
  | "turn-start"
  /** "przed wykonaniem ruchu". */
  | "before-move"
  /** Spent *instead of* moving, not merely before it. */
  | "instead-of-move"
  /** "po zakończeniu ruchu". */
  | "after-move"
  /** Before the dice of a fight (17.3). */
  | "before-fight"
  /** During a fight, once the dice are known. */
  | "in-fight"
  /** On meeting another character or a Wróg. */
  | "meeting"
  /** "natychmiast po wzięciu Karty Zdarzenia". */
  | "after-card";

/** What a spell is aimed at. */
export type SpellTarget =
  | "self"
  | "character"
  | "self-or-character"
  | "foe"
  | "character-or-foe"
  | "field"
  /** A face-up Karta Zdarzenia lying on the board. */
  | "card-on-board"
  /** Another spell — the two that answer spells rather than characters. */
  | "spell"
  | "none";

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
    | "dispels-spells"
    /** Siewca Spustoszenia: one face-up Karta Zdarzeń, off the board. */
    | "removes-card";
  /**
   * What the spell does, where the effect vocabulary can say it.
   *
   * `effect` above is the sentence a player acts on and every spell has one;
   * this is the same rule written in the terms the engine already carries out
   * for Karty and Obszary, and only some spells have it. A spell with `script`
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
  script?: Effect;
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
 * card, so it goes through `lose` with the rest of them.
 */
export function appliedByTheApp(script: SpellScript | null): boolean {
  return script?.applies !== undefined;
}

export const SPELLS: Readonly<Partial<Record<SpellId, SpellScript>>> = {
  "kamien-filozoficzny": {
    timing: ["turn-start"],
    target: "self",
    effect: "Odłóż dowolną liczbę swoich Przedmiotów, biorąc 1 Sz. Z. za każdy.",
    // "Należy odłożyć Karty Przedmiotów biorąc za każdą z nich 1 Sztukę Złota"
    // — the Lichwiarz's own trade, at the Lichwiarz's own rate.
    script: { op: "sell", price: 1 },
  },
  /**
   * Applied — for a Postać. Half of the card, and the half the app can hold.
   *
   * „Ofiara zostaje otoczona płomieniami, i nie może zrobić nic poza użyciem
   * Władcy Zaklęć (co zaneguje działanie Kręgu Płomieni). Ofiary nie można
   * zaatakować, jednak można się jej wymknąć."
   *
   * Both halves are now real. `frozen` existed and was read by nothing, so it
   * described the two things the turn order already handled — Kamień and a lost
   * turn — and could not have stopped anybody: `refuseWhileHeld` is the door it
   * was waiting for, and `oprocz` carries the one key the card prints. The
   * other half is 20.5's own guard, widened by `untouchable` to the narrower
   * prohibition this card states: an attack, and not a Zaklęcie, because a
   * Zaklęcie is how the victim gets out.
   *
   * Cast at a Wróg it stays announced. A creature lying on an Obszar has no
   * seat to hold a status, and „nie można zaatakować" of a Wróg wants a state
   * on a field card, which is the same gap the Władca Gromu waits on.
   */
  "krag-plomieni": {
    timing: ["any-time"],
    target: "character-or-foe",
    effect:
      "Ofiara nie może nic robić poza rzuceniem Władcy Zaklęć; nie można jej zaatakować.",
    script: {
      op: "status",
      label: "Krąg Płomieni",
      modifier: { kind: "frozen", oprocz: ["wladca-zaklec"] },
      ends: { kind: "dispelled" },
    },
  },
  "magia-i-miecz": {
    timing: ["before-fight"],
    target: "self",
    effect: "W tej jednej walce (nie magicznej) dodajesz Magię do Miecza.",
    /**
     * "Zaklęciem tym możesz posłużyć się tylko w jednej walce" — so it ends
     * with the fight, however the fight ends, which is what `Ends.fight` is.
     * The Bojowy Rumak does the same thing as a held card; a character with
     * both folds its Magia in once.
     */
    script: {
      op: "status",
      label: "Magia i Miecz — Magia liczy się do Miecza",
      modifier: { kind: "magic-as-sword" },
      ends: { kind: "fight" },
    },
  },
  "magiczna-wedrowka": {
    timing: ["instead-of-move"],
    target: "self",
    effect: "Przenieś się na dowolny Obszar w tym Kręgu. Nie działa na Kamiennym Moście.",
    // "natychmiastowe przeniesienie się do dowolnego Obszaru w tym samym
    // Kręgu". The bar on using it on the Kamienny Most is `timing`'s, not this.
    script: { op: "move", to: { kind: "anywhere-in-ring" } },
  },
  /**
   * Applied for a Postać, and said out loud for the rest.
   *
   * „Dla Postaci oznacza ocalenie przed stratą punktu Życia jeżeli taka strata
   * ma nastąpić. Dla innych — ocalenie przed śmiercią. Użyty w walce sprawia,
   * że rezultat starcia pozostanie nierozstrzygnięty."
   *
   * The first third is a status spent at `spendLife`, which is the one door
   * every loss in the game comes through — so an Ocalony spoken „w dowolnej
   * chwili" answers whatever the loss turns out to be, a lost fight or a Karta
   * or a fall off the Most, without knowing in advance which.
   *
   * The note here used to argue against building that third, because
   * `coverageOf` reports whether a card has a script and not whether the script
   * does what the card says — so a third of a card would have read `full` with
   * two thirds still on the table. That was right about the danger and wrong
   * about the remedy: `MANUAL` exists for exactly this, marks the card
   * `partial`, and prints the rest where a player reads the card.
   *
   * The two thirds it does not do: a Przyjaciel or a Wróg saved from death
   * wants a state on something that is not a seat, and the fight's „remis"
   * wants the settle to change a result the dice have already given.
   */
  ocalony: {
    timing: ["any-time", "in-fight"],
    target: "character-or-foe",
    effect:
      "Postać nie traci punktu Życia; Przyjaciel lub Wróg nie ginie. Użyty w walce — remis.",
    script: {
      op: "status",
      label: "Ocalony",
      modifier: { kind: "rescue" },
      ends: { kind: "dispelled" },
    },
  },
  /**
   * Applied. It needed an op that reaches back into the turn's own stack, and
   * `redraw` is it: every other effect acts on a seat, a field or a pile.
   *
   * „Jednej z wyciągniętych" needs no picker, because 15.2 already put the
   * drawn cards in an order and this may only be spoken „natychmiast po wzięciu
   * Karty" — so the one it acts on is the one in front of the player, which is
   * the one the sheet is showing.
   */
  "odmiana-losu": {
    timing: ["after-card"],
    target: "self",
    effect: "Odrzuć jedną z wyciągniętych Kart i wyciągnij w zamian inną.",
    script: { op: "redraw" },
  },
  odrodzenie: {
    timing: ["any-time"],
    target: "self-or-character",
    effect: "Przywraca Życie do 4 punktów z początku gry.",
    // "przywraca punkty Życia z początku rozgrywki (czyli 4 punkty)" — the card
    // states the number the rulebook's 4.7 would have given anyway.
    script: { op: "heal", upTo: 4 },
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
    timing: ["before-move"],
    target: "self",
    effect: "Obejrzyj w tajemnicy 5 pierwszych Kart Zdarzeń ze stosu.",
    script: { op: "peek", count: 5 },
  },
  "pan-bogactwa": {
    timing: ["any-time"],
    target: "character",
    effect: "Zabierz ofierze 1 Przedmiot albo 1 Sztukę Złota.",
    // "Pozwala zabrać wybranej Postaci jeden Przedmiot lub jedną Sztukę Złota."
    // The coin is the fallback: a victim with nothing to carry still has a purse.
    script: { op: "take", what: "item-or-gold" },
  },
  "pan-przyjaciol": {
    timing: ["any-time"],
    target: "character",
    effect: "Zabierz ofierze 1 Przyjaciela i dołącz go do swoich.",
    // "zabrać wybranej Postaci jednego z Przyjaciół i dołączyć go do swoich" —
    // changing hands rather than being destroyed, which is why this is not a
    // `lose`.
    script: { op: "take", what: "friend" },
  },
  /**
   * Applied. It was the card half of 11.2's „except by Łódź, or by field and
   * card effects", and what was missing was a crossing from an arbitrary
   * square.
   *
   * That arrives as a status the crossing door reads, which is the shape the
   * rest of the sentence already had: the Łódź is an ability, the two crossing
   * points are the board's, and this is a Zaklęcie's. The obstacle is then
   * simply walked — 11.3's two dice are the Uroczysko's own card and this
   * crosses somewhere else — and where they land is the far side of the
   * crossing leading out of the Kraina they are in, since each obstacle has one
   * in each direction.
   *
   * `ends: crossing` was waiting for exactly this. The Ends union has named the
   * event since it was written and only the Południca raised it; a granted
   * crossing is spent by being taken, and `settleCrossing` already sheds
   * anything ending that way.
   */
  "pan-trzesawisk": {
    timing: ["instead-of-move"],
    target: "self-or-character",
    effect: "Przebądź Trzęsawiska w dowolnym miejscu, w obie strony.",
    script: {
      op: "status",
      label: "Pan Trzęsawisk",
      modifier: { kind: "crossing", over: "trzesawiska" },
      ends: { kind: "event", what: "crossing" },
    },
  },
  "powiew-smierci": {
    timing: ["meeting"],
    target: "character-or-foe",
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
     * `script` reaches seats.
     */
    script: { op: "points", stat: "life", delta: -2 },
  },
  "siedem-wichrow": {
    timing: ["any-time"],
    target: "character",
    effect: "Rzuć kostką za każdy Przedmiot ofiary: 1 niszczy go. Tylko w tej samej Krainie.",
    /**
     * "Rzuć raz kostką dla każdego Przedmiotu będącego w posiadaniu ofiary.
     * Jeśli wynikiem jest 1, Wichry niszczą Przedmiot."
     *
     * The same shape as the Urwisko's roll for each Przyjaciel, one number
     * apart, and aimed at the victim rather than the caster — which is what
     * `target: "character"` and the seat it names are for.
     */
    script: { op: "roll-for-each", what: "item", lostOn: 1 },
  },
  "siewca-spustoszenia": {
    timing: ["turn-start", "after-move"],
    target: "card-on-board",
    effect: "Zdejmij z planszy jedną odkrytą Kartę Zdarzeń.",
    applies: "removes-card",
  },
  szalenstwo: {
    timing: ["any-time"],
    target: "character",
    effect: "Wskaż ofiarę, potem obejrzyj jej Zaklęcia i zabierz jedno.",
    /**
     * "Najpierw należy zdecydować, kto padnie ofiarą Szaleństwa, a dopiero
     * następnie obejrzeć Zaklęcia i wybrać jedno z nich."
     *
     * The choice is the caster's, against 5.6's default — and it is the one
     * place in the box where a hand held face down under 9.3 is opened to
     * somebody else.
     */
    script: { op: "take", what: "spell", chosenBy: "caster" },
  },
  "wladca-czarow": {
    timing: ["any-time"],
    target: "character",
    effect: "Ofiara traci wszystkie swoje Zaklęcia.",
    applies: "dispels-spells",
  },
  "wladca-gromu": {
    timing: ["any-time"],
    target: "field",
    effect:
      "Wszystkie istoty na Obszarze sparaliżowane: nie wolno ich atakować, można się wymknąć. Postacie tracą następną turę.",
    /**
     * Applied to the Postacie standing there, which is the half with seats.
     *
     * „Możesz wypowiedzieć to Zaklęcie w dowolnej chwili na Obszar w Kręgu, po
     * którym wędrujesz. Wszystkie istoty w tym Obszarze (także Postacie)
     * zostaną sparaliżowane lękiem. Istot tych nie wolno atakować, lecz można
     * im się wymknąć. Postacie tracą następną turę."
     *
     * The note here used to say the target was why this could not be built:
     * `wszyscy-tutaj` existed and resolved against the *caster's* own square,
     * so a spell thrown at somebody else's Obszar would reliably have cost the
     * caster the turn they were taking from them. A cast now carries the Obszar
     * it names — 9.6 lets a Zaklęcie reach anywhere, and this card narrows it
     * to the ring being walked, which is checked where the casting happens.
     *
     * Two steps, because the card says two things and the engine keeps them in
     * different places. „Tracą następną turę" is the turn order's, and reaches
     * it through the column `nextSeat` reads. „Nie wolno ich atakować" is a
     * status, and it is the same `frozen` the Krąg Płomieni wears — which is
     * what `untouchable` is asked at every attack. Written as one effect they
     * would have had to be one thing, and they are not.
     *
     * The creatures are not covered. „Wszystkie istoty" includes the Wrogowie
     * lying on that Obszar, and a Karta on the board has nowhere to carry a
     * state — the same gap the Krąg Płomieni meets when it is thrown at a Wróg.
     * That half stays in the sentence the table reads.
     */
    script: {
      op: "sequence",
      steps: [
        { op: "lose-turn", turns: 1, target: "everyone-here" },
        {
          op: "status",
          label: "Władca Gromu",
          modifier: { kind: "frozen" },
          ends: { kind: "turns", turns: 1 },
          target: "everyone-here",
        },
      ],
    },
  },
  /** Applied, by exactly what unblocked the Pan Trzęsawisk — 11.6's half of it. */
  "wladca-lodu": {
    timing: ["instead-of-move"],
    target: "self-or-character",
    effect: "Przebądź Lodowy Las w dowolnym miejscu, w obie strony.",
    script: {
      op: "status",
      label: "Władca Lodu",
      modifier: { kind: "crossing", over: "lodowy-las" },
      ends: { kind: "event", what: "crossing" },
    },
  },
  /**
   * Applied, and it is the card the response window was built for.
   *
   * „Neguje działanie każdego innego (bez wyjątku) Zaklęcia, rzuconego
   * bezpośrednio przed nim." Nothing in this engine was ever *pending* — a
   * command decides and commits in one breath — so there was nothing for this
   * to negate. A Zaklęcie now waits in the air while anybody at the table holds
   * something that could answer it (`spoken`, and `couldAnswer`), and this is
   * one of the two things that answer.
   *
   * With nothing in the air it does the other half of its job: it lifts what a
   * Zaklęcie left on you. „Co zaneguje działanie Kręgu Płomieni" — the flames
   * end `dispelled`, and this card is the only thing in the box that dispels,
   * so without it the one way out of the Krąg was a status nothing could lift.
   *
   * No `script`: what it does is not an effect on anybody, it is what happens
   * to another Zaklęcie. That lives in `castSpell` because it is about the
   * casting itself.
   */
  "wladca-zaklec": {
    timing: ["any-time"],
    target: "spell",
    reactive: true,
    effect: "Neguje działanie Zaklęcia rzuconego bezpośrednio przed nim — każdego, bez wyjątku.",
  },
  /**
   * Applied. Half of it already existed — the Siewca takes a Karta off the
   * board through `applies: "removes-card"` — and this one takes it off *and
   * puts it down again*, which wanted an Obszar to point at.
   *
   * That is the destination every card offering „dowolny Obszar w tym Kręgu"
   * already asks for: the effect comes back owed, the interface asks, and the
   * answer arrives as `Decisions.destination`. Both ends of it are the
   * player's — which Karta, and which Obszar — which is why `move-card` is
   * never settled.
   */
  "wladca-zdarzen": {
    timing: ["turn-start", "after-move"],
    target: "card-on-board",
    effect:
      "Przenieś odkrytą Kartę Zdarzeń na inny, nie zajęty Obszar w tym samym Kręgu.",
    script: { op: "move-card" },
  },
  /**
   * Applied by half, and the half is the one the app can hold.
   *
   * „Żaden gracz, łącznie z tobą, nie będzie mógł używać Zaklęć i Magicznych
   * Przedmiotów ani ciągnąć z nich żadnych korzyści, aż do początku twojej
   * następnej tury."
   *
   * The spells are refused. Six rows and not one, because `seat_effects` is
   * where a status lives — and six turned out to be right rather than a
   * compromise: `{ turns: 1 }` is measured in the *holder's* own turns, so each
   * seat wears it through exactly one turn of theirs and the caster's own
   * expires at the end of the turn they spoke it in. That is „do początku
   * twojej następnej tury", to the letter, without a clock.
   *
   * The Magiczne Przedmioty are not, and the reason is the data: the deck does
   * not record which Przedmioty are Magiczne. The word is printed on the card
   * and was never transcribed, so „item" covers a Miecz and a Pierścień Mocy
   * alike — and suppressing every Przedmiot would enforce a harder rule than
   * the one on the card. That half stays in the sentence the table reads.
   */
  "wojna-zywiolow": {
    timing: ["before-move"],
    target: "none",
    effect:
      "Nikt, łącznie z tobą, nie używa Zaklęć ani Magicznych Przedmiotów do początku twojej następnej tury.",
    /**
     * Anchored to the wrong person, knowingly, and this is the note saying so.
     *
     * The card ends it "aż do początku **twojej** następnej tury" — the
     * caster's. What is written here is a one-turn countdown handed to every
     * victim on their own clock, so each of them sheds it at the end of their
     * own next turn instead: a seat playing before the caster comes round is
     * freed early, one playing after is held late.
     *
     * `Ends.this-turn` does not fix it — that ends with the turn in progress,
     * and this spans the rest of the caster's turn plus everybody else's.
     * `Ends.round` does not either: "the start of round N" is not "the start of
     * the caster's turn in round N", and the seats before them in the order
     * would go free too soon. What it wants is a fifth kind anchored to a named
     * seat — `{ kind: "before"; seatIndex }` — shed when that seat's turn
     * begins, with the caster filled in where this data is executed.
     *
     * Left as it is rather than half-fixed, because the countdown is at least
     * the right length for the table as a whole and a wrong anchor that looks
     * exact is worse than one that is written down.
     */
    script: {
      op: "status",
      label: "Wojna Żywiołów",
      modifier: { kind: "no-spells" },
      ends: { kind: "turns", turns: 1 },
      target: "everyone",
    },
  },
  /**
   * Applied, by the same window the Władca Zaklęć waits in.
   *
   * „Odbije ono każde inne Zaklęcie rzucone na Postać na tego, kto je rzucił."
   * The spell in the air is turned round: it lands on whoever spoke it, and
   * anything it *takes* is taken for the one holding the mirror — a Szaleństwo
   * reflected steals a Zaklęcie from its own caster, for you.
   *
   * Only what was aimed at the seat holding it. „Rzucone na Postać" is the
   * spell landing on *you*; a mirror is not a shield for the table.
   */
  zwierciadlo: {
    timing: ["any-time"],
    target: "spell",
    reactive: true,
    effect: "Odbija rzucone na ciebie Zaklęcie na tego, kto je rzucił.",
  },
  fatum: {
    timing: ["any-time"],
    target: "character",
    effect:
      "Ofiara rzuca kostką: 1 — Kamień; 2 — całe złoto; 3 — 1 Miecza; 4 — 1 Magii; 5 — zyskuje 1 Miecza lub Magii; 6 — zyskuje 1 Życie.",
    /**
     * The one spell that is a die table and nothing else, so the whole of it
     * fits the vocabulary. Face 2 takes "całe złoto" — a number rather than a
     * count of cards, and `adjustSeat` floors a purse at nothing, so asking for
     * more than anyone could hold is how "all of it" is said.
     */
    script: {
      op: "roll",
      faces: {
        1: { op: "stone" },
        2: { op: "points", stat: "gold", delta: -99 },
        3: { op: "points", stat: "sword", delta: -1 },
        4: { op: "points", stat: "magic", delta: -1 },
        5: {
          op: "choice",
          options: [
            { label: "+1 Miecza", effect: { op: "points", stat: "sword", delta: 1 } },
            { label: "+1 Magii", effect: { op: "points", stat: "magic", delta: 1 } },
          ],
        },
        6: { op: "points", stat: "life", delta: 1 },
      },
    },
  },
  /**
   * Applied. The turn order had no word for taking one twice, and now it has.
   *
   * „Wykorzystanie 3 kolejnych tur zamiast jednej" needed `nextSeat` to come
   * back to the same seat, and every rule about turns in this box is written as
   * *losing* them — `turns_lost` counts down and there was no counting up. So
   * the extra turns are held the way everything else with a duration is: a
   * status, ticking at the pass, that says the turn does not move.
   *
   * Two, not three: the turn it is spoken in is the first of the three, so what
   * is granted is two more. The counting is `Ends` doing what it always does,
   * which is why nothing new counts.
   *
   * „Inne Postacie nie mogą w tym czasie podjąć żadnych działań oprócz walki
   * jeżeli zostały zaatakowane" needs nothing of its own: a player whose turn
   * never comes cannot act, and being attacked is the one thing that happens on
   * somebody else's turn anyway.
   */
  "formula-czasu": {
    timing: ["before-move"],
    target: "self",
    effect:
      "Wykorzystujesz 3 kolejne tury zamiast jednej. Inni mogą tylko walczyć, jeśli ich zaatakujesz.",
    script: {
      op: "status",
      label: "Formuła Czasu",
      modifier: { kind: "again" },
      ends: { kind: "turns", turns: 2 },
    },
  },
  "formula-przestrzeni": {
    timing: ["any-time"],
    target: "self-or-character",
    effect: "Wynik rzutu na ruch mnożysz przez 2.",
    /**
     * "prędkość Postaci (twoja lub kogokolwiek innego) podwoi się" — cast on
     * anybody, which is why it is `self-or-character` and why the doubling is a
     * status on the seat rather than a fact about the caster.
     */
    script: {
      op: "status",
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
   * are now `summon` and `Fight.raid.summoned`.
   *
   * The rest of the card needs no encoding, because it is what a lost fight
   * already costs: „Gdy przegra, Postać traci jedno Życie" is 17.4's own point,
   * and „a Wróg jest zdejmowany z planszy" is `beatenOffTheBoard`.
   */
  golem: {
    timing: ["before-move"],
    target: "character-or-foe",
    effect:
      "Golem (Miecz 3) atakuje cel w tym Kręgu. Przegrana ofiara traci 1 Życie; Wróg znika z planszy.",
    script: { op: "summon", name: "GOLEM", sword: 3 },
  },
  /** The Golem with Miecz 5, and it was blocked on the same one thing. */
  homunculus: {
    timing: ["before-move"],
    target: "character-or-foe",
    effect:
      "Homunculus (Miecz 5) atakuje cel w tym Kręgu. Przegrana ofiara traci 1 Życie; Wróg znika z planszy.",
    script: { op: "summon", name: "HOMUNCULUS", sword: 5 },
  },
  // The Karty that have moved to one file each — see `karta.ts`.
  ...spellsOf(KARTY),
};

/**
 * Takes any `CardId`, not only a `SpellId`: `spellFacts` is asked of whatever
 * card is being looked at and „this is not a Zaklęcie" is one of the answers.
 */
export function spellScript(cardId: CardId): SpellScript | null {
  return isSpellId(cardId) ? (SPELLS[cardId] ?? null) : null;
}

/**
 * Whether speaking this Zaklęcie leaves its victim impossible to attack.
 *
 * "Ofiara zostaje otoczona płomieniami... Ofiary nie można zaatakować, jednak
 * można się jej wymknąć", and 19.1 quotes the same state from the other side —
 * "jednej (unieruchomionej w Kręgu Płomieni) istocie". So a fight against the
 * victim cannot go on, which is law 4's cash-in: a cast that reaches down and
 * ends the fight beneath it (docs/STACK.md).
 *
 * Read off what the spell already declares rather than declared a second time.
 * The rule is about the *state* the victim is left in, not about which card put
 * them there — so a second freezing Zaklęcie gets this without an edit, and a
 * Władca Zaklęć that lifts the state means the right thing by the same token.
 */
export function unattackableAfter(script: SpellScript | null | undefined): boolean {
  const applied = script?.script;
  return applied?.op === "status" && applied.modifier.kind === "frozen";
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
  if (script.timing.includes("any-time")) return true;
  const open = typeof moment === "string" ? [moment] : moment;
  return script.timing.some((when) => open.includes(when));
}

/**
 * What the turn is currently in the middle of.
 *
 * More than the phase, because the phase alone cannot tell four of these
 * windows apart. A fight before the dice and a fight after the first die are
 * both `fight` and are not the same moment — 17.3 puts the spells before the
 * roll, and a spell that changes a roll has to come after it. A field with a
 * card just turned over is `pole`, and so is a field with nothing left on it.
 *
 * This existed as `phase + hasMoved` and produced four of the nine windows;
 * `in-fight`, `after-card`, `meeting` and `instead-of-move` could never happen,
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
      state.phase === "field" && state.drawn.some((entry) => isFoeClass(entry.cardClass)),
  });
}

/** Every window the turn is in at once — a moment can be more than one. */
export function momentsOf(at: TurnMoment): SpellTiming[] {
  const now: SpellTiming[] = ["any-time"];
  switch (at.phase) {
    case "roll":
      // Nothing has happened yet: the start of the turn, and everything that
      // has to come before the move.
      now.push("turn-start", "before-move", "instead-of-move");
      break;
    case "move":
      now.push("before-move");
      break;
    case "field":
      now.push("after-move");
      if (at.cardJustDrawn) now.push("after-card");
      if (at.meeting) now.push("meeting", "before-fight");
      break;
    case "fight":
      // Before the dice both windows are open; once one is thrown, 17.3 has
      // passed and only the spells that act on a roll are left.
      now.push(at.diceRolled ? "in-fight" : "before-fight", "meeting");
      break;
  }
  return now;
}

/** The single window that best describes the moment, for labelling it. */
export function momentOf(at: TurnMoment): SpellTiming {
  const [, first] = momentsOf(at);
  return first ?? "any-time";
}

export const TIMING_LABEL: Record<SpellTiming, string> = {
  "any-time": "w dowolnej chwili",
  "turn-start": "na początku tury",
  "before-move": "przed ruchem",
  "instead-of-move": "zamiast ruchu",
  "after-move": "po ruchu",
  "before-fight": "przed walką",
  "in-fight": "w walce",
  meeting: "przy spotkaniu",
  "after-card": "po wyciągnięciu Karty",
};

export const TARGET_LABEL: Record<SpellTarget, string> = {
  self: "na siebie",
  character: "na Postać",
  "self-or-character": "na siebie lub Postać",
  foe: "na Wroga",
  "character-or-foe": "na Postać lub Wroga",
  field: "na Obszar",
  "card-on-board": "na odkrytą Kartę",
  spell: "na Zaklęcie",
  none: "—",
};

/**
 * A Zaklęcie's two formalised lines: the window it opens in, and its aim.
 *
 * Both were printed under the tile in the hand, which is the one place they are
 * least useful: a row of five cards carried two lines of small type each, and
 * the answer to "when can I speak this" is wanted while you are looking at the
 * card, not while you are counting the row. So they moved to the panel every
 * other card answers in — where a Przedmiot says which place it is worn in, a
 * Zaklęcie says when it may be spoken and at what.
 *
 * Null for a Zaklęcie the app carries no script for, which is the honest answer
 * rather than a guess at a window. The target is null where the card names none.
 */
export function spellFacts(cardId: CardId): { when: string; at: string | null } | null {
  const script = spellScript(cardId);
  if (!script) return null;
  return {
    when: script.timing.map((timing) => TIMING_LABEL[timing]).join(" / "),
    at: script.target === "none" ? null : TARGET_LABEL[script.target],
  };
}

/**
 * The word for speaking one, as `USE_VERB` is the word for spending a Przedmiot.
 *
 * Here rather than in the component for the same reason that one is in
 * `uses.ts`: the journal, the console and the button all name the same act, and
 * a verb that lives in a button is one three surfaces have to agree about by
 * remembering to.
 */
export const CAST_VERB = "rzuć";

/**
 * Why no Zaklęcie at all may be spoken right now, or null when one may.
 *
 * One sentence, two readers. `castSpell` throws it and the spell hand greys
 * itself with it, so the reason a card is dimmed is the reason the server would
 * have given for refusing it — the same basis, not one that happens to agree
 * most of the time. The rack used to be gated on nothing at all: a Postać
 * Zamieniona w Kamień was offered every Zaklęcie in its hand with a live „rzuć"
 * under each, and found out by pressing one.
 *
 * Only the blanket cases. A `frozen` status that prints an exemption is left to
 * the door, because the Krąg Płomieni's whole shape is a prison with one key —
 * „nie może zrobić nic poza użyciem Władcy Zaklęć" — and a rack greyed whole
 * would hide the one card that gets you out. Kamień names no exemption, which
 * is what makes it a blanket case: 20.5 gives the Zaklęcia back after three
 * turns and not before.
 *
 * The Kryształ Magów's half of this used to read `abilities` for a bare
 * `no-spells` kind, through a reader of its own. It reads `standing` for a `no-spells`
 * status now — `HELD_TWIN` in `status.ts` already projects that ability's
 * "may not cast" half onto a held card's row, through the same `inEffect` gate
 * every other held status passes (a Kryształ sitting in the pack in slotowy,
 * or on a Natura the card forbids, lends nothing) — so this reader gains that
 * gate rather than adding a second copy of it. It is told apart from the
 * Wojna Żywiołów's own `no-spells` above by `ends.kind === "held"`: the two
 * checks share a modifier kind but not a sentence.
 */
export function whyNoSpells(where: {
  fieldName: string | null;
  /** Everything true of the caster — both halves, so a projected freeze counts. */
  statuses: readonly Status[];
  /** `statuses` plus what held cards themselves stand for (`heldStatuses`). */
  standing: readonly Status[];
}): string | null {
  if (where.fieldName !== null) return `${where.fieldName}: tu nie rzuca się Zaklęć.`;

  const hushed = spellsHushed(where.statuses);
  if (hushed) return `${hushed} — nikt teraz nie rzuca Zaklęć.`;

  const held = frozenBy(where.statuses);
  if (held && held.oprocz.length === 0) return `${held.label} — nie możesz nic zrobić.`;

  const givenUpMagic = where.standing.some(
    (status) => status.ends.kind === "held" && status.modifier.kind === "no-spells",
  );
  if (givenUpMagic) {
    return "Właściciel Kryształu Magów nie rzuca ani nie używa Zaklęć.";
  }
  return null;
}
