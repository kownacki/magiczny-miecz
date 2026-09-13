/**
 * `card` — play one Karta out loud, against a table built from the command line.
 *
 *     npm run card -- try sztukmistrz --gold 3 --magic 4 --answers 0
 *     npm run card -- try eremita --dice 3
 *     npm run card -- try eremita --lying --answers 0
 *     npm run card -- try jednorozec --answers 0 --destination pustelnia
 *     npm run card -- examples sztukmistrz
 *
 * The same harness `examples.test.ts` runs every card's own examples through
 * (`commands/examples.ts`), without the `expect`: it prints what the Karta
 * said, what it is still waiting on, and the seat before and after. This is
 * `karta try` from docs/KARTA.md — a builder's first tool, and the one to
 * reach for before writing an example down.
 *
 * Offline and on a fixture, not on a saved table: `mm` is where a Karta is
 * dealt into a running game (`testmode on`, `dice`, `deal`, `answer`).
 */

import { argv } from "node:process";
import { isCardId, type CardId } from "@/data/ids";
import { asFieldId } from "@/lib/engine/board";
import { scriptFor, type Example } from "@/lib/engine/cardScript";
import { cardIdNamed } from "@/lib/engine/lookup";
import { cardName } from "@/lib/engine/polish";
import { mismatches, playExample, type Played } from "@/lib/game/commands/examples";
import type { Snapshot } from "@/lib/game/change";

const USAGE = [
  "card — play one Karta out loud, on a table built from the flags.",
  "",
  "  card try <id|name> [flags]   play it once and say what happened",
  "  card examples <id|name>      play every example written on the Karta",
  "",
  "flags: --gold N --life N --sword N --magic N --nature good|evil|chaotic",
  "       --items a,b --friends a,b --spells N   the seat before",
  "       --lying                                the Karta is found, not drawn (15.1)",
  "       --dice 3,4 --answers 0,1 --destination <field>",
];

function toCardId(query: string): CardId | null {
  if (isCardId(query)) return query;
  const hit = cardIdNamed(query);
  if ("id" in hit) return hit.id;
  if ("candidates" in hit) console.log(`ambiguous — did you mean: ${hit.candidates.join(", ")}`);
  return null;
}

/** `--name value` pairs and bare `--flag`s, in one pass. */
function flagsOf(args: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at];
    if (!arg.startsWith("--")) continue;
    const next = args[at + 1];
    if (next === undefined || next.startsWith("--")) out[arg.slice(2)] = true;
    else {
      out[arg.slice(2)] = next;
      at += 1;
    }
  }
  return out;
}

const numbers = (value: string | true | undefined): number[] | undefined =>
  typeof value === "string" ? value.split(",").map(Number) : undefined;
const number = (value: string | true | undefined): number | undefined =>
  typeof value === "string" ? Number(value) : undefined;
const ids = (value: string | true | undefined): CardId[] | undefined =>
  typeof value === "string"
    ? value.split(",").map((one) => toCardId(one.trim())).filter((one): one is CardId => one !== null)
    : undefined;

function exampleFrom(flags: Record<string, string | true>): Example {
  const destination = typeof flags.destination === "string" ? asFieldId(flags.destination) : null;
  const nature = flags.nature;
  return {
    name: "from the command line",
    given: {
      gold: number(flags.gold),
      life: number(flags.life),
      sword: number(flags.sword),
      magic: number(flags.magic),
      ...(nature === "good" || nature === "evil" || nature === "chaotic" ? { nature } : {}),
      items: ids(flags.items),
      friends: ids(flags.friends),
      spells: number(flags.spells),
    },
    ...(flags.lying ? { lying: true as const } : {}),
    dice: numbers(flags.dice),
    answers: numbers(flags.answers),
    ...(destination ? { destination } : {}),
    expect: {},
  };
}

function seatLine(table: Snapshot): string {
  const seat = table.seats[0];
  const held = (kind: string) =>
    table.holdings
      .filter((row) => row.seat_id === seat.id && row.kind === kind)
      .map((row) => cardName(row.card_id))
      .join(", ");
  return (
    `Miecz ${seat.sword_own}  Magia ${seat.magic_own}  Życie ${seat.life}  Złoto ${seat.gold}  ` +
    `Natura ${seat.nature}  Obszar ${seat.field_id}\n` +
    `    Przedmioty: ${held("item") || "—"}   Przyjaciele: ${held("friend") || "—"}   Zaklęcia: ${held("spell") || "—"}`
  );
}

function report(cardId: CardId, played: Played): void {
  console.log(`${cardName(cardId)}`);
  console.log(`  before  ${seatLine(played.before)}`);
  for (const line of played.said) console.log(`  › ${line}`);
  if (played.waitingOn) console.log(`  … still waiting on: ${played.waitingOn}`);
  if (played.unused.length > 0) console.log(`  … answers never asked for: ${played.unused.join(", ")}`);
  console.log(`  after   ${seatLine(played.after)}`);
  const lying = played.after.fieldCards.map((row) => `${cardName(row.card_id)} on ${row.field_id}`);
  if (lying.length > 0) console.log(`  lying   ${lying.join("; ")}`);
}

async function main(): Promise<void> {
  const [verb, query, ...rest] = argv.slice(2);
  if (!verb || !query) {
    console.log(USAGE.join("\n"));
    return;
  }
  const cardId = toCardId(query);
  if (!cardId) {
    console.log(`no such Karta: ${query}`);
    return;
  }
  const script = scriptFor(cardId);
  if (!script) {
    console.log(`${cardName(cardId)} has no script — nothing to play.`);
    return;
  }
  if (verb === "try") {
    report(cardId, await playExample(cardId, exampleFrom(flagsOf(rest))));
    return;
  }
  if (verb === "examples") {
    const examples = script.examples ?? [];
    if (examples.length === 0) console.log(`${cardName(cardId)} carries no examples.`);
    for (const example of examples) {
      const played = await playExample(cardId, example);
      const wrong = mismatches(played, example);
      console.log(`${wrong.length === 0 ? "✓" : "×"} ${example.name}`);
      for (const line of played.said) console.log(`    › ${line}`);
      for (const line of wrong) console.log(`    ! ${line}`);
    }
    return;
  }
  console.log(USAGE.join("\n"));
}

void main();
