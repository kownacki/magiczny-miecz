import { describe, expect, it } from "vitest";
import { destinationsFor, questionOn } from "./question";
import type { TurnPhase } from "./turn";
import type { Effect } from "./cardScript";
import { ringFields } from "./board";

/**
 * One answer to "what is the turn waiting for", because a question is a rule.
 *
 * Both surfaces used to work it out themselves and they disagreed: the sheet
 * drew buttons for the two shapes it knew, the console printed nothing at all
 * for any of them, and the sheet — met with a shape it could not draw — told the
 * table to answer in the console. Everything below is asked of the one function
 * they both call now.
 */
const frame = (effect: Effect, over: Partial<Extract<TurnPhase, { phase: "script" }>> = {}) =>
  ({
    phase: "script",
    seatId: "seat-a",
    cardId: "jednorozec",
    reason: "JEDNOROŻEC",
    cursor: [],
    effect,
    ...over,
  }) as Extract<TurnPhase, { phase: "script" }>;

const nowhere = { standingOn: null, occupied: [] };
const atOsada = { standingOn: "osada" as const, occupied: [] };

describe("questionOn", () => {
  it("says nothing about a frame that is not a Karta mid-sentence", () => {
    expect(questionOn({ phase: "roll" }, nowhere)).toBeNull();
  });

  /** A thrown die is not a question: `heldAt` stopped *over* the row it chose. */
  it("calls a held die a press, not a choice", () => {
    const held = frame({ op: "nic" }, { held: true, reason: "EREMITA (3)" });
    expect(questionOn(held, nowhere)).toEqual({ kind: "dalej", reason: "EREMITA (3)" });
  });

  it("hands over a Karta's own options, in the Karta's own order", () => {
    const asking = frame({
      op: "wybor",
      options: [
        { label: "przenosisz się", effect: { op: "nic" } },
        { label: "Pomiń", effect: { op: "nic" } },
      ],
    });
    expect(questionOn(asking, nowhere)).toEqual({
      kind: "wybor",
      reason: "JEDNOROŻEC",
      options: ["przenosisz się", "Pomiń"],
    });
  });

  /**
   * „do dowolnego Obszaru w tym Kręgu" — and the list is the Krąg, which is the
   * same list `walk` refuses against. The offer and the refusal are one
   * function, so a button cannot be drawn for an Obszar the server will refuse.
   */
  it("offers the Krąg, and only the Krąg", () => {
    const asking = frame({ op: "przenies", to: { kind: "dowolne-w-kregu" } });
    const question = questionOn(asking, atOsada);
    expect(question?.kind).toBe("gdzie");
    expect(question?.kind === "gdzie" && question.fields).toEqual(ringFields("osada"));
    expect(question?.kind === "gdzie" && question.fields).not.toContain("zamek-bestii");
  });

  /** „na którymś z tych Obszarów, nie zajętym przez inną Postać" (LEWIATAN). */
  it("strikes an occupied Obszar off a listed set", () => {
    const asking = frame({
      op: "poloz-karte",
      gdzie: { kind: "jedno-z", fieldIds: ["bagna-1", "bagna-2"] },
    });
    const question = questionOn(asking, { standingOn: "osada", occupied: ["bagna-1"] });
    expect(question?.kind === "gdzie" && question.fields).toEqual(["bagna-2"]);
  });

  /**
   * „jeśli nie ma takiego Obszaru, odłóż Kartę" — an empty list is a real
   * answer and not a missing one, which is why this is `gdzie` with nothing in
   * it rather than null.
   */
  it("answers with an empty list when nothing is free", () => {
    const asking = frame({
      op: "poloz-karte",
      gdzie: { kind: "jedno-z", fieldIds: ["bagna-1"] },
    });
    const question = questionOn(asking, { standingOn: "osada", occupied: ["bagna-1"] });
    expect(question).toEqual({ kind: "gdzie", reason: "JEDNOROŻEC", fields: [] });
  });

  /**
   * The STRAŻ names its destination in terms of the turn, so there is nothing
   * to point at — `walk` reads it off the frame's `from` and asks nobody.
   */
  it("offers nothing for a destination the card names itself", () => {
    expect(destinationsFor({ kind: "poczatek-ruchu" }, atOsada)).toEqual([]);
  });

  /** Named rather than guessed at — and named the same way on both surfaces. */
  it("admits a question nobody can ask yet", () => {
    const asking = frame({ op: "przenies-karte" } as Effect);
    expect(questionOn(asking, nowhere)).toMatchObject({
      kind: "nieobslugiwane",
      op: "przenies-karte",
    });
  });
});
