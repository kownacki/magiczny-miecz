import { describe, expect, it } from "vitest";
import characters from "@/data/characters.json";
import events from "@/data/events.json";
import type { Character, EventCard } from "@/data/types";
import { LIVE_ABILITIES, PARKED_CARDS, parkedAbility, parkedCard } from "./disabled";
import { STARTING_KIT, abilitiesOfCharacter } from "./characters";
import { isCardId, type CharacterId } from "@/data/ids";
import { coverageOf, manualNote } from "./coverage";
import { asCharacterId } from "./characters";

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
  "bledny-rycerz": [[0, "Miecz i Zbroję"]],
  czarodziej: [[0, "2 Zaklęcia"]],
  demon: [[0, "1 Zaklęcie"]],
  hummit: [[0, "1 Zaklęcie"]],
  kaplan: [[0, "1 Zaklęcie"]],
  kaplanka: [[0, "2 Zaklęcia"]],
  karzel: [[0, "2 Zaklęcia"]],
  kat: [[1, "1 Zaklęcie i Miecz"]],
  krasnolud: [[0, "Tarczę i Sztylet"]],
  ksiaze: [
    [0, "5 Sztuk Złota"],
    [1, "Hełm i Miecz"],
  ],
  lotr: [[0, "Sztylet"]],
  mag: [[0, "2 Zaklęcia"]],
  magog: [[0, "1 Zaklęcie"]],
  quark: [[0, "1 Zaklęcie"]],
  "rycerz-ciemnosci": [[0, "1 Zaklęcie i Miecz"]],
  wiedzma: [[0, "1 Zaklęcie"]],
  zdobywca: [[0, "Miecz i Tarczę"]],
};

const CHARACTERS = characters as Character[];
const EVENTS = events as EventCard[];

describe("what is parked while Postać przeciw Postaci is unbuilt", () => {
  it("names only Karty that exist", () => {
    for (const cardId of Object.keys(PARKED_CARDS).filter(isCardId)) {
      expect(EVENTS.some((card) => card.id === cardId)).toBe(true);
    }
  });

  it("names only Postacie that exist, and clauses they actually have", () => {
    for (const [characterId, indices] of Object.entries(LIVE_ABILITIES)) {
      const character = CHARACTERS.find((one) => one.id === characterId);
      expect(character, characterId).toBeDefined();
      for (const index of indices ?? []) {
        expect(character!.abilities[index], `${characterId}[${index}]`).toBeDefined();
      }
    }
  });

  it("keeps live exactly the clause each starting kit deals", () => {
    for (const [characterId, expected] of Object.entries(MUST_CONTAIN)) {
      const character = CHARACTERS.find((one) => one.id === characterId)!;
      for (const [index, words] of expected) {
        expect(character.abilities[index], `${characterId}[${index}]`).toContain(words);
        expect(parkedAbility(asCharacterId(characterId), index), `${characterId}[${index}]`).toBe(false);
      }
    }
  });

  it("lists a live clause for every Postać that is dealt a kit, and no other", () => {
    expect(Object.keys(LIVE_ABILITIES).sort()).toEqual(Object.keys(STARTING_KIT).sort());
    expect(Object.keys(LIVE_ABILITIES).sort()).toEqual(Object.keys(MUST_CONTAIN).sort());
  });

  it("parks every clause that is not the kit, on every Postać", () => {
    for (const character of CHARACTERS) {
      const live = LIVE_ABILITIES[character.id as CharacterId] ?? [];
      character.abilities.forEach((_, index) => {
        expect(parkedAbility(character.id, index), `${character.id}[${index}]`).toBe(
          !live.includes(index),
        );
      });
    }
  });

  it("hands out no encoded Postać power while they are parked", () => {
    // One door: `abilitiesOfCharacter`. Nothing is deleted — `CHARACTER_ABILITIES`
    // still holds all sixteen — and every reader that asks gets nothing.
    for (const character of CHARACTERS) {
      expect(abilitiesOfCharacter(character.id as CharacterId), character.id).toEqual([]);
    }
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
    for (const cardId of Object.keys(PARKED_CARDS).filter(isCardId)) {
      expect(manualNote(cardId), cardId).toBeNull();
    }
  });

  /**
   * A parked Karta is not `czesciowe` either — it is not carried in part, it
   * is not carried at all, and `coverageOf` should not be the thing a reader
   * consults about it.
   */
  it("reads as something other than a half-carried card", () => {
    for (const cardId of Object.keys(PARKED_CARDS).filter(isCardId)) {
      expect(coverageOf(cardId), cardId).not.toBe("partial");
    }
  });
});
