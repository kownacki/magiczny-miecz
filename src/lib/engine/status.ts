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
  /** After this many more of the holder's own turns. Kamień is three (20.1). */
  | { kind: "turns"; turns: number }
  /** When the next fight finishes, however it finishes (17.4). */
  | { kind: "fight" }
  /** When a particular thing happens to the holder. */
  | { kind: "event"; co: EndingEvent }
  /** Never on its own — only when something takes it off. Fatum, Krąg Płomieni. */
  | { kind: "dispelled" };

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
  | { kind: "move-max"; pola: number }
  /** Cannot act at all: Kamień, and the turn a Zaklinacz Czasu takes. */
  | { kind: "frozen" }
  /** Natura is forced to something while this lasts. */
  | { kind: "nature"; na: Nature }
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
  | { kind: "note" };

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
    .map((status) => (status.modifier as { kind: "move-max"; pola: number }).pola);
  return caps.length > 0 ? Math.min(...caps) : null;
}

/** Whether anything is stopping the holder acting at all. */
export function frozen(statuses: readonly Status[]): boolean {
  return statuses.some((status) => status.modifier.kind === "frozen");
}

/** The Natura being forced on the holder, if any. */
export function forcedNature(statuses: readonly Status[]): Nature | null {
  const forced = statuses.find((status) => status.modifier.kind === "nature");
  return forced ? (forced.modifier as { kind: "nature"; na: Nature }).na : null;
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

/** Something happened to the holder. */
export function afterEvent(statuses: readonly Status[], event: EndingEvent): Status[] {
  return statuses.filter(
    (status) => !(status.ends.kind === "event" && status.ends.co === event),
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
    case "fight":
      return "do końca walki";
    case "event":
      return ends.co === "crossing"
        ? "do przeprawy przez Trzęsawiska lub Lodowy Las"
        : ends.co === "bridge-entry"
          ? "do wejścia na Kamienny Most"
          : "do śmierci Postaci";
    case "dispelled":
      return "dopóki ktoś tego nie zdejmie";
  }
}

/* --------------------------------------------------------------------------
 * The four ad-hoc columns, read as effects.
 *
 * `turns_lost`, `stone_until_turn`, `bridge_blocked_until_turn` and
 * `nature_changed_turn` predate this module and are read by the turn engine
 * itself when it works out whose turn is next. Moving them into the store would
 * be a rewrite of turn order to gain nothing, so they stay where they are and
 * are projected here instead.
 *
 * The point is that a player sees ONE set of effects. Which half of the model
 * an effect happens to live in is the app's problem, not theirs.
 * ----------------------------------------------------------------------- */

/** What a seat's own columns say about it, in the shape everything else uses. */
export interface TimedColumns {
  turnsLost: number;
  stoneUntilTurn: number | null;
  bridgeBlockedUntilTurn: number | null;
  natureChangedTurn: number | null;
}

export function fromColumns(seat: TimedColumns, turn: number): Status[] {
  const out: Status[] = [];

  if (seat.turnsLost > 0) {
    out.push({
      id: "tura-stracona",
      source: "tura-stracona",
      // Just the fact. How many is the duration's to say, and saying it twice
      // gave "Traci 2 tury — jeszcze 2 tury".
      label: "Traci turę",
      modifier: { kind: "frozen" },
      ends: { kind: "turns", turns: seat.turnsLost },
    });
  }

  // 20.1: three turns as stone, and the column holds the turn it wears off on.
  if (seat.stoneUntilTurn !== null && seat.stoneUntilTurn > turn) {
    out.push({
      id: "kamien",
      source: "kamien",
      label: "Zamieniony w Kamień",
      modifier: { kind: "frozen" },
      ends: { kind: "turns", turns: seat.stoneUntilTurn - turn },
    });
  }

  // 11.11: a failed attempt on the Most cannot be repeated next turn.
  if (seat.bridgeBlockedUntilTurn !== null && seat.bridgeBlockedUntilTurn > turn) {
    out.push({
      id: "most-zablokowany",
      source: "most",
      label: "Nie wejdziesz na Kamienny Most",
      modifier: { kind: "barred", place: "most" },
      ends: { kind: "turns", turns: seat.bridgeBlockedUntilTurn - turn },
    });
  }

  // 7.2 changed it; 7.3 is why the fact is worth keeping on screen for the rest
  // of the turn. What the Natura now *is* the seat card says with the Karta
  // Zmiany Natury, which is where the rule puts it — this is only the part a
  // player deciding what to do next has to know.
  if (seat.natureChangedTurn !== null && seat.natureChangedTurn === turn) {
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
  turn: number,
): Status[] {
  return [...fromColumns(seat, turn), ...stored];
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
    case "move-max":
      return { glyph: "\u25B8", tone: "zly", title };
    case "nature":
      return { glyph: "\u25D1", tone: "obojetny", title };
    case "barred":
      return { glyph: "\u2298", tone: "zly", title };
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
