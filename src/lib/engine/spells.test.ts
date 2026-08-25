import { describe, expect, it } from "vitest";
import spells from "@/data/spells.json";
import type { Spell } from "@/data/types";
import { SPELLS, castableNow, momentOf, spellScript } from "./spells";

const IDS = new Set<string>((spells as Spell[]).map((s) => s.id));

describe("the spell registry against the real pile", () => {
  it("covers every spell in the box, and invents none", () => {
    // Unlike the event deck, this one is small enough to finish — and a spell
    // with no entry could never be cast at all, which is the bug this replaces.
    for (const id of IDS) expect(spellScript(id), id).not.toBeNull();
    for (const id of Object.keys(SPELLS)) expect(IDS.has(id), id).toBe(true);
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
    expect(castableNow(stone, "poczatek-tury")).toBe(true);
    expect(castableNow(stone, "po-ruchu")).toBe(false);
    expect(castableNow(stone, "przed-walka")).toBe(false);
  });

  it("lets an anytime spell go at any moment", () => {
    const fatum = spellScript("fatum")!;
    for (const moment of ["poczatek-tury", "przed-walka", "po-ruchu"] as const) {
      expect(castableNow(fatum, moment), moment).toBe(true);
    }
  });

  it("always allows the two that answer other spells", () => {
    // Władca Zaklęć negates "Zaklęcie rzucone bezpośrednio przed nim", so it
    // must be castable in a window nobody chose in advance.
    for (const id of ["wladca-zaklec", "zwierciadlo"]) {
      const script = spellScript(id)!;
      expect(script.reactive, id).toBe(true);
      expect(castableNow(script, "w-walce"), id).toBe(true);
    }
  });

  it("offers the fight window when a fight is what is happening", () => {
    // 17.3 and 17.7: spells go in before the dice.
    expect(momentOf("walka", true)).toBe("przed-walka");
    expect(momentOf("rzut", false)).toBe("poczatek-tury");
    expect(momentOf("pole", true)).toBe("po-ruchu");
  });

  it("keeps the movement spells out of the middle of a turn", () => {
    // Magiczna Wędrówka is spent *instead of* a move, not after one.
    const walk = spellScript("magiczna-wedrowka")!;
    expect(walk.timing).toEqual(["zamiast-ruchu"]);
    expect(castableNow(walk, "po-ruchu")).toBe(false);
  });
});
