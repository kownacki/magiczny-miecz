import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { scriptedRandom } from "@/lib/engine/ports";
import { top, type TurnState } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { apply, type Snapshot } from "../change";
import { beginFight, escape, fightRoll, resolveFight } from "./fight";

/**
 * The Trójgłowy Smok: one Wróg, three fights (law 3, docs/STACK.md).
 *
 * "Postać, która podejmie z nim walkę, będzie musiała pokonać jego trzy głowy
 * (każda głowa ma 2 punkty Miecza). Jeśli przegra, głowy, które odcięła
 * odrastają."
 *
 * The first card in step 3, and the reason the `loop` frame exists: 17.4 ends
 * a fight the moment the dice are compared, so three heads cannot be one
 * fight, and before the stack there was nowhere to keep "one down, two to go"
 * between them.
 */

const SMOK = "trogglowy-smok";

/**
 * As printed. The card's own title band reads TRÓGGŁOWY SMOK while its body
 * text says "Trójgłowy Smok" three lines later — a 1993 misprint, checked
 * against the scan, and the deck carries what the card carries.
 */
const NAME = "TRÓGGŁOWY SMOK";

/**
 * Wrzosowiska, where the ground adds nothing — six Obszary make every Wróg
 * stronger and a test about heads should not be a test about the Kamienny Las.
 */
const onTheField = (over: Partial<Extract<TurnPhase, { phase: "field" }>> = {}): Snapshot =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: {
        phase: "field",
        fieldId: "wrzosowiska",
        from: null,
        draw: 1,
        drawn: [{ cardId: SMOK, cardClass: "foe" }],
        ...over,
      } as TurnPhase,
    },
    seats: [aSeat({ sword_own: 5, life: 4, field_id: asFieldId("wrzosowiska") })],
    holdings: [],
  });

const phases = (state: TurnState) => state.stack.map((frame) => frame.phase);

const fightOn = (state: TurnState) => {
  const frame = top(state);
  if (frame.phase !== "fight") throw new Error(`na wierzchu jest ${frame.phase}`);
  return frame.fight;
};

/**
 * One round played out: both dice and the settle, exactly as the two buttons
 * in front of a player do it.
 *
 * The enemy's die decides the round — the character's Miecz 5 against a head's
 * 2 means a 1 loses and a 6 wins, with nothing else on the table.
 */
async function round(table: Snapshot, mine: number, its: number): Promise<Snapshot> {
  const dice = ports({ random: scriptedRandom([mine, its, 1, 1, 1, 1]) });
  let at = table;
  at = apply(at, (await fightRoll(at, { side: "player" }, dice)).writes);
  at = apply(at, (await fightRoll(at, { side: "enemy" }, dice)).writes);
  return apply(at, (await resolveFight(at, undefined as never, dice)).writes);
}

describe("a Wróg fought in rounds", () => {
  it("opens as a loop with its first head already on screen", () => {
    const { writes } = beginFight(onTheField(), { cardIds: [SMOK] });
    const state = writes.game!.turn_state!;
    // The count is bookkeeping and never the top frame.
    expect(phases(state)).toEqual(["field", "loop", "fight"]);
    expect(state.stack[1]).toMatchObject({ phase: "loop", times: 3, done: 0, round: "głowa" });
    expect(fightOn(state)).toMatchObject({ enemyTotal: 2, cardName: `${NAME} (głowa 1 z 3)` });
  });

  /**
   * 17.5 sums the Miecze of everything attacking at once and rolls one die
   * against the sum. There is no reading of the card in which three heads are
   * added to a Wilk and beaten in a single comparison, so the pack is refused
   * out loud rather than quietly flattened into an ordinary fight.
   */
  it("refuses to be beaten as part of a pack", () => {
    const crowded = onTheField({
      drawn: [
        { cardId: SMOK, cardClass: "foe" },
        { cardId: "wilk", cardClass: "foe" },
      ],
    });
    expect(() => beginFight(crowded, { cardIds: [SMOK, "wilk"] })).toThrow("po kolei");
  });

  it("puts the next head up the moment one is cut, in the same commit", async () => {
    const opened = apply(onTheField(), beginFight(onTheField(), { cardIds: [SMOK] }).writes);
    const after = await round(opened, 6, 1);

    expect(phases(after.game.turn_state)).toEqual(["field", "loop", "fight"]);
    expect(after.game.turn_state.stack[1]).toMatchObject({ done: 1 });
    expect(fightOn(after.game.turn_state).cardName).toBe(`${NAME} (głowa 2 z 3)`);
    // A head is not a kill: no trophy, and the creature is still to be dealt with.
    expect(after.holdings).toHaveLength(0);
  });

  it("pays out once, on the third head", async () => {
    let at = apply(onTheField(), beginFight(onTheField(), { cardIds: [SMOK] }).writes);
    at = await round(at, 6, 1);
    at = await round(at, 6, 1);
    expect(at.holdings).toHaveLength(0);

    at = await round(at, 6, 1);
    // Back on the field, the Smok settled (17.4) and taken as one trophy (1.4).
    expect(phases(at.game.turn_state)).toEqual(["field"]);
    const back = top(at.game.turn_state);
    expect(back.phase === "field" && back.fought).toEqual([SMOK]);
    expect(at.holdings.filter((h) => h.card_id === SMOK && h.kind === "trophy")).toHaveLength(1);
  });

  /** "Jeśli przegra, głowy, które odcięła odrastają." */
  it("a loss regrows the heads and ends the attempt", async () => {
    let at = apply(onTheField(), beginFight(onTheField(), { cardIds: [SMOK] }).writes);
    const life = at.seats[0].life;
    at = await round(at, 6, 1);
    at = await round(at, 1, 6);

    expect(phases(at.game.turn_state)).toEqual(["field"]);
    const back = top(at.game.turn_state);
    // Fought this turn (17.4), still lying there, no trophy, and the point of
    // Życie a lost fight costs was paid — a head is a fight.
    expect(back.phase === "field" && back.fought).toEqual([SMOK]);
    expect(at.holdings).toHaveLength(0);
    expect(at.seats[0].life).toBe(life - 1);
  });

  /**
   * A log of three wins must not read as three dead dragons, and the loss has
   * to say what it cost — which is the heads, not a point of Życie.
   */
  it("says which head it was, and how many grew back", async () => {
    let at = apply(onTheField(), beginFight(onTheField(), { cardIds: [SMOK] }).writes);
    const cut = ports({ random: scriptedRandom([6, 1, 1, 1]) });
    at = apply(at, (await fightRoll(at, { side: "player" }, cut)).writes);
    at = apply(at, (await fightRoll(at, { side: "enemy" }, cut)).writes);
    const first = await resolveFight(at, undefined as never, cut);
    expect(first.writes.journal?.at(-1)).toMatchObject({
      kind: "fight-end",
      payload: { cardId: SMOK, outcome: "wygrana", creature: "głowa", round: 1, times: 3 },
    });

    at = apply(at, first.writes);
    const lost = ports({ random: scriptedRandom([1, 6, 1, 1]) });
    at = apply(at, (await fightRoll(at, { side: "player" }, lost)).writes);
    at = apply(at, (await fightRoll(at, { side: "enemy" }, lost)).writes);
    const second = await resolveFight(at, undefined as never, lost);
    expect(second.writes.journal?.at(-1)).toMatchObject({
      kind: "fight-end",
      payload: { outcome: "przegrana", round: 2, regrown: 1 },
    });
  });

  /** 17.10 costs nothing, and 17.4 still ends the fight. */
  it("a draw ends the attempt with nothing lost and nothing kept", async () => {
    let at = apply(onTheField(), beginFight(onTheField(), { cardIds: [SMOK] }).writes);
    const life = at.seats[0].life;
    at = await round(at, 6, 1);
    at = await round(at, 3, 6);

    expect(phases(at.game.turn_state)).toEqual(["field"]);
    expect(at.seats[0].life).toBe(life);
    expect(at.holdings).toHaveLength(0);
  });

  /**
   * A Zaklęcie that lasted "one fight" is spent by the head it was spoken at.
   * Carrying the old figure forward would fight three heads with one card.
   */
  it("weighs the character again for each head", async () => {
    const armed = aTable({
      game: {
        active_seat: 0,
        turn_state: {
          phase: "field",
          fieldId: "wrzosowiska",
          from: null,
          draw: 1,
          drawn: [{ cardId: SMOK, cardClass: "foe" }],
        } as TurnPhase,
      },
      seats: [aSeat({ sword_own: 5, life: 4, field_id: asFieldId("wrzosowiska") })],
      holdings: [aHolding({ id: "h-1", card_id: "excalibur" })],
    });
    let at = apply(armed, beginFight(armed, { cardIds: [SMOK] }).writes);
    const first = fightOn(at.game.turn_state).playerTotal;
    at = await round(at, 6, 1);
    // Nothing was spent, so the second head meets the same figure — read
    // again rather than copied off the first.
    expect(fightOn(at.game.turn_state).playerTotal).toBe(first);
  });

  /**
   * 19.1 out of the second head is out of the creature: there is nobody left
   * swinging at the third, and a loop frame is never left on screen.
   */
  it("an escape mid-loop closes the whole thing", async () => {
    let at = apply(onTheField(), beginFight(onTheField(), { cardIds: [SMOK] }).writes);
    at = await round(at, 6, 1);
    expect(phases(at.game.turn_state)).toEqual(["field", "loop", "fight"]);

    const fled = escape(at, { reported: true });
    const after = apply(at, fled.writes);
    expect(phases(after.game.turn_state)).toEqual(["field"]);
    const back = top(after.game.turn_state);
    expect(back.phase === "field" && back.fought).toEqual([SMOK]);
  });
});
