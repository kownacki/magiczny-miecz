/** The per-turn state machine: what the active player is being asked for, and what answering it does. */

import {
  DOLNY_KRAG,
  FIELDS,
  KAMIENNY_MOST,
  type BoardField,
  GUARDIAN_STRENGTH_OFFSET,
  type BridgeEntrance,
  type Direction,
  bridgeEntranceFrom,
  moveOptions,
  ringOf,
  type FieldId,
} from "./board";
import { resolutionOrder, type TurnCard } from "./state";
import type { Crossing } from "./rings";
import { compareCombat, type CombatKind, type CombatResult } from "./combat";

/**
 * A turn is rule 10.1's two steps — move, then deal with where you landed —
 * expressed as the question currently on screen.
 *
 * `rzut` and `ruch` are separate phases on purpose. The roll has to be visible
 * and settled before the two destinations are offered, because at a physical
 * table someone reads the die aloud and the others check it; collapsing them
 * would hide the number the table is agreeing on.
 */
export type TurnPhase =
  | { phase: "roll" }
  | { phase: "move"; roll: number; options: TurnMoveOption[] }
  | {
      phase: "field";
      fieldId: FieldId;
      /** Where this move started, which the Przeprawa sends you back to. */
      from: FieldId | null;
      draw: number;
      drawn: TurnCard[];
      /**
       * Cards already resolved this turn, by id.
       *
       * A Spotkanie stays on the field until the turn ends (16.8), so "still
       * lying here" cannot mean "still to be dealt with". Without this the
       * draw modal would offer the same card again the moment it closed.
       */
      resolved?: string[];
      /**
       * Cards already fought this turn, by id.
       *
       * Rule 17.4 ends the fight the moment the two dice are compared — "na tym
       * walka się kończy" — win, lose or draw. A beaten Wróg is a trophy to be
       * picked up and a surviving one is something to walk away from; neither is
       * something to roll against a second time on the same turn. Without this
       * the card simply stays on the field and can be fought over and over,
       * which is a way to farm a Smok for free until the dice go your way.
       *
       * By card id rather than by copy, because 17.5 has several creatures
       * attack as one: their Miecze are summed into a single fight, so settling
       * that fight settles all of them.
       */
      fought?: string[];
      /**
       * This turn was spent meeting somebody rather than exploring (13.2).
       *
       * "Postać musi dokonać wyboru między spotkaniem z inną Postacią
       * znajdującą się na tym samym Obszarze, a badaniem samego Obszaru." One
       * or the other, and the app offered both — you could attack a rival and
       * then go through the Obszar's own instruction on the same turn, which is
       * two turns' worth of a square.
       *
       * A mark rather than a lookup, because the fight is gone from the turn
       * state by the time it matters: a duel that has been settled leaves
       * nothing behind saying it happened.
       */
      met?: true;
    }
  | { phase: "fight"; fight: Fight }
  /** Standing at a bridge entrance with its guardian in the way (11.9-11.11). */
  | { phase: "bridge"; bridge: BridgeEntrance }
  | { phase: "end" };

/**
 * A fight in progress, kept in the turn state so every device at the table
 * watches the same numbers appear rather than one player narrating them.
 *
 * `playerTotal` is seeded from the character's own points but stays editable,
 * because rule 1.5 counts Przedmioty and Przyjaciele towards the total and
 * those are physical cards lying on the table that the referee does not track
 * yet. Guessing low and letting the player correct it is honest; silently
 * fighting with the wrong number is not.
 */
export interface Fight {
  cardId: string;
  cardName: string;
  /** Staged by the test shortcut rather than drawn — see `TurnCard.granted`. */
  granted?: boolean;
  /** Seat index of the opponent when this is a duel between characters (17.6). */
  opponentSeat?: number;
  kind: CombatKind;
  enemyTotal: number;
  playerTotal: number;
  playerRoll: number | null;
  enemyRoll: number | null;
  result: CombatResult | null;
  /** The field to return to once the fight is settled. */
  fieldId: FieldId;
  draw: number;
  drawn: TurnCard[];
  /**
   * Every card that will count as fought once this is over — what the field had
   * already settled, plus the creature or creatures in this fight. Carried
   * through the fight so that ending it cannot lose the list.
   */
  fought?: string[];
  /** 13.2's mark, carried through the fight so the field phase gets it back. */
  met?: true;
  /**
   * Set when this is not a fight with a drawn card but with something standing
   * in a doorway — a bridge guardian or the Rycerz in the Lodowy Las.
   *
   * It changes both ends of the fight. A loss costs what that doorway charges
   * rather than the usual point of Życie (11.4, 11.8, 11.11), and winning moves
   * the character through rather than returning it to the field the fight
   * interrupted.
   */
  guardian?: GuardianFight;
  /**
   * Set when a Przyjaciel was sent out to fight this rather than the character
   * fighting it (the Poszukiwacz Przygód, "zlecić temu Przyjacielowi, by
   * zaatakował Postać lub Wroga, oddalonego najwyżej o 3 Obszary").
   *
   * Carried on the fight because it changes who pays at the end of it: "w
   * przypadku porażki ty nie tracisz punktu Życia, ale twój Przyjaciel ginie".
   * The character is not in this fight and cannot be hurt by losing it, so the
   * usual point of Życie is never spent — which is a fact about how the fight
   * started, and by the time it is settled there is nothing else left to say so.
   */
  raid?: {
    cardId: string;
    /**
     * Conjured by a Zaklęcie rather than sent from a hand (GOLEM, HOMUNCULUS).
     *
     * The difference is what a loss costs. A wyprawa the Przyjaciel loses kills
     * the Przyjaciel — „w przypadku porażki ty nie tracisz punktu Życia, ale
     * twój Przyjaciel ginie" — and there is a Karta to lose. A summoned
     * creature is nobody's card: „jeśli zwycięży [ofiara] — nic się nie
     * dzieje", and the caster has nothing at stake at all.
     */
    summoned?: boolean;
    /**
     * The row on the board being attacked, when the target is a Karta and not a
     * Postać.
     *
     * Carried because a fight this far from the character cannot be found again
     * afterwards: a normal fight settles cards out of `drawn`, which is the
     * stack in front of the seat, and a raider reaches Obszary the seat is not
     * standing on. Without the row id a beaten Wróg stayed lying there — the
     * Poszukiwacz killed him twice a turn, for ever.
     */
    fieldCardId?: string;
  };
  /**
   * Where the turn goes when this is over, when the fight interrupted it.
   *
   * Every other fight in the game happens on the Obszar a move ended on, so it
   * ends by going back to that Obszar — which is what `endFight` does. A
   * summoned creature is the exception: the Golem and the Homunculus are spoken
   * „przed wykonaniem ruchu", so the caster still owes their own turn, and
   * dropping them into the field phase afterwards would quietly eat the move.
   */
  resume?: { phase: "roll" };
  /**
   * The die that decides the guardian's own strength, where the board makes it
   * a roll rather than a number: "1 - 5; 2 - 6; ... 6 - 10" at both bridge
   * entrances. Null while it is still owed. Absent when the creature has a
   * printed strength, as the Rycerz does.
   */
  strengthRoll?: number | null;
  /**
   * Who has claimed the moment before the dice, and until when (17.3, 17.7).
   *
   * 17.3 puts a character's spells before their own roll; 17.7 gives the same
   * right to the other side of a duel; and thirteen of the twenty-seven cards
   * say "w dowolnej chwili", which lets anybody at the table speak into
   * somebody else's fight (9.1, 9.6). So the question is not *whether* a
   * bystander may cast — they may — but how a table of four says so without
   * everybody being asked every time.
   *
   * They ask for the floor, and get it alone. Nobody is polled and nobody is
   * named in advance, which also keeps 9.3: a window that opened only for the
   * people holding a castable spell announced who was holding one, every
   * fight, before anyone had decided anything. Reaching for a card is a tell
   * you make yourself.
   *
   * The dice wait only while somebody holds this. An empty floor is the normal
   * state of a fight, and the roll goes straight through it.
   */
  caster?: SpellFloor | null;
}

/** A claim on the moment before the dice: whose it is, and when it lapses. */
export interface SpellFloor {
  seat: number;
  /** Epoch milliseconds. Written by the server, which owns the clock. */
  until: number;
}

export type GuardianFight =
  | { kind: "bridge"; entrance: BridgeEntrance }
  | { kind: "crossing"; crossing: Crossing }
  /**
   * The Demon Zagłady and the Monstrum, which stand on the bridge itself rather
   * than at its entrance (14.6). Their strength is two dice rather than the
   * entrances' one-plus-four, and a character cannot pass until one is dead.
   */
  | { kind: "bridge-field"; fieldId: FieldId; name: string; combat: CombatKind };

export interface TurnMoveOption {
  direction: Direction;
  fieldId: FieldId;
  fieldName: string;
  /** Names of the fields walked through, for the player to check against the board. */
  through: string[];
  /**
   * Set when taking this option is an attempt to step onto the Kamienny Most
   * rather than to finish the walk (11.10). `fieldId` is then the entrance the
   * character stops at to face the guardian, not where it ends up.
   */
  bridge?: BridgeEntrance;
}

export const DIRECTION_LABEL: Record<Direction, string> = {
  clockwise: "zgodnie ze wskazówkami zegara",
  widdershins: "przeciwnie do wskazówek zegara",
};

/** A turn always opens on the roll. */
export function startTurn(): TurnPhase {
  return { phase: "roll" };
}

/**
 * Movement on the Kamienny Most, where the die plays no part.
 *
 * Rule 10.3: a character on the bridge moves at one field per turn and must
 * stop on each, resolving it before going on. There is no direction to choose
 * beyond onward or back — 10.4 lets a character turn around and leave at any
 * time, which is why both neighbours are offered.
 */
export function bridgeOptions(
  fieldId: FieldId,
  /**
   * Whether the Zamek is a square this character may stop on.
   *
   * "Postać, która wejdzie na Most nie posiadając tej Tarczy, musi ominąć Zamek
   * (potraktować to pole tak, jakby go nie było)." Without a Tarcza Tolimana
   * the Zamek is not a place you decline to enter — it is not there, so the
   * step goes over it to the field beyond, in whichever direction you were
   * walking. It sits dead centre of the nine, so both directions cross it.
   *
   * A fact about the seat rather than the board, so it arrives decided, the
   * same way `bridgeOffered` does.
   */
  mayEnterCastle = true,
): TurnMoveOption[] {
  const at = KAMIENNY_MOST.findIndex((field) => field.id === fieldId);
  if (at === -1) return [];

  /** One step that way, and one further where the Zamek is not there. */
  const step = (from: number, by: 1 | -1) => {
    const next = KAMIENNY_MOST[from + by];
    if (!next) return null;
    if (next.id !== "zamek-bestii" || mayEnterCastle) return { field: next, over: [] as FieldId[] };
    const beyond = KAMIENNY_MOST[from + by + by];
    return beyond ? { field: beyond, over: [next.id] } : null;
  };

  const options: TurnMoveOption[] = [];
  const onward = step(at, 1);
  const back = step(at, -1);
  // The bridge is a line, not a ring, so an entrance has only one neighbour.
  if (onward) {
    options.push({
      direction: "clockwise",
      fieldId: onward.field.id,
      fieldName: onward.field.name,
      through: onward.over,
    });
  }
  if (back) {
    options.push({
      direction: "widdershins",
      fieldId: back.field.id,
      fieldName: back.field.name,
      through: back.over,
    });
  }
  return options;
}

/**
 * Rule 10.2: the roll gives a distance, and the player picks which way round
 * the ring to walk it. Both landing squares are offered rather than a direction
 * being asked for first, because what a player actually decides between is two
 * *places*, not two abstract directions.
 */
export function afterRoll(
  fieldId: FieldId,
  roll: number,
  /**
   * Whether the character is in a position to try for the bridge at all — it
   * needs a Magiczny Miecz, and 11.11 bars anyone who failed there last turn.
   * Both are facts about the seat rather than the board, so they arrive here
   * already decided.
   */
  {
    bridgeOffered = false,
    cap = null,
    mayEnterCastle = true,
  }: {
    bridgeOffered?: boolean;
    /** Whether the Zamek exists for this character — see `bridgeOptions`. */
    mayEnterCastle?: boolean;
    /**
     * The furthest this character may walk whatever the die says — Mgła, and
     * nothing else in the base game (`move-max`).
     *
     * A cap on the *walk*, not on the die. The number thrown stays in the turn
     * state and on screen, because the app must not tell a player they rolled
     * something they did not; what shrinks is the list of places the roll can
     * take them. Null when nothing is limiting the move, which is almost always.
     */
    cap?: number | null;
  } = {},
): TurnPhase {
  // On the bridge the roll is ignored entirely (10.3) — one field per turn,
  // either onward or back the way you came.
  if (ringOf(fieldId) === KAMIENNY_MOST) {
    return { phase: "move", roll, options: bridgeOptions(fieldId, mayEnterCastle) };
  }
  const ring = ringOf(fieldId) ?? DOLNY_KRAG;
  const walks = moveOptions(ring, fieldId, cap === null ? roll : Math.min(roll, cap));
  const options: TurnMoveOption[] = walks.map((option) => ({
    direction: option.direction,
    fieldId: option.field.id,
    fieldName: option.field.name,
    through: option.through.map((field) => field.name),
  }));

  // 11.10: the bridge is taken in passing. A character may try for it only if
  // this move would carry it *through* an entrance with a step still to spend —
  // "Postać, której ruch kończy się dokładnie na Obszarze Wymarłego Miasta albo
  // Ruin Twierdzy, nie może podjąć próby wkroczenia na Most." Landing squares
  // are therefore not candidates, only fields walked over.
  if (bridgeOffered) {
    for (const walk of walks) {
      const at = walk.through.findIndex((field) => bridgeEntranceFrom(field.id));
      if (at === -1) continue;
      const entrance = bridgeEntranceFrom(walk.through[at].id)!;
      options.push({
        direction: walk.direction,
        fieldId: entrance.from,
        fieldName: FIELDS.get(entrance.from)?.name ?? entrance.from,
        through: walk.through.slice(0, at).map((field) => field.name),
        bridge: entrance,
      });
    }
  }

  return { phase: "move", roll, options };
}

/**
 * Landing on a field. Rule 13.4: a field marked "WYCIĄGNIJ N KART" makes the
 * character draw, and 13.1 restricts encounters and exploration to the field a
 * move *ended* on — never one merely passed through.
 */
export function afterMove(
  field: BoardField,
  from: FieldId | null = null,
  /**
   * Cards already lying face up on the field (16.8), which the arriving
   * character has to deal with along with anything it draws.
   *
   * They count against the field's printed draw: 13.4 says "ciągnie się ich
   * tylko tyle, by ich suma równała się liczbie Kart" — a Płaskowyż Mgieł with
   * two cards on it is drawn down to one, not three.
   */
  waiting: readonly TurnCard[] = [],
): TurnPhase {
  return {
    phase: "field",
    fieldId: field.id,
    from,
    draw: field.draw ?? 0,
    drawn: resolutionOrder([...waiting]),
  };
}

/**
 * The one-turn bar 11.11 puts on a failed or drawn bridge attempt.
 *
 * "nie może w następnej turze podjąć kolejnej próby wejścia na Most" — the next
 * turn, and only the next one. The turn counter counts rounds rather than
 * seat-turns, so a seat gets exactly one go per number, and barring the next
 * round means the mark has to outlast it: set at `turn + 2` and tested with a
 * strict `>`, an attempt on round 3 is barred on round 4 and free again on
 * round 5. The obvious `turn + 1` bars nothing.
 */
export function bridgeBlockUntil(turn: number): number {
  return turn + 2;
}

export function bridgeBlocked(blockedUntil: number | null, turn: number): boolean {
  return blockedUntil !== null && blockedUntil > turn;
}

/** Stops the move at a bridge entrance, with the guardian still to be dealt with. */
export function atBridge(bridge: BridgeEntrance): TurnPhase {
  return { phase: "bridge", bridge };
}

/**
 * Records a card the player says they drew, keeping the stack in the order
 * rule 15.2 requires it to be resolved in — lowest class numeral first.
 */
export function afterDraw(phase: TurnPhase, card: TurnCard): TurnPhase {
  if (phase.phase !== "field") return phase;
  return { ...phase, drawn: resolutionOrder([...phase.drawn, card]) };
}

export function endTurn(): TurnPhase {
  return { phase: "end" };
}

/**
 * Opens a fight against a drawn card.
 *
 * Rule 16.3: a Demon forces magical combat, which rule 18.2 resolves the same
 * way but on Magia instead of Miecz — so which parameter is in play is decided
 * here, once, by which value the card printed.
 */
export function startFight(
  phase: TurnPhase,
  card: {
    cardId: string;
    cardName: string;
    miecz?: number;
    magia?: number;
    opponentSeat?: number;
    granted?: boolean;
    /**
     * The ids this fight settles. Several when 17.5 has a pack attack as one,
     * and `cardId` is then their ids joined together for display rather than
     * something to look up.
     */
    settles?: string[];
    /** Who is fighting instead of the character, and what they are sent at. */
    raid?: Fight["raid"];
    /** Where to hand the turn back, for a fight that interrupted it. */
    resume?: Fight["resume"];
  },
  playerTotals: { miecz: number; magia: number },
): TurnPhase {
  if (phase.phase !== "field") return phase;
  const kind: CombatKind = card.magia !== undefined ? "magical" : "ordinary";
  const enemyTotal = (kind === "magical" ? card.magia : card.miecz) ?? 0;
  return {
    phase: "fight",
    fight: {
      cardId: card.cardId,
      cardName: card.cardName,
      ...(card.granted ? { granted: true } : {}),
      ...(card.opponentSeat !== undefined ? { opponentSeat: card.opponentSeat } : {}),
      ...(card.raid ? { raid: card.raid } : {}),
      ...(card.resume ? { resume: card.resume } : {}),
      kind,
      enemyTotal,
      playerTotal: kind === "magical" ? playerTotals.magia : playerTotals.miecz,
      playerRoll: null,
      enemyRoll: null,
      result: null,
      fieldId: phase.fieldId,
      draw: phase.draw,
      drawn: phase.drawn,
      /**
       * 13.2's mark, set here because a duel *is* the meeting.
       *
       * Carried through the fight the way `drawn` and `fought` are, so it is
       * still there when `endFight` lays the field phase back out — by then the
       * duel is over and nothing else would remember it happened.
       */
      ...(card.opponentSeat !== undefined || phase.met ? { met: true as const } : {}),
      fought: [
        ...(phase.fought ?? []),
        // A duel settles no card: the other character is still there, and 17.9
        // ends the turn anyway.
        ...(card.opponentSeat !== undefined ? [] : (card.settles ?? [card.cardId])),
      ],
    },
  };
}

/**
 * Opens a fight with something guarding a way off the ring.
 *
 * The two bridge guardians have no strength until a die is thrown for them, so
 * the fight starts with `enemyTotal` at zero and `strengthRoll` owed; the Rycerz
 * Wiecznych Śniegów prints Miecz 10 and needs no such step.
 */
export function startGuardianFight(
  guardian: GuardianFight,
  playerTotals: { miecz: number; magia: number },
  fieldId: FieldId,
): TurnPhase {
  const rolled = guardian.kind === "bridge" || guardian.kind === "bridge-field";
  const stat =
    guardian.kind === "bridge"
      ? guardian.entrance.stat
      : guardian.kind === "bridge-field"
        ? guardian.combat === "magical"
          ? "magic"
          : "sword"
        : "sword";
  const kind: CombatKind = stat === "magic" ? "magical" : "ordinary";
  const name =
    guardian.kind === "bridge"
      ? guardian.entrance.guardian
      : guardian.kind === "bridge-field"
        ? guardian.name
        : guardian.crossing.test?.kind === "fight"
          ? guardian.crossing.test.guardian
          : "Strażnik";
  const printed =
    guardian.kind === "crossing" && guardian.crossing.test?.kind === "fight"
      ? guardian.crossing.test.miecz
      : 0;

  return {
    phase: "fight",
    fight: {
      cardId: `guardian:${name}`,
      cardName: name,
      kind,
      enemyTotal: rolled ? 0 : printed,
      playerTotal: kind === "magical" ? playerTotals.magia : playerTotals.miecz,
      playerRoll: null,
      enemyRoll: null,
      result: null,
      fieldId,
      draw: 0,
      drawn: [],
      guardian,
      ...(rolled ? { strengthRoll: null } : {}),
    },
  };
}

/** Whether the guardian's own strength is still owed a die. */
export function strengthPending(fight: Fight): boolean {
  return fight.strengthRoll === null;
}

/**
 * Fixes a bridge guardian's strength from its die.
 *
 * Both entrances print the same table — 1 gives 5 and each pip adds one, up to
 * 10 — which is a die plus four.
 */
/**
 * Fixes a guardian's strength from its dice.
 *
 * The two entrances print a table that is a die plus four (1 gives 5, up to
 * 10). The Demon Zagłady and the Monstrum are two dice added together, with no
 * offset — a different creature on a different rule (14.6), so the sum is
 * passed in and used as it stands.
 */
export function recordGuardianStrength(phase: TurnPhase, roll: number): TurnPhase {
  if (phase.phase !== "fight") return phase;
  const onTheBridgeItself = phase.fight.guardian?.kind === "bridge-field";
  return {
    ...phase,
    fight: {
      ...phase.fight,
      strengthRoll: roll,
      enemyTotal: onTheBridgeItself ? roll : roll + GUARDIAN_STRENGTH_OFFSET,
    },
  };
}

export function setFightTotal(phase: TurnPhase, playerTotal: number): TurnPhase {
  if (phase.phase !== "fight") return phase;
  return { ...phase, fight: { ...phase.fight, playerTotal: Math.max(0, playerTotal) } };
}

/**
 * Records one side's die. Rule 17.8 fixes the order — the attacker's Miecz is
 * worked out first — so the player's roll is taken before the enemy's, and the
 * comparison only runs once both are in.
 */
export function recordFightRoll(
  phase: TurnPhase,
  side: "player" | "enemy",
  roll: number,
): TurnPhase {
  if (phase.phase !== "fight") return phase;
  // Rolling for the fight before the guardian has a strength would compare
  // against zero and hand the player a free win.
  if (strengthPending(phase.fight)) return phase;
  const fight = {
    ...phase.fight,
    ...(side === "player" ? { playerRoll: roll } : { enemyRoll: roll }),
  };
  if (fight.playerRoll !== null && fight.enemyRoll !== null) {
    fight.result = compareCombat(
      { label: "Postać", total: fight.playerTotal, roll: fight.playerRoll },
      { label: fight.cardName, total: fight.enemyTotal, roll: fight.enemyRoll },
      fight.kind,
    );
  }
  return { ...phase, fight };
}

/**
 * Closes the fight and returns to the field it interrupted.
 *
 * The card is left where it was — a defeated Wróg is a trophy still to be
 * picked up (1.4), and one that won is still standing on the field for whoever
 * comes next (16.8) — but it is written down as settled, so this turn is done
 * rolling against it.
 */
export function endFight(phase: TurnPhase): TurnPhase {
  if (phase.phase !== "fight") return phase;
  // A fight that interrupted the turn hands it back where it took it from.
  if (phase.fight.resume) return phase.fight.resume;
  const { fieldId, draw, drawn, fought, met } = phase.fight;
  return {
    phase: "field",
    fieldId,
    from: null,
    draw,
    drawn,
    fought: fought ?? [],
    ...(met ? { met: true as const } : {}),
  };
}

/**
 * Whose turn comes next.
 *
 * Rule 16.1 and the Spotkanie cards that cost a turn mean a seat can be sitting
 * out, and 4.4 removes a dead character entirely, so both are skipped. Turns
 * lost are spent one per pass, which is what makes "tracisz 1 turę" cost
 * exactly one go round the table.
 */
export interface TurnOrderSeat {
  index: number;
  eliminated: boolean;
  turnsLost: number;
  stoneUntilTurn: number | null;
}

export function nextSeat(
  seats: readonly TurnOrderSeat[],
  current: number | null,
  turn: number,
): { seat: number | null; skipped: number[] } {
  const playable = seats.filter((seat) => !seat.eliminated);
  if (playable.length === 0) return { seat: null, skipped: [] };

  const skipped: number[] = [];
  const start = current === null ? -1 : seats.findIndex((s) => s.index === current);

  for (let step = 1; step <= seats.length; step++) {
    const candidate = seats[(start + step + seats.length) % seats.length];
    if (candidate.eliminated) continue;
    // Turned to Stone freezes a character for three turns (20.4) and it cannot
    // act at all in that time — distinct from a lost turn, which is spent.
    if (candidate.stoneUntilTurn !== null && candidate.stoneUntilTurn > turn) {
      skipped.push(candidate.index);
      continue;
    }
    if (candidate.turnsLost > 0) {
      skipped.push(candidate.index);
      continue;
    }
    return { seat: candidate.index, skipped };
  }
  return { seat: null, skipped };
}
