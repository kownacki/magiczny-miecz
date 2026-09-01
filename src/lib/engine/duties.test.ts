import { describe, expect, it } from "vitest";
import { dutiesBeforeEnding, mayEndTurn, whyCannotEnd } from "./duties";

describe("duties before ending a turn", () => {
  it("owes the Bestia fight while standing in the Zamek", () => {
    const duties = dutiesBeforeEnding({ fieldId: "zamek-bestii", done: [] });
    expect(duties.map((duty) => duty.kind)).toEqual(["beast"]);
    expect(mayEndTurn({ fieldId: "zamek-bestii", done: [] })).toBe(false);
  });

  it("owes nothing once the fight has happened", () => {
    // Compulsory, not repeatable: 14.7 is satisfied by fighting, whatever the
    // result. A loss costs two Życia and puts the character off the Most, and
    // that still counts as having fought.
    expect(mayEndTurn({ fieldId: "zamek-bestii", done: ["beast"] })).toBe(true);
  });

  it("owes nothing anywhere else on the Most", () => {
    for (const field of ["cerber", "monstrum", "demon-zaglady", "pulapka"] as const) {
      expect(mayEndTurn({ fieldId: field, done: [] })).toBe(true);
    }
  });

  it("owes nothing on an ordinary field, or before a move", () => {
    // Bezdroża and not the Karczma. The Karczma prints "MUSISZ RZUCIĆ KOSTKĄ",
    // which 13.5 makes a duty of its own — it was standing in for "an ordinary
    // field" here while nothing checked the Obszar's own instruction, and it is
    // the least ordinary field on the ring.
    expect(mayEndTurn({ fieldId: "bezdroza", done: [] })).toBe(true);
    expect(mayEndTurn({ fieldId: null, done: [] })).toBe(true);
  });

  it("does not fire the moment the figure lands", () => {
    // The whole point: the duty blocks the END of the turn, so a player is free
    // to put a Tarcza on and rearrange what they carry first. Nothing here
    // demands the fight happen before anything else.
    const duties = dutiesBeforeEnding({ fieldId: "zamek-bestii", done: [] });
    expect(duties).toHaveLength(1);
    expect(duties[0].label).toContain("Bestią");
  });
});

describe("saying why", () => {
  it("names what is owed and the rule that owes it", () => {
    const duties = dutiesBeforeEnding({ fieldId: "zamek-bestii", done: [] });
    expect(whyCannotEnd(duties)).toBe("Najpierw: Stocz walkę z Bestią (14.7).");
  });

  it("says nothing when nothing is owed", () => {
    expect(whyCannotEnd([])).toBeNull();
  });
});

describe("the move, which is not optional (10.1-10.2)", () => {
  it("will not let a turn end before it has moved", () => {
    // 10.1 makes a turn "a) ruch b) spotkania", and 10.2 gives no clause
    // turning a roll of 3 into a move of 0. The only choice is direction.
    expect(mayEndTurn({ fieldId: "karczma", done: [], phase: "roll" })).toBe(false);
    expect(whyCannotEnd(dutiesBeforeEnding({ fieldId: "karczma", done: [], phase: "roll" })))
      .toContain("10.1");
  });

  it("lets it end once the character has arrived somewhere", () => {
    expect(mayEndTurn({ fieldId: "bezdroza", done: [], phase: "field" })).toBe(true);
  });

  it("asks nothing of the Kamienny Most, which has no roll (10.3)", () => {
    expect(mayEndTurn({ fieldId: "pulapka", done: [], phase: "bridge" })).toBe(true);
  });

  it("takes a move that happened another way as done", () => {
    // 10.2 allows for it: "Pewne specjalne zdolności i Zaklęcia umożliwiają
    // wykonywanie ruchu w inny sposób."
    expect(mayEndTurn({ fieldId: "bezdroza", done: ["move"], phase: "roll" })).toBe(true);
  });
});

/* ==========================================================================
 * The Obszar's kolejka, and the Obszar's own instruction
 * ======================================================================= */

describe("what the Obszar still owes (16.4, 13.5)", () => {
  const onField = (drawn: { cardId: string; cardClass: string }[], settled: string[] = []) => ({
    drawn: drawn as never,
    settled,
  });

  /**
   * The gap this closes. Every window said `compulsory` and the door did not
   * agree: a Wróg could be left standing on the Obszar and the turn handed on
   * by pressing "koniec tury", which is a rule kept by a label.
   */
  it("will not let a turn end with a Wróg still standing", () => {
    const owed = {
      fieldId: "bezdroza" as const,
      done: [],
      phase: "field" as const,
      onField: onField([{ cardId: "wilk", cardClass: "foe" }]),
    };
    expect(mayEndTurn(owed)).toBe(false);
    expect(whyCannotEnd(dutiesBeforeEnding(owed))).toContain("WILK");
    expect(whyCannotEnd(dutiesBeforeEnding(owed))).toContain("16.4");
  });

  /** 17.5 fights a pack as one, so the refusal names one thing. */
  it("names a pack as one thing, the way it is fought", () => {
    const duties = dutiesBeforeEnding({
      fieldId: "bezdroza",
      done: [],
      phase: "field",
      onField: onField([
        { cardId: "wilk", cardClass: "foe" },
        { cardId: "wilkolak", cardClass: "foe" },
      ]),
    });
    expect(duties[0].label).toContain("WILK + WILKOŁAK");
  });

  it("lets the turn end once the kolejka is worked through", () => {
    expect(
      mayEndTurn({
        fieldId: "bezdroza",
        done: [],
        phase: "field",
        onField: onField([{ cardId: "wilk", cardClass: "foe" }], ["wilk"]),
      }),
    ).toBe(true);
  });

  /**
   * 12.1 gives loot and services the run of the turn — "w każdej chwili, aż do
   * końca swojej tury" — so nothing about them is owed at the end of it. A
   * Miecz nobody picked up stays lying there (16.8), which is not a debt.
   */
  it("owes nothing for what is merely offered", () => {
    expect(
      mayEndTurn({
        fieldId: "bezdroza",
        done: [],
        phase: "field",
        onField: onField([
          { cardId: "helm", cardClass: "item" },
          { cardId: "cudotworca", cardClass: "stranger" },
          { cardId: "targowisko", cardClass: "place" },
        ]),
      }),
    ).toBe(true);
  });

  /** "Do niektórych instrukcji Postać musi się zastosować" — the Karczma's is one. */
  it("will not let a turn end with the Karczma unrolled (13.5)", () => {
    const owed = { fieldId: "karczma" as const, done: [], phase: "field" as const };
    expect(mayEndTurn(owed)).toBe(false);
    expect(whyCannotEnd(dutiesBeforeEnding(owed))).toContain("13.5");
  });

  it("lets it end once the Obszar has been rolled", () => {
    expect(
      mayEndTurn({
        fieldId: "karczma",
        done: [],
        phase: "field",
        onField: onField([], ["pole:Karczma"]),
      }),
    ).toBe(true);
  });

  /** An Obszar that only offers — "MOŻESZ TU ODWIEDZIĆ" — owes nothing. */
  it("owes nothing at an Obszar that only offers", () => {
    expect(mayEndTurn({ fieldId: "osada", done: [], phase: "field" })).toBe(true);
  });

  /**
   * 13.5 puts the Obszar's own instruction after every Karta on it, so the
   * kolejka is what a player is told about first.
   */
  it("names the Karty before the Obszar itself", () => {
    const duties = dutiesBeforeEnding({
      fieldId: "karczma",
      done: [],
      phase: "field",
      onField: onField([{ cardId: "wilk", cardClass: "foe" }]),
    });
    expect(duties.map((duty) => duty.kind)).toEqual(["kolejka", "obszar"]);
  });
});
