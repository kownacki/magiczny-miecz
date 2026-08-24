/** Reads a printed "rzuć kostką" table out of Polish prose, or refuses to when it cannot do so safely. */

export interface RollTable {
  /** Outcome text for each face of the die, 1 to 6. */
  outcomes: Record<number, string>;
  /**
   * The prose immediately before the table, which says what the roll is *for*.
   *
   * Load-bearing rather than decorative. Gród's table belongs to the Wróżbita
   * you may choose to visit, not to the field as a whole — presenting it as
   * "the Gród table" would invite a player to roll when they never opted in.
   * Showing the lead-in makes the scope of the roll visible.
   */
  label: string;
}

/**
 * A die-value clause: the number or range that opens an outcome.
 *
 * Handles every shape the board and deck actually print — "1 -", "2.", "2, 3",
 * "1-2", "4-5", "1,2 lub 3" — anchored to a clause boundary so that numbers
 * inside prose ("za 2 Sz. Z.", "Miecz 4", "1 Sztukę Złota") are not mistaken
 * for table entries.
 */
const ENTRY =
  /(?:^|[;,.:]\s*|\bkostką\s*)(\d(?:\s*(?:-|,|\s+lub\s+)\s*\d)*)\s*[-.]?\s+(?=\p{L})/gu;

function facesOf(spec: string): number[] {
  const numbers = [...spec.matchAll(/\d/g)].map((m) => Number(m[0]));
  if (numbers.length === 0) return [];
  // "2-3" and "4-5" are ranges; "2, 3" and "1,2 lub 3" are lists. A hyphen
  // between exactly two numbers is the only range form the source uses.
  if (/^\s*\d\s*-\s*\d\s*$/.test(spec)) {
    const [from, to] = numbers;
    if (to < from) return [];
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  return numbers;
}

/**
 * Parses a die table, or returns null.
 *
 * Null is the common and correct answer. The parser only commits when the
 * result covers all six faces exactly once — no gaps, no duplicates. That check
 * is what makes this safe to show a player: a field like Czarci Młyn prints two
 * separate tables under different Natures, and Gród buries one inside a list of
 * people you may visit. Both produce overlapping or partial coverage and are
 * rejected, falling back to showing the printed text for a human to read.
 */
export function parseRollTable(text: string): RollTable | null {
  const entries: { faces: number[]; start: number; end: number; specStart: number }[] = [];
  for (const match of text.matchAll(ENTRY)) {
    const faces = facesOf(match[1]);
    if (faces.length === 0) continue;
    entries.push({
      faces,
      // Where the outcome's prose begins, after the die spec.
      start: match.index + match[0].length,
      // Where the die spec itself begins. The label runs up to here, not up to
      // `start` — otherwise the first entry's "1 - " is dragged into it.
      specStart: match.index + match[0].indexOf(match[1]),
      end: text.length,
    });
  }
  if (entries.length < 2) return null;

  // Each outcome runs until the next one begins.
  for (let i = 0; i < entries.length - 1; i++) {
    const nextStart = text.lastIndexOf(
      String(entries[i + 1].faces[0]),
      entries[i + 1].start,
    );
    entries[i].end = nextStart === -1 ? entries[i + 1].start : nextStart;
  }

  const outcomes: Record<number, string> = {};
  for (const entry of entries) {
    const body = text.slice(entry.start, entry.end).trim().replace(/[;,]\s*$/, "");
    if (!body) return null;
    for (const face of entry.faces) {
      // A face claimed twice means the prose holds more than one table, or a
      // number in the text was misread as an entry. Either way, stop.
      if (outcomes[face] !== undefined) return null;
      outcomes[face] = body;
    }
  }

  for (let face = 1; face <= 6; face++) {
    if (outcomes[face] === undefined) return null;
  }

  // Take the sentence or clause the table hangs off, so the roll is never
  // presented without saying what it is for.
  const before = text.slice(0, entries[0].specStart);
  const label =
    before
      .split(/(?<=[.;])\s+/)
      .filter(Boolean)
      .pop()
      ?.trim()
      .replace(/[:\s]+$/, "") ?? "";

  return { outcomes, label };
}
