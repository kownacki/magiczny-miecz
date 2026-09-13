import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPOSING_OPS, SCRIPTS, type Effect } from "./cardScript";
import { FIELD_SCRIPTS } from "./fieldScript";
import { SPELLS } from "./spells";

/**
 * Every word a card says has to be heard by the thing that runs it.
 *
 * `reachable.test.ts` holds this for `Ability` kinds: a clause transcribed into
 * the vocabulary and consulted by nothing is a rule the app silently drops.
 * This holds the same line one level down, for the *parameters* of an
 * `Effect` op. The PÓŁBÓG is the case: „Możesz je wybrać ze stosu" became
 * `zeStosu: true` on his `zaklecie`, both text renderers read it and say so
 * under the card, and the executor in `ops.ts` never looks — the card promises
 * a choice and deals the top of the pile. Nothing failed, because nothing
 * requires a field of the vocabulary to have a reader in the engine.
 *
 * So, for every op the corpus actually uses, every parameter the corpus gives
 * it must be named in the code that carries that op out: the executor's entry
 * in `ops.ts` for a leaf, the walk in `effects.ts` for a composing op. Where
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

/** `op.param` read by a file other than the executor's, and which one. */
const ELSEWHERE: Readonly<Record<string, string>> = {
  // The Lichwiarz's desk: `sell` reads the offer off the Obszar, not the op.
  "sprzedaj.cena": "src/lib/game/commands/shop.ts",
  // The Medyk's and the Pustelnik's price: `heal` reads the cure off the
  // Obszar — `isSettled` calls a priced `uzdrow` a purchase, and the purchase
  // is the shop's door, not the walk's.
  "uzdrow.cena": "src/lib/game/commands/shop.ts",
  // The ZŁY DUCH's „z wyjątkiem Południcy": `chooseLosses` spares them.
  "strata.oprocz": "src/lib/engine/losses.ts",
};

/**
 * `op.param` nothing reads yet. A backlog, not a design — see docs/KARTA.md.
 *
 * Two of the three are the same bug: a word that changes *who chooses* or
 * *from where*, rendered faithfully under the card and ignored by the walk.
 */
const UNREAD: readonly string[] = [
  // PÓŁBÓG: „Możesz je wybrać ze stosu." The chooser the CHOCHLIK uses is the
  // door; the executor deals the top of the pile regardless.
  "zaklecie.zeStosu",
  // SZALEŃSTWO: „obejrzeć Zaklęcia i wybrać jedno z nich" hands the pick to
  // the caster (`wybiera: "rzucajacy"`); the executor takes whatever answer
  // the frame carries and never asks who the card says should give it.
  "zabierz.wybiera",
  // KOMETA: `zasieg` has one value, `krag`, and the executor sweeps the Krąg
  // without looking. Harmless today; a word with one value and no reader is
  // vocabulary nobody speaks — read it or delete it.
  "katastrofa.zasieg",
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

/** Every parameter the corpus hands each op, walked off the registries. */
function paramsUsed(): Record<string, Set<string>> {
  const used: Record<string, Set<string>> = {};
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const record = node as Record<string, unknown>;
    if (typeof record.op === "string") {
      const set = (used[record.op] ??= new Set());
      for (const key of Object.keys(record)) if (key !== "op") set.add(key);
    }
    Object.values(record).forEach(visit);
  };
  for (const script of Object.values(SCRIPTS)) {
    visit(script?.effect);
    visit(script?.placed);
    visit(script?.przegrana);
  }
  for (const spell of Object.values(SPELLS)) visit(spell.stosuje);
  for (const field of Object.values(FIELD_SCRIPTS)) field?.offers.forEach((o) => visit(o.effect));
  return used;
}

const mentions = (text: string, word: string) => new RegExp(`\\b${word}\\b`).test(text);

describe("every parameter a card gives an op is read by the code that runs it", () => {
  const used = paramsUsed();
  const bodies = executors();
  const composing = new Set<string>(COMPOSING_OPS);

  it("knows an executor for every leaf op the corpus uses", () => {
    for (const op of Object.keys(used)) {
      if (composing.has(op as Effect["op"])) continue;
      expect(bodies[op], `no entry for \`${op}\` in ops.ts`).toBeDefined();
    }
  });

  for (const [op, params] of Object.entries(used)) {
    const body = composing.has(op as Effect["op"]) ? WALK : (bodies[op] ?? "");
    for (const param of params) {
      const key = `${op}.${param}`;
      if (UNREAD.includes(key)) {
        it(`${key} — still unread, as UNREAD says`, () => {
          expect(
            mentions(body, param),
            `${key} is read now — take it off UNREAD so the list stays the backlog`,
          ).toBe(false);
        });
        continue;
      }
      const elsewhere = ELSEWHERE[key];
      it(`${key} is read${elsewhere ? ` in ${elsewhere}` : ""}`, () => {
        const text = elsewhere ? readFileSync(elsewhere, "utf8") : body;
        expect(
          mentions(text, param),
          `\`${param}\` on \`${op}\` is written by a card and read by nothing — the card says one thing and does another; read it, or list it in UNREAD as the gap it is`,
        ).toBe(true);
      });
    }
  }
});
