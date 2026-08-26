/** Every kind of thing the journal records — the one list the writer and the reader share. */

/**
 * Why this is a list and not a `string`.
 *
 * The journal is written in one place and read in another, and for a long time
 * nothing connected them: `kind` was a bare string on both sides, and the only
 * thing holding them together was a test that read the store's source with a
 * regular expression and counted what it found.
 *
 * That test was right to exist and wrong to be a regex. It missed a `kind`
 * whose value was a ternary, it missed one written on a single line, it missed
 * one with a comment between `turn:` and `kind:`, and it missed one where
 * `turn` was passed in shorthand — four blind spots, each found only because
 * something happened to move past it. A kind it cannot see is a line nobody
 * checks has a sentence, in the one artefact whose whole job is being believed
 * when the app and the board disagree.
 *
 * So the list is the type. A writer cannot invent a kind, a reader cannot
 * forget one, and neither can drift without the compiler saying so.
 */
export const JOURNAL_KINDS = [
  "bestia-porazka",
  "bestia-remis",
  "dosiadka",
  "efekt",
  "kamien",
  "karta",
  "karta-tabela",
  "koniec-tury",
  "korekta",
  "kupno",
  "leczenie",
  "most-cerber",
  "most-gra-ze-smiercia",
  "most-nieudane",
  "most-pulapka",
  "nowa-postac",
  "odrzucenie",
  "oslona",
  "pojedynek",
  "pole-tabela",
  "proba-mostu",
  "przeprawa",
  "przeprawa-nieudana",
  "przestawienie",
  "przetasowanie",
  "przewoznik",
  "przewoznik-odmowa",
  "punkty",
  "ruch",
  "rzut",
  "smierc",
  "sprzedaz",
  "start",
  "strata",
  "straznik-koniec",
  "straznik-mostu",
  "straznik-sila",
  "straznik-start",
  "test-karta",
  "test-karta-obszar",
  "test-koniec-walki",
  "tura-stracona",
  "ucieczka",
  "ucieczka-nieudana",
  "uzdrowienie",
  "uzycie",
  "walka-koniec",
  "walka-rzut",
  "walka-start",
  "wejscie-na-most",
  "wymiana-trofeow",
  "wyposazenie-poczatkowe",
  "zabranie",
  "zaklecie",
  "zmiana-natury",
  "zostawienie",
  "zwyciestwo",
] as const;

export type JournalKind = (typeof JOURNAL_KINDS)[number];

const KNOWN: ReadonlySet<string> = new Set(JOURNAL_KINDS);

/**
 * A stored `kind` column, narrowed once at the boundary.
 *
 * Null for anything the app does not recognise, which is a row written by a
 * version that knew a kind this one does not — worth showing as unreadable
 * rather than crashing the journal somebody opened to settle an argument.
 */
export function asJournalKind(value: unknown): JournalKind | null {
  return typeof value === "string" && KNOWN.has(value) ? (value as JournalKind) : null;
}
