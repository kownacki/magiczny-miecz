import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPS_IN_ORDER, WORDS } from "./words";

/**
 * Every word a card says has to be heard by the thing that runs it.
 *
 * `reachable.test.ts` holds this for `Ability` kinds: a clause transcribed into
 * the vocabulary and consulted by nothing is a rule the app silently drops.
 * This holds the same line one level down, for the *fields* of an `Effect`
 * word. The PÓŁBÓG is the case: „Możesz je wybrać ze stosu" became
 * `fromPile: true` on his `gain-spell`, both text renderers read it and say so
 * under the card, and the executor in `ops.ts` never looks — the card promises
 * a choice and deals the top of the pile. Nothing failed, because nothing
 * requires a field of the vocabulary to have a reader in the engine.
 *
 * So, for every word in `WORDS`, every field its `params` declares must be
 * named in the code that carries the word out: the executor's entry in
 * `ops.ts` for a leaf, the walk in `effects.ts` for a composing word. Where
 * the reader honestly lives elsewhere, `ELSEWHERE` says which file and the
 * file is checked; where nothing reads it yet, `UNREAD` says so and is the
 * backlog — an entry there is a card that says one thing and does another,
 * and the aim is an empty list.
 *
 * Matched by word inside the one entry, the way `disabled.test.ts` pins a
 * clause by words only it contains. It cannot tell a read from a mention, and
 * does not try to: what it catches is the silent case, a field with no
 * mention at all, which is the shape the bug had.
 */

const OPS = readFileSync("src/lib/game/commands/ops.ts", "utf8");
const WALK = readFileSync("src/lib/game/commands/effects.ts", "utf8");

/** `op.field` read by a file other than the executor's, and which one. */
const ELSEWHERE: Readonly<Record<string, string>> = {
  // The Lichwiarz's desk: `sell` reads the offer off the Obszar, not the op.
  "sell.price": "src/lib/game/commands/shop.ts",
  // The Medyk's and the Pustelnik's price: `heal` reads the cure off the
  // Obszar — a priced `heal` is a purchase, and the purchase is the shop's
  // door, not the walk's.
  "heal.price": "src/lib/game/commands/shop.ts",
  // The ZŁY DUCH's „z wyjątkiem Południcy": `chooseLosses` spares them.
  "lose.except": "src/lib/engine/losses.ts",
};

/**
 * `op.field` nothing reads yet. A backlog, not a design — see docs/KARTA.md.
 *
 * Two of the three are the same bug: a word that changes *who chooses* or
 * *from where*, rendered faithfully under the card and ignored by the walk.
 */
const UNREAD: readonly string[] = [
  // PÓŁBÓG: „Możesz je wybrać ze stosu." The chooser the CHOCHLIK uses is the
  // door; the executor deals the top of the pile regardless.
  "gain-spell.fromPile",
  // SZALEŃSTWO: „obejrzeć Zaklęcia i wybrać jedno z nich" hands the pick to
  // the caster (`chosenBy: "caster"`); the executor takes whatever answer
  // the frame carries and never asks who the card says should give it.
  "take.chosenBy",
  // KOMETA: `reach` has one value, `krag`, and the executor sweeps the Krąg
  // without looking. Harmless today; a word with one value and no reader is
  // vocabulary nobody speaks — read it or delete it.
  "wipe.reach",
];

/** The executor table's entries, keyed on the op, as source text. */
function executors(): Record<string, string> {
  const start = OPS.indexOf("const OPS:");
  const end = OPS.indexOf("\n};", start);
  const table = OPS.slice(start, end).split("\n");
  const out: Record<string, string> = {};
  let current: string | null = null;
  for (const line of table) {
    const head = line.match(/^ {2}"?([a-z-]+)"?: /);
    if (head) current = head[1];
    if (current) out[current] = `${out[current] ?? ""}${line}\n`;
  }
  return out;
}

const mentions = (text: string, word: string) => new RegExp(`\\b${word}\\b`).test(text);

describe("every field a word declares is read by the code that runs it", () => {
  const bodies = executors();

  it("knows an executor for every leaf word", () => {
    for (const op of OPS_IN_ORDER) {
      if (WORDS[op].composes) continue;
      expect(bodies[op], `no entry for \`${op}\` in ops.ts`).toBeDefined();
    }
  });

  for (const op of OPS_IN_ORDER) {
    const body = WORDS[op].composes ? WALK : (bodies[op] ?? "");
    for (const field of Object.keys(WORDS[op].params)) {
      const key = `${op}.${field}`;
      if (UNREAD.includes(key)) {
        it(`${key} — still unread, as UNREAD says`, () => {
          expect(
            mentions(body, field),
            `${key} is read now — take it off UNREAD so the list stays the backlog`,
          ).toBe(false);
        });
        continue;
      }
      const elsewhere = ELSEWHERE[key];
      it(`${key} is read${elsewhere ? ` in ${elsewhere}` : ""}`, () => {
        const text = elsewhere ? readFileSync(elsewhere, "utf8") : body;
        expect(
          mentions(text, field),
          `\`${field}\` on \`${op}\` is a field a card may write and nothing reads — the card would say one thing and do another; read it, or list it in UNREAD as the gap it is`,
        ).toBe(true);
      });
    }
  }
});
