import { describe, expect, it } from "vitest";
import { parseRollTable } from "./rollTable";
import fields from "@/data/dolny-fields.json";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";

describe("roll tables", () => {
  it("reads Karczma, which uses '1 - ...;' throughout", () => {
    const karczma = (fields as { id: string; text: string }[]).find((f) => f.id === "karczma")!;
    const table = parseRollTable(karczma.text);
    expect(table).not.toBeNull();
    expect(table!.outcomes[1]).toContain("przegrałeś w kości");
    expect(table!.outcomes[2]).toContain("wygrałeś");
    expect(table!.outcomes[6]).toContain("Świątyni Nemed");
  });

  it("expands a hyphen range, as Kurhan's '2-3' and '4-5'", () => {
    const kurhan = (fields as { id: string; text: string }[]).find((f) => f.id === "kurhan")!;
    const table = parseRollTable(kurhan.text)!;
    expect(table).not.toBeNull();
    expect(table.outcomes[2]).toBe(table.outcomes[3]);
    expect(table.outcomes[4]).toBe(table.outcomes[5]);
    expect(table.outcomes[1]).toContain("punkt Miecza");
  });

  it("expands a comma list, as Krąg Mocy's '2, 3' and '4, 5'", () => {
    const krag = (fields as { id: string; text: string }[]).find((f) => f.id === "krag-mocy")!;
    const table = parseRollTable(krag.text)!;
    expect(table.outcomes[2]).toBe(table.outcomes[3]);
    expect(table.outcomes[4]).toContain("nic się nie dzieje");
    expect(table.outcomes[6]).toContain("punkt Magii");
  });

  it("reads a card that numbers with a full stop", () => {
    const table = parseRollTable(
      "Rzuć kostką, by się tego dowiedzieć: 1. do Równiny Snu, 2. do Równiny Traw, 3. do Doliny Cienia, 4. do Mrocznej Polany, 5. do Osady, 6. do Karczmy.",
    )!;
    expect(table).not.toBeNull();
    expect(table.outcomes[1]).toContain("Równiny Snu");
    expect(table.outcomes[6]).toContain("Karczmy");
  });

  it("refuses prose that holds two tables under different Natures", () => {
    // Czarci Młyn prints one table for Chaotyczny and another for Zły, so faces
    // are claimed twice and no single table is correct.
    const mlyn = (fields as { id: string; text: string }[]).find((f) => f.id === "czarci-mlyn")!;
    expect(parseRollTable(mlyn.text)).toBeNull();
  });

  it("refuses a partial table", () => {
    expect(parseRollTable("Rzuć kostką: 1 - tracisz Życie; 2 - nic.")).toBeNull();
  });

  it("is not fooled by numbers in ordinary prose", () => {
    expect(
      parseRollTable("Zamień tę Kartę na 1 Sztukę Złota, a następnie ją odłóż."),
    ).toBeNull();
    expect(parseRollTable("Możesz u niego kupić: za 2 Sz. Z. miecz; hełm - 1 Sz. Z.")).toBeNull();
  });

  describe("against the real data", () => {
    const fieldTables = (fields as { id: string; text: string }[])
      .map((f) => ({ id: f.id, table: parseRollTable(f.text) }))
      .filter((f) => f.table);

    it("reads the Dolny Krąg fields players hit constantly", () => {
      const ids = fieldTables.map((f) => f.id);
      expect(ids).toContain("karczma");
      expect(ids).toContain("kurhan");
      expect(ids).toContain("krag-mocy");
    });

    it("every parsed table covers all six faces", () => {
      for (const { id, table } of fieldTables) {
        for (let face = 1; face <= 6; face++) {
          expect(table!.outcomes[face], `${id} face ${face}`).toBeTruthy();
        }
      }
    });

    it("parses a useful number of cards without overreaching", () => {
      const cards = (events as EventCard[]).filter((c) => parseRollTable(c.text));
      expect(cards.length).toBeGreaterThan(2);
      expect(cards.length).toBeLessThan(30);
    });
  });
});

describe("table labels", () => {
  it("says what the roll is for, so an optional table is not mistaken for the field's own", () => {
    const grod = (fields as { id: string; text: string }[]).find((f) => f.id === "grod")!;
    const table = parseRollTable(grod.text)!;
    // The table is the fortune-teller's, not Gród's — visiting is a choice.
    expect(table.label).toMatch(/Wróżbit/);
  });

  it("labels a field whose table is unconditional", () => {
    const karczma = (fields as { id: string; text: string }[]).find((f) => f.id === "karczma")!;
    expect(parseRollTable(karczma.text)!.label).toMatch(/RZUCIĆ KOSTKĄ/i);
  });
});

describe("label boundaries", () => {
  it("does not drag the first die spec into the label", () => {
    const karczma = (fields as { id: string; text: string }[]).find((f) => f.id === "karczma")!;
    const label = parseRollTable(karczma.text)!.label;
    expect(label).toBe("MUSISZ RZUCIĆ KOSTKĄ");
    expect(label).not.toMatch(/\d/);
  });
});
