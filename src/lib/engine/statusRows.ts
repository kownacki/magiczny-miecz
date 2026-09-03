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
 */

import {
  DEBT,
  describeEnd,
  markOf,
  type Mark,
  type Modifier,
  type Status,
} from "./status";
import type { QueueEntry } from "./turnQueue";

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
    // "Traci turę — traci 2 tury" is the same sentence twice.
    const many = `jeszcze ${owed} ${owed === 1 ? "tura" : owed <= 4 ? "tury" : "tur"}`;
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
