/** The middle and outer rings, derived from the board scan and checked against the rules that constrain them. */

import type { BoardField, FieldId } from "./board";

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
export const SRODKOWY_KRAG_FIELDS = [
  { id: "twierdza-strzegaca-drog", name: "Twierdza Strzegąca Dróg", region: "srodkowy" },
  { id: "przelecz-wichrow", name: "Przełęcz Wichrów", region: "srodkowy", draw: 1 },
  { id: "przeprawa-1", name: "Przeprawa I", region: "srodkowy" },
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
  { id: "przeprawa-2", name: "Przeprawa II", region: "srodkowy" },
  { id: "mroczna-polana", name: "Mroczna Polana", region: "srodkowy", draw: 1 },
] as const;

export const SRODKOWY_KRAG: readonly BoardField[] = SRODKOWY_KRAG_FIELDS;


/**
 * Kraina Górnego Kręgu, the outermost ring, clockwise from the top-left corner.
 *
 * The bridge cuts this ring at its two entrances, Ruiny Twierdzy on the top edge
 * and Wymarłe Miasto on the bottom (11.9) — which is what makes the bridge a
 * straight line across the whole board rather than a spur.
 */
export const GORNY_KRAG_FIELDS = [
  { id: "urwisko-1", name: "Urwisko I", region: "gorny" },
  { id: "ruiny-twierdzy", name: "Ruiny Twierdzy", region: "gorny", draw: 1 },
  { id: "swiatynia-tolimana", name: "Świątynia Tolimana", region: "gorny" },
  { id: "dolina-czaszek", name: "Dolina Czaszek", region: "gorny", draw: 1 },
  { id: "bagna-1", name: "Bagna I", region: "gorny" },
  { id: "ruchome-skaly-1", name: "Ruchome Skały I", region: "gorny" },
  { id: "urwisko-2", name: "Urwisko II", region: "gorny" },
  { id: "rownina-traw", name: "Równina Traw", region: "gorny", draw: 1 },
  { id: "rozstajne-drogi-1", name: "Rozstajne Drogi I", region: "gorny", draw: 1 },
  { id: "zamek", name: "Zamek", region: "gorny" },
  { id: "wymarle-miasto", name: "Wymarłe Miasto", region: "gorny", draw: 1 },
  { id: "ruchome-skaly-2", name: "Ruchome Skały II", region: "gorny" },
  { id: "bagna-2", name: "Bagna II", region: "gorny" },
  { id: "krypta-upiorow", name: "Krypta Upiorów", region: "gorny" },
  { id: "rownina-snu", name: "Równina Snu", region: "gorny", draw: 1 },
  { id: "rozstajne-drogi-2", name: "Rozstajne Drogi II", region: "gorny", draw: 1 },
  { id: "kamienny-las", name: "Kamienny Las", region: "gorny", draw: 2 },
  { id: "wilczy-parow", name: "Wilczy Parów", region: "gorny" },
] as const;

export const GORNY_KRAG: readonly BoardField[] = GORNY_KRAG_FIELDS;


/**
 * The only places a character may pass between rings.
 *
 * Rule 11.1 allows the Trzęsawiska crossing at Uroczysko and Las Błędnych Ogni
 * alone, and 11.5 allows the Lodowy Las crossing at Przełęcz Wichrów and Dolina
 * Czaszek alone. Everything else on the boundary is impassable, which is what
 * makes the rings rings rather than one long track.
 */
export interface Crossing {
  from: FieldId;
  to: FieldId;
  /** What must be overcome, per 11.3-11.4 and 11.7-11.8. */
  obstacle: "trzesawiska" | "lodowy-las";
  /**
   * What the crossing demands, or absent when it demands nothing.
   *
   * Only the inbound direction of each is defended — see the note on
   * `crossingIsDefended` — and the two are not the same kind of obstacle at
   * all. The Trzęsawiska are a test of Magia against two dice; the Lodowy Las
   * is a fight against a creature with a printed Miecz. Treating both as a
   * generic "did you make it?" lost that distinction.
   */
  test?: CrossingTest;
}

export type CrossingTest =
  /** Uroczysko: "Rzuć dwoma kostkami: wynik mniejszy lub równy twojej Magii". */
  | { kind: "magia"; dice: number }
  /** Przełęcz Wichrów: "musisz pokonać ... Rycerza Wiecznych Śniegów (Miecz 10)". */
  | { kind: "walka"; guardian: string; miecz: number };

export const CROSSINGS: readonly Crossing[] = [
  {
    from: "uroczysko",
    to: "las-blednych-ogni",
    obstacle: "trzesawiska",
    test: { kind: "magia", dice: 2 },
  },
  { from: "las-blednych-ogni", to: "uroczysko", obstacle: "trzesawiska" },
  {
    from: "przelecz-wichrow",
    to: "dolina-czaszek",
    obstacle: "lodowy-las",
    test: { kind: "walka", guardian: "Rycerz Wiecznych Śniegów", miecz: 10 },
  },
  { from: "dolina-czaszek", to: "przelecz-wichrow", obstacle: "lodowy-las" },
];

export function crossingFrom(fieldId: FieldId): Crossing | undefined {
  return CROSSINGS.find((crossing) => crossing.from === fieldId);
}

/**
 * Whether this crossing has to be earned, or is simply walked.
 *
 * Only one direction of each crossing is defended. 11.3: the Trzęsawiska are
 * rolled for at Uroczysko, going up into the middle ring, and "idąc w przeciwnym
 * kierunku, nie musi wykonywać rzutu" — the board says the same on Las Błędnych
 * Ogni, "(nie rzucając kostką)". 11.7: the Rycerz Wiecznych Śniegów attacks only
 * a character going from the middle ring outward, and Przełęcz Wichrów prints
 * "nie atakuje jeżeli przechodzisz z Doliny Czaszek".
 *
 * So a character coming back down crosses for free. Asking them to roll — or
 * worse, charging them a point of Życie for failing — is a toll the rules do
 * not levy.
 */
export function crossingIsDefended(crossing: Crossing): boolean {
  return crossing.test !== undefined;
}

/**
 * The Trzęsawiska, decided (11.3).
 *
 * The field card is explicit and admits no middle: "wynik mniejszy lub równy
 * twojej Magii - przeprawiłeś się na drugą stronę. Większy wynik oznacza
 * porażkę (tracisz 1 Życie)." Rule 11.4 does mention a drawn result, but that
 * sentence reads as boilerplate carried over from 11.8, where a *fight* really
 * can be drawn; against a threshold there is nothing for a draw to be. The
 * printed card is the more specific rule and is followed.
 *
 * Magia here is the derived total, items included — the Trzęsawiska are not one
 * of the places that suppress them.
 */
export function trzesawiskaOutcome(
  dice: readonly number[],
  magia: number,
): "udana" | "nieudana" {
  const rolled = dice.reduce((sum, die) => sum + die, 0);
  return rolled <= magia ? "udana" : "nieudana";
}
