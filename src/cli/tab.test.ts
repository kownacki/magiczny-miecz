import { describe, expect, it } from "vitest";
import { tabFor } from "./tab";
import type { Stage } from "@/lib/engine/console";

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
/** Mid-turn and unlocked, unless a test says otherwise. */
const tab = (line: string, offering: { stage: Stage; testmode: boolean } = { stage: "roll", testmode: true }) =>
  tabFor(line, PLAYERS, LOCAL, offering);

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
   * What the first person to run `mm` typed, and what came back.
   *
   * `p` in the poczekalnia offered `pass`, `place` and `put`: one belongs to a
   * turn that has not started, and two are overrides on a table where testmode
   * was never turned on. Tab is for finishing a word you already know will
   * work — `help` is where you go to find out that the others exist.
   */
  it("offers only what would run here", () => {
    const lobby = (line: string) => tab(line, { stage: "lobby", testmode: false });
    expect(lobby("p")[0]).toEqual(["pick "]);

    // Mid-turn `pass` comes back — and `pick` stays, because 4.4 lets a player
    // whose Postać died choose another without waiting for a lobby.
    // No trailing space where two candidates share the prefix: readline lists
    // them and advances as far as they agree, which is nowhere here.
    expect(tab("p", { stage: "roll", testmode: false })[0]).toEqual(["pass", "pick"]);
    expect(tab("p", { stage: "roll", testmode: true })[0]).toEqual(
      expect.arrayContaining(["place", "put"]),
    );
  });

  it("offers a verb only in the phase it belongs to", () => {
    const at = (stage: Stage) =>
      tab("", { stage, testmode: false })[0].map((one) => one.trim());
    expect(at("roll")).toContain("roll");
    expect(at("roll")).not.toContain("move");
    expect(at("move")).toContain("move");
    expect(at("field")).toContain("answer");
    expect(at("field")).not.toContain("roll");
  });

  it("still explains a command it would not offer", () => {
    // Asking about one you cannot run is a fair question.
    expect(tab("help kil", { stage: "lobby", testmode: false })[0]).toEqual(["help kill "]);
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
