/** Which Obszar faces which across the Trzęsawiska and the Lodowy Las (11.2, 11.6). */

import type { FieldId } from "./board";

/**
 * The board draws this and never names it.
 *
 * The ŁÓDŹ and the LATARNIA both say where they put you — „przeprawisz się do
 * Obszaru graniczącego z tym, z którego wyruszyłeś", „z lasu wyjdziesz na
 * Obszarze graniczącym z tym, z którego wszedłeś" — and no rule anywhere lists
 * what borders what. 11.1 and 11.5 name only the two printed crossings, which
 * are a *route* rather than the geography: the Instrukcja gives Uroczysko ↔ Las
 * Błędnych Ogni and Przełęcz Wichrów ↔ Dolina Czaszek and stops.
 *
 * # How this was read
 *
 * Off `MM - MAGICZNY MIECZ - Plansza.pdf`, but not by measuring it. Detecting
 * the printed cell dividers works on the long sides and fails on the top and
 * bottom, where the bands are short, packed with text plaques, and crossed by
 * the Kamienny Most — the same window at different thresholds gave 1244, 1206
 * and 1132 for one boundary, and the Most is drawn slanting, so it is not even
 * one vertical.
 *
 * So the names were read instead. A narrow strip cut through one Obszar and
 * outward across the water shows three printed plaques in a column, and which
 * three is not a measurement — it is legible. Every row below came from such a
 * strip.
 *
 * # What checks it
 *
 * The two printed crossings must fall out of it, and they do. Uroczysko sits
 * directly opposite Las Błędnych Ogni, each carrying the other's name in its
 * own printed text — „TYLKO TĘDY MOŻNA PRZEJŚĆ DO LASU" against „TYLKO TĘDY
 * MOŻNA PRZEPRAWIĆ SIĘ NA UROCZYSKO". Przełęcz Wichrów and Dolina Czaszek meet
 * around the top-right corner, which is why 11.5's pair is not a straight
 * crossing and why a purely geometric guess would have missed it.
 *
 * That is the test in `across.test.ts`, and it is the reason to trust the rest:
 * the two rows the Instrukcja can confirm are the two rows nothing was fitted
 * to.
 *
 * # Why several
 *
 * The three rings' dividers do not line up — the long sides run 1:1, and the
 * corners and the short sides do not. So „graniczący" is a relation and not a
 * function, and where two Obszary face one the player chooses. That is what a
 * table does looking at the board, and 11.2's „w dowolnym miejscu" is not shy
 * about letting them.
 */

/** Across the Trzęsawiska: every Dolny Obszar, and what faces it in the Środkowy Krąg. */
export const ACROSS_TRZESAWISKA: Readonly<Record<string, readonly FieldId[]>> = {
  // Top edge, left to right. Osada faces the Twierdza; the Most cuts between.
  osada: ["twierdza-strzegaca-drog"],
  "step-1": ["przelecz-wichrow"],
  // The top-right corner, so it faces the top band and the right band both.
  "mokradla-1": ["przelecz-wichrow", "przeprawa-1"],
  // Right edge, top to bottom. Clean 1:1 all the way down.
  "czarci-mlyn": ["dolina-cienia"],
  "krag-mocy": ["wrzosowiska"],
  "studnia-wiecznosci": ["wieza-przeznaczenia"],
  bezdroza: ["straznik-magicznych-wrot"],
  // The bottom-right corner, the same way Mokradła II is the top-right one.
  grod: ["magiczne-wrota", "plaskowyz-mgiel"],
  // Bottom edge, right to left.
  "mrozne-pustkowie": ["plaskowyz-mgiel"],
  karczma: ["swiatynia-bogini-nemed"],
  // Left edge, bottom to top — and the first of them is 11.1's printed crossing.
  uroczysko: ["las-blednych-ogni"],
  "step-2": ["pustelnia"],
  "mokradla-2": ["rownina-samotnych-skal"],
  kurhan: ["przeprawa-2"],
};

/** Across the Lodowy Las: every Środkowy Obszar, and what faces it in the Górny Krąg. */
export const ACROSS_LODOWY_LAS: Readonly<Record<string, readonly FieldId[]>> = {
  // The short top band carries two Obszary against the Górny Krąg's three, so
  // both of them face two.
  "twierdza-strzegaca-drog": ["urwisko-1", "ruiny-twierdzy"],
  // And Dolina Czaszek, which is 11.5's printed crossing and sits round the
  // top-right corner rather than straight across — „TYLKO TU MOŻNA PRZEPRAWIĆ
  // SIĘ PRZEZ LODOWY LAS" on one card, „TYLKO TĘDY MOŻNA PRZEDOSTAĆ SIĘ DO
  // PRZEŁĘCZY WICHRÓW" on the other. A reading that took only what is directly
  // above would have dropped the one pair the Instrukcja names.
  "przelecz-wichrow": ["ruiny-twierdzy", "swiatynia-tolimana", "dolina-czaszek"],
  // Right edge. Przeprawa I meets Dolina Czaszek around the corner, which is
  // 11.5's printed crossing and the reason that pair looks odd on the board.
  "przeprawa-1": ["dolina-czaszek"],
  "dolina-cienia": ["bagna-1"],
  wrzosowiska: ["ruchome-skaly-1"],
  "wieza-przeznaczenia": ["urwisko-2"],
  "straznik-magicznych-wrot": ["rownina-traw"],
  "magiczne-wrota": ["rownina-traw", "rozstajne-drogi-1"],
  // Bottom edge, two against three again.
  "plaskowyz-mgiel": ["wymarle-miasto", "zamek"],
  "swiatynia-bogini-nemed": ["ruchome-skaly-2", "wymarle-miasto"],
  // Left edge, bottom to top. 1:1, and the corners at either end reach round.
  "zaczarowane-wzgorza": ["bagna-2"],
  "las-blednych-ogni": ["krypta-upiorow"],
  pustelnia: ["rownina-snu"],
  "rownina-samotnych-skal": ["rozstajne-drogi-2"],
  "przeprawa-2": ["kamienny-las"],
  "mroczna-polana": ["wilczy-parow", "urwisko-1"],
};

/** What a crossing from here reaches, or an empty list where the water does not run. */
export function facing(
  from: FieldId,
  obstacle: "trzesawiska" | "lodowy-las",
): readonly FieldId[] {
  const table = obstacle === "trzesawiska" ? ACROSS_TRZESAWISKA : ACROSS_LODOWY_LAS;
  return table[from] ?? [];
}
