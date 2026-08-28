/**
 * `docs/RULES.md` → `src/data/rules.json`, so the app can show the rulebook.
 *
 * The transcript is the source and stays the source: it is read by people
 * working on this and cited by every rule number in the code, and a second copy
 * kept by hand would be two rulebooks the first time somebody fixed a typo in
 * one. So this is a build step like `generate-ids.mjs`, and the JSON is
 * committed like the card images are — a fresh checkout has the manual without
 * needing the doc.
 *
 * What it keeps: the numbered chapters and their rules, plus the unnumbered
 * front matter (what is in the box, how to set up, how a turn goes), which is
 * where a first-time player starts. What it drops: the file's own preamble
 * about transcription, which is about the transcript rather than the game, and
 * the HTML comments flagging oddities in the original — those are notes to
 * whoever is reading the scans.
 *
 * Run: node scripts/build-rules.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "docs/RULES.md";
const OUT = "src/data/rules.json";

const text = readFileSync(SOURCE, "utf8");

/**
 * Everything from the `# INSTRUKCJA` marker on.
 *
 * Above it sits the file's own explanation of itself — who transcribed it and
 * from what — which belongs in the repository and not in the Księga.
 */
const body = text.slice(text.indexOf("\n# INSTRUKCJA") + 1);

const chapters = [];
let chapter = null;
let rule = null;

/**
 * Everything the book puts under a `###`, which is not only numbered rules.
 *
 * Three shapes. `### 5.3` is the ordinary one. `### 22` is chapter 22's single
 * rule, numbered with no decimal at all. And the boxed Kamienny Most section
 * heads its nine field instructions by name — `### WEJŚCIE NA MOST`, `###
 * CERBER` — which 14.3 calls "poza numeracją" and which are as much a part of
 * the book as anything with a number on it.
 *
 * Matching only the first shape left the other ten falling through to prose,
 * so the Księga printed "### CERBER" as a line of text. Same failure as the
 * table, one heading level up.
 */
const RULE_HEADING = /^###\s+(.+?)\.?\s*$/;
/** What counts as a rule number rather than a name. */
const IS_NUMBER = /^\d+(\.\d+)?[a-z]?$/;
/**
 * `## 5. PRZEDMIOTY.` — numbered — or `## PRZYGOTOWANIE DO GRY`, which is not.
 *
 * The title keeps whatever punctuation the book gave it. Six of the chapters
 * print a full stop after the name and the rest do not, and tidying that up
 * here would be the transcript's one job undone: this is what the page says.
 */
const CHAPTER_HEADING = /^##\s+(?:(\d+)\.\s+)?(.+?)\s*$/;

const shut = () => {
  if (
    rule &&
    (rule.paras.length > 0 || rule.examples.length > 0 || rule.notes.length > 0 ||
      rule.table.length > 0)
  )
    chapter?.rules.push(rule);
  rule = null;
};

for (const raw of body.split("\n")) {
  const line = raw.trim();
  if (line === "" || line === "# INSTRUKCJA") continue;
  /**
   * The transcriber's notes — kept, not dropped.
   *
   * They were skipped as being about the scans rather than about the game, and
   * most of them are: "literówka w oryginale", "transkrybowane dosłownie". But
   * two are not. One says a sentence in 11.3 stops mid-air because that is
   * where the page ends, and another that a printed table has a column too few
   * — and a reader who meets either without the note thinks the app has lost
   * something. A transcript that hides where it is uncertain is worse than one
   * that says so.
   */
  if (line.startsWith("<!--")) {
    const note = line.replace(/^<!--\s*/, "").replace(/\s*-->$/, "");
    if (rule) rule.notes.push(note);
    else if (chapter) chapter.rules.push({
      id: null,
      title: null,
      paras: [],
      examples: [],
      notes: [note],
      table: [],
      tableAfter: 0,
    });
    continue;
  }

  const asRule = line.match(RULE_HEADING);
  if (asRule) {
    shut();
    const said = asRule[1];
    const numbered = IS_NUMBER.test(said);
    rule = {
      id: numbered ? said : null,
      // A named one — the Most's own instructions. Kept apart from `id`
      // because nothing cites these and nothing can: they have no number.
      title: numbered ? null : said,
      paras: [],
      examples: [],
      notes: [],
      table: [],
      tableAfter: 0,
    };
    continue;
  }

  const asChapter = line.match(CHAPTER_HEADING);
  if (asChapter && !asRule) {
    shut();
    const [, number, title] = asChapter;
    chapter = { key: number ?? slug(title), number: number ?? null, title, rules: [] };
    chapters.push(chapter);
    // An unnumbered chapter is prose with no rule numbers in it, so it gets one
    // nameless rule to hold the prose rather than a special case downstream.
    rule = number ? null : { id: null, title: null, paras: [], examples: [], notes: [], table: [], tableAfter: 0 };
    continue;
  }

  if (!chapter) continue;
  // Prose before the first `###` in a numbered chapter — rare, but 20. has it.
  if (!rule) rule = { id: null, title: null, paras: [], examples: [], notes: [], table: [], tableAfter: 0 };

  /**
   * The one table in the book — 2.6's Magia against the Zaklęcia it allows.
   *
   * Kept as rows rather than as three paragraphs of pipes. A reader of the
   * Księga was getting "|---|---|---|" on a line of its own, which is Markdown
   * showing through, and the numbers underneath it read as a list rather than
   * as the answer to "how many may I hold".
   *
   * The separator row is dropped: it is the format's, not the book's.
   */
  if (line.startsWith("|")) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.every((cell) => /^-{2,}$/.test(cell))) continue;
    // Where it stood, so the reader can put it back there. 2.6's first
    // paragraph ends "w następujący sposób:" and the table is what follows;
    // collecting rows and prose separately had the colon introducing the
    // sentence after the table instead.
    if (rule.table.length === 0) rule.tableAfter = rule.paras.length;
    rule.table.push(cells);
    continue;
  }

  if (line.startsWith(">")) {
    // "> Przykład: …" — the book's worked examples, which are the best part of
    // it and are marked so the app can set them apart rather than run them into
    // the rule they illustrate.
    rule.examples.push(line.replace(/^>\s*/, "").replace(/^Przykład:\s*/, ""));
  } else {
    rule.paras.push(line);
  }
}
shut();

function slug(title) {
  return title
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => "acelnoszz"["ąćęłńóśźż".indexOf(c)])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const ruleCount = chapters.reduce((n, one) => n + one.rules.filter((r) => r.id).length, 0);
writeFileSync(OUT, `${JSON.stringify(chapters, null, 2)}\n`);
console.log(
  `wrote ${OUT}: ${chapters.length} rozdziałów, ${ruleCount} numbered rules, ` +
    `${chapters.reduce((n, c) => n + c.rules.reduce((m, r) => m + r.examples.length, 0), 0)} przykładów, ` +
    `${chapters.reduce((n, c) => n + c.rules.reduce((m, r) => m + r.notes.length, 0), 0)} uwag, ` +
    `${chapters.reduce((n, c) => n + c.rules.filter((r) => r.table.length > 0).length, 0)} tabela`,
);
