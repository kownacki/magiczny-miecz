import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isCardId, isCharacterId, isSpellId } from "@/data/ids";
import { asFieldId } from "./board";
import { classOf } from "./cards";
import { KARTY } from "./content/index";
import { isEventKarta, scriptsOf } from "./karta";
import { SCRIPTS } from "./cardScript";

/**
 * What one file per Karta promises, checked on every run.
 *
 * 1. The index is generated and current — the same bargain `ids.test.ts`
 *    makes: a stale index is a Karta the box has and the app cannot see.
 * 2. A Karta is data. Through JSON and back it is the same object, so no
 *    card is a function in a coat; that is what a builder writes and what a
 *    set loader reads (docs/KARTA.md §2).
 * 3. Its id is a real id of its kind, and its kind is what the deck says the
 *    card is — `czarodziej` is a Postać *and* a Nieznajomy, and a file that
 *    said otherwise would be a card the Księga files on the wrong shelf.
 * 4. The registry views agree with the files: what `SCRIPTS["eremita"]` says
 *    is what `content/stranger/eremita.ts` says.
 *
 * If the first fails: `node scripts/generate-cards.mjs`.
 */

const ROOT = "src/lib/engine/content";

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== "shared") out.push(...filesUnder(full));
    }
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && entry.name !== "index.ts") {
      out.push(full.slice(ROOT.length + 1).replace(/\.ts$/, ""));
    }
  }
  return out.sort();
}

describe("the generated index of Karty", () => {
  it("lists exactly the files under content/", () => {
    const imported = [...readFileSync(`${ROOT}/index.ts`, "utf8").matchAll(/from "\.\/([^"]+)"/g)]
      .map((match) => match[1])
      .sort();
    expect(imported, "run: node scripts/generate-cards.mjs").toEqual(filesUnder(ROOT));
  });

  it("names each Karta once per kind", () => {
    const seen = new Set<string>();
    for (const card of KARTY) {
      const key = `${card.kind}:${card.id}`;
      expect(seen.has(key), `${key} is in the index twice`).toBe(false);
      seen.add(key);
    }
  });
});

describe("every Karta", () => {
  for (const card of KARTY) {
    describe(`${card.kind}:${card.id}`, () => {
      it("is plain data, through JSON and back", () => {
        expect(JSON.parse(JSON.stringify(card))).toEqual(card);
      });

      it("has an id of its kind, and the deck's class for it", () => {
        if (card.kind === "spell") expect(isSpellId(card.id)).toBe(true);
        else if (card.kind === "character") expect(isCharacterId(card.id)).toBe(true);
        else if (card.kind === "field") expect(asFieldId(card.id)).not.toBeNull();
        else {
          expect(isCardId(card.id)).toBe(true);
          expect(classOf(card.id)).toBe(card.kind);
        }
      });

      it("is disposed of wherever it is resolved", () => {
        if (isEventKarta(card) && card.resolved) expect(card.disposition).toBeDefined();
      });
    });
  }
});

describe("the registries as views", () => {
  it("say about a moved Karta exactly what its file says", () => {
    for (const [id, script] of Object.entries(scriptsOf(KARTY))) {
      expect(SCRIPTS[id as keyof typeof SCRIPTS]).toEqual(script);
    }
  });
});
