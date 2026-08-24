/** Checks the middle and outer ring transcriptions against the rings the engine already knows, and writes the copy the app loads. */

import fs from "node:fs";

const RAW = "src/data/raw/ring-fields.json";
const OUT = "src/data/ring-fields.json";
const RINGS = "src/lib/engine/rings.ts";

/**
 * The ring arrays and these transcriptions are two independent readings of the
 * same board — the arrays were built by walking the scan edge by edge, the text
 * by reading each field's printed instructions. Both record how many cards a
 * field makes you draw, so comparing those counts checks one reading against
 * the other. They agreed on all 34 fields the first time this ran; if they ever
 * stop agreeing, one of the two passes has drifted and neither should be
 * trusted until someone looks.
 */
function ringsFromSource() {
  const source = fs.readFileSync(RINGS, "utf8");
  const fields = new Map();
  for (const match of source.matchAll(
    /\{ id: "([^"]+)", name: "([^"]+)", region: "([^"]+)"(?:, draw: (\d+))? \}/g,
  )) {
    fields.set(match[1], {
      name: match[2],
      region: match[3],
      draw: match[4] ? Number(match[4]) : undefined,
    });
  }
  return fields;
}

const engine = ringsFromSource();
const entries = JSON.parse(fs.readFileSync(RAW, "utf8"));
const problems = [];
const seen = new Set();

for (const entry of entries) {
  const field = engine.get(entry.id);
  if (!field) {
    problems.push(`${entry.id}: no such field in the middle or outer ring`);
    continue;
  }
  if (seen.has(entry.id)) problems.push(`${entry.id}: transcribed twice`);
  seen.add(entry.id);

  if (field.name !== entry.name) {
    problems.push(`${entry.id}: board says "${entry.name}", engine says "${field.name}"`);
  }
  if ((entry.draw ?? undefined) !== field.draw) {
    problems.push(
      `${entry.id}: board text says draw=${entry.draw ?? "none"}, engine says ${field.draw ?? "none"}`,
    );
  }
}

for (const [id] of engine) {
  if (!seen.has(id)) problems.push(`${id}: no transcription`);
}

const out = [...entries].sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`${out.length} fields -> ${OUT}`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log("\nnames and draw counts agree with the engine on every field");
}
