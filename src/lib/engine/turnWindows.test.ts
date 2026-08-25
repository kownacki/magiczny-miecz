import { describe, expect, it } from "vitest";
import { opensItself, windowsFor, type TurnFacts } from "./turnWindows";

const quiet: TurnFacts = {
  phase: "pole",
  standingOn: "karczma",
  cardsWaiting: 0,
  fighting: false,
  crossing: false,
  ordeal: false,
  demands: false,
};

const ids = (facts: Partial<TurnFacts>) =>
  windowsFor({ ...quiet, ...facts }).map((window) => window.id);

describe("what a turn is offering", () => {
  it("offers the Obszar wherever a character is standing", () => {
    expect(ids({})).toEqual(["obszar"]);
  });

  it("offers nothing at all before a character is placed", () => {
    expect(ids({ standingOn: null })).toEqual([]);
  });

  it("puts the cards before the Obszar they were drawn on (16.4)", () => {
    // "Dopiero po rozpatrzeniu skutków wszystkich Spotkań i pokonaniu
    // wszystkich Wrogów ... Postać może przystąpić do rozpatrzenia pozostałych
    // Kart" — the order is the rule, so it is the order of the list.
    expect(ids({ cardsWaiting: 2 })).toEqual(["karty", "obszar"]);
  });

  it("puts a fight before everything", () => {
    expect(ids({ fighting: true, cardsWaiting: 1 })).toEqual(["walka", "karty", "obszar"]);
  });

  it("says how many cards are waiting, and nothing about the rest", () => {
    const [cards, obszar] = windowsFor({ ...quiet, cardsWaiting: 3 });
    expect(cards.count).toBe(3);
    expect(obszar.count).toBeUndefined();
  });
});

describe("what cannot be walked past", () => {
  it("marks a fight and drawn cards as not offers", () => {
    const windows = windowsFor({ ...quiet, fighting: true, cardsWaiting: 1 });
    const forced = windows.filter((window) => window.compulsory).map((w) => w.id);
    // The Obszar underneath them stays an offer: 16.4 orders the cards before
    // it, but the field itself is somewhere you may simply stand.
    expect(forced).toEqual(["walka", "karty"]);
  });

  it("leaves an ordinary Obszar as an offer", () => {
    expect(windowsFor(quiet)[0].compulsory).toBeUndefined();
  });

  it("marks an Obszar that happens to you whether you ask or not", () => {
    // The Karczma has no "if you want" about it: you arrive and it rolls.
    expect(windowsFor({ ...quiet, demands: true })[0].compulsory).toBe(true);
  });

  it("opens the most pressing one by itself, and only a compulsory one", () => {
    expect(opensItself(windowsFor({ ...quiet, fighting: true, cardsWaiting: 1 }))).toBe("walka");
    expect(opensItself(windowsFor({ ...quiet, cardsWaiting: 1 }))).toBe("karty");
    expect(opensItself(windowsFor(quiet))).toBeNull();
  });
});

describe("the two that come back next turn", () => {
  it("offers a crossing on arrival and again before the roll (11.4)", () => {
    // "czy będzie ponownie próbowała przekroczyć granicę Kręgów" — retrying is
    // the point of the next turn, so offering it only on arrival meant a failed
    // crossing could never be attempted again.
    expect(ids({ crossing: true, phase: "pole" })).toContain("przeprawa");
    expect(ids({ crossing: true, phase: "rzut" })).toContain("przeprawa");
  });

  it("does not offer one in the middle of a fight", () => {
    expect(ids({ crossing: true, phase: "walka" })).not.toContain("przeprawa");
  });

  it("offers a bridge ordeal on the same terms", () => {
    expect(ids({ ordeal: true, phase: "rzut" })).toContain("most");
    expect(ids({ ordeal: true, phase: "walka" })).not.toContain("most");
  });

  it("keeps them after the Obszar, which is the thing they are on", () => {
    expect(ids({ crossing: true, ordeal: true })).toEqual([
      "obszar",
      "przeprawa",
      "most",
    ]);
  });
});

describe("the move itself", () => {
  it("is a window too, and not one that can be put off", () => {
    // The die is thrown and the character is standing between two roads: the
    // turn goes nowhere until that is answered, so the box opens it rather
    // than offering it.
    const [first] = windowsFor({ ...quiet, phase: "ruch" });
    expect(first.id).toBe("ruch");
    expect(first.compulsory).toBe(true);
    expect(opensItself(windowsFor({ ...quiet, phase: "ruch" }))).toBe("ruch");
  });

  it("still comes second to a fight", () => {
    expect(ids({ phase: "ruch", fighting: true })).toEqual(["walka", "ruch", "obszar"]);
  });

  it("is not offered in any other phase", () => {
    expect(ids({ phase: "pole" })).not.toContain("ruch");
    expect(ids({ phase: "rzut" })).not.toContain("ruch");
  });
});
