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
import { coverageOf, manualNote } from "@/lib/engine/coverage";
import { CHARACTER_POWERS_PARKED, parkedAbility, parkedCard } from "@/lib/engine/disabled";
import { cardIdNamed } from "@/lib/engine/lookup";
import { findByName, fold } from "@/lib/engine/search";
import { SPELLS } from "@/lib/engine/spells";
import { USES } from "@/lib/engine/uses";

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
function sources(dir = "src"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...sources(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(path);
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

// ── ask what ─────────────────────────────────────────────────────────────────

/** A name typed with no verb: say which verb would answer it, rather than refusing. */
function askAnything(query: string): void {
  askId(query);
  say();
  const asCard = isCardId(query) || "id" in cardIdNamed(query);
  const asPerson = toCharacterId(query) !== null;
  say(
    `next: ${[asCard && `ask card ${query}`, asPerson && `ask character ${query}`].filter(Boolean).join("  ·  ") || "—"}`,
  );
}

const USAGE = [
  "ask — what the box says about a name.",
  "",
  "  ask id <string>          every id space that claims it (Postać, Zdarzenie, Przedmiot, Zaklęcie, Obszar)",
  "  ask card <id|name>       class, printed text, ABILITIES, SCRIPTS/USES/SPELLS, coverage, parked",
  "  ask character <id|name>  parameters, MGR, kit, printed clauses numbered, CHARACTER_ABILITIES",
  "  ask ability <kind>       every card and Postać that prints it, and what reads it",
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
  else if (["id", "card", "character", "ability"].includes(verb)) {
    say(`\`ask ${verb}\` needs something to look up.`, "", ...USAGE);
  } else askAnything([verb, query].filter(Boolean).join(" "));

  console.log(out.join("\n"));
}

main();
