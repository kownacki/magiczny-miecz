import { describe, expect, it } from "vitest";
import { asTurnState, only, pop, push, replaceTop, top } from "./stack";
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
