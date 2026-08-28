/** The Instrukcja as lines a console can print — the terminal's way into the book. */

import rules from "@/data/rules.json";

interface Rule {
  id: string | null;
  paras: string[];
  examples: string[];
  notes: string[];
  table: string[][];
  tableAfter: number;
}
interface Chapter {
  key: string;
  number: string | null;
  title: string;
  rules: Rule[];
}

const CHAPTERS = rules as Chapter[];

/**
 * A rule, a chapter, or the list of chapters.
 *
 * `mm` has no Księga and cannot have one, so the rule numbers it prints in
 * every refusal are the one thing a terminal player cannot follow. This is the
 * same door the browser opens by making the number a link, cut to the shape a
 * console can hand back: lines.
 *
 * Off the same `rules.json` the Księga renders, so the two cannot say different
 * things — and the transcript is the book's, verbatim, down to the emphasis
 * marks which are stripped here because a terminal has no bold.
 */
export function ruleLines(about: string | null): string[] {
  if (about === null) return chapterList();

  // Copied straight out of a refusal, brackets and full stop and all: "(7.3)."
  // is what the message said, and retyping it without the punctuation is a
  // thing to remember rather than a thing to do.
  const wanted = about.trim().replace(/^[(]+/, "").replace(/[).]+$/, "");
  const rule = CHAPTERS.flatMap((chapter) => chapter.rules).find((one) => one.id === wanted);
  if (rule) return oneRule(wanted, rule);

  // A bare number is a chapter: `rule 5` for all of PRZEDMIOTY. Matched on the
  // number rather than the title, because that is what a refusal quotes half of.
  const chapter = CHAPTERS.find(
    (one) => one.number === wanted || one.key === wanted.toLowerCase(),
  );
  if (chapter) return oneChapter(chapter);

  /**
   * The letters are the app's own — see `resolve` in `rule-ref.tsx`. The book
   * has 12.1; the code says 12.1a and 12.1b for the three separate things that
   * one rule says, and a refusal quoting a clause should still land.
   */
  const withoutLetter = wanted.replace(/[a-z]$/, "");
  if (withoutLetter !== wanted) return ruleLines(withoutLetter);

  return [`Nie ma zasady ${about}. Wpisz \`rule\`, żeby zobaczyć rozdziały.`];
}

function chapterList(): string[] {
  return [
    "INSTRUKCJA — rozdziały. `rule 5` czyta cały, `rule 5.3` jedną zasadę.",
    ...CHAPTERS.flatMap((chapter) => {
      if (chapter.number === null) return [];
      const ids = chapter.rules.filter((rule) => rule.id).length;
      return [`  ${chapter.number.padStart(2)}. ${plain(chapter.title)}  (${ids})`];
    }),
  ];
}

function oneChapter(chapter: Chapter): string[] {
  const numbered = chapter.rules.filter((rule) => rule.id !== null);
  return [
    `${chapter.number ? `${chapter.number}. ` : ""}${plain(chapter.title)}`,
    ...(numbered.length === 0
      ? chapter.rules.flatMap((rule) => rule.paras.map(plain))
      : numbered.map((rule) => `  ${rule.id}  ${first(rule)}`)),
  ];
}

function oneRule(id: string, rule: Rule): string[] {
  return [
    id,
    // The table where it was printed, not after everything: 2.6's first
    // paragraph ends "w następujący sposób:" and this is what follows it.
    // Columns padded to their widest cell, which is a terminal's whole idea of
    // a table.
    ...rule.paras.flatMap((para, at) => [
      plain(para),
      ...(rule.table.length > 0 && rule.tableAfter === at + 1 ? asColumns(rule.table) : []),
    ]),
    // The book's own worked examples, marked the way it marks them.
    ...rule.examples.map((example) => `Przykład: ${plain(example)}`),
    // And where the transcript flagged something about the printed page — a
    // sentence that stops at a page break, a table with a column missing.
    ...rule.notes.map((note) => `[uwaga do transkrypcji: ${plain(note)}]`),
  ];
}

/** Rows padded into columns, which is a terminal's whole idea of a table. */
function asColumns(rows: readonly (readonly string[])[]): string[] {
  if (rows.length === 0) return [];
  const width = (at: number) => Math.max(...rows.map((row) => (row[at] ?? "").length));
  return rows.map((row) => row.map((cell, at) => cell.padEnd(width(at))).join("  ").trimEnd());
}

/** One line of a rule, for a list where the whole of it will not fit. */
function first(rule: Rule): string {
  const said = plain(rule.paras[0] ?? "");
  return said.length > 78 ? `${said.slice(0, 77)}…` : said;
}

/** Markdown emphasis out: a terminal has no bold, and `**` is not the book. */
function plain(text: string): string {
  return text.replace(/\*\*/g, "");
}
