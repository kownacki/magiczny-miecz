import { describe, expect, it } from "vitest";
import { DOLNY_KRAG, KAMIENNY_MOST, FIELDS } from "@/lib/engine/board";
import { GORNY_KRAG, SRODKOWY_KRAG } from "@/lib/engine/rings";
import { fieldWithText } from "./fieldText";

describe("what the app can read out on each field", () => {
  it("has the printed text for every field on the board", () => {
    // 57 fields, from three transcription passes and two different sources.
    // A field with no text is one the referee can only name, which is what the
    // Kamienny Most was until its rulebook page was loaded.
    const missing = [
      ...DOLNY_KRAG,
      ...SRODKOWY_KRAG,
      ...GORNY_KRAG,
      ...KAMIENNY_MOST,
    ].filter((field) => !fieldWithText(field.id)?.text);
    expect(missing.map((f) => f.id)).toEqual([]);
  });

  it("knows what waits at the end of the bridge", () => {
    const castle = fieldWithText("zamek-bestii");
    expect(castle?.text).toContain("Tarczę Tolimana");
    expect(castle?.text).toContain("MUSI stoczyć walkę z Bestią");
  });

  it("keeps the two Pułapki apart", () => {
    // One subtracts Miecz and drops you toward the Osada, the other subtracts
    // Magia and drops you toward the Karczma. Swapping them would be invisible.
    expect(fieldWithText("pulapka")?.text).toContain("punkty Miecza");
    expect(fieldWithText("magiczna-pulapka")?.text).toContain("punkty Magii");
  });

  it("names every field it has text for", () => {
    for (const field of FIELDS.values()) {
      expect(fieldWithText(field.id)?.name, field.id).toBe(field.name);
    }
  });
});
