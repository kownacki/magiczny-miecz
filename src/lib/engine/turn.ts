/** The per-turn state machine: what the active player is being asked for, and what answering it does. */

import { DOLNY_KRAG, type BoardField, type Direction, moveOptions, ringOf } from "./board";
import { resolutionOrder, type TurnCard } from "./state";
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
  | { phase: "pole"; fieldId: string; draw: number; drawn: TurnCard[] }
  | { phase: "walka"; fight: Fight }
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
}

export interface TurnMoveOption {
  direction: Direction;
  fieldId: string;
  fieldName: string;
  /** Names of the fields walked through, for the player to check against the board. */
  through: string[];
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
 * Rule 10.2: the roll gives a distance, and the player picks which way round
 * the ring to walk it. Both landing squares are offered rather than a direction
 * being asked for first, because what a player actually decides between is two
 * *places*, not two abstract directions.
 */
export function afterRoll(fieldId: string, roll: number): TurnPhase {
  const ring = ringOf(fieldId) ?? DOLNY_KRAG;
  const options = moveOptions(ring, fieldId, roll).map((option) => ({
    direction: option.direction,
    fieldId: option.field.id,
    fieldName: option.field.name,
    through: option.through.map((field) => field.name),
  }));
  return { phase: "ruch", roll, options };
}

/**
 * Landing on a field. Rule 13.4: a field marked "WYCIĄGNIJ N KART" makes the
 * character draw, and 13.1 restricts encounters and exploration to the field a
 * move *ended* on — never one merely passed through.
 */
export function afterMove(field: BoardField): TurnPhase {
  return { phase: "pole", fieldId: field.id, draw: field.draw ?? 0, drawn: [] };
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

/** Closes the fight and returns to the field it interrupted. */
export function endFight(phase: TurnPhase): TurnPhase {
  if (phase.phase !== "walka") return phase;
  const { fieldId, draw, drawn } = phase.fight;
  return { phase: "pole", fieldId, draw, drawn };
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
