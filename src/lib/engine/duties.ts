/** What a character still owes the rules before the turn may end. */

import type { FieldId } from "./board";
import { compulsoryOffer } from "./fieldScript";
import { nextFrame } from "./kolejka";
import { cardName } from "./polish";
import type { TurnCard } from "./state";
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
export type DutyKind = "beast" | "move" | "kolejka" | "obszar";

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
  /** What is on the Obszar, and what of it has been settled — see `kolejka.ts`. */
  onField?: { drawn: readonly TurnCard[]; settled: readonly string[] } | null;
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

  /**
   * The Obszar's kolejka, which nothing checked until now.
   *
   * A Wróg that attacks (16.2), a Spotkanie whose instruction is binding
   * (16.1), a Nieznajomy or a Miejsce that happens to you rather than offering
   * itself (16.5, 16.7) — none of these could be walked away from by the rules
   * and all of them could be walked away from by pressing "koniec tury". The
   * windows said `compulsory` and the door did not agree, which is a rule kept
   * by a label.
   *
   * `nextFrame` is what decides, so the queue on screen and the refusal at the
   * door are the same reading: what does not earn a frame is exactly what 12.1
   * gives the run of the turn, and none of that is owed at the end of it.
   *
   * 16.4 is the citation because it is the rule that says the rest of the turn
   * waits on these — "Dopiero po rozpatrzeniu skutków wszystkich Spotkań i
   * pokonaniu wszystkich Wrogów [...] Postać może przystąpić do rozpatrzenia
   * pozostałych Kart Zdarzeń."
   */
  if (input.onField && !input.done.includes("kolejka")) {
    const owed = nextFrame(input.onField.drawn, input.onField.settled);
    if (owed) {
      duties.push({
        kind: "kolejka",
        // By name and joined with a plus, the same way the kolejka strip
        // writes a pack — 17.5 fights them as one, so the sentence that
        // refuses names one thing.
        label: `Rozpatrz: ${owed.cards.map((card) => cardName(card.cardId)).join(" + ")}`,
        rule: "16.4",
      });
    }
  }

  /**
   * And the Obszar's own instruction, where the board says MUSISZ.
   *
   * 13.5's last sentence is the whole of it: "Do niektórych instrukcji Postać
   * musi się zastosować, do innych może, jeśli ma ochotę." The Karczma's
   * "MUSISZ RZUCIĆ KOSTKĄ" is the first kind, and a turn could be handed on
   * without ever throwing it.
   *
   * Last, after the kolejka, because that is where 13.5 puts it — a
   * non-drawing Obszar does its printed thing after every Karta lying on it,
   * which is the Talisman FAQ's step 10 and what 12.1's own worked example
   * does on Ruchome Skały.
   */
  if (!input.done.includes("obszar")) {
    const offer = compulsoryOffer(input.fieldId, input.onField?.settled ?? []);
    if (offer) {
      duties.push({
        kind: "obszar",
        label: `Rozpatrz Obszar: ${offer.name}`,
        rule: "13.5",
      });
    }
  }

  return duties;
}

/** Whether the turn may end at all. */
export function mayEndTurn(input: {
  fieldId: FieldId | null;
  done: readonly DutyKind[];
  phase?: TurnPhase["phase"];
  onField?: { drawn: readonly TurnCard[]; settled: readonly string[] } | null;
}): boolean {
  return dutiesBeforeEnding(input).length === 0;
}

/** Why the turn cannot end, for the disabled control to say out loud. */
export function whyCannotEnd(duties: readonly Duty[]): string | null {
  if (duties.length === 0) return null;
  return `Najpierw: ${duties.map((duty) => `${duty.label} (${duty.rule})`).join(", ")}.`;
}
