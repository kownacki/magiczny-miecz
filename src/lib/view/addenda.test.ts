import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADDENDA, addendaFor, afterParagraph, asShown, withAddenda } from "./addenda";

/**
 * An addendum is the app putting words in the book's mouth. That is defensible
 * exactly as long as it is visible, argued, and anchored to text that is really
 * there — so all three are pinned here.
 */
describe("addenda", () => {
  const rule12_1 =
    "Postać, której ruch kończy się na danym Obszarze w każdej chwili, aż do końca " +
    "swojej tury może odwiedzić znajdującego się tam Nieznajomego, zabrać leżące " +
    "złoto, Przedmioty (5.4.) lub Przyjaciół z wyjątkiem sytuacji, w której:";

  it("adds Miejsca to 12.1's list of what may be visited", () => {
    const segments = withAddenda("12.1", rule12_1);
    const added = segments.filter((s) => s.added).map((s) => s.text);
    expect(added).toEqual([" lub Miejsce (16.7)"]);
    // And the printed words survive intact around it.
    expect(segments.map((s) => s.text).join("")).toBe(
      rule12_1.replace(
        "znajdującego się tam Nieznajomego",
        "znajdującego się tam Nieznajomego lub Miejsce (16.7)",
      ),
    );
  });

  it("leaves every other rule exactly as printed", () => {
    const other = "Postać ma prawo w dowolnym momencie odrzucić posiadany Przedmiot.";
    expect(withAddenda("5.5", other)).toEqual([{ text: other, added: false }]);
    expect(addendaFor("5.5", other)).toEqual([]);
  });

  /**
   * The anchor has to exist in the transcription, or the addendum silently
   * stops applying and the Księga quietly loses a rule nobody notices is gone.
   */
  it("anchors on text that is really in the book", () => {
    const rules = readFileSync("docs/RULES.md", "utf8");
    for (const addendum of ADDENDA) {
      expect(rules, `${addendum.rule}: "${addendum.after}"`).toContain(addendum.after);
    }
  });

  /** Never written into the transcription — it is ours and must look it. */
  it("is not in the transcription", () => {
    const rules = readFileSync("docs/RULES.md", "utf8");
    const json = readFileSync("src/data/rules.json", "utf8");
    for (const addendum of ADDENDA) {
      expect(rules).not.toContain(addendum.text.trim());
      expect(json).not.toContain(addendum.text.trim());
    }
  });

  /**
   * The whole point of showing the addition is that a reader can read it — and
   * a reader who reads a phrase and cannot search for it has been told the page
   * is lying.
   */
  it("is findable by its own words", () => {
    expect(asShown("12.1", [rule12_1])).toContain("lub Miejsce");
    // And the correction is findable by the number it shows, not the misprint.
    expect(
      asShown("16.6", ["Postać może zabrać te Karty ze sobą, jeżeli tylko wolno jej to zrobić (58.3-4.)."]),
    ).toContain("(5.3-4.)");
  });

  /**
   * 15.2's half of the compulsory/optional line. 12.1's half is 12.1c, which
   * gates rather than explains — with an unresolved compulsory Karta blocking
   * everything, nothing more needs saying about whether it may be declined.
   */
  it("frees a Karta that only offers from 15.2's order", () => {
    const fifteen = withAddenda("15.2", "Konieczne jest przy tym zachowanie kolejności zgodnej z numeracją Kart (numer znajduje się u góry każdej Karty) - Karta o najniższym numerze rozpatrywana jest jako pierwsza.");
    expect(fifteen.filter((s) => s.added)[0].text).toContain("jedynie coś oferują");
  });

  /**
   * 12.1's third exception. It is a clause of a list, so it stands as its own
   * paragraph beside a) and b) rather than running onto the end of b).
   */
  it("adds 12.1's third exception as its own paragraph", () => {
    const b = "b) Jest to Obszar, na który ciągnięte są Karty (13.4).";
    // Nothing inserted into b) itself…
    expect(withAddenda("12.1", b)).toEqual([{ text: b, added: false }]);
    // …and c) standing after it.
    const own = afterParagraph("12.1", b);
    expect(own).toHaveLength(1);
    expect(own[0].text).toMatch(/^c\) Na Obszarze leżą Karty/);
    // Findable, like every other addition.
    expect(asShown("12.1", [b])).toContain("do których instrukcji Postać musi się zastosować");
  });

  it("carries an argument", () => {
    for (const addendum of ADDENDA) expect(addendum.because.length).toBeGreaterThan(80);
  });
});
