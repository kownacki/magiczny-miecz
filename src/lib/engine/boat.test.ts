import { describe, expect, it } from "vitest";
import { isConsumedOnResolve, scriptFor } from "./cardScript";

/**
 * The Łódź and the Latarnia are a crossing, not a thing you own.
 *
 * "Nie możesz nieść Łodzi, zaś pozostawiona na brzegu szybko gnije." So the
 * Karta never reaches the pack: it costs nothing against 5.4's four, cannot be
 * taken off you at the Bagna, and cannot be hoarded until it suits you. The
 * Latarnia says the same of its oil.
 */
describe("the two cards that are a crossing", () => {
  it("are spent on the way in, like a Sztuka Złota", () => {
    expect(isConsumedOnResolve("lodz")).toBe(true);
    expect(isConsumedOnResolve("latarnia")).toBe(true);
    // The comparison that makes the point: an ordinary Przedmiot is kept.
    expect(isConsumedOnResolve("helm")).toBe(false);
  });

  it("open the obstacle their own card names", () => {
    const effect = scriptFor("lodz")?.effect as { modifier?: { przez?: string } };
    expect(effect.modifier?.przez).toBe("trzesawiska");
    const lamp = scriptFor("latarnia")?.effect as { modifier?: { przez?: string } };
    expect(lamp.modifier?.przez).toBe("lodowy-las");
  });

  /**
   * "W następnej turze po znalezieniu" — one more of the finder's own turns.
   * And "bez względu na to, czy użyłeś… odłóż tę Kartę", which is why it ends
   * on the clock rather than on the crossing: a boat rots whether you got in it
   * or not. The two spells that open the same door end `on: "crossing"`, because
   * a spell spent is spent when it works.
   */
  it("expire on the clock, not on the crossing", () => {
    for (const id of ["lodz", "latarnia"]) {
      const effect = scriptFor(id)?.effect as { ends?: { kind?: string; turns?: number } };
      expect(effect.ends, id).toEqual({ kind: "turns", turns: 1 });
    }
  });

  it("go to the used pile either way", () => {
    for (const id of ["lodz", "latarnia"]) {
      expect(scriptFor(id)?.disposition, id).toEqual({ kind: "odloz" });
    }
  });
});
