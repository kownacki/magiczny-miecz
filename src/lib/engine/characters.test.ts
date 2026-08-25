import { describe, expect, it } from "vitest";
import characters from "@/data/characters.json";
import items from "@/data/items.json";
import type { Character, Item } from "@/data/types";
import { FIELDS, fieldByName } from "./board";
import { skipsRollAt, tollIsWaived, isForbidden, rollModifier } from "./abilities";
import {
  CHARACTER_ABILITIES,
  CHARACTER_NOTES,
  RANDOM_CHARACTER_ID,
  STARTING_KIT,
  abilitiesOfCharacter,
  asCharacterId,
  asSeatCharacter,
  isRandomPick,
  notesForCharacter,
  startingKit,
} from "./characters";

const CHARACTERS = characters as Character[];
const IDS = new Set<string>(CHARACTERS.map((c) => c.id));
const ITEM_IDS = new Set<string>((items as Item[]).map((i) => i.id));

describe("the character registries against the real character cards", () => {
  it("only describes characters that exist", () => {
    for (const id of [
      ...Object.keys(CHARACTER_ABILITIES),
      ...Object.keys(CHARACTER_NOTES),
      ...Object.keys(STARTING_KIT),
    ]) {
      expect(IDS.has(id), id).toBe(true);
    }
  });

  it("only names fields that exist", () => {
    for (const [id, abilities] of Object.entries(CHARACTER_ABILITIES)) {
      for (const ability of abilities) {
        const named =
          ability.kind === "bezpieczny" || ability.kind === "ucieczka"
            ? ability.fields
            : ability.kind === "bez-oplaty"
              ? ability.fields
              : ability.kind === "modyfikator-rzutu" && ability.gdzie.na === "pola"
                ? ability.gdzie.fields
                : [];
        for (const fieldId of named) {
          expect(FIELDS.get(fieldId), `${id} -> ${fieldId}`).toBeDefined();
        }
      }
    }
  });

  it("only hands out equipment that is in the box", () => {
    for (const [id, kit] of Object.entries(STARTING_KIT)) {
      for (const cardId of kit.items ?? []) {
        expect(ITEM_IDS.has(cardId), `${id} -> ${cardId}`).toBe(true);
      }
    }
  });

  it("says something about every character it does not fully carry", () => {
    // A character with neither encoded abilities nor notes is a claim that the
    // app handles all of its powers, which is true of none of them.
    for (const character of CHARACTERS) {
      const encoded = abilitiesOfCharacter(asCharacterId(character.id)).length;
      const noted = notesForCharacter(asCharacterId(character.id)).length;
      expect(encoded + noted, character.id).toBeGreaterThan(0);
    }
  });
});

describe("what the characters can actually do", () => {
  it("keeps the Barbarzyńca safe where his card says", () => {
    const b = abilitiesOfCharacter("barbarzynca");
    expect(skipsRollAt(b, "wilczy-parow")).toBe(true);
    expect(skipsRollAt(b, "urwisko-2")).toBe(true);
    expect(skipsRollAt(b, "kurhan")).toBe(false);
  });

  it("lets the Karzeł past the Strażnik without paying", () => {
    expect(tollIsWaived(abilitiesOfCharacter("karzel"), "straznik-magicznych-wrot")).toBe(true);
    // He is not exempt from the ferryman.
    expect(tollIsWaived(abilitiesOfCharacter("karzel"), "przeprawa-1")).toBe(false);
  });

  it("shaves a point off the guardian each of the two rogues knows", () => {
    // Hobgoblin at the ruins, Obbol at the dead city — mirror abilities at the
    // two bridge entrances.
    expect(rollModifier(abilitiesOfCharacter("hobgoblin"), { fieldId: "ruiny-twierdzy" }).delta).toBe(-1);
    expect(rollModifier(abilitiesOfCharacter("obbol"), { fieldId: "wymarle-miasto" }).delta).toBe(-1);
    expect(rollModifier(abilitiesOfCharacter("hobgoblin"), { fieldId: "wymarle-miasto" }).delta).toBe(0);
  });

  it("keeps a blade out of the Pustelnik's hands", () => {
    const p = abilitiesOfCharacter("pustelnik");
    expect(isForbidden(p, "miecz")).toBe(true);
    expect(isForbidden(p, "zbroja")).toBe(true);
    expect(isForbidden(p, "latarnia")).toBe(false);
  });
});

describe("what a character owns before the first roll", () => {
  it("gives the Książę his purse and his gear", () => {
    expect(startingKit("ksiaze")).toEqual({ items: ["helm", "miecz"], zloto: 5 });
  });

  it("gives the spellcasters their spells", () => {
    expect(startingKit("mag").spells).toBe(2);
    expect(startingKit("kaplanka").spells).toBe(2);
    expect(startingKit("wiedzma").spells).toBe(1);
  });

  it("gives a plain fighter nothing beyond the default", () => {
    expect(startingKit("barbarzynca")).toEqual({});
    expect(startingKit("troll")).toEqual({});
  });
});

describe("the surprise pick", () => {
  it("is not the id of any printed character", () => {
    // The whole scheme rests on this: the sentinel lives in the same column as
    // a real character id, so a collision would let a seat claim a card by
    // asking to be surprised.
    expect(IDS.has(RANDOM_CHARACTER_ID)).toBe(false);
  });

  it("recognises itself and nothing else", () => {
    expect(isRandomPick(RANDOM_CHARACTER_ID)).toBe(true);
    for (const character of CHARACTERS) expect(isRandomPick(character.id)).toBe(false);
    // A seat that has not chosen is not a seat that chose the surprise, and
    // the difference is what lets one be ready and the other not.
    expect(isRandomPick(null)).toBe(false);
    expect(isRandomPick(undefined)).toBe(false);
    expect(isRandomPick("")).toBe(false);
  });

  it("cannot reach an ability lookup at all", () => {
    // Stronger than it used to be. This once checked that the accessors
    // returned nothing for the sentinel; now `abilitiesOfCharacter` will not
    // take it — the type says a Karta Postaci or null, and the sentinel is
    // neither, so the narrowing has to happen first and this is what it says.
    expect(asCharacterId(RANDOM_CHARACTER_ID)).toBeNull();
    expect(abilitiesOfCharacter(asCharacterId(RANDOM_CHARACTER_ID))).toEqual([]);
    expect(notesForCharacter(asCharacterId(RANDOM_CHARACTER_ID))).toEqual([]);
    expect(startingKit(asCharacterId(RANDOM_CHARACTER_ID))).toEqual({});
  });

  it("is still a seat's state, alongside the 27 cards and nothing chosen", () => {
    expect(asSeatCharacter(RANDOM_CHARACTER_ID)).toBe(RANDOM_CHARACTER_ID);
    expect(asSeatCharacter("goblin")).toBe("goblin");
    expect(asSeatCharacter("step")).toBeNull();
    expect(asSeatCharacter(null)).toBeNull();
  });
});

describe("where characters start", () => {
  it("puts every MGR on a field that exists", () => {
    // Six characters used to start nowhere. Their cards name Step and Mokradła,
    // the board has two of each, and the ids are `step-1`/`step-2` — so a
    // slugified "Step" matched no field at all and the figure went on the board
    // at a place with no dot, no neighbours and no way to move.
    for (const character of CHARACTERS) {
      const field = fieldByName(character.start);
      expect(field, `${character.id} — MGR "${character.start}"`).toBeDefined();
      expect(FIELDS.has(field!.id)).toBe(true);
    }
  });

  it("starts everybody in the Dolny Krąg", () => {
    // The journey the game is about runs outward from the inner ring, so an MGR
    // anywhere else would be a character starting the race halfway along it.
    for (const character of CHARACTERS) {
      expect(fieldByName(character.start)!.region, character.id).toBe("dolny");
    }
  });
});
