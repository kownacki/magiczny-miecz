import { describe, expect, it } from "vitest";
import { pop, replaceTop, top, type TurnState } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";
import type { Effect } from "@/lib/engine/cardScript";
import { scriptedRandom } from "@/lib/engine/ports";
import { aSeat, aTable, aUser, ports } from "../fixture";
import { apply, type Snapshot } from "../change";
import { applyEffect, continueTopScript } from "./effects";
import { resolveFight } from "./spoils";
import { passTurn } from "./turn";

/**
 * The suspension lifecycle — docs/STACK.md step 2, mechanism by mechanism.
 *
 * These are synthetic effects, not cards from the box: step 3 is where real
 * cards start using `walka` mid-sequence, and these tests are what make that
 * authoring safe. Each one walks a whole life: suspend, frame, fight or
 * answer, resume, complete.
 */

const asIs = <T,>(pile: readonly T[]): T[] => [...pile];

const onField = (): Snapshot =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: { phase: "field", fieldId: "wrzosowiska", from: null, draw: 0, drawn: [] },
    },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, field_id: "wrzosowiska", sword_own: 5, life: 4 }),
    ],
    users: [aUser({ id: "u-a", seat_index: 0, name: "Michał" })],
  });

const runOn = (
  table: Snapshot,
  effect: Effect,
  over: { decided?: { choices?: number[] }; random?: ReturnType<typeof scriptedRandom>; mark?: string; keep?: boolean } = {},
) =>
  applyEffect(
    table,
    {
      seatId: "seat-a",
      effect,
      reason: "KARTA",
      cardId: "poludnica",
      decided: over.decided,
      shuffle: asIs,
      ...(over.mark ? { mark: over.mark } : {}),
      ...(over.keep ? { keep: true } : {}),
    },
    ports(over.random ? { random: over.random } : {}),
  );

const frameOf = (state: TurnState) =>
  top(state) as Extract<TurnPhase, { phase: "script" }>;

/** Hands the pushed fight a finished result, the way the dice would have. */
const wonAbove = (state: TurnState): TurnState => {
  const fight = top(state);
  if (fight.phase !== "fight") throw new Error("no fight on top");
  return replaceTop(state, {
    ...fight,
    fight: {
      ...fight.fight,
      playerRoll: 6,
      enemyRoll: 1,
      result: { outcome: "wygrana" as const, winner: "Michał", loser: fight.fight.cardName, kind: "ordinary" as const },
    },
  });
};

describe("a walka mid-sequence: the whole life", () => {
  const card: Effect = {
    op: "po-kolei",
    steps: [
      { op: "punkty", stat: "sword", delta: 1, target: "ty" },
      { op: "walka", nazwa: "Strażnik Skarbu", miecz: 3 },
      { op: "punkty", stat: "gold", delta: 2, target: "ty" },
    ],
  };

  it("writes the first step, frames the second, and owes the third", async () => {
    const { writes, result } = await runOn(onField(), card);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { sword_own: 6 } }]);

    const state = writes.game!.turn_state!;
    // [field, script, fight] — the card mid-sentence, the fight on screen.
    expect(state.stack.map((one) => one.phase)).toEqual(["field", "script", "fight"]);
    expect(state.stack[1]).toMatchObject({ phase: "script", cursor: [1] });
    const fight = state.stack[2];
    expect(fight.phase === "fight" && fight.fight.cardName).toBe("Strażnik Skarbu");
    // A walka asks nobody anything — it opens a fight.
    expect(result.pending).toBeNull();
  });

  it("settling the fight pops it and the gold arrives by continuation", async () => {
    const table = onField();
    const first = await runOn(table, card);
    const mid = apply(table, { ...first.writes, game: { turn_state: wonAbove(first.writes.game!.turn_state!) } });

    // The fight closes: pushed, so it pops — revealing the script frame.
    const settled = await resolveFight(mid, undefined as never, ports({ random: scriptedRandom([1, 1]) }));
    const afterFight = apply(mid, settled.writes);
    expect(top(afterFight.game.turn_state).phase).toBe("script");

    // The chain the stores run: the revealed card continues by itself.
    const rest = await continueTopScript(afterFight, { shuffle: asIs }, ports());
    const done = apply(afterFight, rest.writes);
    // The third step landed exactly once…
    expect(done.seats[0].gold).toBe(table.seats[0].gold + 2);
    // …the first was NOT re-applied on the way down the cursor…
    expect(done.seats[0].sword_own).toBe(6);
    // …and the frame is gone.
    expect(done.game.turn_state.stack.map((one) => one.phase)).toEqual(["field"]);
  });

  it("pays the frame's debts on completion: mark and keep", async () => {
    const table = onField();
    const first = await runOn(table, card, { mark: "poludnica", keep: true });
    const mid = apply(table, { ...first.writes, game: { turn_state: wonAbove(first.writes.game!.turn_state!) } });
    const settled = await resolveFight(mid, undefined as never, ports({ random: scriptedRandom([1, 1]) }));
    const afterFight = apply(mid, settled.writes);

    const rest = await continueTopScript(afterFight, { shuffle: asIs }, ports());
    const done = apply(afterFight, rest.writes);
    const field = top(done.game.turn_state);
    expect(field.phase === "field" && field.resolved).toContain("poludnica");
    expect(done.holdings.some((h) => h.card_id === "poludnica" && h.kind === "friend")).toBe(true);
  });
});

describe("a rzut is not re-rolled on the way back", () => {
  it("reads the face off the cursor", async () => {
    const table = onField();
    const card: Effect = {
      op: "rzut",
      faces: {
        3: {
          op: "po-kolei",
          steps: [
            { op: "walka", nazwa: "Hadron", miecz: 3 },
            { op: "punkty", stat: "life", delta: -1, target: "ty" },
          ],
        },
      },
    };
    // One die in the pot: the first walk spends it on the table.
    const first = await runOn(table, card, { random: scriptedRandom([3]) });
    expect(frameOf(pop(first.writes.game!.turn_state!)).cursor).toEqual([3, 0]);

    const mid = apply(table, { ...first.writes, game: { turn_state: wonAbove(first.writes.game!.turn_state!) } });
    const settled = await resolveFight(mid, undefined as never, ports({ random: scriptedRandom([1, 1]) }));
    const afterFight = apply(mid, settled.writes);

    // No dice left. If the resume rolled the table again, this would throw.
    const rest = await continueTopScript(afterFight, { shuffle: asIs }, ports({ random: scriptedRandom([]) }));
    const done = apply(afterFight, rest.writes);
    expect(done.seats[0].life).toBe(3);
  });
});

describe("a question answered through the frame", () => {
  const card: Effect = {
    op: "po-kolei",
    steps: [
      { op: "punkty", stat: "sword", delta: 1, target: "ty" },
      {
        op: "wybor",
        options: [
          { label: "Miecz", effect: { op: "punkty", stat: "sword", delta: 1, target: "ty" } },
          { label: "Złoto", effect: { op: "punkty", stat: "gold", delta: 1, target: "ty" } },
        ],
      },
    ],
  };

  it("suspends on the wybor and completes on the answer", async () => {
    const table = onField();
    const first = await runOn(table, card);
    expect(frameOf(first.writes.game!.turn_state!)).toMatchObject({ cursor: [1] });

    const mid = apply(table, first.writes);
    const rest = await continueTopScript(mid, { decided: { choices: [1] }, shuffle: asIs }, ports());
    const done = apply(mid, rest.writes);
    expect(done.seats[0].gold).toBe(table.seats[0].gold + 1);
    expect(done.seats[0].sword_own).toBe(6);
    expect(top(done.game.turn_state).phase).toBe("field");
  });

  it("stays suspended on a wrong-shaped answer, frame intact", async () => {
    const table = onField();
    const first = await runOn(table, card);
    const mid = apply(table, first.writes);
    const again = await continueTopScript(mid, { shuffle: asIs }, ports());
    const after = apply(mid, again.writes);
    expect(frameOf(after.game.turn_state)).toMatchObject({ cursor: [1] });
  });
});

describe("what a suspended card blocks", () => {
  it("refuses to pass the turn over a card mid-sentence", async () => {
    const table = onField();
    const first = await runOn(table, {
      op: "wybor",
      options: [{ label: "A", effect: { op: "nic" } }],
    });
    const mid = apply(table, first.writes);
    expect(() => passTurn(mid)).toThrow(/dokończ/);
  });

  it("refuses to continue when nothing is suspended", async () => {
    await expect(
      continueTopScript(onField(), { shuffle: asIs }, ports()),
    ).rejects.toThrow(/Nic tu nie czeka/);
  });
});

describe("a second walka in one card", () => {
  it("opens the next fight from the same frame", async () => {
    const table = onField();
    const card: Effect = {
      op: "po-kolei",
      steps: [
        { op: "walka", nazwa: "Pierwszy", miecz: 2 },
        { op: "walka", nazwa: "Drugi", miecz: 3 },
      ],
    };
    const first = await runOn(table, card);
    const mid = apply(table, { ...first.writes, game: { turn_state: wonAbove(first.writes.game!.turn_state!) } });
    const settled = await resolveFight(mid, undefined as never, ports({ random: scriptedRandom([1, 1]) }));
    const afterFight = apply(mid, settled.writes);

    const rest = await continueTopScript(afterFight, { shuffle: asIs }, ports());
    const done = apply(afterFight, rest.writes);
    const stack = done.game.turn_state.stack;
    expect(stack.map((one) => one.phase)).toEqual(["field", "script", "fight"]);
    expect(stack[1]).toMatchObject({ cursor: [1] });
    const second = stack[2];
    expect(second.phase === "fight" && second.fight.cardName).toBe("Drugi");
  });
});
