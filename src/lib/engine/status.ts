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
  | { kind: "tur"; turns: number }
  /** When the next fight finishes, however it finishes (17.4). */
  | { kind: "walka" }
  /** When a particular thing happens to the holder. */
  | { kind: "zdarzenie"; co: EndingEvent }
  /** Never on its own — only when something takes it off. Fatum, Krąg Płomieni. */
  | { kind: "rozproszone" };

/**
 * The events that end something.
 *
 * Deliberately a closed list. An effect that ends on "anything" is an effect
 * nobody can be told the rules of, and the point of writing these down is that
 * a player can be shown what they are waiting for.
 */
export type EndingEvent =
  /** Crossing the Trzęsawiska or the Lodowy Las — what sheds Południca. */
  | "przeprawa"
  /** Stepping onto the Kamienny Most. */
  | "wejscie-na-most"
  /** The holder's own death (4.4). */
  | "smierc";

/** What being under this effect actually does. */
export type Modifier =
  /** Added to the total at read time, never written to own points (1.2-1.5). */
  | { kind: "punkty"; miecz?: number; magia?: number }
  /** A hard cap on how far the holder may move, whatever the die says. Mgła. */
  | { kind: "ruch-max"; pola: number }
  /** Cannot act at all: Kamień, and the turn a Zaklinacz Czasu takes. */
  | { kind: "bez-ruchu" }
  /** Natura is forced to something while this lasts. */
  | { kind: "natura"; na: Nature };

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
 * Przyjaciele. A buff that wrote itself into `miecz_own` would survive its own
 * expiry, and rule 1.3 would then refuse to take it back off, because own
 * points may never fall below where the character started.
 */
export function bonusFrom(statuses: readonly Status[]): { miecz: number; magia: number } {
  let miecz = 0;
  let magia = 0;
  for (const status of statuses) {
    if (status.modifier.kind !== "punkty") continue;
    miecz += status.modifier.miecz ?? 0;
    magia += status.modifier.magia ?? 0;
  }
  return { miecz, magia };
}

/** The tightest cap in force, or null when nothing is limiting movement. */
export function movementCap(statuses: readonly Status[]): number | null {
  const caps = statuses
    .filter((status) => status.modifier.kind === "ruch-max")
    .map((status) => (status.modifier as { kind: "ruch-max"; pola: number }).pola);
  return caps.length > 0 ? Math.min(...caps) : null;
}

/** Whether anything is stopping the holder acting at all. */
export function frozen(statuses: readonly Status[]): boolean {
  return statuses.some((status) => status.modifier.kind === "bez-ruchu");
}

/** The Natura being forced on the holder, if any. */
export function forcedNature(statuses: readonly Status[]): Nature | null {
  const forced = statuses.find((status) => status.modifier.kind === "natura");
  return forced ? (forced.modifier as { kind: "natura"; na: Nature }).na : null;
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
    if (status.ends.kind !== "tur") {
      left.push(status);
      continue;
    }
    const turns = status.ends.turns - 1;
    if (turns > 0) left.push({ ...status, ends: { kind: "tur", turns } });
  }
  return left;
}

/** A fight has finished, however it finished (17.4). */
export function afterFight(statuses: readonly Status[]): Status[] {
  return statuses.filter((status) => status.ends.kind !== "walka");
}

/** Something happened to the holder. */
export function afterEvent(statuses: readonly Status[], event: EndingEvent): Status[] {
  return statuses.filter(
    (status) => !(status.ends.kind === "zdarzenie" && status.ends.co === event),
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
  return statuses.filter((status) => status.ends.kind !== "rozproszone");
}

/** What a player is told about how long this lasts. */
export function describeEnd(ends: Ends): string {
  switch (ends.kind) {
    case "tur":
      return ends.turns === 1
        ? "do końca tej tury"
        : `jeszcze ${ends.turns} ${ends.turns <= 4 ? "tury" : "tur"}`;
    case "walka":
      return "do końca walki";
    case "zdarzenie":
      return ends.co === "przeprawa"
        ? "do przeprawy przez Trzęsawiska lub Lodowy Las"
        : ends.co === "wejscie-na-most"
          ? "do wejścia na Kamienny Most"
          : "do śmierci Postaci";
    case "rozproszone":
      return "dopóki ktoś tego nie zdejmie";
  }
}
