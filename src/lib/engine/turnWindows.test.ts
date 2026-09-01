import { describe, expect, it } from "vitest";
import { factsIn, opensItself, turnSteps, windowsFor, type TurnFacts } from "./turnWindows";
import { asFieldId } from "./board";
import { offerKey } from "./fieldScript";
import type { TurnPhase } from "./turn";

const quiet: TurnFacts = {
  phase: "field",
  standingOn: "karczma",
  cardsWaiting: 0,
  fighting: false,
  crossing: false,
  ordeal: false,
  demands: false,
  beast: false,
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

describe("the Bestia, which is the end of the game (14.7)", () => {
  it("is offered at the Zamek, and is not an offer", () => {
    const [first] = windowsFor({ ...quiet, standingOn: "zamek-bestii", beast: true });
    expect(first.id).toBe("bestia");
    expect(first.compulsory).toBe(true);
  });

  it("opens itself, like a fight", () => {
    expect(opensItself(windowsFor({ ...quiet, beast: true }))).toBe("bestia");
  });

  it("comes before the Obszar's own business", () => {
    // Nothing is drawn at the Zamek and nothing else the turn could do matters
    // once you are standing there.
    expect(ids({ beast: true })).toEqual(["bestia", "obszar"]);
  });

  it("gives way to the fight once it has started", () => {
    // `factsIn` stops calling it a duty the moment the dice are out: from then
    // on it is the `walka` window like any other.
    const fighting = factsIn(
      { phase: "fight", fight: {} } as unknown as TurnPhase,
      asFieldId("zamek-bestii"),
    );
    expect(fighting.beast).toBe(false);
    // The Obszar stays offered, as it is everywhere a character is standing;
    // what has gone is the Bestia as a thing still to be done.
    expect(ids({ ...fighting, fighting: true })).toEqual(["walka", "obszar"]);
  });

  it("is not offered anywhere else on the board", () => {
    expect(factsIn({ phase: "roll" } as TurnPhase, asFieldId("karczma")).beast).toBe(false);
    expect(factsIn({ phase: "roll" } as TurnPhase, asFieldId("zamek-bestii")).beast).toBe(true);
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
    expect(ids({ crossing: true, phase: "field" })).toContain("przeprawa");
    expect(ids({ crossing: true, phase: "roll" })).toContain("przeprawa");
  });

  it("does not offer one in the middle of a fight", () => {
    expect(ids({ crossing: true, phase: "fight" })).not.toContain("przeprawa");
  });

  it("offers a bridge ordeal on the same terms", () => {
    expect(ids({ ordeal: true, phase: "roll" })).toContain("most");
    expect(ids({ ordeal: true, phase: "fight" })).not.toContain("most");
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
    const [first] = windowsFor({ ...quiet, phase: "move" });
    expect(first.id).toBe("ruch");
    expect(first.compulsory).toBe(true);
    expect(opensItself(windowsFor({ ...quiet, phase: "move" }))).toBe("ruch");
  });

  it("still comes second to a fight", () => {
    expect(ids({ phase: "move", fighting: true })).toEqual(["walka", "ruch", "obszar"]);
  });

  it("is not offered in any other phase", () => {
    expect(ids({ phase: "field" })).not.toContain("ruch");
    expect(ids({ phase: "roll" })).not.toContain("ruch");
  });
});

describe("how far through the turn you are", () => {
  const shape = (phase: TurnPhase["phase"]) =>
    turnSteps(phase).map((step) => `${step.label}:${step.state}`);

  it("has not rolled yet at the start", () => {
    expect(shape("roll")).toEqual(["Rzut:teraz", "Ruch:przed", "Obszar:przed"]);
  });

  it("has rolled once there is a direction to choose", () => {
    expect(shape("move")).toEqual(["Rzut:zrobione", "Ruch:teraz", "Obszar:przed"]);
  });

  it("has rolled and moved once it is standing somewhere", () => {
    expect(shape("field")).toEqual(["Rzut:zrobione", "Ruch:zrobione", "Obszar:teraz"]);
  });

  it("has done all three at the end", () => {
    expect(shape("end").every((s) => s.endsWith("zrobione"))).toBe(true);
  });

  it("claims no roll on the Kamienny Most, which has none (10.3)", () => {
    // One Obszar a turn and an instruction to get through. Saying a roll had
    // happened would be a lie; saying one was coming would be worse.
    expect(shape("bridge")).toEqual(["Most:teraz"]);
  });

  it("says only that a fight is happening", () => {
    expect(shape("fight")).toEqual(["Walka:teraz"]);
  });
});

/**
 * Reading the facts off a turn state.
 *
 * This assembly used to live in the page component, which is where its one
 * known bug lived too. Moving it here is what lets the bug be written down as a
 * test instead of as a comment.
 */
describe("factsIn", () => {
  const at = (fieldId: string, state: TurnPhase = { phase: "roll" }) =>
    factsIn(state, asFieldId(fieldId));

  const onField = (fieldId: string, drawn: { cardId: string; cardClass: string }[] = [], resolved: string[] = []) =>
    factsIn(
      {
        phase: "field",
        fieldId: asFieldId(fieldId)!,
        from: null,
        draw: 1,
        drawn,
        resolved,
      } as unknown as TurnPhase,
      asFieldId(fieldId),
    );

  /**
   * `crossingFrom` answers `undefined`, not null.
   *
   * Comparing it against null was true for every Obszar on the board, so the
   * Karczma — which is not a crossing and has no other side — offered a
   * Przeprawa.
   */
  it("does not offer a Przeprawa from an Obszar that has none", () => {
    expect(at("karczma").crossing).toBe(false);
    expect(at("uroczysko").crossing).toBe(true);
    expect(at("przelecz-wichrow").crossing).toBe(true);
  });

  it("knows the Kamienny Most's own Obszary", () => {
    expect(at("pulapka").ordeal).toBe(true);
    expect(at("cerber").ordeal).toBe(true);
    expect(at("karczma").ordeal).toBe(false);
  });

  /** 16.5: a Karczma happens to you, so its window is not an offer. */
  it("marks an Obszar that demands rather than offers", () => {
    expect(onField("karczma").demands).toBe(true);
    expect(onField("uroczysko").demands).toBe(false);
  });

  it("stops demanding once its offer has been settled", () => {
    expect(onField("karczma", [], [offerKey("Karczma")]).demands).toBe(false);
  });

  it("counts only the cards still waiting (16.4)", () => {
    const drawn = [
      { cardId: "goblin", cardClass: "foe" },
      { cardId: "helm", cardClass: "item" },
    ];
    expect(onField("uroczysko", drawn).cardsWaiting).toBe(2);
    expect(onField("uroczysko", drawn, ["goblin"]).cardsWaiting).toBe(1);
  });

  it("says nothing is waiting anywhere but on the Obszar", () => {
    expect(at("uroczysko").cardsWaiting).toBe(0);
    expect(at("uroczysko").fighting).toBe(false);
  });

  it("survives a character who is not on the board yet", () => {
    const facts = factsIn({ phase: "roll" }, null);
    expect(facts.standingOn).toBeNull();
    expect(facts.crossing).toBe(false);
    expect(facts.ordeal).toBe(false);
    expect(facts.demands).toBe(false);
  });

  /** The whole point: the facts feed the reading, and the reading is unchanged. */
  it("feeds windowsFor", () => {
    const windows = windowsFor(onField("karczma"));
    expect(windows.map((w) => w.id)).toContain("obszar");
    expect(opensItself(windows)).toBe("obszar");
  });
});
