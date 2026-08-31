/**
 * Plays a whole game by itself and reports every line the rules refused.
 *
 * `npm run soak -- 150`
 *
 * Not a test — it asserts nothing, and it is not meant to. It is the thing a
 * test cannot be: a hundred turns of a real game, played through the same
 * console vocabulary a person types, against a save file with no server and no
 * database anywhere. What it prints is the tail of things the engine said no
 * to, counted, which is where a rule that is missing or wrong shows up as a
 * refusal nobody can explain.
 *
 * Most of what it prints is *correct* and should stay: a Spotkanie is not
 * luggage, a Natura forbids what 5.3 says it forbids, and a card nobody has
 * transcribed answers "rozpatrzcie sami". Reading the list is the work.
 *
 * It found the jam it was written to look for on its first long run: with every
 * Postać dead the game sat in `playing` with no active seat, and `look` reported
 * a turn that was not happening.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.MM_HOME = mkdtempSync(join(tmpdir(), "mm-play-"));

import { parseCommand } from "@/lib/engine/console";
import { runCommand } from "@/lib/game/consoleStore";
import { activeStore, setStore } from "@/lib/game/gameStore";
import { top } from "@/lib/engine/stack";
import { newSave } from "@/lib/game/saves";
import { seatsFor, usersFor } from "@/lib/game/store";
import events from "@/data/events.json";
import itemCards from "@/data/items.json";

/** A player types the printed name, so the harness has to as well. */
const NAME = new Map<string, string>(
  [...(events as { id: string; name: string }[]), ...(itemCards as { id: string; name: string }[])]
    .map((one) => [one.id, one.name]),
);
const nameOf = (id: string) => NAME.get(id) ?? id;

const TURNS = Number(process.argv[2] ?? 40);
const said = new Map<string, number>();
const note = (text: string) => said.set(text, (said.get(text) ?? 0) + 1);

async function main() {
const { gameId, store } = await newSave(["Kowi", "Ola"]);
setStore(store);

async function actor() {
  const [seats, people] = await Promise.all([seatsFor(gameId), usersFor(gameId)]);
  const game = (await activeStore().load(gameId)).game;
  const seat =
    game.active_seat === null
      ? (seats.find((one) => {
          const who = people.find((p) => p.seat_index === one.seat_index);
          return who !== undefined && !who.ready;
        }) ?? seats[0])
      : (seats.find((one) => one.seat_index === game.active_seat) ?? seats[0]);
  const driver = people.find((one) => one.seat_index === seat?.seat_index) ?? people[0];
  return { userId: driver?.id ?? "", seatId: seat?.id ?? null };
}

async function run(line: string): Promise<string> {
  const parsed = parseCommand(line);
  if ("error" in parsed) { note(`PARSE: ${parsed.error}`); return ""; }
  try {
    return await runCommand(gameId, await actor(), parsed.ok);
  } catch (error) {
    note(`${line.split(" ")[0]}: ${(error as Error).message}`);
    return "";
  }
}

for (const line of ["pick GOBLIN", "ready", "pick WIEDŹMA", "ready", "start"]) await run(line);

const fought = new Set<string>();
for (let turn = 0; turn < TURNS; turn++) {
  fought.clear();
  // 4.4: whoever lost a Postać chooses another, which is what a table does.
  const before = await activeStore().load(gameId);
  if (before.game.active_seat === null) {
    for (const seat of before.seats.filter((one) => one.eliminated)) {
      const who = (await usersFor(gameId)).find((p) => p.seat_index === seat.seat_index);
      if (who) await runCommand(gameId, { userId: who.id, seatId: seat.id }, { kind: "pick", characterId: null, seat: null }).catch(() => "");
    }
  }
  await run("roll");
  const state = top((await activeStore().load(gameId)).game.turn_state) as {
    phase?: string; options?: { fieldName: string }[];
  };
  if (state.options?.length) await run(`move ${state.options[0].fieldName}`);

  // Whatever the Obszar turned out to want, tried in a plausible order.
  for (let step = 0; step < 6; step++) {
    const now = top((await activeStore().load(gameId)).game.turn_state) as {
      phase?: string; drawn?: { cardId: string; cardClass: string }[]; resolved?: string[];
    };
    if (now.phase === "fight") { await run("fight"); continue; }
    if (now.phase !== "field") break;
    const waiting = (now.drawn ?? []).filter((one) => !(now.resolved ?? []).includes(one.cardId));
    if (waiting.length === 0) { await run("draw"); continue; }
    const foe = waiting.find((one) => one.cardClass === "foe" && !fought.has(one.cardId));
    if (foe) { fought.add(foe.cardId); await run(`fight ${nameOf(foe.cardId)}`); continue; }
    // Take what can be taken, then answer what is left.
    const loot = waiting.find((one) => one.cardClass !== "foe");
    if (loot && !(await run(`take ${nameOf(loot.cardId)}`))) {
      if (!(await run("answer"))) break;
    }
    if (!loot) break;
  }
  await run("endturn");
}

const game = (await activeStore().load(gameId)).game;
console.log(`--- ${TURNS} turns asked for; game is at turn ${game.round}, ${game.status} ---`);
for (const one of await seatsFor(gameId)) {
  console.log(`  seat ${one.seat_index}: ${one.character_id ?? "—"} · ${one.life} Życia` +
    `${one.eliminated ? " · dead" : ""}`);
}
for (const [text, n] of [...said].sort((a, b) => b[1] - a[1]).slice(0, 24)) {
  console.log(`${String(n).padStart(4)}  ${text.slice(0, 92)}`);
}
}
void main();
