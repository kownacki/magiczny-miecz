import { describe, expect, it } from "vitest";
import characters from "@/data/characters.json";
import events from "@/data/events.json";
import type { Character, EventCard } from "@/data/types";
import { PARKED_ABILITIES, PARKED_CARDS, parkedAbility, parkedCard } from "./disabled";
import { coverageOf, manualNote } from "./coverage";

/**
 * An index into transcribed prose is a reference that rots in silence.
 *
 * `PARKED_ABILITIES` names clauses by their position in a Karta Postaci's own
 * `abilities` array, because that array is what the seat card renders and
 * there is nothing else stable to point at — the sentences have no ids. So the
 * cost is that re-transcribing a Postać, or the slicer re-cutting one, moves
 * every index after the change and dims the wrong sentence with no error.
 *
 * This is what turns that into a failing test. Each parked clause is pinned by
 * words only that clause contains, so a moved index fails here and says which
 * character moved rather than being discovered by a player reading a Karta
 * that crosses out the wrong ability.
 *
 * The first draft of the list had six of its nine indices wrong, taken off a
 * filtered grep rather than the arrays themselves — which is the whole reason
 * this file exists.
 */
const MUST_CONTAIN: Record<string, readonly (readonly [number, string])[]> = {
  barbarzynca: [[2, "zaatakować ją po raz drugi"]],
  demon: [[3, "w walce magicznej"]],
  kat: [
    [2, "ściąć jej głowę"],
    [3, "możesz wybrać rodzaj walki"],
  ],
  lotr: [
    [2, "Ilekroć pokonasz inną Postać"],
    [3, "walczysz nieuczciwie"],
  ],
  olbrzym: [[1, "przewyższa twój całkowity Miecz"]],
  "rycerz-ciemnosci": [[3, "Podczas Turnieju Rycerskiego"]],
  zdobywca: [[2, "odebrać pokonanej Postaci 2 punkty"]],
};

const CHARACTERS = characters as Character[];
const EVENTS = events as EventCard[];

describe("what is parked while Postać przeciw Postaci is unbuilt", () => {
  it("names only Karty that exist", () => {
    for (const cardId of Object.keys(PARKED_CARDS)) {
      expect(EVENTS.some((card) => card.id === cardId)).toBe(true);
    }
  });

  it("names only Postacie that exist, and clauses they actually have", () => {
    for (const [characterId, indices] of Object.entries(PARKED_ABILITIES)) {
      const character = CHARACTERS.find((one) => one.id === characterId);
      expect(character, characterId).toBeDefined();
      for (const index of indices ?? []) {
        expect(character!.abilities[index], `${characterId}[${index}]`).toBeDefined();
      }
    }
  });

  it("dims the clause it means, not the one that moved into its place", () => {
    for (const [characterId, expected] of Object.entries(MUST_CONTAIN)) {
      const character = CHARACTERS.find((one) => one.id === characterId)!;
      for (const [index, words] of expected) {
        expect(character.abilities[index], `${characterId}[${index}]`).toContain(words);
      }
    }
  });

  it("pins every parked index, so a new one cannot be added unpinned", () => {
    const named = Object.entries(PARKED_ABILITIES)
      .flatMap(([id, list]) => (list ?? []).map((index) => `${id}[${index}]`))
      .sort();
    const pinned = Object.entries(MUST_CONTAIN)
      .flatMap(([id, list]) => list.map(([index]) => `${id}[${index}]`))
      .sort();
    expect(named).toEqual(pinned);
  });

  it("leaves alone the clauses that are not duels", () => {
    // The Błędny Rycerz's refight is „jeżeli przegrasz walkę" — any fight —
    // and the Rycerz Ciemności's choice of form is 18.1b's, which is how he
    // attacks a Wróg with Magia.
    expect(parkedAbility("bledny-rycerz", 1)).toBe(false);
    expect(parkedAbility("bledny-rycerz", 3)).toBe(false);
    expect(parkedAbility("rycerz-ciemnosci", 1)).toBe(false);
    // And the Olbrzym still steps past somebody standing in his way.
    expect(parkedAbility("olbrzym", 0)).toBe(false);
  });

  it("answers for a card and for a seat with no character", () => {
    expect(parkedCard("turniej-rycerski")).toBe("pvp");
    expect(parkedCard("wilk")).toBeNull();
    expect(parkedAbility(null, 0)).toBe(false);
  });

  /**
   * The two lists mean different things and a card may only be in one.
   *
   * `MANUAL` says "this Karta is in the deck, will be drawn, and here is the
   * clause you apply yourself". Parked says "this Karta is not in the box".
   * A card in both would be the app promising a table it will come up *and*
   * refusing to deal it, which is worse than either — so CLAUDE.md forbids it
   * and this is what makes that a build failure rather than a paragraph.
   */
  it("never parks a card that also has a MANUAL note", () => {
    for (const cardId of Object.keys(PARKED_CARDS)) {
      expect(manualNote(cardId), cardId).toBeNull();
    }
  });

  /**
   * A parked Karta is not `czesciowe` either — it is not carried in part, it
   * is not carried at all, and `coverageOf` should not be the thing a reader
   * consults about it.
   */
  it("reads as something other than a half-carried card", () => {
    for (const cardId of Object.keys(PARKED_CARDS)) {
      expect(coverageOf(cardId), cardId).not.toBe("czesciowe");
    }
  });
});
