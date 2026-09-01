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
    expect(ruleForKind("discarded")).toBe("5.5");
    expect(ruleForKind("new-character")).toBe("4.4");
    expect(ruleForKind("death")).toBe("4.4");
    expect(ruleForKind("trophies-traded")).toBe("1.4");
    expect(ruleForKind("stone")).toBe("20.1");
    expect(ruleForKind("turn-lost")).toBe("16.1");
  });

  /**
   * The ones an audit found citing a real rule about something else. A wrong
   * number is worse than none, because it is a link: somebody follows it,
   * lands somewhere unrelated, and trusts the next one less.
   */
  it("says nothing where no rule covers what happened", () => {
    // 15.1 is the order drawn cards are resolved in, not permission to drink
    // an Eliksir; 21 is buying, not selling to a Lichwiarz; 16.6 is what you
    // may carry away, not what can be taken off you.
    for (const kind of ["used", "sold", "lost-card", "bridge-death-game"] as const) {
      expect(ruleForKind(kind), kind).toBeNull();
    }
  });

  /** And the ones that are about the table rather than the game. */
  it("leaves the poczekalnia and the console out of it", () => {
    for (const kind of ["joined", "left-table", "override", "test-card"] as const) {
      expect(ruleForKind(kind)).toBeNull();
    }
  });
});

describe("linijki, których zasada zależy od treści", () => {
  /** The bug that started the audit: an Eliksir citing the spell-casting rule. */
  it("does not read an Eliksir as a Zaklęcie", () => {
    expect(ruleForKind("effect", { source: "eliksir-sily" })).toBeNull();
    expect(ruleForKind("effect", { source: "krag-plomieni" })).toBe("9.6");
  });

  it("names the pile that ran out", () => {
    expect(ruleForKind("reshuffle", { pile: "zaklecia" })).toBe("9.5");
    expect(ruleForKind("reshuffle", { pile: "zdarzenia" })).toBe("13.4");
  });

  /**
   * 5.5 is a Przedmiot's rule and 6.4 is his own. Both leave a Karta face up on
   * the Obszar you are standing on, and only one of them is about somebody who
   * then walks off with whoever picks him up.
   */
  it("cites the Przyjaciel's own rule when a Przyjaciel is left behind", () => {
    expect(ruleForKind("discarded", { kind: "friend", cardId: "pasterz" })).toBe("6.4");
    expect(ruleForKind("discarded", { kind: "item", cardId: "miecz" })).toBe("5.5");
    // A row from before the payload carried a kind still answers with the rule
    // that was right for every card it could have been about.
    expect(ruleForKind("discarded")).toBe("5.5");
  });

  it("names the border that was crossed", () => {
    expect(ruleForKind("crossing", { obstacle: "lodowy-las" })).toBe("11.7");
    expect(ruleForKind("crossing", { obstacle: "trzesawiska" })).toBe("11.1");
  });

  /** A row with nothing in it still has to answer without throwing. */
  it("survives a payload it was not given", () => {
    expect(ruleForKind("effect")).toBeNull();
    expect(ruleForKind("reshuffle", null)).toBe("13.4");
  });
});
