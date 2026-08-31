/** Things that are true of a character for a while, and what makes them stop being true. */

import type { Nature } from "@/data/types";

/**
 * What ends an effect.
 *
 * This, and not a duration, is the shape of the problem. Every buff framework
 * worth reading is built around a countdown — apply, tick, expire — and in this
 * game a countdown fits about a third of what needs modelling. Eliksir Siły
 * lasts a turn and Kamień lasts three, but Południca leaves when you cross the
 * Trzęsawiska, Magia i Miecz lasts exactly one fight, and Fatum lasts until
 * somebody speaks Władca Zaklęć. None of those are times.
 *
 * So a countdown is one case here rather than the frame everything else has to
 * be bent into.
 */
export type Ends =
  /** After this many more of the holder's own turns. */
  | { kind: "turns"; turns: number }
  /**
   * At the start of a named round, on `games.round`'s clock.
   *
   * The other clock, and the reason there are two. `turns` counts the holder's
   * OWN goes, which is what a card means by "na 1 turę" — a buff that lasted a
   * round would last longer at a table of six than at a table of two. But a
   * character turned to Stone takes no goes at all, so a countdown in their own
   * turns would never count down; 20.1's three are the table's circuits, and
   * `stone_until_round` holds the one it wears off on.
   *
   * Which clock an effect is on decides what a player can be told about it. A
   * round is a date and can be named outright; a countdown in the holder's own
   * turns only becomes a date by walking the turn order forward, and the walk
   * is a forecast. See `lapsesOn` in `statusRows.ts`.
   */
  | { kind: "round"; round: number }
  /** When the next fight finishes, however it finishes (17.4). */
  | { kind: "fight" }
  /** When a particular thing happens to the holder. */
  | { kind: "event"; what: EndingEvent }
  /** Never on its own — only when something takes it off. Fatum, Krąg Płomieni. */
  | { kind: "dispelled" }
  /**
   * When the holder throws this or less, on their own turn.
   *
   * Both Świątynie end their worst row that way: "zostałeś opętany,
   * pozostaniesz tu, dopóki nie wyrzucisz podczas swojej tury 1, 2 lub 3 oczek
   * (na 1 kostce)". Not a countdown — it may take one turn or a dozen — and not
   * `dispelled` either, because nothing else lifts it and a status nothing can
   * lift is a character nothing can move.
   */
  | { kind: "roll"; upTo: number };

/**
 * The events that end something.
 *
 * Deliberately a closed list. An effect that ends on "anything" is an effect
 * nobody can be told the rules of, and the point of writing these down is that
 * a player can be shown what they are waiting for.
 */
export type EndingEvent =
  /** Crossing the Trzęsawiska or the Lodowy Las — what sheds Południca. */
  | "crossing"
  /** Stepping onto the Kamienny Most. */
  | "bridge-entry"
  /** The holder's own death (4.4). */
  | "death";

/** What being under this effect actually does. */
export type Modifier =
  /** Added to the total at read time, never written to own points (1.2-1.5). */
  | { kind: "points"; miecz?: number; magia?: number }
  /** A hard cap on how far the holder may move, whatever the die says. Mgła. */
  | { kind: "move-max"; fields: number }
  /**
   * Cannot act at all: Kamień, the turn a Zaklinacz Czasu takes, and the Krąg
   * Płomieni.
   *
   * `oprocz` is the one way out, by the id of the Zaklęcie that is it. „Nie
   * może zrobić nic poza użyciem Władcy Zaklęć (co zaneguje działanie Kręgu
   * Płomieni)" — the card names its own antidote, and an exemption a card
   * prints belongs on the status the card causes rather than in a branch
   * somewhere that has to remember it.
   */
  | { kind: "frozen"; oprocz?: readonly string[] }
  /**
   * No Zaklęcia may be spoken while this holds — the Wojna Żywiołów.
   *
   * „Żaden gracz, łącznie z tobą, nie będzie mógł używać Zaklęć i Magicznych
   * Przedmiotów ani ciągnąć z nich żadnych korzyści." Only the first half is
   * enforced, and the reason is in the data rather than here: the deck does not
   * say which Przedmioty are *Magiczne*. The word is printed on the card and
   * was never transcribed, so „item" covers a Miecz and a Pierścień Mocy alike
   * — and suppressing every Przedmiot would be a harder rule than the one on
   * the card. The other half stays on the card's sentence for the table.
   *
   * The Obszary that forbid spells do it by field id (`NO_SPELLS`); this is the
   * same prohibition arriving as a status, so both are asked at one door.
   */
  | { kind: "no-spells" }
  /**
   * A crossing granted, to be taken instead of a move (Pan Trzęsawisk, Władca
   * Lodu).
   *
   * „Będzie można (zamiast zwykłego ruchu) przebyć w dowolnym miejscu
   * Trzęsawiska, przechodząc z Krainy Dolnego Kręgu do Krainy Środkowego Kręgu
   * lub odwrotnie." Two things at once: the crossing may be made from anywhere
   * rather than only at the one Obszar the board prints it on, and it is simply
   * walked — 11.3's dice belong to the Uroczysko's own card, and this crosses
   * somewhere else.
   *
   * Ends on the crossing itself, which `Ends` has named since it was written
   * and `settleCrossing` already sheds.
   */
  | { kind: "przeprawa"; przez: "trzesawiska" | "lodowy-las" }
  /**
   * The turn comes back to this character instead of moving on.
   *
   * Formuła Czasu: „Pozwala postaci na wykorzystanie 3 kolejnych tur zamiast
   * jednej." Every other rule about turns in this box is written as *losing*
   * them — `turns_lost` counts down and there was no counting up — so the extra
   * turns are held the same way everything else with a duration is: a status
   * whose `turns` are how many more times the turn comes back.
   *
   * „Inne Postacie nie mogą w tym czasie podjąć żadnych działań oprócz walki
   * jeżeli zostały zaatakowane" needs nothing of its own: a player whose turn
   * never comes cannot act, and being attacked is the one thing that happens on
   * somebody else's turn anyway.
   */
  | { kind: "znowu" }
  /**
   * The next point of Życie that would be lost, is not (OCALONY).
   *
   * „Dla Postaci oznacza ocalenie przed stratą punktu Życia jeżeli taka strata
   * ma nastąpić." Spent by being used, which is what `dispelled` means for a
   * status nothing else lifts: it waits until a loss is about to happen and
   * takes it instead.
   */
  | { kind: "ocalenie" }
  /**
   * A Zaklęcie spoken and not yet in effect, waiting to be answered.
   *
   * The three cards that answer one — WŁADCA ZAKLĘĆ „neguje działanie każdego
   * innego (bez wyjątku) Zaklęcia, rzuconego bezpośrednio przed nim",
   * ZWIERCIADŁO „odbije każde inne Zaklęcie rzucone na Postać na tego, kto je
   * rzucił" — need the spell to be *pending* rather than done, and nothing in
   * this engine was pending: a command decides and commits in one breath.
   *
   * So a spoken spell waits here, on the seat that spoke it, which is a thing
   * that is true of that character for a moment. It carries what the cast
   * named, because settling it later has to do exactly what settling it then
   * would have done.
   *
   * Only when somebody could actually answer. With no reactive Zaklęcie in
   * anybody else's hand there is nothing to wait for, and the spell simply
   * happens — which is almost every cast in almost every game.
   */
  | {
      kind: "spoken";
      spell: string;
      /** When the window closes and it takes effect on its own. */
      until: number;
      /** Whom or what it was aimed at, exactly as the caster said it. */
      target?: {
        seatIndex?: number;
        fieldId?: string;
        fieldCardId?: string;
        note?: string;
      };
      /**
       * What the caster had already answered, kept for when it lands.
       *
       * The Władca Zdarzeń asks where the Karta goes, and the answer arrives
       * with the cast. Dropped here, the spell would settle half an hour later
       * with the question unanswered — and settle silently, because a cast that
       * pends writes nothing and says nothing.
       */
      decided?: { choices?: number[]; destination?: string };
    }
  /** Natura is forced to something while this lasts. */
  | { kind: "nature"; to: Nature }
  /**
   * Shut out of one place. 11.11 bars a failed attempt on the Kamienny Most
   * from trying again next turn, which is not a cap on movement and not a
   * freeze — the character walks normally everywhere else.
   */
  | { kind: "barred"; place: "most" }
  /**
   * Nothing mechanical, only worth saying. 7.2 limits how often a Natura may be
   * changed, so "changed this turn" is a fact a player has to be able to see
   * without it altering anything by itself.
   */
  | { kind: "note" }
  /**
   * A standing errand for the Władca Twierdzy, and the only rule on the board
   * that outlives the turn it started in.
   *
   * "Władca Twierdzy może wyznaczyć ci misję ... Po wypełnieniu misji, Władca
   * ofiaruje ci Tarczę Tolimana." Everything else an Obszar does is settled
   * where you stand; this one sends you away and waits.
   *
   * It lives in `seat_effects` rather than in a column of its own because that
   * is already the table for things that are true of a character for a while,
   * and a mission needs exactly what a status needs: something to show the
   * player, and something the rules can read. `done` is set when the errand
   * is done but the Tarcza has not been collected — for a Wróg or a Postać the
   * doing and the collecting happen in different places.
   */
  | { kind: "mission"; what: "foe" | "character" | "gold"; count?: number; done?: true }
  /**
   * No new Przyjaciele while this lasts (Zły Duch).
   *
   * "Nie możesz zdobywać nowych Przyjaciół, dopóki nie uwolnisz się od niego,
   * odwiedzając Pustelnię." A prohibition rather than a cost, and the only one
   * in the box that bars a whole kind of card from being picked up.
   */
  | { kind: "no-friends" }
  /**
   * Magia counts towards Miecz for one fight (Magia i Miecz).
   *
   * The Bojowy Rumak does the same thing as a held card and the spell does it
   * as a status, which is why the reckoning has to ask both — a character with
   * the Rumak and the Zaklęcie folds its Magia in once, not twice.
   *
   * "lecz nie w walce magicznej": there is no sense in adding Magia to Magia,
   * and the card says so rather than leaving it to be worked out.
   */
  | { kind: "magia-as-miecz" }
  /**
   * The movement roll is doubled (Formuła Przestrzeni).
   *
   * "wynik rzutu kostką przy wykonywaniu ruchu należy pomnożyć przez 2" — the
   * die, not the distance, which is the same distinction the Talizmany make in
   * a fight. It multiplies where `move-max` caps, so a character under both
   * walks the smaller of the two.
   */
  | { kind: "move-x2" }
  /**
   * This character has raised a hand against another (Dobre Bóstwo).
   *
   * "Jeśli podczas tej rozgrywki zaatakowałeś inną Postać ... musisz złożyć w
   * ofierze 1 Sz.Z." — the only rule in the box that asks what you did earlier
   * in the game rather than what is true of you now, so it is the only one that
   * needs remembering.
   *
   * It is a status because that is the table for facts about a character that
   * last, and this one lasts the whole game: nothing lifts it, which is what
   * `Ends.dispelled` says when nothing dispels.
   */
  | { kind: "attacker" };

export interface Status {
  /** Unique per holder, so two of the same card can be told apart. */
  id: string;
  /** The card that put it there, for the journal and the panel. */
  source: string;
  /** What a player is shown, in the language the cards use. */
  label: string;
  modifier: Modifier;
  ends: Ends;
}

/**
 * What the holder gets, summed.
 *
 * Computed, never stored — the same rule 1.2-1.5 puts on Przedmioty and
 * Przyjaciele. A buff that wrote itself into `sword_own` would survive its own
 * expiry, and rule 1.3 would then refuse to take it back off, because own
 * points may never fall below where the character started.
 */
export function bonusFrom(statuses: readonly Status[]): { miecz: number; magia: number } {
  let miecz = 0;
  let magia = 0;
  for (const status of statuses) {
    if (status.modifier.kind !== "points") continue;
    miecz += status.modifier.miecz ?? 0;
    magia += status.modifier.magia ?? 0;
  }
  return { miecz, magia };
}

/** The tightest cap in force, or null when nothing is limiting movement. */
export function movementCap(statuses: readonly Status[]): number | null {
  const caps = statuses
    .filter((status) => status.modifier.kind === "move-max")
    .map((status) => (status.modifier as { kind: "move-max"; fields: number }).fields);
  return caps.length > 0 ? Math.min(...caps) : null;
}

/** Whether anything is stopping the holder acting at all. */
export function frozen(statuses: readonly Status[]): boolean {
  return statuses.some((status) => status.modifier.kind === "frozen");
}

/**
 * What is stopping them, for a refusal that can name it — and what it lets
 * through anyway.
 *
 * Whichever is found first: two things freezing one character both stop it, and
 * the message wants one reason rather than a list. A Zaklęcie the status
 * exempts is castable while every other action is refused, which is the Krąg
 * Płomieni's whole shape — a prison with one key printed on it.
 */
export function frozenBy(
  statuses: readonly Status[],
): { label: string; oprocz: readonly string[] } | null {
  const held = statuses.find((status) => status.modifier.kind === "frozen");
  if (!held) return null;
  const modifier = held.modifier as { kind: "frozen"; oprocz?: readonly string[] };
  return { label: held.label, oprocz: modifier.oprocz ?? [] };
}

/**
 * Whether the holder is out of everybody's reach (20.5, Krąg Płomieni).
 *
 * „Ofiary nie można zaatakować, jednak można się jej wymknąć" says the same of
 * the Krąg as 20.5 does of Kamień, and both are the same question asked at the
 * same door — so a status says it rather than each command knowing which
 * conditions put somebody out of reach.
 */
export function untouchable(statuses: readonly Status[]): string | null {
  const held = statuses.find(
    (status) => status.modifier.kind === "frozen" && status.source !== "tura-stracona",
  );
  return held ? held.label : null;
}

/**
 * The obstacle this character may walk through wherever they stand, if any.
 *
 * One at a time is all the box can give: the two spells that grant it name
 * different obstacles, and a character holding both would be told about the
 * first — which is the one they cast first, and no worse an answer than asking
 * them.
 */
export function grantedCrossing(
  statuses: readonly Status[],
): { przez: "trzesawiska" | "lodowy-las"; label: string } | null {
  const held = statuses.find((status) => status.modifier.kind === "przeprawa");
  if (!held) return null;
  const modifier = held.modifier as { kind: "przeprawa"; przez: "trzesawiska" | "lodowy-las" };
  return { przez: modifier.przez, label: held.label };
}

/** Whether anything is stopping the holder speaking a Zaklęcie (9.6). */
export function spellsHushed(statuses: readonly Status[]): string | null {
  const held = statuses.find((status) => status.modifier.kind === "no-spells");
  return held ? held.label : null;
}

/** The Natura being forced on the holder, if any. */
export function forcedNature(statuses: readonly Status[]): Nature | null {
  const forced = statuses.find((status) => status.modifier.kind === "nature");
  return forced ? (forced.modifier as { kind: "nature"; to: Nature }).to : null;
}

/**
 * One of the holder's turns has gone by.
 *
 * Counted in the holder's OWN turns rather than the table's rounds. "Na 1 turę"
 * on a card means one of yours; measuring it in rounds would make a buff last
 * longer at a table of six than at a table of two, which no card says.
 */
export function afterTurn(statuses: readonly Status[]): Status[] {
  const left: Status[] = [];
  for (const status of statuses) {
    if (status.ends.kind !== "turns") {
      left.push(status);
      continue;
    }
    const turns = status.ends.turns - 1;
    if (turns > 0) left.push({ ...status, ends: { kind: "turns", turns } });
  }
  return left;
}

/** A fight has finished, however it finished (17.4). */
export function afterFight(statuses: readonly Status[]): Status[] {
  return statuses.filter((status) => status.ends.kind !== "fight");
}

/**
 * The holder threw for their freedom (both Świątynie, face 9).
 *
 * Rolled once and read by every status waiting on a die, because the board asks
 * for one throw a turn rather than one per affliction — and a character
 * unlucky enough to be held by two of them is not asked to roll twice.
 */
export function afterBreakout(statuses: readonly Status[], die: number): Status[] {
  return statuses.filter((status) => !(status.ends.kind === "roll" && die <= status.ends.upTo));
}

/** Whether this character has attacked another during the game (Dobre Bóstwo). */
export function hasAttacked(statuses: readonly Status[]): boolean {
  return statuses.some((status) => status.modifier.kind === "attacker");
}

/** Whether a status folds Magia into Miecz for a fight (Magia i Miecz). */
export function magiaCountsAsMiecz(statuses: readonly Status[]): boolean {
  return statuses.some((status) => status.modifier.kind === "magia-as-miecz");
}

/**
 * The thing standing between this character and the next point they would lose.
 *
 * Read at the one door every loss comes through, so an Ocalony spoken in
 * advance answers whatever the loss turns out to be — a lost fight, a Karta, an
 * Obszar, a fall off the Most.
 */
export function savedFromLoss(statuses: readonly Status[]): { id: string; label: string } | null {
  const held = statuses.find((status) => status.modifier.kind === "ocalenie");
  return held ? { id: held.id, label: held.label } : null;
}

/**
 * The Zaklęcie this character has spoken and not yet had take effect.
 *
 * Read with the clock, because the window is a clock: past it, the spell is
 * nobody's to answer any more and settles on its own.
 */
export function spokenSpell(
  statuses: readonly Status[],
): {
  id: string;
  spell: string;
  until: number;
  target?: {
    seatIndex?: number;
    fieldId?: string;
    fieldCardId?: string;
    note?: string;
  };
  decided?: { choices?: number[]; destination?: string };
} | null {
  const held = statuses.find((status) => status.modifier.kind === "spoken");
  if (!held) return null;
  const modifier = held.modifier as Extract<Modifier, { kind: "spoken" }>;
  return {
    id: held.id,
    spell: modifier.spell,
    until: modifier.until,
    target: modifier.target,
    decided: modifier.decided,
  };
}

/**
 * Whether the turn comes back to this character rather than moving on.
 *
 * Read at the pass, which is the only place a turn changes hands. The status
 * ticking down is what counts the turns out: three in a row is this turn and
 * two more, so the Zaklęcie is written as two.
 */
export function playsAgain(statuses: readonly Status[]): boolean {
  return statuses.some((status) => status.modifier.kind === "znowu");
}

/** How much the movement roll is multiplied by (Formuła Przestrzeni). */
export function moveMultiplier(statuses: readonly Status[]): number {
  return statuses.some((status) => status.modifier.kind === "move-x2") ? 2 : 1;
}

/** Whether something is barring this character from gaining Przyjaciele (Zły Duch). */
export function barredFromFriends(statuses: readonly Status[]): boolean {
  return statuses.some((status) => status.modifier.kind === "no-friends");
}

/** The errand this character is carrying for the Władca, if any. */
export function missionOf(
  statuses: readonly Status[],
): { id: string; what: "foe" | "character" | "gold"; count: number; done: boolean } | null {
  for (const status of statuses) {
    if (status.modifier.kind !== "mission") continue;
    return {
      id: status.id,
      what: status.modifier.what,
      count: status.modifier.count ?? 0,
      done: status.modifier.done ?? false,
    };
  }
  return null;
}

/** Whether anything the holder is under can be thrown off at all. */
export function heldByARoll(statuses: readonly Status[]): boolean {
  return statuses.some((status) => status.ends.kind === "roll");
}

/** Something happened to the holder. */
export function afterEvent(statuses: readonly Status[], event: EndingEvent): Status[] {
  return statuses.filter(
    (status) => !(status.ends.kind === "event" && status.ends.what === event),
  );
}

/**
 * Something took the effects off — Władca Zaklęć, and nothing else in the base
 * game.
 *
 * Only what was waiting to be dispelled goes. A countdown is not cancelled by
 * being argued with.
 */
export function dispel(statuses: readonly Status[]): Status[] {
  return statuses.filter((status) => status.ends.kind !== "dispelled");
}

/** What a player is told about how long this lasts. */
export function describeEnd(ends: Ends): string {
  switch (ends.kind) {
    case "turns":
      return ends.turns === 1
        ? "do końca tej tury"
        : `jeszcze ${ends.turns} ${ends.turns <= 4 ? "tury" : "tur"}`;
    // Named outright, because a round deadline is the one duration in this
    // union that is already a date. Everything else is a condition, and the
    // countdown is a date only after somebody walks the order forward.
    case "round":
      return `mija na początku rundy ${ends.round}`;
    case "fight":
      return "do końca walki";
    case "event":
      return ends.what === "crossing"
        ? "do przeprawy przez Trzęsawiska lub Lodowy Las"
        : ends.what === "bridge-entry"
          ? "do wejścia na Kamienny Most"
          : "do śmierci Postaci";
    case "dispelled":
      return "dopóki ktoś tego nie zdejmie";
    case "roll":
      return `dopóki nie wyrzucisz ${ends.upTo} lub mniej`;
  }
}

/* --------------------------------------------------------------------------
 * The four ad-hoc columns, read as effects.
 *
 * `turns_lost`, `stone_until_round`, `bridge_blocked_until_round` and
 * `nature_changed_round` predate this module and are read by the turn engine
 * itself when it works out whose turn is next. Moving them into the store would
 * be a rewrite of turn order to gain nothing, so they stay where they are and
 * are projected here instead.
 *
 * The point is that a player sees ONE set of effects. Which half of the model
 * an effect happens to live in is the app's problem, not theirs.
 * ----------------------------------------------------------------------- */

/**
 * The source a lost turn is filed under.
 *
 * Named once because two files have to agree on it: this one writes it, and
 * `lapsesOn` reads it to know that this status's countdown runs the other way.
 */
export const DEBT = "tura-stracona";

/** What a seat's own columns say about it, in the shape everything else uses. */
export interface TimedColumns {
  turnsLost: number;
  stoneUntilRound: number | null;
  bridgeBlockedUntilRound: number | null;
  natureChangedRound: number | null;
}

export function fromColumns(seat: TimedColumns, round: number): Status[] {
  const out: Status[] = [];

  if (seat.turnsLost > 0) {
    out.push({
      id: "tura-stracona",
      source: DEBT,
      // Just the fact. How many is the duration's to say, and saying it twice
      // gave "Traci 2 tury — jeszcze 2 tury".
      label: "Traci turę",
      modifier: { kind: "frozen" },
      // The one `turns` in this file that counts turns NOT taken. Everything
      // else with a countdown survives that many of the holder's goes; this
      // one is a debt, and each go it names is one the holder does not get.
      // `lapsesOn` has to know the difference, which is what `DEBT` is for.
      ends: { kind: "turns", turns: seat.turnsLost },
    });
  }

  // 20.1: three turns as stone, and the column holds the round it wears off on.
  //
  // A round deadline rather than a countdown, and that is not a presentational
  // choice: a statue takes no turns of its own, so a countdown measured in them
  // would never reach zero. `nextSeat` compares the same column against
  // `games.round` for exactly this reason.
  if (seat.stoneUntilRound !== null && seat.stoneUntilRound > round) {
    out.push({
      id: "kamien",
      source: "kamien",
      label: "Zamieniony w Kamień",
      modifier: { kind: "frozen" },
      ends: { kind: "round", round: seat.stoneUntilRound },
    });
  }

  // 11.11: a failed attempt on the Most cannot be repeated next turn. Stored as
  // a date for the same reason, and lifted by the round arriving.
  if (seat.bridgeBlockedUntilRound !== null && seat.bridgeBlockedUntilRound > round) {
    out.push({
      id: "most-zablokowany",
      source: "most",
      label: "Nie wejdziesz na Kamienny Most",
      modifier: { kind: "barred", place: "most" },
      ends: { kind: "round", round: seat.bridgeBlockedUntilRound },
    });
  }

  // 7.2 changed it; 7.3 is why the fact is worth keeping on screen for the rest
  // of the turn. What the Natura now *is* the seat card says with the Karta
  // Zmiany Natury, which is where the rule puts it — this is only the part a
  // player deciding what to do next has to know.
  if (seat.natureChangedRound !== null && seat.natureChangedRound === round) {
    out.push({
      id: "natura-zmieniona",
      source: "natura",
      label: "Natura zmieniona; drugiej zmiany nie będzie (7.3)",
      modifier: { kind: "note" },
      ends: { kind: "turns", turns: 1 },
    });
  }

  return out;
}

/** Everything true of a seat right now, from both halves of the model. */
export function allStatuses(
  stored: readonly Status[],
  seat: TimedColumns,
  round: number,
): Status[] {
  return [...fromColumns(seat, round), ...stored];
}

/* --------------------------------------------------------------------------
 * How an effect is drawn.
 * ----------------------------------------------------------------------- */

/** Whether the effect is doing the holder a favour. */
export type Tone = "dobry" | "zly" | "obojetny";

export interface Mark {
  /** A single character, drawn small beside the holder's name. */
  glyph: string;
  tone: Tone;
  /** The whole of it in words, for the hover. */
  title: string;
}

/**
 * One effect, as the mark a player sees.
 *
 * A glyph and not an icon file: there are six shapes here and each is doing the
 * work of a bullet, not of a picture. The hover carries the meaning, which is
 * where a player will look for it — a mark on a name is a reminder that
 * something is true, not an explanation of what.
 */
export function markOf(status: Status): Mark {
  const when = describeEnd(status.ends);
  const title = `${status.label} — ${when}`;
  switch (status.modifier.kind) {
    case "points": {
      const up = (status.modifier.miecz ?? 0) + (status.modifier.magia ?? 0) >= 0;
      return { glyph: up ? "\u25B2" : "\u25BC", tone: up ? "dobry" : "zly", title };
    }
    case "frozen":
      return { glyph: "\u25A0", tone: "zly", title };
    // A door closed on one kind of card, like `barred` on one place: nothing is
    // worse about the character, there is simply something they may not speak.
    case "no-spells":
      return { glyph: "⊘", tone: "zly", title };
    // A way opened rather than a weight carried: the one mark here that is
    // something a character *may* do.
    case "przeprawa":
      return { glyph: "⇥", tone: "dobry", title };
    // Turns coming back rather than being taken away, which is the other thing
    // this app's marks have never had to say.
    case "znowu":
      return { glyph: "↻", tone: "dobry", title };
    // Nothing has happened yet — that is the whole of what this one says.
    // A point of Życie held back rather than a weight carried.
    case "ocalenie":
      return { glyph: "✚", tone: "dobry", title };
    case "spoken":
      return { glyph: "…", tone: "obojetny", title };
    case "move-max":
      return { glyph: "\u25B8", tone: "zly", title };
    case "nature":
      return { glyph: "\u25D1", tone: "obojetny", title };
    case "barred":
      return { glyph: "\u2298", tone: "zly", title };
    // An errand rather than an affliction, so it is neither good nor bad to be
    // carrying one — and a filled star once it is done and only the collecting
    // is left.
    case "mission":
      return {
        glyph: status.modifier.done ? "\u2605" : "\u2606",
        tone: "obojetny",
        title,
      };
    // A door closed rather than a weight carried — nothing is worse about the
    // character, there is simply something they may no longer do.
    case "no-friends":
      return { glyph: "\u2298", tone: "zly", title };
    // Both make the character worth more for a moment, so they read as the same
    // upward mark a `points` buff does.
    case "magia-as-miecz":
    case "move-x2":
      return { glyph: "\u25B2", tone: "dobry", title };
    // A record rather than an effect: nothing about the character has changed,
    // and one Nieznajomy will want to know.
    case "attacker":
      return { glyph: "\u2694", tone: "obojetny", title };
    case "note":
      return { glyph: NOTE_GLYPH[status.source] ?? "\u25CB", tone: "obojetny", title };
  }
}

/**
 * The symbol a note carries, where what it is a note about has one.
 *
 * `note` is the bucket for effects with nothing mechanical to apply, and every
 * one of them drew the same hollow circle \u2014 which beside a player's name says
 * that something is true and not one word about what. It looked less like a
 * mark than like a picture that had failed to load.
 *
 * A Natura has a symbol of its own, so the bucket does not have to stay a
 * bucket. Anything else added here should be the same kind of thing: a shape
 * that names the subject, not one that grades it.
 */
const NOTE_GLYPH: Record<string, string> = {
  natura: "\u262F",
};
