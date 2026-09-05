import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A transcribed rule that nothing reads is a rule the app silently drops.
 *
 * This is the check that found three of them on 2026-09-05, all shipped and
 * all invisible: the KRYSZTAŁ MAGÓW's immunity to six named Zaklęcia and its
 * ban on an opponent's Odrodzenie, the WIERZCHOWIEC's and ZAPRZĘG's „dodać do
 * wyniku rzutu", and the PUSTELNIK's „nie możesz używać Miecza, Sztyletu,
 * Hełmu ani Zbroi". Each was transcribed, typed, covered by a passing suite,
 * and reported `pelne` by `coverage.ts` — because a card with an `ABILITIES`
 * entry counts as carried whether or not anything asks. Nothing failed. The
 * only signal was a reader nobody called.
 *
 * So the habit becomes a test. Two halves, and they catch different mistakes:
 *
 *   1. every `Ability` kind has code that *branches* on it, so a clause cannot
 *      be transcribed into the vocabulary and then never consulted;
 *   2. every reader exported from `abilities.ts` has a caller, so one whose
 *      work moved elsewhere is deleted rather than left as a second spelling
 *      the compiler still offers.
 *
 * **The trap this file exists to avoid repeating.** The first pass of that
 * audit matched the bare string `"zakazane"`, found it in `characters.ts`, and
 * counted the *data literal that declares the ability* as evidence something
 * read it — a kind vouching for itself. It reported the vocabulary clean and
 * was wrong within the hour. So this matches on the branch (`kind === "x"`,
 * `case "x"`) and never on the bare name.
 *
 * Tests do not count as callers, on purpose: a reader exercised only by its own
 * unit test is exactly the shape all three bugs had.
 */

const ABILITIES = "src/lib/engine/abilities.ts";

/** Every `.ts`/`.tsx` under `src`, minus the tests. */
function sources(dir = "src"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const FILES = sources();
/**
 * Imports are not uses, and they have to be removed *whole*.
 *
 * Found by breaking this file on purpose, twice. Renaming the one call to
 * `diesForYou` left it green, because an unreferenced reader that is still
 * imported is exactly the shape being hunted. Excluding lines that look like
 * an import left it green *again*: the imports here are multi-line, so the
 * line carrying the name is a bare `  diesForYou,` and looks like nothing at
 * all. Only stripping the whole statement works.
 */
const withoutImports = (text: string) =>
  text
    // `import … from "…"`, which may run over many lines.
    .replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?/gm, "")
    // A re-export, but *only* the `{ … } from` and `* from` shapes: matching a
    // bare `export` here swallowed whole function bodies up to the next
    // `from`, and reported four live readers as orphaned.
    .replace(/^export\s*(?:\{[\s\S]*?\}|\*)\s*from\s+["'][^"']+["'];?/gm, "");

const RAW = new Map(FILES.map((path) => [path, readFileSync(path, "utf8")]));
const ABILITY_SOURCE = RAW.get(ABILITIES)!;
/** What the files say once their import lists are taken out. */
const TEXT = new Map([...RAW].map(([path, text]) => [path, withoutImports(text)]));

/** A line that is only a comment cannot be a caller or a reader. */
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);


describe("every printed ability is actually read", () => {
  const kinds = [...new Set([...ABILITY_SOURCE.matchAll(/\|\s*\{\s*kind:\s*"([^"]+)"/g)].map((m) => m[1]))];

  it("finds the whole vocabulary, so a rename cannot empty this file", () => {
    // If the union stops parsing, every assertion below passes vacuously —
    // which is the one way a test like this fails silently.
    expect(kinds.length).toBeGreaterThan(30);
  });

  it.each(kinds)("something branches on %s", (kind) => {
    // The branch, never the bare name: a `{ kind: "x" }` literal is the data
    // declaring itself, not code consulting it.
    const branch = new RegExp(`kind\\s*(===|!==)\\s*"${kind}"|case\\s*"${kind}"`);
    const found = [...TEXT].some(([, text]) =>
      text.split("\n").some((line) => !isComment(line) && branch.test(line)),
    );
    expect(found, `nothing reads the \`${kind}\` ability — is a card's clause unenforced?`).toBe(
      true,
    );
  });
});

describe("every reader in abilities.ts is called", () => {
  const readers = [...ABILITY_SOURCE.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);

  it("finds the readers, so a rename cannot empty this file", () => {
    expect(readers.length).toBeGreaterThan(20);
  });

  it.each(readers)("%s has a caller outside its own file", (name) => {
    const used = new RegExp(`\\b${name}\\b`);
    const found = [...TEXT].some(
      ([path, text]) =>
        path !== ABILITIES &&
        text.split("\n").some((line) => !isComment(line) && used.test(line)),
    );
    expect(
      found,
      `\`${name}\` has no caller — either a rule is unenforced, or its work moved and it should be deleted`,
    ).toBe(true);
  });
});
