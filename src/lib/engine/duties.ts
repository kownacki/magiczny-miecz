/** What a character still owes the rules before the turn may end. */

import type { FieldId } from "./board";
import type { TurnPhase } from "./turn";

/**
 * Something compulsory that has not happened yet.
 *
 * The distinction this exists for: compulsory is not the same as immediate.
 * Landing on the Zamek makes the fight unavoidable (14.7), but it does not make
 * it instant — a player may put a Tarcza on, move a Miecz to the main hand, or
 * change their mind about what they are carrying first, and the rules say
 * nothing against any of it. Forcing the fight the moment the figure lands
 * takes away preparation the game allows.
 *
 * So the duty is not a prompt. It is a thing the turn cannot end without, which
 * leaves the player free to do everything else in any order they like and still
 * cannot walk away from what the rules require.
 */
export type DutyKind = "beast" | "move";

export interface Duty {
  kind: DutyKind;
  /** What the player still has to do, in the language the rest of the app uses. */
  label: string;
  /** The numbered rule that makes it compulsory. */
  rule: string;
}

/**
 * Everything blocking the end of this turn, in the order it should be shown.
 *
 * Pure: what has already been done arrives as `done` rather than being looked
 * up, so the rule is testable on its own and the caller stays free to work that
 * out however it can.
 */
export function dutiesBeforeEnding(input: {
  fieldId: FieldId | null;
  done: readonly DutyKind[];
  /**
   * Where the turn has got to. A turn still at "rzut" has not moved, and 10.1
   * makes the move the first of the two things a turn is made of.
   */
  phase?: TurnPhase["phase"];
}): Duty[] {
  const duties: Duty[] = [];

  /**
   * 10.1: "Postacie kolejno wykonują swoje czynności: a) ruch b) spotkania i
   * badanie Obszaru" — and 10.2 has no clause letting a roll of 3 become a move
   * of 0. The only choice the rules give is the direction.
   *
   * 13.1 says the same from the other side: nothing whatsoever may be done on
   * the Obszar a turn starts from, so a turn spent standing still would be a
   * turn in which nothing could legally happen at all.
   *
   * The turn never reaches this phase in the cases where movement is genuinely
   * impossible — Kamień and a lost turn are skipped by the turn engine before
   * anybody is asked to roll, and the Kamienny Most has its own phase because
   * 10.3 gives it no roll.
   */
  if (input.phase === "roll" && !input.done.includes("move")) {
    duties.push({
      kind: "move",
      label: "Rzuć kostką i wykonaj ruch",
      rule: "10.1-10.2",
    });
  }

  // 14.7: reaching the Zamek means fighting the Bestia. There is no leaving
  // without it — a loss costs two Życia and puts the character off the Most,
  // but it is still the fight that ends the visit, not walking away from one.
  if (input.fieldId === "zamek-bestii" && !input.done.includes("beast")) {
    duties.push({
      kind: "beast",
      label: "Stocz walkę z Bestią",
      rule: "14.7",
    });
  }

  return duties;
}

/** Whether the turn may end at all. */
export function mayEndTurn(input: {
  fieldId: FieldId | null;
  done: readonly DutyKind[];
  phase?: TurnPhase["phase"];
}): boolean {
  return dutiesBeforeEnding(input).length === 0;
}

/** Why the turn cannot end, for the disabled control to say out loud. */
export function whyCannotEnd(duties: readonly Duty[]): string | null {
  if (duties.length === 0) return null;
  return `Najpierw: ${duties.map((duty) => `${duty.label} (${duty.rule})`).join(", ")}.`;
}
