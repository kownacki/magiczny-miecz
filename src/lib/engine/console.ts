/** The test console's grammar: turning a typed line into something the store can carry out. */

import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import { FIELDS, type FieldId } from "./board";
import { findByName } from "./search";

/**
 * A tester's console, and why the game has one.
 *
 * The interface had grown a test button wherever a test needed one: a "weź" on
 * every card in the drawer, a "walcz" on every Wróg, a chip for every one of
 * the fifty-seven Obszary, a ± under every parameter, a way out of a fight in
 * the corner of a fight. Each was reasonable on its own and together they were
 * a second interface laid over the first, in the way of the game they existed
 * to test.
 *
 * A line of text costs nothing to add and nothing to look at. This is the
 * grammar half of it, kept pure — a line in, a command or a complaint out, no
 * database, no clock, no game — so the whole vocabulary can be tested the way
 * the rest of the engine is. Carrying a command out is `runCommand`'s job, and
 * it does it by calling the same functions the game does.
 *
 * English, alone among everything the app says. The rest is Polish because the
 * game is Polish and its players are; this is not part of the game, and the
 * words in it are the names of functions.
 */
export interface CommandSpec {
  name: string;
  aliases: string[];
  /** How to type it, for `help`. */
  usage: string;
  summary: string;
}

/** Which parameter a stat command moves. The column names, as the store knows them. */
export type StatName = "miecz" | "magia" | "zycie" | "zloto";

export type Command =
  | { kind: "help" }
  | { kind: "kill"; who: string | null }
  | { kind: "stat"; stat: StatName; delta: number; who: string | null }
  | { kind: "give"; cardId: string }
  | { kind: "go"; fieldId: FieldId }
  | { kind: "fight"; cardId: string }
  | { kind: "endfight" }
  | { kind: "endturn" }
  | { kind: "spell"; who: string | null };

const STATS: Record<string, StatName> = {
  sword: "miecz",
  miecz: "miecz",
  magic: "magia",
  magia: "magia",
  life: "zycie",
  zycie: "zycie",
  gold: "zloto",
  zloto: "zloto",
};

export const COMMANDS: CommandSpec[] = [
  { name: "help", aliases: ["?"], usage: "help", summary: "list these commands" },
  {
    name: "gold",
    aliases: ["sword", "magic", "life"],
    usage: "gold +5 [player]",
    summary: "move a parameter — gold, sword, magic, life — by a signed amount",
  },
  { name: "kill", aliases: [], usage: "kill [player]", summary: "take a character to 0 Życia (4.4)" },
  { name: "give", aliases: ["card"], usage: "give MAGICZNY MIECZ", summary: "put a card in a hand" },
  { name: "go", aliases: ["move"], usage: "go Karczma", summary: "stand on an Obszar" },
  { name: "fight", aliases: [], usage: "fight WILKOŁAK", summary: "pick a fight with a Wróg" },
  { name: "endfight", aliases: [], usage: "endfight", summary: "drop the fight without settling it" },
  { name: "endturn", aliases: ["pass"], usage: "endturn", summary: "hand the turn on" },
  { name: "spell", aliases: [], usage: "spell [player]", summary: "draw a Zaklęcie" },
];

/** Every card that can be fought: only a Wróg has a Miecz or a Magia to roll against. */
const FOES = (events as EventCard[]).filter((card) => card.cardClass === "wrog");
const CARDS = events as EventCard[];
const PLACES = [...FIELDS.values()];

/**
 * Reads one line.
 *
 * A leading slash is allowed and ignored — it is what a person types out of
 * habit, and refusing it would be pedantry. Everything is case-insensitive and
 * the rest of the line after the verb is one argument, so a card can be named
 * with the spaces it is printed with: `give magiczny miecz`.
 */
export function parseCommand(line: string): { ok: Command } | { error: string } {
  const trimmed = line.trim().replace(/^\//, "");
  if (trimmed === "") return { error: "Type a command, or `help`." };

  const [verb, ...rest] = trimmed.split(/\s+/);
  const word = verb.toLowerCase();
  const tail = rest.join(" ").trim();

  if (word === "help" || word === "?") return { ok: { kind: "help" } };

  if (word in STATS) {
    const [amount, ...who] = tail.split(/\s+/).filter(Boolean);
    if (!amount) return { error: `How much? ${usageOf("gold")}` };
    // A bare number is a gain, because "gold 5" plainly means five more of it.
    const delta = Number(amount.startsWith("+") ? amount.slice(1) : amount);
    if (!Number.isInteger(delta) || delta === 0) {
      return { error: `\`${amount}\` is not a whole number of points.` };
    }
    return { ok: { kind: "stat", stat: STATS[word], delta, who: who.join(" ") || null } };
  }

  if (word === "kill") return { ok: { kind: "kill", who: tail || null } };
  if (word === "spell") return { ok: { kind: "spell", who: tail || null } };
  if (word === "endfight") return { ok: { kind: "endfight" } };
  if (word === "endturn" || word === "pass") return { ok: { kind: "endturn" } };

  if (word === "give" || word === "card") {
    return name(CARDS, (card) => card.name, tail, "card", (card) => ({
      kind: "give",
      cardId: card.id,
    }));
  }

  if (word === "fight") {
    return name(FOES, (card) => card.name, tail, "Wróg", (card) => ({
      kind: "fight",
      cardId: card.id,
    }));
  }

  if (word === "go" || word === "move") {
    return name(PLACES, (field) => field.name, tail, "Obszar", (field) => ({
      kind: "go",
      fieldId: field.id,
    }));
  }

  return { error: `No command \`${word}\`. Type \`help\` for the list.` };
}

/** Resolves one name, or says why it could not. */
function name<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  query: string,
  what: string,
  build: (item: T) => Command,
): { ok: Command } | { error: string } {
  if (query === "") return { error: `Which ${what}?` };
  const hit = findByName(items, nameOf, query);
  if ("found" in hit) return { ok: build(hit.found) };
  if ("ambiguous" in hit) {
    return { error: `Which one — ${hit.ambiguous.slice(0, 6).join(", ")}?` };
  }
  return { error: `No ${what} called \`${query}\`.` };
}

function usageOf(command: string): string {
  return COMMANDS.find((spec) => spec.name === command)?.usage ?? command;
}

/** The list `help` prints, one command to a line. */
export function helpLines(): string[] {
  return COMMANDS.map((spec) => {
    const also = spec.aliases.length > 0 ? `  (also ${spec.aliases.join(", ")})` : "";
    return `${spec.usage.padEnd(24)} ${spec.summary}${also}`;
  });
}
