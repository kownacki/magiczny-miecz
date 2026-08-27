import { describe, expect, it } from "vitest";
import { STARTING_KIT } from "./characters";
import { slotsFor, stowStartingKit } from "./slots";

describe("wyposażenie początkowe w wariancie slotowym", () => {
  /**
   * The audit that decided this, kept as a test: seven characters are dealt
   * eleven Przedmioty and every one of them has a place. If a transcription
   * ever gives somebody a starting card that cannot be worn, this says so
   * rather than quietly dropping it in the Plecak.
   */
  it("finds a place for every starting Przedmiot in the box", () => {
    const homeless: string[] = [];
    for (const [id, kit] of Object.entries(STARTING_KIT)) {
      const items = (kit as { items?: readonly string[] }).items ?? [];
      stowStartingKit(items).forEach((slot, at) => {
        if (slot === null) homeless.push(`${id}: ${items[at]}`);
      });
    }
    expect(homeless).toEqual([]);
  });

  it("gives each of a character's items a place of its own", () => {
    for (const [id, kit] of Object.entries(STARTING_KIT)) {
      const items = (kit as { items?: readonly string[] }).items ?? [];
      const places = stowStartingKit(items).filter((slot) => slot !== null);
      expect(new Set(places).size, id).toBe(places.length);
    }
  });

  /** The two-handed pair: a Tarcza is off-hand only, a Sztylet takes the other. */
  it("arms the Krasnolud with both of the things he starts with", () => {
    const kit = (STARTING_KIT.krasnolud as { items?: readonly string[] }).items ?? [];
    expect(stowStartingKit(kit)).toEqual(kit.map((card) => slotsFor(card)[0]));
  });

  /** A second copy of the same card has nowhere left to go, and says so. */
  it("answers null rather than putting two cards in one place", () => {
    expect(stowStartingKit(["miecz", "miecz"])).toEqual(["main-hand", null]);
  });
});
