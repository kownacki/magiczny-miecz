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
  | { phase: "rzut" }
  | { phase: "ruch"; roll: number; options: TurnMoveOption[] }
  | {
      phase: "pole";
      fieldId: string;
      /** Where this move started, which the Przeprawa sends you back to. */
      from: string | null;
      draw: number;
      drawn: TurnCard[];
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
    }
  | { phase: "walka"; fight: Fight }
  /** Standing at a bridge entrance with its guardian in the way (11.9-11.11). */
  | { phase: "most"; bridge: BridgeEntrance }
  | { phase: "koniec" };

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
  /** Seat index of the opponent when this is a duel between characters (17.6). */
  opponentSeat?: number;
  kind: CombatKind;
  enemyTotal: number;
  playerTotal: number;
  playerRoll: number | null;
  enemyRoll: number | null;
  result: CombatResult | null;
  /** The field to return to once the fight is settled. */
  fieldId: string;
  draw: number;
  drawn: TurnCard[];
  /**
   * Every card that will count as fought once this is over — what the field had
   * already settled, plus the creature or creatures in this fight. Carried
   * through the fight so that ending it cannot lose the list.
   */
  fought?: string[];
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
   * The die that decides the guardian's own strength, where the board makes it
   * a roll rather than a number: "1 - 5; 2 - 6; ... 6 - 10" at both bridge
   * entrances. Null while it is still owed. Absent when the creature has a
   * printed strength, as the Rycerz does.
   */
  strengthRoll?: number | null;
}

export type GuardianFight =
  | { kind: "most"; entrance: BridgeEntrance }
  | { kind: "przeprawa"; crossing: Crossing }
  /**
   * The Demon Zagłady and the Monstrum, which stand on the bridge itself rather
   * than at its entrance (14.6). Their strength is two dice rather than the
   * entrances' one-plus-four, and a character cannot pass until one is dead.
   */
  | { kind: "most-pole"; fieldId: string; name: string; combat: CombatKind };

export interface TurnMoveOption {
  direction: Direction;
  fieldId: string;
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
  zgodnie: "zgodnie ze wskazówkami zegara",
  przeciwnie: "przeciwnie do wskazówek zegara",
};

/** A turn always opens on the roll. */
export function startTurn(): TurnPhase {
  return { phase: "rzut" };
}

/**
 * Movement on the Kamienny Most, where the die plays no part.
 *
 * Rule 10.3: a character on the bridge moves at one field per turn and must
 * stop on each, resolving it before going on. There is no direction to choose
 * beyond onward or back — 10.4 lets a character turn around and leave at any
 * time, which is why both neighbours are offered.
 */
export function bridgeOptions(fieldId: string): TurnMoveOption[] {
  const at = KAMIENNY_MOST.findIndex((field) => field.id === fieldId);
  if (at === -1) return [];

  const options: TurnMoveOption[] = [];
  const onward = KAMIENNY_MOST[at + 1];
  const back = KAMIENNY_MOST[at - 1];
  // The bridge is a line, not a ring, so an entrance has only one neighbour.
  if (onward) {
    options.push({
      direction: "zgodnie",
      fieldId: onward.id,
      fieldName: onward.name,
      through: [],
    });
  }
  if (back) {
    options.push({
      direction: "przeciwnie",
      fieldId: back.id,
      fieldName: back.name,
      through: [],
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
  fieldId: string,
  roll: number,
  /**
   * Whether the character is in a position to try for the bridge at all — it
   * needs a Magiczny Miecz, and 11.11 bars anyone who failed there last turn.
   * Both are facts about the seat rather than the board, so they arrive here
   * already decided.
   */
  { bridgeOffered = false }: { bridgeOffered?: boolean } = {},
): TurnPhase {
  // On the bridge the roll is ignored entirely (10.3) — one field per turn,
  // either onward or back the way you came.
  if (ringOf(fieldId) === KAMIENNY_MOST) {
    return { phase: "ruch", roll, options: bridgeOptions(fieldId) };
  }
  const ring = ringOf(fieldId) ?? DOLNY_KRAG;
  const walks = moveOptions(ring, fieldId, roll);
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

  return { phase: "ruch", roll, options };
}

/**
 * Landing on a field. Rule 13.4: a field marked "WYCIĄGNIJ N KART" makes the
 * character draw, and 13.1 restricts encounters and exploration to the field a
 * move *ended* on — never one merely passed through.
 */
export function afterMove(
  field: BoardField,
  from: string | null = null,
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
    phase: "pole",
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
  return { phase: "most", bridge };
}

/**
 * Records a card the player says they drew, keeping the stack in the order
 * rule 15.2 requires it to be resolved in — lowest class numeral first.
 */
export function afterDraw(phase: TurnPhase, card: TurnCard): TurnPhase {
  if (phase.phase !== "pole") return phase;
  return { ...phase, drawn: resolutionOrder([...phase.drawn, card]) };
}

export function endTurn(): TurnPhase {
  return { phase: "koniec" };
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
    /**
     * The ids this fight settles. Several when 17.5 has a pack attack as one,
     * and `cardId` is then their ids joined together for display rather than
     * something to look up.
     */
    settles?: string[];
  },
  playerTotals: { miecz: number; magia: number },
): TurnPhase {
  if (phase.phase !== "pole") return phase;
  const kind: CombatKind = card.magia !== undefined ? "magiczna" : "zwykla";
  const enemyTotal = (kind === "magiczna" ? card.magia : card.miecz) ?? 0;
  return {
    phase: "walka",
    fight: {
      cardId: card.cardId,
      cardName: card.cardName,
      ...(card.opponentSeat !== undefined ? { opponentSeat: card.opponentSeat } : {}),
      kind,
      enemyTotal,
      playerTotal: kind === "magiczna" ? playerTotals.magia : playerTotals.miecz,
      playerRoll: null,
      enemyRoll: null,
      result: null,
      fieldId: phase.fieldId,
      draw: phase.draw,
      drawn: phase.drawn,
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
  fieldId: string,
): TurnPhase {
  const rolled = guardian.kind === "most" || guardian.kind === "most-pole";
  const stat =
    guardian.kind === "most"
      ? guardian.entrance.stat
      : guardian.kind === "most-pole"
        ? guardian.combat === "magiczna"
          ? "magia"
          : "miecz"
        : "miecz";
  const kind: CombatKind = stat === "magia" ? "magiczna" : "zwykla";
  const name =
    guardian.kind === "most"
      ? guardian.entrance.guardian
      : guardian.kind === "most-pole"
        ? guardian.name
        : guardian.crossing.test?.kind === "walka"
          ? guardian.crossing.test.guardian
          : "Strażnik";
  const printed =
    guardian.kind === "przeprawa" && guardian.crossing.test?.kind === "walka"
      ? guardian.crossing.test.miecz
      : 0;

  return {
    phase: "walka",
    fight: {
      cardId: `guardian:${name}`,
      cardName: name,
      kind,
      enemyTotal: rolled ? 0 : printed,
      playerTotal: kind === "magiczna" ? playerTotals.magia : playerTotals.miecz,
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
  if (phase.phase !== "walka") return phase;
  const onTheBridgeItself = phase.fight.guardian?.kind === "most-pole";
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
  if (phase.phase !== "walka") return phase;
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
  if (phase.phase !== "walka") return phase;
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
  if (phase.phase !== "walka") return phase;
  const { fieldId, draw, drawn, fought } = phase.fight;
  return { phase: "pole", fieldId, from: null, draw, drawn, fought: fought ?? [] };
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
