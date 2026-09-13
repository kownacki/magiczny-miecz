/**
 * `ask` — what the box says about a name, without writing a throwaway script first.
 *
 *     npm run ask -- id czarodziej
 *     npm run ask -- card "kryształ magów"
 *     npm run ask -- character pustelnik
 *     npm run ask -- ability udzwig
 *
 * Why this exists, in one sentence: on 2026-09-05 a name read off a grep of
 * `abilities.ts` — which holds the encoded clauses of cards *and* of Postacie —
 * became "Rusałka is a Postać" in a design decision, and she is a Przyjaciel.
 * The id spaces overlap on purpose (`czarodziej` and `demon` each name a Karta
 * Postaci *and* a Karta Zdarzeń, pinned by `src/data/ids.test.ts`), so the only
 * safe answer to "what is this string" is *every* space that claims it.
 *
 * It reads the same modules the app reads — no second copy of a lookup, no
 * re-parsed JSON — so an answer here is the answer the engine would give.
 *
 * Language follows `src/cli/mm.ts`: prose is English because a developer reads
 * it, and everything printed on a component stays Polish because that is what
 * the thing is called. `Postać`, `Zaklęcie`, `Obszar` name kinds of thing and
 * stay too.
 */

import { readFileSync, readdirSync } from "node:fs";
import { argv } from "node:process";

import characters from "@/data/characters.json";
import events from "@/data/events.json";
import itemCards from "@/data/items.json";
import spellCards from "@/data/spells.json";
import { CARD_CLASS, CARD_CLASS_LABEL, type Character, type EventCard, type Item, type Spell } from "@/data/types";
import { isCardId, isCharacterId, type CardId, type CharacterId } from "@/data/ids";
import { ABILITIES, abilitiesOf, type Ability } from "@/lib/engine/abilities";
import { asFieldId, FIELDS, fieldByName } from "@/lib/engine/board";
import { classOf, numeralOf } from "@/lib/engine/cards";
import { SCRIPTS } from "@/lib/engine/cardScript";
import { asCharacterId, CHARACTER_ABILITIES, startingKit } from "@/lib/engine/characters";
import { COMMANDS } from "@/lib/engine/consoleSpec";
import { coverageOf, manualNote } from "@/lib/engine/coverage";
import { CHARACTER_POWERS_PARKED, parkedAbility, parkedCard } from "@/lib/engine/disabled";
import { cardIdNamed } from "@/lib/engine/lookup";
import { findByName, fold } from "@/lib/engine/search";
import { SPELLS } from "@/lib/engine/spells";
import { USES } from "@/lib/engine/uses";
import { FIELD_SCRIPTS } from "@/lib/engine/fieldScript";
import { everyNode } from "@/lib/engine/resolve";
import { OPS_IN_ORDER, WORDS, type Op } from "@/lib/engine/words";
import type { Effect } from "@/lib/engine/cardScript";

const EVENTS = events as EventCard[];
const ITEMS = itemCards as Item[];
const SPELL_CARDS = spellCards as Spell[];
const PEOPLE = characters as Character[];

/** Every Postać starts with four (4.2); nothing on a Karta Postaci varies it. */
const STARTING_LIFE = 4;
/** 3.2's single coin, which a Karta may override — `startingKit` says when. */
const DEFAULT_GOLD = 1;

const out: string[] = [];
const say = (...lines: string[]) => out.push(...(lines.length > 0 ? lines : [""]));

// ── shared bits ──────────────────────────────────────────────────────────────

/**
 * An `Ability` as one line: its kind, then whatever else it carries.
 *
 * Deliberately the raw shape rather than prose. `abilityText.ts` renders these
 * for players; the question here is what was *encoded*, and a paraphrase is the
 * thing that cannot be checked against `abilities.ts`.
 */
function abilityLine(ability: Ability): string {
  const { kind, ...rest } = ability as { kind: string } & Record<string, unknown>;
  const args = Object.entries(rest).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return args.length > 0 ? `${kind} ${args.join(" ")}` : kind;
}

function cardClassOf(cardId: CardId): string {
  const cardClass = classOf(cardId);
  if (!cardClass) return "—";
  return `${CARD_CLASS_LABEL[cardClass]} ${numeralOf(cardId)} (${cardClass}, sorts ${CARD_CLASS[cardClass]})`;
}

/**
 * A card name from any of the three decks resolved to its id.
 *
 * `cardIdNamed` first, because it is the console's own door and knows about
 * the printed duplicates; a bare id skips it.
 */
function toCardId(query: string): CardId | null {
  if (isCardId(query)) return query;
  const hit = cardIdNamed(query);
  if ("id" in hit) return hit.id;
  if ("candidates" in hit) {
    say(`ambiguous — did you mean: ${hit.candidates.join(", ")}`);
  }
  return null;
}

function toCharacterId(query: string): CharacterId | null {
  const direct = asCharacterId(query);
  if (direct) return direct;
  const hit = findByName(PEOPLE, (one) => one.name, query);
  if ("found" in hit) return hit.found.id;
  if ("ambiguous" in hit) say(`ambiguous — did you mean: ${hit.ambiguous.join(", ")}`);
  return null;
}

// ── ask id ───────────────────────────────────────────────────────────────────

/**
 * Every id space that claims a string, and the fact that more than one might.
 *
 * The whole point of the tool. `ids.ts` is five separate unions plus the board,
 * and nothing about a bare string says which of them it came out of — so this
 * asks all six and prints what each one answers, including the "no".
 */
function askId(query: string): void {
  const needle = query.trim();
  const claims: string[] = [];
  const misses: string[] = [];

  const person = PEOPLE.find((one) => one.id === needle);
  if (person && isCharacterId(needle)) {
    const start = fieldByName(person.start);
    claims.push(
      `Postać         ${person.name} · Miecz ${person.miecz} · Magia ${person.magia} · ` +
        `natura ${person.nature} · MGR ${person.start}${start ? ` (${start.id})` : " — not on the board!"}`,
    );
  } else misses.push("Postać");

  const event = EVENTS.find((one) => one.id === needle);
  if (event) {
    claims.push(
      `Karta Zdarzeń  ${event.name} · ${cardClassOf(event.id)}` +
        `${event.miecz !== undefined ? ` · Miecz ${event.miecz}` : ""}` +
        `${event.magia !== undefined ? ` · Magia ${event.magia}` : ""}`,
    );
  } else misses.push("Karta Zdarzeń");

  const item = ITEMS.find((one) => one.id === needle);
  if (item) {
    claims.push(
      `Przedmiot      ${item.name}` +
        `${item.miecz !== undefined ? ` · Miecz +${item.miecz}` : ""}` +
        `${item.magia !== undefined ? ` · Magia +${item.magia}` : ""}` +
        `${item.price !== undefined ? ` · ${item.price} Sz.Z.` : ""}` +
        `${item.magical ? " · Magiczny" : ""}`,
    );
  } else misses.push("Przedmiot");

  const spell = SPELL_CARDS.find((one) => one.id === needle);
  if (spell) claims.push(`Zaklęcie       ${spell.name}`);
  else misses.push("Zaklęcie");

  const fieldId = asFieldId(needle);
  const field = fieldId ? FIELDS.get(fieldId) : undefined;
  if (field) claims.push(`Obszar         ${field.name} · ${field.region}`);
  else misses.push("Obszar");

  if (claims.length === 0) {
    say(`${needle} — no id space claims this.`);
    return;
  }

  say(`${needle} — claimed by ${claims.length} of 5 id spaces`);
  for (const claim of claims) say(`  ${claim}`);
  say(`  not a: ${misses.join(", ")}`);

  // The trap the whole file was written for, said outright rather than left to
  // be noticed in a list. `ids.test.ts` pins these two pairs.
  if (person && event) {
    say();
    say(
      `  ⚠ BOTH a Postać and a Karta Zdarzeń. \`CharacterId\` and \`EventId\` both` +
        ` contain "${needle}"; which one a \`string\` meant is not recoverable from the string.`,
    );
    say(`    \`describeCard\`/\`card ${event.name}\` answers with the Postać — see lookup.ts's note on PEOPLE.`);
  }
  if (event && item) {
    say();
    say(`  note: the same card, printed twice (16.6) — the Wyposażenie sheet and the event deck share the id.`);
  }
}

// ── ask card ─────────────────────────────────────────────────────────────────

function askCard(query: string): void {
  const cardId = toCardId(query);
  if (!cardId) {
    say(`${query} — not a Karta in this box. Try \`ask id ${query}\`.`);
    return;
  }

  const event = EVENTS.find((one) => one.id === cardId);
  const item = ITEMS.find((one) => one.id === cardId);
  const spell = SPELL_CARDS.find((one) => one.id === cardId);
  const printed = event ?? item ?? spell;
  const copies = EVENTS.filter((one) => one.id === cardId).length;

  say(`${printed?.name ?? cardId}  (${cardId})`);
  say(`  class     ${cardClassOf(cardId)}`);
  say(
    `  decks     ${[event && `Zdarzenia${copies > 1 ? ` ×${copies}` : ""}`, item && "Wyposażenie", spell && "Zaklęcia"]
      .filter(Boolean)
      .join(" + ")}`,
  );
  if (event?.trophy !== undefined) say(`  trophy    ${event.trophy} (1.4)`);
  if (item?.forbiddenTo) say(`  forbidden ${item.forbiddenTo.join(", ")} (5.3)`);

  const text = printed?.text?.trim();
  say(`  text      ${text ? text.split("\n").join("\n            ") : "—"}`);

  const abilities = abilitiesOf(cardId);
  say(`  ABILITIES${abilities.length === 0 ? " —" : ""}`);
  for (const ability of abilities) say(`            · ${abilityLine(ability)}`);

  say(`  SCRIPTS   ${cardId in SCRIPTS ? "yes" : "—"}`);
  say(`  USES      ${cardId in USES ? "yes" : "—"}`);
  say(`  SPELLS    ${cardId in SPELLS ? "yes" : "—"}`);
  say(`  coverage  ${coverageOf(cardId)}`);
  say(`  manual    ${manualNote(cardId) ?? "—"}`);
  say(`  parked    ${parkedCard(cardId) ?? "—"}`);

  // A Postać of the same name is the one thing a reader of this page can get
  // wrong without noticing, so it is said here too.
  if (isCharacterId(cardId)) {
    say();
    say(`  ⚠ "${cardId}" is ALSO a Karta Postaci. \`ask character ${cardId}\` for that one.`);
  }
}

// ── ask character ────────────────────────────────────────────────────────────

function askCharacter(query: string): void {
  const characterId = toCharacterId(query);
  if (!characterId) {
    say(`${query} — not a Karta Postaci in this box. Try \`ask id ${query}\`.`);
    return;
  }
  const person = PEOPLE.find((one) => one.id === characterId)!;
  const start = fieldByName(person.start);
  const kit = startingKit(characterId);

  say(`${person.name}  (${characterId})`);
  say(
    `  natura ${person.nature} · Miecz ${person.miecz} · Magia ${person.magia} · ` +
      `Życie ${STARTING_LIFE} (4.2) · Złoto ${kit.gold ?? DEFAULT_GOLD}${kit.gold === undefined ? " (3.2)" : ""}`,
  );
  say(`  MGR    ${person.start}${start ? ` → ${start.id}` : "  — not on the board!"}`);
  say(
    `  kit    ${[kit.items && `items ${kit.items.join(", ")}`, kit.spells && `${kit.spells} Zaklęcia`]
      .filter(Boolean)
      .join(" · ") || "—"}`,
  );

  // Numbered, because the index *is* the identity: `LIVE_ABILITIES` keys on it
  // and a wrong one dimmed the wrong sentence on seven Kartas once already.
  say(`  clauses (index is what LIVE_ABILITIES keys on)`);
  person.abilities.forEach((clause, index) => {
    const state = parkedAbility(characterId, index) ? "parked" : "live  ";
    say(`    [${index}] ${state} ${clause.split("\n").join(" ")}`);
  });
  if (CHARACTER_POWERS_PARKED) {
    say(`    (CHARACTER_POWERS_PARKED is true — everything outside the starting kit is parked wholesale)`);
  }

  const encoded = CHARACTER_ABILITIES[characterId] ?? [];
  say(`  CHARACTER_ABILITIES${encoded.length === 0 ? " —" : ""}`);
  for (const ability of encoded) say(`    · ${abilityLine(ability)}`);
  if (encoded.length > 0 && CHARACTER_POWERS_PARKED) {
    say(`    (encoded, but \`abilitiesOfCharacter\` returns nothing while the powers are parked)`);
  }
}

// ── ask ability ──────────────────────────────────────────────────────────────

const ABILITIES_FILE = "src/lib/engine/abilities.ts";

/** Every `.ts`/`.tsx` under `src`, minus the tests — `reachable.test.ts`'s walk. */
function sources(dir = "src", tests = false): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...sources(path, tests));
    else if (/\.tsx?$/.test(entry.name) && (tests || !/\.test\.tsx?$/.test(entry.name))) found.push(path);
  }
  return found;
}

/** The vocabulary itself, parsed off the union so a kind nothing prints is still known. */
function everyKind(): string[] {
  const source = readFileSync(ABILITIES_FILE, "utf8");
  return [...new Set([...source.matchAll(/\|\s*\{\s*kind:\s*"([^"]+)"/g)].map((m) => m[1]))].sort();
}

/**
 * Which files branch on a kind — the question `reachable.test.ts` asks, asked
 * of one kind at a time.
 *
 * Same discipline as the test, and for the same reason: match the *branch*, never
 * the bare name, or the literal that declares the ability vouches for itself.
 * Imports are stripped whole because they span lines.
 */
function readersOf(kind: string): string[] {
  const branch = new RegExp(`kind\\s*(===|!==)\\s*"${kind}"|case\\s*"${kind}"`);
  const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
  return sources().filter((path) => {
    const text = readFileSync(path, "utf8")
      .replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?/gm, "")
      .replace(/^export\s*(?:\{[\s\S]*?\}|\*)\s*from\s+["'][^"']+["'];?/gm, "");
    return text.split("\n").some((line) => !isComment(line) && branch.test(line));
  });
}

function askAbility(query: string): void {
  const kinds = everyKind();
  const kind = kinds.includes(query) ? query : kinds.find((one) => fold(one).startsWith(fold(query)));
  if (!kind) {
    say(`${query} — no such Ability kind. The vocabulary is:`);
    say(`  ${kinds.join(", ")}`);
    return;
  }

  say(`${kind}`);

  const cards = (Object.keys(ABILITIES) as CardId[])
    .filter((cardId) => (ABILITIES[cardId] ?? []).some((one) => one.kind === kind))
    .sort();
  say(`  cards (${cards.length})`);
  for (const cardId of cards) {
    for (const ability of (ABILITIES[cardId] ?? []).filter((one) => one.kind === kind)) {
      say(`    ${cardId.padEnd(22)} ${abilityLine(ability)}`);
    }
  }

  const people = (Object.keys(CHARACTER_ABILITIES) as CharacterId[])
    .filter((id) => (CHARACTER_ABILITIES[id] ?? []).some((one) => one.kind === kind))
    .sort();
  say(`  Postacie (${people.length})`);
  for (const id of people) {
    for (const ability of (CHARACTER_ABILITIES[id] ?? []).filter((one) => one.kind === kind)) {
      say(`    ${id.padEnd(22)} ${abilityLine(ability)}`);
    }
  }

  const readers = readersOf(kind);
  say(`  read by (${readers.length})`);
  for (const path of readers) say(`    ${path}`);
  if (readers.length === 0) {
    say(`    ⚠ nothing branches on it — a transcribed clause the app silently drops.`);
  }
}

// ── ask where ────────────────────────────────────────────────────────────────

/**
 * "I have a word — where is it?"
 *
 * `WHERE.md` answers the other question, "to add X, touch these files in this
 * order", and cannot answer this one: a recipe is written per *kind of thing*,
 * and the thing you have is a noun off a card or out of a conversation. The
 * fallback was `grep -rn fight src`, which returns two hundred lines in file
 * order — the fourth mention inside a test ranked exactly like the exported
 * function that does the work.
 *
 * Nothing here is a hand-written map of concept → files, on purpose: an index
 * maintained by hand is the kind of prose this repo has already had to go back
 * and fix twice. Everything below is read off the tree at the moment you ask —
 * `export` lines for the symbols, `SPECS` for the verbs, `WHERE.md`'s own `##`
 * headings for the recipes — so a file renamed this morning answers correctly
 * this afternoon and a stale answer is not a thing that can happen.
 */

const WHERE_DOC = "docs/WHERE.md";

/**
 * The stem a word is allowed to be recognised by.
 *
 * Two characters off the end, never below four, because both languages in this
 * repo inflect: `parked` has to reach `Parking a card`, and `przeprawa` has to
 * reach `przeprawy` and `Przeprawę`. Trimming is what makes a Polish noun
 * findable at all — `fieldNamed` and the console can afford exact names because
 * a name is printed on a component, and a *concept* never is.
 */
function stemOf(needle: string): string {
  return needle.slice(0, Math.max(4, needle.length - 2));
}

/**
 * How well one word answers one needle: 1 exact, 0.8 prefix, 0.5 same stem.
 *
 * Three tiers rather than a boolean, so the stem — which is the loose one, and
 * the one that lets `status` reach `state` — can never outrank a real name.
 */
function wordScore(word: string, needle: string): number {
  const one = fold(word);
  if (one === needle) return 1;
  if (one.startsWith(needle)) return 0.8;
  const stem = stemOf(needle);
  return one.startsWith(stem) ? 0.5 : 0;
}

/** An identifier or a sentence as the words in it: camelCase, SNAKE_CASE, kebab and prose alike. */
function wordsIn(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}]+|(?<=\p{Ll})(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u)
    .filter((one) => one.length > 0);
}

/** The best any one word of a phrase manages against any one needle. */
function phraseScore(text: string, needles: string[]): number {
  const parts = wordsIn(text);
  const whole = Math.max(0, ...needles.map((needle) => wordScore(text, needle)));
  const inside = Math.max(0, ...parts.flatMap((word) => needles.map((needle) => wordScore(word, needle))));
  // A word found *inside* a name is worth a little less than the whole name
  // being it: `payFerry` answers "ferry", but `ferry` answers it better.
  return Math.max(whole, inside * 0.85);
}

/** Comments count, but less — a mention in prose is a lead, a mention in code is a fact. */
function bodyScore(text: string, needles: string[]): { score: number; mentions: number } {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const weigh = (source: string, factor: number) => {
    let score = 0;
    let mentions = 0;
    for (const word of wordsIn(source)) {
      const hit = Math.max(0, ...needles.map((needle) => wordScore(word, needle)));
      if (hit > 0) {
        score += hit * factor;
        mentions += 1;
      }
    }
    return { score, mentions };
  };
  const inCode = weigh(code, 1);
  const all = weigh(text, 1);
  return { score: inCode.score + (all.score - inCode.score) * 0.3, mentions: all.mentions };
}

type Area = "engine" | "commands" | "elsewhere" | "tests";

/**
 * Where a file sits and what a match there is worth.
 *
 * The whole ranking, in one place. An exported name in the pure engine is the
 * best answer the tree can give; the same name in a `page.tsx` is a caller.
 * Tests are kept and demoted rather than dropped, because "which test would
 * break" is a real question — just never the first one.
 */
function areaOf(path: string): { area: Area; weight: number } {
  const test = /\.test\.tsx?$/.test(path);
  const base = path.startsWith("src/lib/engine/")
    ? 1.3
    : path.startsWith("src/lib/game/commands/")
      ? 1.2
      : path.startsWith("src/lib/game/")
        ? 1.1
        : path.startsWith("src/lib/")
          ? 1
          : path.startsWith("src/cli/")
            ? 0.9
            : path.startsWith("src/app/api/")
              ? 0.85
              : 0.7;
  if (test) return { area: "tests", weight: base * 0.6 };
  if (path.startsWith("src/lib/engine/")) return { area: "engine", weight: base };
  if (path.startsWith("src/lib/game/commands/")) return { area: "commands", weight: base };
  return { area: "elsewhere", weight: base };
}

const EXPORTED = /^export\s+(?:async\s+)?(?:declare\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;

interface FileHit {
  path: string;
  area: Area;
  score: number;
  symbols: string[];
  mentions: number;
}

function filesMatching(needles: string[]): FileHit[] {
  const hits: FileHit[] = [];
  for (const path of sources("src", true)) {
    const text = readFileSync(path, "utf8");
    const { area, weight } = areaOf(path);

    const symbols: { name: string; line: number; score: number }[] = [];
    text.split("\n").forEach((line, index) => {
      const name = EXPORTED.exec(line)?.[1];
      if (!name) return;
      const score = phraseScore(name, needles);
      if (score > 0) symbols.push({ name, line: index + 1, score });
    });
    symbols.sort((a, b) => b.score - a.score || a.line - b.line);

    const best = symbols[0]?.score ?? 0;
    const file = phraseScore(path.split("/").pop()!.replace(/\.(test\.)?tsx?$/, ""), needles);
    const body = bodyScore(text, needles);
    const score = (best * 100 + file * 70 + Math.min(body.score, 14) * 2.5) * weight;
    if (score < 15) continue;

    hits.push({
      path,
      area,
      score,
      symbols: symbols.slice(0, 3).map((one) => `${one.name}:${one.line}`),
      mentions: body.mentions,
    });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/**
 * The verbs whose name, alias, usage or summary answers.
 *
 * The most useful single line the tool can print, because a match here means the
 * thing can be *driven* — `npm run mm`, one word, no file opened at all. It is
 * also the only place the two languages meet: `SPECS` writes English names over
 * Polish summaries, so "przeprawa" finds `ferry` here and nowhere else.
 */
function verbsMatching(needles: string[]) {
  return COMMANDS.map((spec) => {
    const named = Math.max(phraseScore(spec.name, needles), ...spec.aliases.map((one) => phraseScore(one, needles)));
    const said = Math.max(phraseScore(spec.usage, needles), phraseScore(spec.summary, needles));
    return { spec, score: Math.max(named, said * 0.6) };
  })
    .filter((one) => one.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function verbLine(spec: (typeof COMMANDS)[number]): string {
  const called = `${spec.name}${spec.aliases.length > 0 ? ` (${spec.aliases.join(", ")})` : ""}`;
  return `  ${called.padEnd(20)} ${spec.usage.padEnd(26)} ${spec.summary}`;
}

/** WHERE.md's own `##` headings, read out of the file rather than copied into one here. */
function recipesMatching(needles: string[]): string[] {
  let text: string;
  try {
    text = readFileSync(WHERE_DOC, "utf8");
  } catch {
    return [];
  }
  const lines = text.split("\n");
  const starts = lines.flatMap((line, index) => (/^## /.test(line) ? [{ heading: line.slice(3).trim(), index }] : []));

  return starts
    .map((start, nth) => {
      const body = lines.slice(start.index, starts[nth + 1]?.index ?? lines.length).join("\n");
      const score = phraseScore(start.heading, needles) + Math.min(bodyScore(body, needles).score, 6) * 0.05;
      return { start, score };
    })
    .filter((one) => one.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ start }) => `  ${WHERE_DOC}:${start.index + 1}  ${start.heading}`);
}

/** A word that is also a name printed on a component — said in one line, and handed to `ask id`. */
function boxMatching(needles: string[]): string[] {
  const named = <T,>(items: readonly T[], idOf: (one: T) => string, nameOf: (one: T) => string) =>
    items
      .filter((one) => phraseScore(idOf(one), needles) >= 0.8 || phraseScore(nameOf(one), needles) >= 0.8)
      .map(idOf)
      .slice(0, 4);

  const found: string[] = [
    ...named(PEOPLE, (one) => one.id, (one) => one.name),
    ...named(EVENTS, (one) => one.id, (one) => one.name),
    ...named(ITEMS, (one) => one.id, (one) => one.name),
    ...named(SPELL_CARDS, (one) => one.id, (one) => one.name),
    ...named([...FIELDS.values()], (one) => one.id, (one) => one.name),
  ];
  const ids = [...new Set(found)].slice(0, 5);
  return ids.length === 0 ? [] : [`  also a name in the box: ${ids.join(", ")} — \`ask id ${ids[0]}\``];
}

function askWhere(query: string): void {
  const needles = query
    .split(/\s+/)
    .map(fold)
    .filter((one) => one.length >= 3);
  if (needles.length === 0) {
    say(`${query} — too short to look for. Two letters match everything.`);
    return;
  }

  const sections: { title: string; lines: string[] }[] = [];
  const verbs = verbsMatching(needles);
  if (verbs.length > 0) {
    sections.push({ title: "console  (you can drive this from `npm run mm`)", lines: verbs.map((one) => verbLine(one.spec)) });
  }

  /**
   * The best verb's own name joins the search.
   *
   * Half the vocabulary of this repo is Polish on the cards and English in the
   * code, and a word from one side finds nothing on the other: "przeprawa"
   * appears three times under `src/lib/game/commands/` and `payFerry` appears
   * in none of them. `SPECS` is the one table that carries both, so the verb it
   * matched is used as a second needle — derived, not translated by hand.
   */
  const alsoBy = verbs
    .slice(0, 1)
    .map((one) => fold(one.spec.name))
    .filter((one) => !needles.includes(one));
  const files = filesMatching([...needles, ...alsoBy]);

  const width = Math.min(52, Math.max(24, ...files.slice(0, 20).map((one) => one.path.length + 1)));
  const section = (area: Area, title: string, cap: number) => {
    const mine = files.filter((one) => one.area === area);
    const floor = Math.max(15, (mine[0]?.score ?? 0) * 0.3);
    const lines = mine
      .filter((one) => one.score >= floor)
      .slice(0, cap)
      .map((one) => `  ${one.path.padEnd(width)}${one.symbols.join("  ") || `${one.mentions} mentions`}`);
    if (lines.length > 0) sections.push({ title, lines });
  };

  section("engine", "engine", 4);
  section("commands", "commands", 4);
  section("elsewhere", "elsewhere", 3);
  section("tests", "tests", 3);

  const recipes = recipesMatching(needles);
  if (recipes.length > 0) sections.push({ title: "recipe", lines: recipes });
  const box = boxMatching(needles);
  if (box.length > 0) sections.push({ title: "box", lines: box });

  if (sections.length === 0) {
    say(`${query} — nothing under src/ is named after it or says it. Not a word this codebase uses.`);
    return;
  }

  say(`${query} — where it lives${alsoBy.length > 0 ? `  (and \`${alsoBy.join("`, `")}\`, off the console verb)` : ""}`);
  // Said out loud, because the difference is invisible from the answer and a
  // reader who does not know it will take a partial answer for a whole one.
  say(`(declarations and files that say the word — for every *use*, \`ask readers ${query}\`)`);
  for (const one of sections) {
    say("");
    say(one.title);
    say(...one.lines);
  }
}

// ── ask readers ──────────────────────────────────────────────────────────────

/**
 * "I have a name — who touches it?"
 *
 * The other half of `ask where`, and the half that was missing when it mattered.
 * `where` indexes **declarations** (see `EXPORTED`), so it answers "where does
 * this live" and cannot answer "who reads this" — and the difference is not
 * academic. A session hunting the readers of `resolved` asked `ask where
 * resolved`, was handed `leavesWhenResolved`, `resolveDrawnCard` and
 * `markResolved`, and moved on satisfied. The five readers that were actually
 * wrong are called none of those things: they say `resolved.includes(...)` in
 * files whose exports mention nothing of the sort.
 *
 * The tool did not fail to find them, which would have been loud. It found
 * three other things, which was quiet — and a tool that quietly under-answers
 * is worse than one that is not there, because the answer gets believed.
 *
 * So this greps the identifier as a whole word, drops imports and comments —
 * neither is a reader — and marks the lines that *declare* it, so the answer
 * reads as "here is where it is made, and here is everywhere it is used".
 * Same grouping as `where`, tests kept and last: "which test would break" is a
 * real question, just never the first one.
 */
function askReaders(query: string): void {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = new RegExp(`\\b${escaped}\\b`);
  const declares = new RegExp(
    `^\\s*(?:export\\s+)?(?:async\\s+)?(?:function|const|let|var|class|interface|type|enum)\\s+${escaped}\\b`,
  );
  const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
  const isImport = (line: string) => /^\s*(import|export)\s/.test(line);

  const hits = new Map<Area, string[]>();
  let made = 0;
  for (const path of sources("src", true)) {
    const here: string[] = [];
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, at) => {
        if (!word.test(line) || isComment(line) || isImport(line)) return;
        const mint = declares.test(line);
        if (mint) made += 1;
        here.push(`  ${path}:${at + 1}${mint ? "  ·declares" : ""}`);
        here.push(`      ${line.trim().slice(0, 96)}`);
      });
    if (here.length === 0) continue;
    const { area } = areaOf(path);
    hits.set(area, [...(hits.get(area) ?? []), ...here]);
  }

  if (hits.size === 0) {
    say(`${query} — nothing under src/ uses that word.`, "", `next: ask where ${query}`);
    return;
  }

  const total = [...hits.values()].reduce((sum, lines) => sum + lines.length, 0) / 2;
  say(`${query} — who touches it  (${total} lines, ${made} of them a declaration)`);
  for (const area of ["engine", "commands", "elsewhere", "tests"] as Area[]) {
    const lines = hits.get(area);
    if (!lines) continue;
    say("");
    say(area);
    // Capped per area rather than overall, so a word with two hundred test
    // mentions cannot push the engine's four off the bottom of the answer.
    say(...lines.slice(0, 40));
    if (lines.length > 40) say(`  … and ${(lines.length - 40) / 2} more in ${area}`);
  }
}

// ── ask what ─────────────────────────────────────────────────────────────────

/** A name typed with no verb: say which verb would answer it, rather than refusing. */
function askAnything(query: string): void {
  askId(query);
  say();
  const asCard = isCardId(query) || "id" in cardIdNamed(query);
  const asPerson = toCharacterId(query) !== null;
  // `where` is offered unconditionally: it is the one verb that answers for a
  // word the box has never heard of, which is exactly when the others say no.
  say(
    `next: ${[asCard && `ask card ${query}`, asPerson && `ask character ${query}`, `ask where ${query}`]
      .filter(Boolean)
      .join("  ·  ")}`,
  );
}

// ── ask slowo ────────────────────────────────────────────────────────────────

const OPS_FILE = "src/lib/game/commands/ops.ts";
const WALK_FILE = "src/lib/game/commands/effects.ts";
const TEXT_FILE = "src/lib/engine/effectText.ts";

/** The first line in a file that matches, as `path:line`, or null. */
function lineOf(path: string, pattern: RegExp): string | null {
  const lines = readFileSync(path, "utf8").split("\n");
  const at = lines.findIndex((line) => pattern.test(line));
  return at === -1 ? null : `${path}:${at + 1}`;
}

/** Every encoded effect in the box with the name of what carries it. */
function corpus(): { owner: string; effect: Effect }[] {
  const roots: { owner: string; effect: Effect }[] = [];
  for (const [id, script] of Object.entries(SCRIPTS)) {
    if (!script) continue;
    roots.push({ owner: id, effect: script.effect });
    if (script.placed) roots.push({ owner: `${id} (placed)`, effect: script.placed });
    if (script.przegrana) roots.push({ owner: `${id} (przegrana)`, effect: script.przegrana });
  }
  for (const [id, spell] of Object.entries(SPELLS)) {
    if (spell.stosuje) roots.push({ owner: `${id} (Zaklęcie)`, effect: spell.stosuje });
  }
  for (const [id, field] of Object.entries(FIELD_SCRIPTS)) {
    field?.offers.forEach((offer) =>
      roots.push({ owner: `${id} (Obszar: ${offer.name})`, effect: offer.effect }),
    );
  }
  return roots;
}

/**
 * One word of the card vocabulary: its fields, its shape, where it runs, where
 * it is said, and who in the box speaks it.
 *
 * Read off `WORDS`, which is the one table every other reader of the
 * vocabulary is built on (docs/KARTA.md) — so this is the builder's menu
 * printed out, not a paraphrase of it.
 */
function askWord(query: string): void {
  const needle = fold(query.trim());
  const op =
    OPS_IN_ORDER.find((one) => fold(one) === needle) ??
    OPS_IN_ORDER.find((one) => fold(one).startsWith(needle));
  if (!op) {
    say(`no word \`${query}\` in the vocabulary. The words are:`, "");
    say(...OPS_IN_ORDER.map((one) => `  ${one}${WORDS[one].sklada ? "  (składa)" : ""}`));
    return;
  }
  const word = WORDS[op as Op];
  const fields = Object.keys(word.pola);
  say(`${op} — ${word.sklada ? "a shape the walk descends through" : "a thing that happens"}`, "");
  say(`fields      ${fields.length > 0 ? fields.join(", ") : "(none)"}`);
  say(
    `runs in     ${
      word.sklada
        ? `${WALK_FILE} (the walk)`
        : (lineOf(OPS_FILE, new RegExp(`^  "?${op}"?: `)) ?? `${OPS_FILE} — not found`)
    }`,
  );
  const said = lineOf(TEXT_FILE, new RegExp(`^    case "${op}":`));
  say(`said in     ${said ?? `${TEXT_FILE} — not found`}`);

  const speakers = corpus()
    .filter(({ effect }) => everyNode(effect).some((node) => node.op === op))
    .map(({ owner }) => owner);
  say("", `spoken by   ${speakers.length} ${speakers.length === 1 ? "card" : "cards"}`);
  for (const owner of speakers.slice(0, 8)) say(`  ${owner}`);
  if (speakers.length > 8) say(`  … and ${speakers.length - 8} more`);

  const example = corpus()
    .flatMap(({ owner, effect }) => everyNode(effect).map((node) => ({ owner, node })))
    .find(({ node }) => node.op === op);
  if (example) {
    say("", `example     (${example.owner})`);
    say(...JSON.stringify(example.node, null, 2).split("\n").map((line) => `  ${line}`));
  }
}

const USAGE = [
  "ask — what the box says about a name.",
  "",
  "  ask id <string>          every id space that claims it (Postać, Zdarzenie, Przedmiot, Zaklęcie, Obszar)",
  "  ask card <id|name>       class, printed text, ABILITIES, SCRIPTS/USES/SPELLS, coverage, parked",
  "  ask character <id|name>  parameters, MGR, kit, printed clauses numbered, CHARACTER_ABILITIES",
  "  ask ability <kind>       every card and Postać that prints it, and what reads it",
  "  ask slowo <op>           one word of the card vocabulary: fields, shape, where it runs, who speaks it",
  "  ask where <thing>        which files own a concept: console verb, engine, commands, tests, recipe",
  "  ask readers <name>       every line that uses an identifier — the question `where` cannot answer",
  "  ask <string>             id, plus which of the above would answer",
  "",
  "Names are matched the way the console matches them: case- and diacritic-insensitive",
  "(`kryształ magów` = `krysztal magow`), exact first, then prefix.",
];

function main(): void {
  const [verb, ...rest] = argv.slice(2);
  const query = rest.join(" ").trim();

  if (!verb) {
    say(...USAGE);
  } else if (verb === "id" && query) askId(query);
  else if (verb === "card" && query) askCard(query);
  else if (verb === "character" && query) askCharacter(query);
  else if (verb === "ability" && query) askAbility(query);
  else if (verb === "slowo" && query) askWord(query);
  else if (verb === "where" && query) askWhere(query);
  else if (verb === "readers" && query) askReaders(query);
  else if (["id", "card", "character", "ability", "slowo", "where", "readers"].includes(verb)) {
    say(`\`ask ${verb}\` needs something to look up.`, "", ...USAGE);
  } else askAnything([verb, query].filter(Boolean).join(" "));

  console.log(out.join("\n"));
}

main();
