/** The middle and outer rings, derived from the board scan and checked against the rules that constrain them. */

import type { BoardField } from "./board";

/**
 * How this order was arrived at, and how far to trust it.
 *
 * Each edge of the board was read as ONE continuous strip so both its corners
 * fell inside the same image, which is what forces the splice — earlier
 * attempts that read overlapping tiles could not settle the corners and
 * produced an order that turned out to be wrong.
 *
 * Two things corroborate the result. Reading down the left edge gives Osada,
 * Kurhan, Mokradła, Step, Uroczysko — exactly indices 9 to 13 of the
 * independently-verified Dolny Krąg, so the reading direction is right. And the
 * four names that appear twice (Urwisko, Ruchome Skały, Bagna, Rozstajne Drogi)
 * land in symmetric positions, matching what a separate pass over different
 * crops reported.
 *
 * It has still not been checked against the physical board. The cross-checks in
 * rings.test.ts encode every constraint the rulebook places on these rings, so
 * a mistake in a *constrained* position fails the build. A mistake between two
 * unconstrained fields would not — that is the residual risk, and it is why
 * this lives in its own file rather than being merged into board.ts.
 */
export const RINGS_VERIFIED_AGAINST_PHYSICAL_BOARD = false;

/**
 * Kraina Środkowego Kręgu, clockwise from the bridge crossing at the top.
 *
 * The bridge cuts this ring at Twierdza Strzegąca Dróg and Świątynia Bogini
 * Nemed, which the rulebook names explicitly (p3): walking the middle ring you
 * ignore the bridge squares and use those two instead.
 */
export const SRODKOWY_KRAG: readonly BoardField[] = [
  { id: "twierdza-strzegaca-drog", name: "Twierdza Strzegąca Dróg", region: "srodkowy" },
  { id: "przelecz-wichrow", name: "Przełęcz Wichrów", region: "srodkowy", draw: 1 },
  { id: "przeprawa-1", name: "Przeprawa", region: "srodkowy" },
  { id: "dolina-cienia", name: "Dolina Cienia", region: "srodkowy", draw: 1 },
  { id: "wrzosowiska", name: "Wrzosowiska", region: "srodkowy", draw: 2 },
  { id: "wieza-przeznaczenia", name: "Wieża Przeznaczenia", region: "srodkowy" },
  { id: "straznik-magicznych-wrot", name: "Strażnik Magicznych Wrót", region: "srodkowy" },
  { id: "magiczne-wrota", name: "Magiczne Wrota", region: "srodkowy" },
  { id: "plaskowyz-mgiel", name: "Płaskowyż Mgieł", region: "srodkowy", draw: 3 },
  { id: "swiatynia-bogini-nemed", name: "Świątynia Bogini Nemed", region: "srodkowy" },
  { id: "zaczarowane-wzgorza", name: "Zaczarowane Wzgórza", region: "srodkowy", draw: 1 },
  { id: "las-blednych-ogni", name: "Las Błędnych Ogni", region: "srodkowy", draw: 1 },
  { id: "pustelnia", name: "Pustelnia", region: "srodkowy" },
  { id: "rownina-samotnych-skal", name: "Równina Samotnych Skał", region: "srodkowy", draw: 2 },
  { id: "przeprawa-2", name: "Przeprawa", region: "srodkowy" },
  { id: "mroczna-polana", name: "Mroczna Polana", region: "srodkowy", draw: 1 },
];

/**
 * Kraina Górnego Kręgu, the outermost ring, clockwise from the top-left corner.
 *
 * The bridge cuts this ring at its two entrances, Ruiny Twierdzy on the top edge
 * and Wymarłe Miasto on the bottom (11.9) — which is what makes the bridge a
 * straight line across the whole board rather than a spur.
 */
export const GORNY_KRAG: readonly BoardField[] = [
  { id: "urwisko-1", name: "Urwisko", region: "gorny" },
  { id: "ruiny-twierdzy", name: "Ruiny Twierdzy", region: "gorny", draw: 1 },
  { id: "swiatynia-tolimana", name: "Świątynia Tolimana", region: "gorny" },
  { id: "dolina-czaszek", name: "Dolina Czaszek", region: "gorny", draw: 1 },
  { id: "bagna-1", name: "Bagna", region: "gorny" },
  { id: "ruchome-skaly-1", name: "Ruchome Skały", region: "gorny" },
  { id: "urwisko-2", name: "Urwisko", region: "gorny" },
  { id: "rownina-traw", name: "Równina Traw", region: "gorny", draw: 1 },
  { id: "rozstajne-drogi-1", name: "Rozstajne Drogi", region: "gorny", draw: 1 },
  { id: "zamek", name: "Zamek", region: "gorny" },
  { id: "wymarle-miasto", name: "Wymarłe Miasto", region: "gorny", draw: 1 },
  { id: "ruchome-skaly-2", name: "Ruchome Skały", region: "gorny" },
  { id: "bagna-2", name: "Bagna", region: "gorny" },
  { id: "krypta-upiorow", name: "Krypta Upiorów", region: "gorny" },
  { id: "rownina-snu", name: "Równina Snu", region: "gorny", draw: 1 },
  { id: "rozstajne-drogi-2", name: "Rozstajne Drogi", region: "gorny", draw: 1 },
  { id: "kamienny-las", name: "Kamienny Las", region: "gorny", draw: 2 },
  { id: "wilczy-parow", name: "Wilczy Parów", region: "gorny" },
];

/**
 * The only places a character may pass between rings.
 *
 * Rule 11.1 allows the Trzęsawiska crossing at Uroczysko and Las Błędnych Ogni
 * alone, and 11.5 allows the Lodowy Las crossing at Przełęcz Wichrów and Dolina
 * Czaszek alone. Everything else on the boundary is impassable, which is what
 * makes the rings rings rather than one long track.
 */
export interface Crossing {
  from: string;
  to: string;
  /** What must be overcome, per 11.3-11.4 and 11.7-11.8. */
  obstacle: "trzesawiska" | "lodowy-las";
}

export const CROSSINGS: readonly Crossing[] = [
  { from: "uroczysko", to: "las-blednych-ogni", obstacle: "trzesawiska" },
  { from: "las-blednych-ogni", to: "uroczysko", obstacle: "trzesawiska" },
  { from: "przelecz-wichrow", to: "dolina-czaszek", obstacle: "lodowy-las" },
  { from: "dolina-czaszek", to: "przelecz-wichrow", obstacle: "lodowy-las" },
];

export function crossingFrom(fieldId: string): Crossing | undefined {
  return CROSSINGS.find((crossing) => crossing.from === fieldId);
}
