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

describe("wszystko, co Instrukcja stawia pod nagłówkiem", () => {
  /**
   * Chapter 22's only rule is numbered "22" — no decimal — and the parser used
   * to want `\d+\.\d+`, so it fell through and the Księga printed "### 22" as
   * a line of prose.
   */
  it("reads a rule numbered without a decimal", () => {
    const said = ruleLines("22");
    expect(said[0]).toBe("22");
    expect(said[1]).toContain("Zwycięzcą w grze");
  });

  /**
   * And the boxed Kamienny Most section, whose nine instructions 14.3 calls
   * "poza numeracją". They have names instead of numbers, and printing them
   * without their headings ran nine different Obszary together.
   */
  it("keeps the Most's field instructions under their own names", () => {
    const said = ruleLines("kamienny-most-zamek-bestii").join("\n");
    for (const name of ["WEJŚCIE NA MOST", "CERBER", "ZAMEK BESTII", "GRA ZE ŚMIERCIĄ"]) {
      expect(said, name).toContain(name);
    }
  });

  it("leaves no heading behind as prose", () => {
    for (const id of ["22", "2.6", "14.7", "kamienny-most-zamek-bestii"]) {
      expect(ruleLines(id).some((line) => line.startsWith("#")), id).toBe(false);
    }
  });

  /** 2.6's table, the only one in the book, and where it stood. */
  it("prints the table between the paragraphs it was printed between", () => {
    const said = ruleLines("2.6");
    const table = said.findIndex((line) => line.startsWith("Całkowita Magia"));
    expect(said[table - 1]).toContain("w następujący sposób:");
    expect(said[table + 1]).toContain("Maksymalna liczba Zaklęć");
    expect(said[table + 2]).toContain("Jak widać");
  });
});
