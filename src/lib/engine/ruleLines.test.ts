import { describe, expect, it } from "vitest";
import { ruleLines } from "./ruleLines";
import { parseCommand, worksOffTable } from "./console";

const ok = (line: string) => {
  const parsed = parseCommand(line);
  if (!("ok" in parsed)) throw new Error(`nie sparsowano: ${line}`);
  return parsed.ok;
};

describe("Instrukcja w konsoli", () => {
  it("prints one rule with its przykład", () => {
    const said = ruleLines("5.3");
    expect(said[0]).toBe("5.3");
    expect(said[1]).toContain("Żadna Postać nie może posiadać");
    expect(said.some((line) => line.startsWith("Przykład:"))).toBe(true);
  });

  it("lists a chapter from its number", () => {
    const said = ruleLines("5");
    expect(said[0]).toContain("PRZEDMIOTY");
    expect(said.filter((line) => /^ {2}5\.\d/.test(line))).toHaveLength(6);
  });

  it("lists the chapters when asked for nothing", () => {
    expect(ruleLines(null).join("\n")).toContain("PRZEDMIOTY");
  });

  /**
   * The letters are the app's own — the book has 12.1 and the code says 12.1a
   * for one of the three things it says. A refusal quoting the clause has to
   * land somewhere.
   */
  it("takes a clause letter the book does not have", () => {
    expect(ruleLines("12.1a")[0]).toBe("12.1");
  });

  /** A refusal is quoted with its brackets and stop still attached. */
  it("takes a number copied straight out of a refusal", () => {
    expect(ruleLines("(7.3).")[0]).toBe("7.3");
  });

  it("says so when there is no such rule", () => {
    expect(ruleLines("99.9")[0]).toContain("Nie ma zasady");
  });

  /** No bold in a terminal, and `**` is not what the book prints. */
  it("leaves the transcript's markdown out of it", () => {
    expect(ruleLines("co-nalezy-zabrac-na-wyprawe").join("\n")).not.toContain("**");
  });

  it("is answerable with no game open, like help and card", () => {
    expect(worksOffTable(ok("rule 5.3"))).toBe(true);
    expect(ok("rule 5.3")).toEqual({ kind: "rule", about: "5.3" });
    expect(ok("rule")).toEqual({ kind: "rule", about: null });
  });
});
