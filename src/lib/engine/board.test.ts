import { describe, expect, it } from "vitest";
import {
  DOLNY_KRAG,
  FIELDS,
  GORNY_KRAG,
  KAMIENNY_MOST,
  SRODKOWY_KRAG,
  ringFields,
  ringOf,
} from "./board";

/**
 * The set of Obszary a card counts as an answer to "w tym Kręgu".
 *
 * `ringOf` is the geometry; this is the same fact in the form a `dowolne-w-kregu`
 * destination needs it — a list of ids to offer, from a seat's `field_id`,
 * which is nullable. It lived in the modal that renders the dropdown, where
 * nothing could check that the list it offered was the ring the rules mean.
 */
describe("every Obszar in a character's own Krąg", () => {
  it("offers nothing to a character standing nowhere", () => {
    // A seat in the poczekalnia has no `field_id`. The honest answer is an
    // empty list of destinations, not a throw a route handler would have to
    // catch to say the same thing.
    expect(ringFields(null)).toEqual([]);
  });

  it("offers exactly the ring the character is walking, and no other", () => {
    const dolny = ringFields("karczma");
    expect(dolny).toEqual(DOLNY_KRAG.map((field) => field.id));
    expect(dolny).toContain("karczma");
    for (const ring of [SRODKOWY_KRAG, GORNY_KRAG]) {
      for (const field of ring) expect(dolny).not.toContain(field.id);
    }
  });

  it("treats the Kamienny Most as a Krąg of its own", () => {
    // `ringOf` counts the Most as a fourth ring, so a card resolved while
    // crossing it offers the Most's own Obszary rather than the ring the
    // character left. Pinned because it is the answer nobody would guess.
    const most = ringFields(KAMIENNY_MOST[0].id);
    expect(most).toEqual(KAMIENNY_MOST.map((field) => field.id));
  });

  it("puts every Obszar on the board in a Krąg that contains it", () => {
    // A field belonging to no ring reaches the dropdown as an empty list —
    // "przenieś się na dowolny Obszar w tym Kręgu" with nowhere to go, and no
    // sign that anything is wrong. This is the check that a ring array has not
    // dropped one.
    for (const fieldId of FIELDS.keys()) {
      const offered = ringFields(fieldId);
      expect(offered, fieldId).toContain(fieldId);
      expect(new Set(offered).size, fieldId).toBe(offered.length);
    }
  });

  it("says the same thing as the geometry it is derived from", () => {
    for (const fieldId of FIELDS.keys()) {
      expect(ringFields(fieldId), fieldId).toEqual((ringOf(fieldId) ?? []).map((f) => f.id));
    }
  });
});
