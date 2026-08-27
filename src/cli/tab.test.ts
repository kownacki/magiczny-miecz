import { describe, expect, it } from "vitest";
import { tabFor } from "./tab";

/**
 * Tab, in the shape `readline` asks for it.
 *
 * The engine decides what a fragment completes to — that is covered where
 * `complete` lives. What is checked here is only the translation: readline
 * replaces the returned fragment with a chosen candidate, so a candidate that
 * is not a whole line would eat the verb in front of it.
 */

const PLAYERS = ["Michał", "Ola"];
const LOCAL = ["new", "load", "saves", "delete", "testmode", "quit", "exit"];
const tab = (line: string) => tabFor(line, PLAYERS, LOCAL);

describe("finishing a line at a prompt", () => {
  it("finishes a verb", () => {
    const [hits, fragment] = tab("endt");
    expect(hits).toEqual(["endturn "]);
    // The whole line, because that is what the candidates replace.
    expect(fragment).toBe("endt");
  });

  it("offers the local words, which are not part of the shared grammar", () => {
    const [hits] = tab("sav");
    expect(hits).toEqual(["saves "]);
    // `load` and `leave` both start with l, and one is local and one is not.
    expect(tab("l")[0]).toContain("load ");
  });

  it("stops offering local words once the verb is typed", () => {
    // `load AB` is finishing a save code, and nothing here knows those.
    expect(tab("load AB")[0]).toEqual([]);
  });

  it("gives back whole lines, so nothing eats the verb", () => {
    const [hits] = tab("give krysz");
    expect(hits.length).toBeGreaterThan(1);
    for (const hit of hits) expect(hit.startsWith("give ")).toBe(true);
  });

  it("finishes a name without a Polish keyboard", () => {
    expect(tab("give swiety g")[0]).toEqual(["give ŚWIĘTY GRAAL "]);
  });

  it("knows who is at the table", () => {
    expect(tab("kick mich")[0]).toEqual(["kick Michał "]);
  });

  it("says nothing rather than guessing", () => {
    expect(tab("give Narnia")[0]).toEqual([]);
    expect(tab("")[0].length).toBeGreaterThan(0);
  });

  /**
   * The one that would break silently: readline replaces the fragment it is
   * handed, so a candidate must be a line and the fragment must be the line.
   * Get either wrong and Tab appends to what is already there.
   */
  it("hands readline a fragment its candidates can replace", () => {
    for (const line of ["endt", "give krysz", "kick mich", "teleport kar"]) {
      const [hits, fragment] = tab(line);
      expect(fragment, line).toBe(line);
      for (const hit of hits) expect(hit.toLowerCase().startsWith(line.slice(0, 3).toLowerCase())).toBe(true);
    }
  });
});
