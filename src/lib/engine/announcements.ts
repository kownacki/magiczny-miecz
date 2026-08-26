/** Things that happen TO a character, which they have to be told rather than left to notice. */

/**
 * Why this is not the journal.
 *
 * The journal is a log: complete, ordered, and read after the fact when the
 * table disagrees about something. It is the wrong instrument for "your turn
 * just ended" — that is a thing you need to know *now*, and half of these
 * arrive while somebody else is playing. Burza Siedmiu Słońc costs every
 * character in the Krąg a turn, drawn by one player on their own turn; the
 * others find out by noticing they were skipped, three turns later, if at all.
 *
 * So: a short list of things worth interrupting somebody for, and nothing else.
 * The test is whether a player who missed it would be confused later — losing a
 * turn passes, gaining a Sztuka Złota does not.
 */
export type AnnouncementKind = "turn-lost" | "stone" | "death";

export interface Announcement {
  kind: AnnouncementKind;
  title: string;
  /** What happened, in the language the cards use. */
  body: string;
  /** Red for what is taken away; there is nothing here that is not. */
  tone: "grave" | "plain";
}

/** The half of a seat these depend on. */
export interface Watched {
  turnsLost: number;
  stoneUntilTurn: number | null;
  eliminated: boolean;
}

export function watch(seat: Watched): Watched {
  return {
    turnsLost: seat.turnsLost,
    stoneUntilTurn: seat.stoneUntilTurn,
    eliminated: seat.eliminated,
  };
}

/**
 * What changed for the worse since last time, if anything.
 *
 * Compares two readings rather than listening for an event, because the thing
 * being watched arrives by poll and the event that caused it may have happened
 * on another player's device. A change is the only evidence there is.
 *
 * `before` being null is the first reading — a device that has just opened the
 * table announces nothing, or every reload would replay a death.
 */
export function announce(before: Watched | null, now: Watched): Announcement | null {
  if (!before) return null;

  // 4.4 first: it outranks everything, and a dead character is not also losing
  // a turn in any sense worth saying.
  if (now.eliminated && !before.eliminated) {
    return {
      kind: "death",
      // "MGR" is what the Karta Postaci prints beside the field name, and it is
      // legible there because the field is printed next to it. In a sentence it
      // is three letters standing for nothing a player has been told.
      title: "Twoja Postać zginęła",
      body:
        "Jej Przedmioty i Przyjaciele zostali na Obszarze, na którym zginęła. " +
        "Możesz wybrać nową Postać i zacząć od jej Obszaru startowego (4.4).",
      tone: "grave",
    };
  }

  // 20.1: three turns, and 20.5 makes them untouchable meanwhile — worth
  // saying, because from the outside it looks exactly like being skipped.
  if (now.stoneUntilTurn !== null && now.stoneUntilTurn !== before.stoneUntilTurn) {
    return {
      kind: "stone",
      title: "Zamieniony w Kamień",
      body:
        "Przez 3 tury nie możesz się poruszać ani nic posiadać (20.1-20.4). " +
        "Nikt nie może cię zaatakować ani rzucić na ciebie Zaklęcia (20.5).",
      tone: "grave",
    };
  }

  // 16.1. Said whether it was your own card or somebody else's — the Burza and
  // the Zaćmienie cost a turn to people who were not even playing at the time,
  // and being skipped without explanation is the thing this exists to stop.
  if (now.turnsLost > before.turnsLost) {
    const lost = now.turnsLost - before.turnsLost;
    return {
      kind: "turn-lost",
      title: lost === 1 ? "Tracisz turę" : `Tracisz ${lost} tury`,
      body:
        "Nie podejmujesz już żadnych działań — ta tura liczy się jako " +
        "stracona (16.1). Karty, których nie rozpatrzyłeś, zostają odkryte " +
        "na Obszarze (16.8).",
      tone: "grave",
    };
  }

  return null;
}
