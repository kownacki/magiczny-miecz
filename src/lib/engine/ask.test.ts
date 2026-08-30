import { describe, expect, it } from "vitest";
import { askOnTop, closeAsk, openAsk, optionsOf, pickFrom, type AskFrame } from "./ask";
import { only, top } from "./stack";
import { putBackOnTop, type DeckState } from "./deck";
import type { TurnPhase } from "./turn";

const field: TurnPhase = {
  phase: "field",
  fieldId: "wrzosowiska",
  from: null,
  draw: 0,
  drawn: [],
};

const ask = (refs = ["zaklecia#1", "zaklecia#2"]): AskFrame => ({
  phase: "ask",
  seatId: "seat-a",
  cardId: "chochlik",
  reason: "CHOCHLIK",
  question: { kind: "ktore-zaklecie", count: refs.length, refs },
});

describe("a question no card script is asking", () => {
  it("opens over what is running and hands the screen back when answered", () => {
    const open = openAsk(only(field), ask());
    expect(open.stack.map((frame) => frame.phase)).toEqual(["field", "ask"]);
    expect(askOnTop(open)?.seatId).toBe("seat-a");
    expect(top(closeAsk(open)).phase).toBe("field");
  });

  it("is not on top when it is not on top", () => {
    expect(askOnTop(only(field))).toBeNull();
  });

  it("counts its own options", () => {
    expect(optionsOf(ask().question)).toBe(2);
  });
});

describe("taking one of the offered cards", () => {
  it("keeps the one picked and hands the rest back", () => {
    expect(pickFrom(ask().question, 0)).toEqual({
      kept: "zaklecia#1",
      back: ["zaklecia#2"],
    });
    expect(pickFrom(ask().question, 1)).toEqual({
      kept: "zaklecia#2",
      back: ["zaklecia#1"],
    });
  });

  /**
   * The server re-walks the answer against what it offered, so a number from a
   * browser cannot reach a card that was never on the table.
   */
  it("refuses an index that was not offered", () => {
    for (const bad of [-1, 2, 1.5, Number.NaN]) {
      expect(pickFrom(ask().question, bad), String(bad)).toBeNull();
    }
  });
});

describe("putting the unchosen card back", () => {
  const deck = (): DeckState => ({ draw: ["zaklecia#7"], discard: ["zaklecia#9"] });

  it("goes back on top, so it is still the next card off the stos", () => {
    expect(putBackOnTop(deck(), ["zaklecia#2"])).toEqual({
      draw: ["zaklecia#2", "zaklecia#7"],
      discard: ["zaklecia#9"],
    });
  });

  it("keeps the order it is handed", () => {
    expect(putBackOnTop(deck(), ["a", "b"]).draw).toEqual(["a", "b", "zaklecia#7"]);
  });

  /** Called twice by mistake, it must not deal one Zaklęcie to two people. */
  it("will not double a card either pile already has", () => {
    expect(putBackOnTop(deck(), ["zaklecia#7", "zaklecia#9"])).toEqual(deck());
  });
});
