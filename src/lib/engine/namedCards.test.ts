import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import items from "@/data/items.json";
import spells from "@/data/spells.json";
import { CARD_CLASS_LABEL } from "@/data/types";

/**
 * Where the rules know a Karta by name.
 *
 * A card is meant to say what it does in the vocabulary — an `Effect`, an
 * `Ability`, a `Use`, a `SpellScript` — and the engine is meant to read the
 * words and never the name. Where it reads the name instead, the card has a
 * rule nothing derived from the card can see: the WAMPIR's growth lives in
 * `spoils.ts` behind `includes("wampir")`, the TAJEMNA SAKWA's pocket in
 * `slots.ts` behind `"tajemna-sakwa"`, and `coverage.ts` reported both as
 * „aplikacja jej nie prowadzi" for weeks, because it derives its answer from
 * the registries and these two were in neither. `CARRIED_ELSEWHERE` is the
 * patch; this is the measurement the patch stands in for.
 *
 * The list below is every such site on 2026-09-13, frozen. It may shrink and
 * it may not grow: a new rule keyed on a card's name is a new escape from the
 * vocabulary, and docs/KARTA.md says what to write instead — a word on the
 * card, read at the one door where the rule lives. A site that closes is
 * removed from here in the same commit, the way `docCounts.test.ts` makes a
 * stale number fail rather than linger.
 *
 * Not every entry is a *rule*. The Karty Postaci's starting kit names four
 * Przedmioty because the printed card does; `slots.ts` says which Przedmiot
 * hangs where. Those are transcription that happens to sit in a `.ts` file
 * rather than a data table, and they close by moving, not by rewriting. The
 * list does not sort them — that is the work, and it is listed in
 * docs/KARTA.md — it only holds the line.
 *
 * Matched on the quoted literal, outside comments, the way `reachable.test.ts`
 * matches a branch and not a bare word: `"wampir"` in a line of code is the
 * engine naming the card; `wampir` in a sentence above it is somebody
 * explaining why.
 */

/** The files that are *allowed* to name cards: they are the content. */
const CONTENT = [
  /\.test\.tsx?$/,
  /\/engine\/scripts\//,
  /\/engine\/content\//,
  /\/engine\/karta\.ts$/,
  /\/engine\/abilities\.ts$/,
  /\/engine\/uses\.ts$/,
  /\/engine\/spells\.ts$/,
  /\/engine\/fieldScript\.ts$/,
  /\/engine\/characters\.ts$/,
  /\/engine\/coverage\.ts$/,
  /\/engine\/disabled\.ts$/,
  /\/engine\/cardScript\.ts$/,
  /\/engine\/polish\.ts$/,
  /\/engine\/lookup\.ts$/,
  /\/engine\/consoleCatalogue\.ts$/,
  /\/game\/fixture\.ts$/,
];

/**
 * Every site that named a card on the day this was written, by file.
 *
 * Two words are left out of the search rather than listed here as false
 * escapes. `demon` is both a Karta and a `CardClass`, and every `"demon"` in
 * the engine is the class — `case "demon":` in a switch over classes. `miecz`
 * is both a Karta and a stat, and every quoted `"miecz"` outside the content
 * is a key in `Pick<EventCard, "miecz" | "magia">`.
 */
const AMBIGUOUS = [...Object.keys(CARD_CLASS_LABEL), "miecz", "magia"];

const FROZEN: Readonly<Record<string, readonly string[]>> = {
  "src/lib/engine/cards.ts": ["przybysz-z-krainy-cieni", "sobowtor", "trogglowy-smok"],
  "src/lib/engine/slots.ts": [
    "bojowy-rumak",
    "magiczna-sakwa",
    "magiczny-miecz",
    "miecz-chaosu",
    "pierscien-mocy",
    "rozdzka-przeznaczenia",
    "rozdzka-zaklec",
    "swieta-wlocznia",
    "tajemna-sakwa",
    "talizman-ognia",
    "talizman-powietrza",
    "tarcza-boga-tolimana",
    "tarcza-tolimana",
    "topor-swiatla-i-ciemnosci",
  ],
  "src/lib/engine/stock.ts": ["magiczny-miecz", "tarcza-tolimana"],
  "src/lib/game/commands/draw.ts": ["rozdzka-zaklec"],
  "src/lib/game/commands/fight.ts": ["krag-plomieni"],
  "src/lib/game/commands/friends.ts": ["tarcza-tolimana"],
  "src/lib/game/commands/resolving.ts": ["uklad-planet"],
  "src/lib/game/commands/spells.ts": ["wladca-gromu", "wladca-zaklec", "zwierciadlo"],
  "src/lib/game/commands/spoils.ts": ["wampir"],
  "src/lib/game/turnStore.ts": ["magiczny-miecz", "tarcza-boga-tolimana", "tarcza-tolimana"],
};

const IDS = new Set<string>([
  ...(events as { id: string }[]).map((c) => c.id),
  ...(items as { id: string }[]).map((c) => c.id),
  ...(spells as { id: string }[]).map((c) => c.id),
]);
for (const word of AMBIGUOUS) IDS.delete(word);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** `file -> ids named in code`, for everything under the engine and the game. */
function namedToday(): Record<string, string[]> {
  const found: Record<string, Set<string>> = {};
  const files = [...sources("src/lib/engine"), ...sources("src/lib/game")].filter(
    (file) => !CONTENT.some((allowed) => allowed.test(file)),
  );
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      for (const match of line.matchAll(/"([a-z0-9-]+)"/g)) {
        if (IDS.has(match[1])) (found[file] ??= new Set()).add(match[1]);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(found)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, ids]) => [file, [...ids].sort()]),
  );
}

describe("the rules know a Karta by name only where they already did", () => {
  const today = namedToday();

  it("names no card the frozen list does not already name", () => {
    for (const [file, ids] of Object.entries(today)) {
      const allowed = FROZEN[file] ?? [];
      const fresh = ids.filter((id) => !allowed.includes(id));
      expect(
        fresh,
        `${file} names ${fresh.join(", ")} — a rule keyed on a card's name is an escape from the vocabulary; give the card a word and read the word (docs/KARTA.md)`,
      ).toEqual([]);
    }
  });

  it("still names every card the frozen list says it does", () => {
    for (const [file, ids] of Object.entries(FROZEN)) {
      const now = today[file] ?? [];
      const closed = ids.filter((id) => !now.includes(id));
      expect(
        closed,
        `${file} no longer names ${closed.join(", ")} — an escape was closed; take it off FROZEN so the list stays the measurement`,
      ).toEqual([]);
    }
  });
});
