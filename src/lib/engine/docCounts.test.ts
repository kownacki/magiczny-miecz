import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import spells from "@/data/spells.json";
import characters from "@/data/characters.json";
import { coverageOf, manualNote } from "./coverage";
import { FIELDS } from "./board";
import { LIVE_ABILITIES } from "./disabled";
import { CHARACTER_ABILITIES } from "./characters";
import type { CardId } from "@/data/ids";

/**
 * A number written in prose is a claim, and claims about data rot in silence.
 *
 * A comment about *code* rots loudly: the code beside it changes shape and
 * somebody reads both. A count of cards rots the day a card is scripted, in a
 * file nobody had open, and stays wrong until a reader happens to doubt it.
 * On 2026-09-05 `docs/COVERAGE.md` said 128 Karty were `pelne` and 6 were
 * `brak`; the answers were 131 and 3, and had been for a while. It also said
 * two blockers were open that had been cleared, and that four Zaklęcia were
 * carried in part when two were.
 *
 * So every number in that file which can be *derived* is derived here and
 * compared. What is deliberately not checked is the tally of ✅ and ◐ in its
 * tables: `COVERAGE.md` has four of them — the legend, the rules, the Obszary,
 * the slotowy variant — and "how many rules" depends on which you count, so
 * that sentence was removed from the document rather than pinned to a number
 * nobody can derive twice the same way.
 *
 * Whitespace is normalised before matching, because the prose is hard-wrapped
 * and every one of these sentences breaks across a line somewhere.
 */

const COVERAGE = readFileSync("docs/COVERAGE.md", "utf8").replace(/\s+/g, " ");
const TASKS = readFileSync("docs/TASKS.md", "utf8").replace(/\s+/g, " ");

/** The one number a pattern names, or a failure that says which sentence moved. */
function claim(text: string, pattern: RegExp, what: string): number {
  const found = text.match(pattern);
  expect(
    found,
    `docs no longer contain the sentence about ${what} — if it was reworded, reword this pattern too rather than deleting the check`,
  ).not.toBeNull();
  return Number(found![1]);
}

const EVENTS = events as { id: CardId; cardClass?: string }[];
const DISTINCT = [...new Set(EVENTS.map((card) => card.id))];

describe("what COVERAGE.md claims about the deck", () => {
  const tally = { pelne: 0, czesciowe: 0, brak: 0 } as Record<string, number>;
  for (const id of DISTINCT) tally[coverageOf(id)] += 1;

  it("counts the Karty Zdarzeń", () => {
    expect(claim(COVERAGE, /Of the (\d+) Karty Zdarzeń/, "the size of the deck")).toBe(
      DISTINCT.length,
    );
  });

  it("counts what is carried whole, in part, and not at all", () => {
    const pattern = /(\d+) are `pelne`, (\d+) `czesciowe` and (\d+) `brak`/;
    const found = COVERAGE.match(pattern);
    expect(found, "the pelne/czesciowe/brak sentence moved").not.toBeNull();
    expect([found![1], found![2], found![3]].map(Number)).toEqual([
      tally.pelne,
      tally.czesciowe,
      tally.brak,
    ]);
  });

  it("counts the Nieznajomi", () => {
    const strangers = new Set(
      EVENTS.filter((card) => card.cardClass === "stranger").map((card) => card.id),
    ).size;
    expect(claim(COVERAGE, /all (\d+) Nieznajomi/, "the Nieznajomi")).toBe(strangers);
  });

  it("counts the Zaklęcia, and how many are carried whole", () => {
    // Distinct, not rows: three Zaklęcia have a second copy in the pile.
    const distinct = [...new Set((spells as { id: CardId }[]).map((one) => one.id))];
    const partly = distinct.filter((id) => manualNote(id)).length;
    expect(claim(COVERAGE, /all (\d+) Zaklęcia/, "the Zaklęcia")).toBe(distinct.length);
    expect(claim(COVERAGE, /(\d+) of them fully/, "how many Zaklęcia are whole")).toBe(
      distinct.length - partly,
    );
  });

  it("counts the Obszary", () => {
    expect(claim(COVERAGE, /all (\d+) Obszary/, "the Obszary")).toBe(FIELDS.size);
  });
});

describe("what TASKS.md claims about the parked Postać powers", () => {
  const CHARACTERS = characters as { id: string; abilities: string[] }[];

  it("counts the Postacie and their printed clauses", () => {
    const clauses = CHARACTERS.reduce((sum, one) => sum + one.abilities.length, 0);
    expect(claim(TASKS, /(\d+) clauses are printed/, "the printed clauses")).toBe(clauses);
    expect(claim(TASKS, /across the (\d+) Kartas Postaci/, "the roster")).toBe(CHARACTERS.length);
  });

  it("counts what the app actually ran before they were parked", () => {
    const kits = Object.values(LIVE_ABILITIES).reduce(
      (sum, list) => sum + (list?.length ?? 0),
      0,
    );
    const typed = Object.values(CHARACTER_ABILITIES).reduce(
      (sum, list) => sum + (list?.length ?? 0),
      0,
    );
    expect(claim(TASKS, /the app ran (\d+) of them/, "how many clauses were carried")).toBe(
      kits + typed,
    );
    expect(claim(TASKS, /(\d+) encoded abilities/, "the encoded abilities")).toBe(typed);
    expect(
      claim(TASKS, /the latter across only (\d+) characters/, "how many characters carry one"),
    ).toBe(Object.keys(CHARACTER_ABILITIES).length);
  });
});
