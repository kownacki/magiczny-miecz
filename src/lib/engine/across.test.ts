import { describe, expect, it } from "vitest";
import { DOLNY_KRAG, type FieldId } from "./board";
import { GORNY_KRAG, SRODKOWY_KRAG } from "./rings";
import { ACROSS_LODOWY_LAS, ACROSS_TRZESAWISKA, facing } from "./across";

/** The rings hold whole fields; only their ids are wanted here. */
const ids = (ring: readonly { id: FieldId }[]) => ring.map((one) => one.id);
const DOLNY = ids(DOLNY_KRAG);
const SRODKOWY = ids(SRODKOWY_KRAG);
const GORNY = ids(GORNY_KRAG);

/**
 * The table is read off the board, so the Instrukcja is what checks it.
 *
 * 11.1 and 11.5 name two crossings and nothing else names any. If a reading of
 * the board does not put those two pairs face to face, the reading is wrong —
 * and nothing here was fitted to them, which is what makes them a test rather
 * than a restatement.
 */
describe("what faces what across the water", () => {
  it("answers for every Obszar of the Dolny Krąg (11.2)", () => {
    for (const id of DOLNY) {
      expect(facing(id, "trzesawiska"), id).not.toHaveLength(0);
    }
  });

  it("answers for every Obszar of the Środkowy Krąg (11.6)", () => {
    for (const id of SRODKOWY) {
      expect(facing(id, "lodowy-las"), id).not.toHaveLength(0);
    }
  });

  /**
   * 11.1: „Przeprawa z Krainy Dolnego do Środkowego Kręgu jest możliwa wyłącznie
   * na Obszarze Uroczyska i Lasu Błędnych Ogni."
   *
   * The two carry each other's names in their own printed text, and they sit
   * directly opposite on the left edge.
   */
  it("puts 11.1's printed crossing face to face", () => {
    expect(facing("uroczysko", "trzesawiska")).toContain("las-blednych-ogni");
  });

  /**
   * 11.5: „Przez Lodowy Las można przeprawić się wyłącznie na Obszarach
   * Przełęczy Wichrów i Doliny Czaszek."
   *
   * This one is round the top-right corner rather than straight across, which
   * is the sharper half of the check: a table built by taking whatever sits
   * directly outward would have missed it.
   */
  it("puts 11.5's printed crossing face to face, corner and all", () => {
    expect(facing("przelecz-wichrow", "lodowy-las")).toContain("dolina-czaszek");
  });

  /** Only the ring below owns a Trzęsawiska row, and only the middle one a Lodowy Las row. */
  it("names Obszary of the right Krąg on each side", () => {
    for (const [from, to] of Object.entries(ACROSS_TRZESAWISKA)) {
      expect(DOLNY, from).toContain(from);
      for (const one of to) expect(SRODKOWY, `${from} -> ${one}`).toContain(one);
    }
    for (const [from, to] of Object.entries(ACROSS_LODOWY_LAS)) {
      expect(SRODKOWY, from).toContain(from);
      for (const one of to) expect(GORNY, `${from} -> ${one}`).toContain(one);
    }
  });
});
