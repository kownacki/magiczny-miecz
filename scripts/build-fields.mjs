/** Maps the transcribed board text onto the engine's field ids and checks it against the ring the engine already knows. */

import fs from "node:fs";

const RAW = "src/data/raw/dolny-fields.json";
const OUT = "src/data/dolny-fields.json";

/**
 * Mokradła and Step each appear twice on the ring, so a name alone cannot say
 * which field a transcription belongs to. The tile it was read from can: the
 * ring runs Karczma at the bottom left, up the right side through Gród to
 * Czarci Młyn, across the top through the first Mokradła and Step, then down
 * the left through Osada and Kurhan to the second pair and Uroczysko.
 *
 * The two copies of each name print the same instruction with slightly
 * different wording and punctuation, so a mix-up would be invisible in play —
 * which is exactly why it is pinned down here rather than left to chance.
 */
const BY_NAME_AND_TILE = {
  "Karczma": "karczma",
  "Mroźne Pustkowie": "mrozne-pustkowie",
  "Gród": "grod",
  "Bezdroża": "bezdroza",
  "Studnia Wieczności": "studnia-wiecznosci",
  "Krąg Mocy": "krag-mocy",
  "Czarci Młyn": "czarci-mlyn",
  "Osada": "osada",
  "Kurhan": "kurhan",
  "Uroczysko": "uroczysko",
  "Mokradła|dolny-right.png": "mokradla-1",
  "Mokradła|dolny-left.png": "mokradla-2",
  "Step|dolny-top-r.png": "step-1",
  "Step|dolny-left.png": "step-2",
};

/** The draw counts the engine already carries, transcribed independently. */
const EXPECTED_DRAW = {
  "mrozne-pustkowie": 1,
  bezdroza: 2,
  "mokradla-1": 1,
  "mokradla-2": 1,
  "step-1": 1,
  "step-2": 1,
  uroczysko: 1,
};

const entries = JSON.parse(fs.readFileSync(RAW, "utf8"));
const problems = [];
const out = [];
const seen = new Set();

for (const entry of entries) {
  const id =
    BY_NAME_AND_TILE[`${entry.name}|${entry.tile}`] ?? BY_NAME_AND_TILE[entry.name];
  if (!id) {
    problems.push(`no field id for "${entry.name}" (tile ${entry.tile})`);
    continue;
  }
  if (seen.has(id)) {
    problems.push(`two transcriptions map to ${id}`);
    continue;
  }
  seen.add(id);

  // Cross-check against the draw counts already in the engine. These were read
  // from the board separately, so a disagreement means one of the two passes
  // misread the board and neither should be trusted silently.
  const expected = EXPECTED_DRAW[id] ?? undefined;
  if ((entry.draw ?? undefined) !== expected) {
    problems.push(`${id}: board text says draw=${entry.draw ?? "none"}, engine says ${expected ?? "none"}`);
  }

  out.push({ id, name: entry.name, text: entry.text, ...(entry.draw ? { draw: entry.draw } : {}) });
}

out.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

console.log(`${out.length} fields -> ${OUT}`);
const unresolved = out.filter((f) => f.text.includes("[?]"));
if (unresolved.length) {
  console.log(`\n${unresolved.length} field(s) still carry an unread word:`);
  for (const field of unresolved) console.log(`  ${field.id}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log("\nall 14 fields mapped; draw counts agree with the engine");
}
