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
  "beast-draw",
  "beast-loss",
  "bought",
  "bridge-attempt",
  "bridge-cerberus",
  "bridge-death-game",
  "bridge-entry",
  "bridge-failed",
  "bridge-guardian",
  "bridge-trap",
  "card",
  "card-table",
  "crossing",
  "crossing-failed",
  "death",
  "discarded",
  "duel",
  "effect",
  "escape",
  "escape-failed",
  "ferry",
  "ferry-refused",
  "field-table",
  "fight-end",
  "fight-roll",
  "fight-start",
  "guardian-end",
  "guardian-start",
  "guardian-strength",
  "healed",
  "healing",
  "joined",
  /** Somebody left the table, or was put out of it. Not the same as `left-behind`. */
  "left-table",
  "left-behind",
  "lost-card",
  "move",
  "moved-by-hand",
  "nature-change",
  "new-character",
  "override",
  "points",
  "reshuffle",
  "roll",
  "shielded",
  "sold",
  "spell",
  "start",
  "starting-kit",
  "stone",
  "taken",
  "test-card",
  "test-card-field",
  "test-fight-end",
  "trophies-traded",
  "turn-end",
  "turn-lost",
  "used",
  "victory",
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
