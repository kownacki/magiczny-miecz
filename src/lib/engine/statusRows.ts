/**
 * Effects as a player reads them: when each one lapses, and what a second copy does.
 *
 * `status.ts` says what is true of a character and what stops it being true.
 * This says the two things a player standing in front of it actually asks —
 * *when does this end*, and *what happened when it landed on me twice* — and
 * both are questions the `Status` list can only half answer on its own.
 *
 * It is a separate file because it is the only part of the model that needs the
 * turn order. `status.ts` knows nothing about who plays next and should not
 * start: it is imported by `cardScript.ts`, which `turn.ts` imports, and asking
 * it to import the queue projector back would close that circle.
 *
 * `describeEnd` lives here for a related reason and not that one: it is the
 * sentence a player is told, and a sentence is presentation even when nothing
 * in it needs the turn order. `status.ts`'s own `markOf` still wants it for a
 * mark's hover title, and imports it back — a two-file cycle, but not the
 * one the paragraph above is guarding against, because `describeEnd` itself
 * reaches for nothing about who plays next.
 */

import { DEBT, type Ends, type Modifier, type Status } from "./status";
import { tury } from "./polish";
import type { QueueEntry } from "./turnQueue";

/** What a player is told about how long this lasts. */
export function describeEnd(ends: Ends): string {
  switch (ends.kind) {
    case "turns":
      return ends.turns === 1 ? "do końca tej tury" : `jeszcze ${tury(ends.turns)}`;
    // Named outright, because a round deadline is the one duration in this
    // union that is already a date. Everything else is a condition, and the
    // countdown is a date only after somebody walks the order forward.
    case "round":
      return `mija na początku rundy ${ends.round}`;
    // "Bieżącej" rather than "tej", because the two are different sentences
    // and only one of them is about somebody else's turn. `turns: 1` on the
    // active seat also reads "do końca tej tury" and means the holder's own;
    // this one means whichever turn is happening.
    case "this-turn":
      return "do końca bieżącej tury";
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
 * When it lapses.
 * ----------------------------------------------------------------------- */

/**
 * How much the round number can be trusted.
 *
 * A round deadline is stored and exact. A countdown in the holder's own turns
 * is a date only once somebody has walked the order forward, and that walk is a
 * forecast: almost everything that costs a turn in this game is created during
 * a turn, so the next card drawn can move it. The distinction is carried rather
 * than flattened, because a number a player was told and then watched change is
 * worse than one they were told was provisional.
 */
export type Certainty = "pewne" | "prognoza";

export interface Lapse {
  /** The round it stops being true in, on `games.round`'s clock. */
  round: number;
  certainty: Certainty;
  /**
   * Whether it lasts through the holder's own turn in that round.
   *
   * A countdown is spent by `tickEffects` when the holder finishes a turn, so
   * the last one is lived through and the effect is gone after it. A date —
   * Kamień, the Most bar, a debt paid off — is simply true until the round
   * arrives. Same number, two different moments inside the round, which is
   * exactly the thing a player has to know to plan a turn.
   */
  onOwnTurn: boolean;
}

/**
 * The round an effect lapses in, or `null` where it is not a time at all.
 *
 * `null` is the important half. Fatum ends when somebody speaks Władca Zaklęć,
 * a Świątynia's hold ends on a die roll, Magia i Miecz ends with the fight —
 * none of those has a round, and inventing one for the sake of a tidy column
 * would be the app telling a player something it does not know.
 *
 * `queue` is `projectQueue`'s output for the table as it stands. It is walked
 * rather than added to, because `round + turns` is wrong for precisely the
 * characters who have effects worth showing: a countdown in the holder's own
 * turns does not move on a turn the holder never takes, so a seat that is owed
 * turns or standing in Kamień would be handed a date that arrives too early.
 */
export function lapsesOn(
  status: Status,
  queue: readonly QueueEntry[],
  seatIndex: number,
): Lapse | null {
  if (status.ends.kind === "round") {
    return { round: status.ends.round, certainty: "pewne", onOwnTurn: false };
  }
  /**
   * The turn in progress, which is the round in progress.
   *
   * Exact rather than forecast: no walk is involved, because the moment it ends
   * at is the one already happening. `onOwnTurn` is false whoever is holding
   * it — the turn it ends with belongs to whoever is playing, and on a
   * bystander's card "po twojej turze" would name the wrong person entirely.
   */
  if (status.ends.kind === "this-turn") {
    const now = queue.find((entry) => entry.status === "active");
    return now ? { round: now.round, certainty: "pewne", onOwnTurn: false } : null;
  }
  if (status.ends.kind !== "turns") return null;

  const debt = status.source === DEBT;

  /**
   * The holder's actual goes, in order.
   *
   * Skipped slots are not turns and tick nothing: `finishTurn` calls
   * `tickEffects` for the seat that played and for nobody it passed over.
   *
   * The turn in progress counts for a countdown and not for a debt. "Do końca
   * tej tury" on the active seat means the one they are standing in, so it is
   * the first of theirs — but a debt is turns taken away, and the turn already
   * happening is not one of them. Counting it dated a debt to the round its
   * holder was playing in, which is a sentence that answers its own question
   * wrongly: "traci 2 tury — wraca w rundzie 1" was on screen during round 1.
   */
  const own = queue.filter(
    (entry) =>
      entry.seatIndex === seatIndex &&
      (debt ? entry.status === "upcoming" : entry.status !== "skipped"),
  );

  /**
   * A lost turn counts the other way, so it is read the other way.
   *
   * Every other countdown says "this survives N more of your goes". This one
   * says "N of your goes are taken from you", and what ends it is the first go
   * that actually happens. Reading it like the others would put the debt's end
   * two turns past the turn that discharges it.
   */
  const at = debt ? 0 : status.ends.turns - 1;
  const entry = own[at];
  if (!entry) return null;

  return { round: entry.round, certainty: "prognoza", onOwnTurn: !debt };
}

/**
 * The duration in words, with the round on the end where there is one.
 *
 * `mine` is whose effects these are. The same row is drawn twice — on your own
 * strip and on somebody else's tile in the roster — and "po twojej turze" is
 * only true on one of them. Polish has no ungendered third person that reads
 * naturally here, so the other case names the game's own word instead.
 */
export function whenSaid(status: Status, lapse: Lapse | null, mine: boolean): string {
  const said = describeEnd(status.ends);

  // A debt is not "do końca tej tury"; it is turns you do not get. The generic
  // words are wrong enough here to be worth replacing outright.
  if (status.source === DEBT && status.ends.kind === "turns") {
    const owed = status.ends.turns;
    // Said the way the label is not, because the two are printed side by side:
    // "Traci turę — traci 2 tury" is the same sentence twice. Owed is a debt
    // counted down to zero rather than lost to a verb, so 1 is nominative
    // ("1 tura") where `tury` — built for "tracisz turę" — would say "turę";
    // from 2 up the words agree either way, so `tury` settles which of them.
    const many = owed === 1 ? "jeszcze 1 tura" : `jeszcze ${tury(owed)}`;
    return lapse ? `${many} — wraca w rundzie ${lapse.round}` : many;
  }

  // `round` already names its round; anything else would say it twice.
  if (!lapse || status.ends.kind === "round") return said;

  return lapse.onOwnTurn
    ? `${said} — mija w rundzie ${lapse.round}, po ${mine ? "twojej turze" : "turze Postaci"}`
    : `${said} — mija w rundzie ${lapse.round}`;
}

/* --------------------------------------------------------------------------
 * What a second copy does.
 * ----------------------------------------------------------------------- */

/**
 * The four things that can happen when an effect lands on a character twice.
 *
 * Declared rather than decided per card. Every reader in `status.ts` already
 * takes a position — `bonusFrom` adds, `movementCap` takes the smaller,
 * `frozen` asks whether there is any at all — and until now those positions
 * were only visible by reading each one. A player asking "I was hit by that
 * twice, did it do anything?" deserves an answer that does not depend on which
 * function happens to read the effect.
 */
export type Stacking =
  /** Two of them are worth twice as much: `bonusFrom` adds them up. */
  | "sums"
  /** They queue: each is spent in its turn, one at a time. */
  | "queues"
  /** The newest replaces the deadline; two never reach further than the later. */
  | "refreshes"
  /** A second one changes nothing at all. */
  | "exclusive";

/**
 * How each kind of effect stacks, in one table.
 *
 * A `Record` over the whole union and not a `Partial`, so a new `Modifier`
 * cannot be added without the compiler asking this question — the same
 * discipline `RULE_FOR` uses to make every journal line name its rule.
 */
const STACKING: Record<Modifier["kind"], Stacking> = {
  // Off is off. A second one lifts a cap that is already lifted.
  "bez-limitu-zaklec": "exclusive",
  // 1.2-1.5's arithmetic: two Eliksiry are two points, and `bonusFrom` sums.
  points: "sums",
  // `movementCap` takes the smaller of the caps, so a second one either tightens
  // it or does nothing. Never a further restriction than the tightest.
  "move-max": "exclusive",
  // `frozen` asks only whether there is one. Note this is the general answer:
  // the two column-born freezes below say otherwise for themselves.
  frozen: "exclusive",
  "no-spells": "exclusive",
  przeprawa: "exclusive",
  // Two Formuły Czasu do not make six turns: `playsAgain` is a question with a
  // yes-or-no answer, and the countdowns run side by side, so what stands is
  // the longer of them.
  znowu: "refreshes",
  // Each held point of Życie is spent separately (`savedFromLoss` takes one).
  ocalenie: "queues",
  // Each spoken Zaklęcie waits on its own window and is answered on its own.
  spoken: "queues",
  // `forcedNature` takes the first it finds, so a second forcing is inert.
  nature: "exclusive",
  // 11.11's bar is a date in a column; setting it again moves the date.
  barred: "refreshes",
  note: "exclusive",
  // Two errands are two errands, each finished and collected separately.
  mission: "queues",
  "no-friends": "exclusive",
  "magia-as-miecz": "exclusive",
  // `moveMultiplier` answers 2 or 1. Never 4.
  "move-x2": "refreshes",
  attacker: "exclusive",
};

/**
 * The four ad-hoc columns answer for themselves.
 *
 * They have to, because three of them wear the same `Modifier` and stack three
 * different ways: a lost turn is a debt that accumulates, Kamień is a date that
 * is rewritten, and both read as `frozen`. Keying the table on the modifier
 * alone would have to pick one and be wrong about the other. `fromColumns`
 * enumerates exactly these sources, which is why a partial map is honest here
 * and would not be above.
 */
const STACKING_BY_SOURCE: Record<string, Stacking> = {
  // `turns_lost` is incremented on the way in and spent one per pass.
  [DEBT]: "queues",
  // `stone.ts` writes `round + STONE_TURNS` outright: a second petrification
  // resets the sentence rather than adding to it.
  kamien: "refreshes",
  most: "refreshes",
  natura: "exclusive",
};

/** How this particular effect stacks. */
export function stackingOf(status: Status): Stacking {
  return STACKING_BY_SOURCE[status.source] ?? STACKING[status.modifier.kind];
}

/* --------------------------------------------------------------------------
 * How an effect is drawn.
 *
 * `markOf` used to sit in `status.ts`, next to `describeEnd` — it is here for
 * the same reason: a glyph and a hover title are what a player is shown, not
 * what is true of a character, and `status.ts` importing this file back for
 * either one would close the cycle the module doc above already turns away.
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
    // The console's switch, and the only mark here that is not something the
    // game did to anybody. Neutral rather than „dobry": having no cap is not a
    // blessing a Postać earned, it is a rule that has been turned off, and a
    // green triangle beside a name would read as the former.
    case "bez-limitu-zaklec":
      return { glyph: "∞", tone: "obojetny", title };
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

/* --------------------------------------------------------------------------
 * The rows.
 * ----------------------------------------------------------------------- */

export interface StatusRow {
  /** Stable across renders and unique within the holder. */
  key: string;
  label: string;
  mark: Mark;
  stacking: Stacking;
  /** How many applications this row stands for. */
  count: number;
  /** Every status folded into it, in the order they arrived. */
  from: readonly Status[];
  /** When the row as a whole stops being true. */
  lapse: Lapse | null;
  /** That, in words. */
  when: string;
}

/**
 * One row per thing a player has to know, with the stacking already resolved.
 *
 * `sums` is the one class that is never folded. Two Eliksiry are two points but
 * they were drunk on different turns and lapse on different turns, so one row
 * saying "+2 Miecz" would have to name one expiry and lie about the other. The
 * total belongs in the header, where `bonusFrom` already puts it; the rows stay
 * one per source so each can say its own date.
 *
 * Everything else folds by source, and the row keeps the member that lasts
 * longest — because that is when the row stops being true. An effect with no
 * date at all outlasts every date: it may never end, and a row saying "mija w
 * rundzie 7" over a Fatum nobody has dispelled would be a promise.
 *
 * Order is the order it was given, which `allStatuses` fixes and `seat-card`
 * re-sorts by tone. Sorting here as well would make two orders to keep in step.
 */
export function foldStatuses(
  statuses: readonly Status[],
  at?: { queue: readonly QueueEntry[]; seatIndex: number; mine?: boolean },
): StatusRow[] {
  const rows: StatusRow[] = [];
  const byKey = new Map<string, StatusRow>();

  for (const status of statuses) {
    const stacking = stackingOf(status);
    const lapse = at ? lapsesOn(status, at.queue, at.seatIndex) : null;
    // `sums` never folds, so its key is the status itself; the rest fold on
    // where they came from, with the modifier in the key so one card that hangs
    // two different effects on a character keeps them apart.
    const key = stacking === "sums" ? status.id : `${status.source}|${status.modifier.kind}`;

    const already = byKey.get(key);
    if (!already) {
      const row: StatusRow = {
        key,
        label: status.label,
        mark: markOf(status),
        stacking,
        count: 1,
        from: [status],
        lapse,
        when: whenSaid(status, lapse, at?.mine ?? false),
      };
      byKey.set(key, row);
      rows.push(row);
      continue;
    }

    already.count += 1;
    already.from = [...already.from, status];
    if (outlasts(lapse, already.lapse)) {
      already.lapse = lapse;
      already.when = whenSaid(status, lapse, at?.mine ?? false);
    }
  }

  return rows;
}

/** Whether `a` stops being true later than `b` — with "never" later than any date. */
function outlasts(a: Lapse | null, b: Lapse | null): boolean {
  if (a === null) return b !== null;
  if (b === null) return false;
  return a.round > b.round;
}
