import { describe, expect, it } from "vitest";
import events from "./events.json";

/**
 * Which Przedmioty are *Magiczne*, read off the class band the cards print.
 *
 * A Karta's class is printed across its top with the numeral in the middle and
 * the name split around it: "Przedmiot V Przedmiot" for an ordinary one and
 * "Przedmiot V Magiczny" for a magical one. Three rules turn on the
 * distinction — the Wojna Żywiołów suspends Magiczne Przedmioty, the Przybysz
 * z Krainy Cieni refuses them, and the Kryształ Magów is proof against a list
 * of Zaklęcia that name them — and until this was transcribed the app could
 * only say "aplikacja nie wie, które nimi są".
 *
 * These assertions are the transcription's own record. They are not derived
 * from anything the code computes, which is the point: if a later pass over the
 * scans disagrees, this is what it disagrees with.
 */

const items = (events as { id: string; cardClass: string; magical?: boolean }[]).filter(
  (card) => card.cardClass === "item",
);
const magical = new Set(items.filter((card) => card.magical).map((card) => card.id));

describe("Magiczne Przedmioty, as the cards print them", () => {
  it("finds the cards at all, so this cannot pass by checking nothing", () => {
    expect(items.length).toBe(63);
  });

  /**
   * Twenty-five copies, and they sit together in the print run: everything from
   * ARONDIGHT (zdarzenia-6 #8) onward, plus the whole of zdarzenia-7. That the
   * boundary is a clean one is corroboration rather than the rule — the rule is
   * the word in the corner, and each card was read.
   */
  it("marks twenty-five of the sixty-three", () => {
    expect(items.filter((card) => card.magical)).toHaveLength(25);
  });

  it("knows the artefacts", () => {
    for (const id of [
      "excalibur",
      "arondight",
      "pierscien-mocy",
      "magiczny-miecz",
      "swiety-graal",
      "talizman-ognia",
      "talizman-powietrza",
      "krysztal-magow",
      "magiczna-sakwa",
      "zwierciadlo-zniszczenia",
    ]) {
      expect(magical.has(id), id).toBe(true);
    }
  });

  it("knows the ordinary kit", () => {
    for (const id of ["helm", "tarcza", "zbroja", "miecz", "sztylet", "kon", "lodz", "latarnia"]) {
      expect(magical.has(id), id).toBe(false);
    }
  });

  /**
   * The one that would be got wrong by reading the name.
   *
   * MAGICZNY MANUSKRYPT is titled Magiczny and classed "Przedmiot V Przedmiot"
   * — checked twice, and at full size, because it is the single card where the
   * title and the class band disagree. The class band is what the rules key
   * off: "Magiczne Przedmioty" is a printed class, not an adjective in a name.
   * Its sister card TAJEMNA SAKWA is ordinary while MAGICZNA SAKWA is not,
   * which is the same distinction landing the way the names suggest.
   */
  it("goes by the class band and not by the name", () => {
    expect(magical.has("magiczny-manuskrypt")).toBe(false);
    expect(magical.has("tajemna-sakwa")).toBe(false);
    expect(magical.has("magiczna-sakwa")).toBe(true);
  });
});
