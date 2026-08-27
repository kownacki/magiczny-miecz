import { describe, expect, it } from "vitest";
import rulesData from "@/data/rules.json";
import { JOURNAL_KINDS } from "./journal";
import { RULE_FOR, ruleForKind } from "./journalRules";

const KNOWN = new Set(
  (rulesData as { rules: { id: string | null }[] }[])
    .flatMap((chapter) => chapter.rules)
    .map((rule) => rule.id)
    .filter((id): id is string => id !== null),
);

describe("która zasada stoi za linijką dziennika", () => {
  /**
   * The compiler already demands one entry per kind — `Record<JournalKind, …>`
   * — so this is the half it cannot check: that the entry is a rule that
   * exists. A typo like "17.11" typechecks and links to nothing.
   */
  it("cites only rules the Instrukcja actually has", () => {
    for (const kind of JOURNAL_KINDS) {
      const rule = RULE_FOR[kind];
      if (rule !== null) expect(KNOWN.has(rule), `${kind} → ${rule}`).toBe(true);
    }
  });

  it("has an answer for every kind, null included", () => {
    for (const kind of JOURNAL_KINDS) expect(kind in RULE_FOR).toBe(true);
  });

  /** A kind from a version that knew more than this one says nothing. */
  it("says nothing about a kind it has never heard of", () => {
    expect(ruleForKind("czegoś-takiego-nie-ma")).toBeNull();
  });

  /** The ones worth naming, so a careless sweep cannot quietly blank them. */
  it("names the rules behind the lines a reader most often questions", () => {
    expect(ruleForKind("reshuffle")).toBe("9.5");
    expect(ruleForKind("discarded")).toBe("5.5");
    expect(ruleForKind("new-character")).toBe("4.4");
    expect(ruleForKind("trophies-traded")).toBe("1.4");
    expect(ruleForKind("stone")).toBe("20.1");
  });

  /** And the ones that are about the table rather than the game. */
  it("leaves the poczekalnia and the console out of it", () => {
    for (const kind of ["joined", "left-table", "override", "test-card"] as const) {
      expect(ruleForKind(kind)).toBeNull();
    }
  });
});
