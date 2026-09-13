import { describe, expect, it } from "vitest";
import spells from "@/data/spells.json";
import type { Spell } from "@/data/types";
import {
  SPELLS,
  TIMING_LABEL,
  spellFacts,
  castableNow,
  momentOf,
  momentsIn,
  momentsOf,
  spellScript,
  type SpellTiming,
} from "./spells";
import type { Fight, TurnPhase } from "./turn";
import { isSpellId, type CardId, type SpellId } from "@/data/ids";

const IDS = new Set<SpellId>((spells as Spell[]).map((s) => s.id));
/** The same list as bare names, for the membership check whose input is `Object.keys`. */
const ID_NAMES: ReadonlySet<string> = new Set(IDS);

describe("the spell registry against the real pile", () => {
  it("covers every spell in the box, and invents none", () => {
    // Unlike the event deck, this one is small enough to finish — and a spell
    // with no entry could never be cast at all, which is the bug this replaces.
    for (const id of IDS) expect(spellScript(id), id).not.toBeNull();
    for (const id of Object.keys(SPELLS)) expect(ID_NAMES.has(id), id).toBe(true);
  });

  it("gives every spell a window and something to do", () => {
    for (const [id, script] of Object.entries(SPELLS)) {
      expect(script.timing.length, id).toBeGreaterThan(0);
      expect(script.effect.length, id).toBeGreaterThan(0);
    }
  });
});

describe("when a spell may be spoken", () => {
  it("holds a timed spell to its window", () => {
    // "Zaklęcie musi być rzucone na początku tury jego posiadacza."
    const stone = spellScript("kamien-filozoficzny")!;
    expect(castableNow(stone, "turn-start")).toBe(true);
    expect(castableNow(stone, "after-move")).toBe(false);
    expect(castableNow(stone, "before-fight")).toBe(false);
  });

  it("lets an anytime spell go at any moment", () => {
    const fatum = spellScript("fatum")!;
    for (const moment of ["turn-start", "before-fight", "after-move"] as const) {
      expect(castableNow(fatum, moment), moment).toBe(true);
    }
  });

  it("always allows the two that answer other spells", () => {
    // Władca Zaklęć negates "Zaklęcie rzucone bezpośrednio przed nim", so it
    // must be castable in a window nobody chose in advance.
    for (const id of ["wladca-zaklec", "zwierciadlo"] as const) {
      const script = spellScript(id)!;
      expect(script.reactive, id).toBe(true);
      expect(castableNow(script, "in-fight"), id).toBe(true);
    }
  });

  it("offers the fight window when a fight is what is happening", () => {
    // 17.3 and 17.7: spells go in before the dice.
    expect(momentOf({ phase: "fight" })).toBe("before-fight");
    expect(momentOf({ phase: "roll" })).toBe("turn-start");
    expect(momentOf({ phase: "field" })).toBe("after-move");
  });

  it("closes 17.3's window once a die has been thrown", () => {
    // Before the dice a fight is "przed walką"; after the first one it is not,
    // and only the spells that act on a roll are left. The phase is the same
    // for both, which is why the moment is more than the phase.
    expect(momentsOf({ phase: "fight" })).toContain("before-fight");
    expect(momentsOf({ phase: "fight" })).not.toContain("in-fight");
    expect(momentsOf({ phase: "fight", diceRolled: true })).toContain("in-fight");
    expect(momentsOf({ phase: "fight", diceRolled: true })).not.toContain("before-fight");
  });

  it("reaches every window it names", () => {
    // A window `momentsOf` can never produce is a spell that can never be
    // cast, which is how "w walce", "po karcie", "meeting" and "zamiast
    // ruchu" were all unreachable at once.
    const reachable = new Set([
      ...momentsOf({ phase: "roll" }),
      ...momentsOf({ phase: "move" }),
      ...momentsOf({ phase: "field" }),
      ...momentsOf({ phase: "field", cardJustDrawn: true }),
      ...momentsOf({ phase: "field", meeting: true }),
      ...momentsOf({ phase: "fight" }),
      ...momentsOf({ phase: "fight", diceRolled: true }),
    ]);
    for (const timing of Object.keys(TIMING_LABEL) as SpellTiming[]) {
      expect(reachable.has(timing), timing).toBe(true);
    }
  });

  it("keeps the movement spells out of the middle of a turn", () => {
    // Magiczna Wędrówka is spent *instead of* a move, not after one.
    const walk = spellScript("magiczna-wedrowka")!;
    expect(walk.timing).toEqual(["instead-of-move"]);
    expect(castableNow(walk, "after-move")).toBe(false);
  });
});

describe("the two spells the app carries out (9.6)", () => {
  it("marks them in the data, not in a branch somewhere", () => {
    // Both take *cards* out of play, which is the app's own bookkeeping and
    // nobody else's: announce them and step back, and the cards never reach the
    // used pile that 9.5 refills the deck from.
    expect(spellScript("wladca-czarow")?.applies).toBe("dispels-spells");
    expect(spellScript("siewca-spustoszenia")?.applies).toBe("removes-card");
  });

  it("leaves the interconnected ones alone", () => {
    // The reason CAST_IS_ANNOUNCED exists: these answer other spells, and a
    // referee getting one subtly wrong is worse than one staying out of it.
    for (const id of ["zwierciadlo", "wladca-zaklec", "wojna-zywiolow", "odmiana-losu"] as const) {
      expect(spellScript(id)?.applies).toBeUndefined();
    }
  });

  it("does not offer to remove a board card for the spell that moves one", () => {
    // Władca Zdarzeń names a Karta na planszy too, and picks it up rather than
    // taking it away — so it stays announced and gets no picker.
    expect(spellScript("wladca-zdarzen")?.target).toBe("card-on-board");
    expect(spellScript("wladca-zdarzen")?.applies).toBeUndefined();
  });
});

/**
 * Reading the windows straight off a turn state.
 *
 * This is the function both sides now ask, so it is the one place 9.1 is
 * decided. Before it existed the browser took the turn state apart itself and
 * the server did not take it apart at all, which is how a spell could be spoken
 * at any moment by anything that was not the button.
 */
describe("momentsIn", () => {
  const fight = (over: Partial<Fight> = {}): TurnPhase => ({
    phase: "fight",
    fight: {
      cardId: "goblin",
      cardName: "GOBLIN",
      kind: "ordinary",
      enemyTotal: 3,
      playerTotal: 4,
      playerRoll: null,
      enemyRoll: null,
      result: null,
      fieldId: "step-1",
      draw: 0,
      drawn: [],
      ...over,
    } as Fight,
  });

  it("opens the pre-move windows before the die is thrown", () => {
    expect(momentsIn({ phase: "roll" })).toEqual(
      expect.arrayContaining(["turn-start", "before-move", "instead-of-move"]),
    );
  });

  /** 17.3 has passed once a die is on the table, and only 17.7 is left. */
  it("closes before-fight the moment either die is thrown", () => {
    expect(momentsIn(fight())).toContain("before-fight");
    expect(momentsIn(fight())).not.toContain("in-fight");

    const rolled = momentsIn(fight({ playerRoll: 4 }));
    expect(rolled).toContain("in-fight");
    expect(rolled).not.toContain("before-fight");

    expect(momentsIn(fight({ enemyRoll: 2 }))).toContain("in-fight");
  });

  it("notices a Wróg standing on the Obszar", () => {
    const onField = (drawn: { cardId: CardId; cardClass: string }[]): TurnPhase =>
      ({ phase: "field", fieldId: "step-1", from: null, draw: 1, drawn } as unknown as TurnPhase);

    expect(momentsIn(onField([{ cardId: "helm", cardClass: "item" }]))).toEqual(
      expect.arrayContaining(["after-move", "after-card"]),
    );
    expect(momentsIn(onField([{ cardId: "helm", cardClass: "item" }]))).not.toContain(
      "meeting",
    );
    expect(momentsIn(onField([{ cardId: "niedzwiedz", cardClass: "foe" }]))).toEqual(
      expect.arrayContaining(["meeting", "before-fight"]),
    );
  });

  it("always leaves any-time open", () => {
    for (const state of [{ phase: "roll" } as TurnPhase, { phase: "end" } as TurnPhase] as const) {
      expect(momentsIn(state)).toContain("any-time");
    }
  });

  /** The claim the server used to make by hand, now made by the same reading. */
  it("agrees with what a fight actually allows", () => {
    const before = momentsIn(fight());
    const after = momentsIn(fight({ playerRoll: 6 }));
    const wladca = spellScript("wladca-zaklec");
    // A reactive Zaklęcie answers whenever it is answering, dice or no dice.
    if (wladca?.reactive) {
      expect(castableNow(wladca, before)).toBe(true);
      expect(castableNow(wladca, after)).toBe(true);
    }
  });
});

/**
 * The two lines the hover panel prints for a Zaklęcie.
 *
 * Every card in the pile has to have them, because the panel is where they
 * moved to when the tile stopped printing them: a Zaklęcie whose window is a
 * blank line reads as one that can be spoken at any time.
 */
describe("what a Zaklęcie says about itself", () => {
  it("names a window for every Zaklęcie the app carries", () => {
    for (const id of Object.keys(SPELLS).filter(isSpellId)) {
      const facts = spellFacts(id);
      expect(facts, id).not.toBeNull();
      expect(facts!.when, id).not.toBe("");
    }
  });

  it("says nothing about the aim of a Zaklęcie that has none", () => {
    // „none" is a real answer and „—" is not a target; the panel leaves the
    // half-line out rather than printing a dash after the window.
    for (const [id, script] of Object.entries(SPELLS)) {
      if (script?.target !== "none" || !isSpellId(id)) continue;
      expect(spellFacts(id)!.at, id).toBeNull();
    }
  });

  it("answers with nothing for a card that is not a Zaklęcie", () => {
    expect(spellFacts("miecz")).toBeNull();
  });
});
