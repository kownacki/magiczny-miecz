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

/** A `### 5.3` heading, or `### 12.1a` — the book has a few lettered ones. */
const RULE_HEADING = /^###\s+(\d+\.\d+[a-z]?)\.?\s*$/;
/** `## 5. PRZEDMIOTY.` — numbered — or `## PRZYGOTOWANIE DO GRY`, which is not. */
const CHAPTER_HEADING = /^##\s+(?:(\d+)\.\s*)?(.+?)\.?\s*$/;

const shut = () => {
  if (rule && (rule.paras.length > 0 || rule.examples.length > 0)) chapter?.rules.push(rule);
  rule = null;
};

for (const raw of body.split("\n")) {
  const line = raw.trim();
  if (line === "" || line === "# INSTRUKCJA") continue;
  // Notes to a reader of the scans, not to a player.
  if (line.startsWith("<!--")) continue;

  const asRule = line.match(RULE_HEADING);
  if (asRule) {
    shut();
    rule = { id: asRule[1], paras: [], examples: [] };
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
    rule = number ? null : { id: null, paras: [], examples: [] };
    continue;
  }

  if (!chapter) continue;
  // Prose before the first `###` in a numbered chapter — rare, but 20. has it.
  if (!rule) rule = { id: null, paras: [], examples: [] };

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
    `${chapters.reduce((n, c) => n + c.rules.reduce((m, r) => m + r.examples.length, 0), 0)} przykładów`,
);
