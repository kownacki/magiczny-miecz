import { describe, expect, it } from "vitest";
import { asTurnState, only, pop, push, replaceTop, top, whatIsOpen } from "./stack";
import type { TurnPhase } from "./turn";

const roll: TurnPhase = { phase: "roll" };
const end: TurnPhase = { phase: "end" };

describe("the stack's four operations", () => {
  it("only() is a one-frame stack, and top() reads it back", () => {
    expect(top(only(roll))).toEqual(roll);
  });

  it("push puts a frame on screen; pop hands the screen back", () => {
    const opened = push(only(roll), end);
    expect(top(opened)).toEqual(end);
    expect(top(pop(opened))).toEqual(roll);
  });

  /** An empty stack has no answer to "what is on screen". */
  it("refuses to pop the last frame", () => {
    expect(() => pop(only(roll))).toThrow("ostatnia ramka");
  });

  it("replaceTop advances the top frame and leaves the rest alone", () => {
    const state = push(only(roll), end);
    const advanced = replaceTop(state, roll);
    expect(advanced.stack).toEqual([roll, roll]);
  });

  it("never mutates: every operation hands back a new state", () => {
    const state = only(roll);
    push(state, end);
    replaceTop(state, end);
    expect(state.stack).toEqual([roll]);
  });
});

/**
 * The tolerant reader — the whole of the migration, since Michał ruled the
 * live tables disposable and no converter is written (docs/STACK.md).
 */
describe("reading what the database holds", () => {
  it("passes a stack through", () => {
    const state = push(only(roll), end);
    expect(asTurnState(state)).toEqual(state);
  });

  it("reads a pre-stack row as a one-frame stack", () => {
    expect(asTurnState({ phase: "roll" })).toEqual(only(roll));
  });

  /** The column default until the schema moves is the old shape. */
  it("reads the column's own default", () => {
    expect(asTurnState(JSON.parse('{"phase": "roll"}'))).toEqual(only(roll));
  });

  it("reads nothing at all as a turn that is over, not one that never started", () => {
    for (const raw of [null, undefined, {}, [], "roll", { stack: [] }]) {
      expect(asTurnState(raw)).toEqual(only(end));
    }
  });
});

/**
 * What is standing in the way, which is the half a refusal can be acted on.
 *
 * The message this exists for named neither the thing blocking the turn nor a
 * way out of it — and cited 13.4, which is BADANIE OBSZARU and has nothing to
 * say about when in a turn you may draw.
 */
describe("naming the frame that is in the way", () => {
  it("says nothing about a turn that is merely between things", () => {
    for (const phase of ["roll", "move", "end"] as const) {
      expect(whatIsOpen(only({ phase } as TurnPhase)), phase).toBeNull();
    }
  });

  /** A turn doing the ordinary thing is not in anybody's way either. */
  it("says nothing about an ordinary badanie", () => {
    expect(
      whatIsOpen(
        only({ phase: "field", fieldId: "karczma", from: null, draw: 0, drawn: [], fought: [] } as never),
      ),
    ).toBeNull();
  });

  it("names a fight, and the Most", () => {
    expect(whatIsOpen(only({ phase: "fight" } as never))).toBe("trwa walka");
    expect(whatIsOpen(only({ phase: "bridge" } as never))).toBe("trwa próba wejścia na Most");
  });

  /**
   * And the two frames a Karta opens say which Karta, because that is the thing
   * worth saying: "KUGLARZ — Karta jest w trakcie rozpatrywania" tells you what
   * to type next and "trwa coś" does not.
   */
  it("names the Karta a suspended frame belongs to", () => {
    expect(whatIsOpen(only({ phase: "script", reason: "KUGLARZ" } as never))).toBe(
      "KUGLARZ jest w trakcie rozpatrywania",
    );
    expect(whatIsOpen(only({ phase: "ask", reason: "CHOCHLIK" } as never))).toBe(
      "CHOCHLIK czeka na odpowiedź",
    );
    // And a frame with no reason falls back to the table's own wording.
    expect(whatIsOpen(only({ phase: "script" } as never))).toBe(
      "Karta jest w trakcie rozpatrywania",
    );
  });

  /** It reads the top frame, which is the one on screen. */
  it("reads what is on screen, not what is beneath it", () => {
    const mid = push(
      only({ phase: "field", fieldId: "karczma", from: null, draw: 0, drawn: [], fought: [] } as never),
      { phase: "fight" } as never,
    );
    expect(whatIsOpen(mid)).toBe("trwa walka");
  });
});
