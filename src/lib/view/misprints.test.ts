import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MISPRINTS, asRead, misprintsIn } from "./misprints";

/**
 * The transcription and the Księga are allowed to differ, in exactly one
 * direction and only where it is written down.
 */
describe("misprints", () => {
  it("shows 16.6's citation as the rule it meant", () => {
    const printed = "Postać może zabrać te Karty ze sobą, jeżeli tylko wolno jej to zrobić (58.3-4.).";
    expect(asRead(printed)).toContain("(5.3-4.)");
    expect(asRead(printed)).not.toContain("58.3");
    expect(misprintsIn(printed)).toHaveLength(1);
  });

  it("leaves everything else exactly as it was", () => {
    const untouched = "Postać może posiadać najwyżej 4 Przedmioty (5.4.).";
    expect(asRead(untouched)).toBe(untouched);
    expect(misprintsIn(untouched)).toEqual([]);
  });

  /**
   * The record keeps the error. If this ever fails, somebody has repaired the
   * transcription — which is the one thing it may not do, because a transcript
   * that agrees with the app rather than with the paper cannot check anything.
   */
  it("does not touch the transcription itself", () => {
    const rules = readFileSync("docs/RULES.md", "utf8");
    for (const misprint of MISPRINTS) {
      expect(rules, `${misprint.printed} should still be in docs/RULES.md`).toContain(
        misprint.printed,
      );
    }
    // And the machine copy the app reads keeps it too.
    const json = readFileSync("src/data/rules.json", "utf8");
    for (const misprint of MISPRINTS) expect(json).toContain(misprint.printed);
  });
});
