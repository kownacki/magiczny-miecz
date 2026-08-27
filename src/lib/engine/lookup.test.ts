import { describe, expect, it } from "vitest";
import { describeCard, everyCardName } from "./lookup";

/**
 * Reading the box, which is the one thing here that needs no game.
 *
 * The rule this file is really about: a person deciding whether to play wants
 * to read what they would be playing, and there is no table yet to read it
 * against. So this touches nothing but the transcription.
 */

const lines = (name: string) => {
  const found = describeCard(name);
  if (!("lines" in found)) throw new Error(`not found: ${JSON.stringify(found)}`);
  return found.lines;
};

describe("reading a Karta off the box", () => {
  it("reads a Postać with everything you would choose on", () => {
    const [head, mgr, ...rest] = lines("BARBARZYŃCA");
    // The Natura as you would *type* it. The browser renders it Polish because
    // the browser is a Polish interface; a terminal sentence is English, and
    // showing "chaotyczna" here would be showing a word you cannot type.
    expect(head).toBe("BARBARZYŃCA — Sword 5 · Magic 1 · chaotic");
    expect(mgr).toBe("MGR: Kurhan");
    expect(rest.length).toBeGreaterThan(0);
  });

  it("reads a Przedmiot, a Zdarzenie and a Zaklęcie through the one door", () => {
    expect(lines("HEŁM")[0]).toBe("HEŁM");
    expect(lines("HEŁM")[1]).toMatch(/Hełmu/);
    expect(lines("KAMIEŃ FILOZOFICZNY")[0]).toBe("KAMIEŃ FILOZOFICZNY");
    expect(lines("BURZA SIEDMIU SŁOŃC")[1]).toMatch(/Burz/);
  });

  it("finds a name typed without a Polish keyboard", () => {
    expect(lines("barbarzynca")[0]).toContain("BARBARZYŃCA");
    expect(lines("swiety graal")[0]).toBe("ŚWIĘTY GRAAL");
  });

  it("answers a half-typed name with what it could be", () => {
    const found = describeCard("KRYSZTAŁ");
    expect(found).toEqual({ candidates: ["KRYSZTAŁ LOSU", "KRYSZTAŁ MAGÓW"] });
  });

  it("says so plainly when there is no such card", () => {
    expect(describeCard("Narnia")).toEqual({ missing: "Narnia" });
    expect(describeCard("  ")).toEqual({ missing: "  " });
  });

  /**
   * The box prints four Magiczne Miecze and two Upiory, and they share an id —
   * so seventeen names appear more than once in the piles. A list to offer
   * somebody wants each name once: the copies are the same card.
   */
  it("knows every name the box prints, each once", () => {
    const names = everyCardName();
    expect(names.length).toBeGreaterThan(180);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("BARBARZYŃCA");
    expect(names).toContain("WILKOŁAK");
    expect(names.filter((one) => one === "WILKOŁAK")).toHaveLength(1);
  });
});
