import { describe, expect, it } from "vitest";
import { STARTING_KIT } from "./characters";
import { slotOnArrival, slotsOnArrival } from "./holdings";
import { slotsFor } from "./slots";

/**
 * Where a Przedmiot lands when it arrives, whichever way it arrived.
 *
 * One function, because there are three ways in — picked up, dealt with the
 * Postać, conjured at the console — and they used to disagree: the starting kit
 * was worn and everything else went into the Plecak and stayed there. In
 * slotowy that is the difference between a card working and a card doing
 * nothing.
 */

const arriving = (...cardIds: string[]) => cardIds.map((cardId) => ({ cardId, kind: "item" }));
const at = (worn: (string | null)[] = []) => ({
  eqMode: "slots" as const,
  nature: null,
  worn: worn as never,
});

describe("a Przedmiot arriving", () => {
  it("goes on the body when there is a place for it", () => {
    expect(slotOnArrival({ cardId: "helm", kind: "item", ...at() })).toBe("head");
  });

  it("goes in the Plecak when the place is taken", () => {
    // Never displaces: the Miecz already worn stays worn, and the player may
    // swap them with `equip` if that is what they wanted.
    expect(slotOnArrival({ cardId: "miecz", kind: "item", ...at(["main-hand"]) })).toBeNull();
  });

  it("goes in the Plecak when the card is not a thing to wear", () => {
    expect(slotOnArrival({ cardId: "lodz", kind: "item", ...at() })).toBeNull();
  });

  it("goes in the Plecak when the Natura may not use it (5.3)", () => {
    // TOPÓR ŚWIATŁA I CIEMNOŚCI: "nie może być w posiadaniu Chaotycznych".
    const chaotic = { eqMode: "slots" as const, nature: "chaotic" as const, worn: [] };
    const good = { eqMode: "slots" as const, nature: "good" as const, worn: [] };
    const card = { cardId: "topor-swiatla-i-ciemnosci", kind: "item" };
    expect(slotOnArrival({ ...card, ...chaotic })).toBeNull();
    expect(slotOnArrival({ ...card, ...good })).not.toBeNull();
  });

  it("goes in the Plecak for anything that is not a Przedmiot", () => {
    for (const kind of ["friend", "spell", "trophy", "carried"]) {
      expect(slotOnArrival({ cardId: "helm", kind, ...at() }), kind).toBeNull();
    }
  });

  /** Klasyczny has no places at all: a card counts wherever it lies. */
  it("goes in the Plecak in klasyczny, always", () => {
    expect(
      slotOnArrival({ cardId: "helm", kind: "item", eqMode: "classic", nature: null, worn: [] }),
    ).toBeNull();
  });

  /** Nulls in `worn` are pack cards and occupy nothing. */
  it("ignores what is in the Plecak when looking for a free place", () => {
    expect(slotOnArrival({ cardId: "helm", kind: "item", ...at([null, null, null]) })).toBe("head");
  });
});

describe("several arriving together", () => {
  it("gives each one a place of its own", () => {
    expect(slotsOnArrival(arriving("miecz", "miecz"), at())).toEqual(["main-hand", null]);
  });

  it("takes account of what the seat is already wearing", () => {
    expect(slotsOnArrival(arriving("miecz"), at(["main-hand"]))).toEqual([null]);
  });
});

/**
 * The audit that decided the starting kit, kept as a test: seven characters
 * are dealt eleven Przedmioty and every one of them has a place. If a
 * transcription ever gives somebody a starting card that cannot be worn, this
 * says so rather than quietly dropping it in the Plecak.
 */
describe("wyposażenie początkowe w wariancie slotowym", () => {
  const kitOf = (kit: unknown) => (kit as { items?: readonly string[] }).items ?? [];

  it("finds a place for every starting Przedmiot in the box", () => {
    const homeless: string[] = [];
    for (const [id, kit] of Object.entries(STARTING_KIT)) {
      const items = kitOf(kit);
      slotsOnArrival(arriving(...items), at()).forEach((slot, index) => {
        if (slot === null) homeless.push(`${id}: ${items[index]}`);
      });
    }
    expect(homeless).toEqual([]);
  });

  it("gives each of a character's items a place of its own", () => {
    for (const [id, kit] of Object.entries(STARTING_KIT)) {
      const places = slotsOnArrival(arriving(...kitOf(kit)), at()).filter((one) => one !== null);
      expect(new Set(places).size, id).toBe(places.length);
    }
  });

  /** The two-handed pair: a Tarcza is off-hand only, a Sztylet takes the other. */
  it("arms the Krasnolud with both of the things he starts with", () => {
    const kit = kitOf(STARTING_KIT.krasnolud);
    expect(slotsOnArrival(arriving(...kit), at())).toEqual(kit.map((card) => slotsFor(card)[0]));
  });
});
