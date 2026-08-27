import { describe, expect, it } from "vitest";
import { RAID_RANGE, withinRaid } from "./raid";
import { asFieldId, requireFieldId } from "./board";

/**
 * The Poszukiwacz Przygód's reach, which two places now depend on agreeing:
 * `sendRaider` refuses against it and the browser decides what to offer with
 * it. A list of buttons worked out from a different number than the command
 * checks is a list of buttons that fail, so the number and the test that reads
 * it live in one file and both callers import them.
 */
describe("how far a wyprawa reaches", () => {
  const from = asFieldId("twierdza-strzegaca-drog");

  it("counts three Obszary round the ring, and stops", () => {
    // Three along the Środkowy Krąg from the Twierdza: Przełęcz, Przeprawa I,
    // Dolina Cienia — and the Wrzosowiska one step past it.
    expect(withinRaid(from, asFieldId("przelecz-wichrow"))).toBe(true);
    expect(withinRaid(from, asFieldId("dolina-cienia"))).toBe(true);
    expect(withinRaid(from, asFieldId("wrzosowiska"))).toBe(false);
  });

  it("counts the short way round", () => {
    // The last field on the ring is one step back from the first, not sixteen
    // forward: `fieldsApart` takes the shorter arc, so the friend does not walk
    // the long way to somewhere he is standing beside.
    expect(withinRaid(from, asFieldId("mroczna-polana"))).toBe(true);
  });

  it("never leaves the ring it starts on", () => {
    // A Przeprawa is a turn's work that can fail, not a step. Counting one as a
    // step would put most of the board within three Obszary of everywhere, so
    // `fieldsApart` returns null across rings and this reads that as "no".
    //
    // The target is named through `requireFieldId` rather than `asFieldId`: a
    // typo'd id would go to null, and `withinRaid(from, null)` is false for a
    // reason that has nothing to do with rings — the test would pass while
    // testing the case above it instead.
    const otherRing = requireFieldId("ruiny-twierdzy");
    expect(withinRaid(from, otherRing)).toBe(false);
  });

  it("reaches nothing from nowhere, and nothing that is nowhere", () => {
    // A character in the poczekalnia stands on no field, and a card can be held
    // rather than lying on one. Both are false rather than a throw: the browser
    // asks this about every seat and every card on the board, most of which are
    // neither.
    expect(withinRaid(null, asFieldId("przelecz-wichrow"))).toBe(false);
    expect(withinRaid(from, null)).toBe(false);
  });

  it("is the number the card prints", () => {
    expect(RAID_RANGE).toBe(3);
  });
});
