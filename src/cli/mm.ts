/** `mm` — a whole game of Magiczny Miecz at a prompt, offline, from a save file. */

import { createInterface } from "node:readline/promises";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import { helpLines, parseCommand, permits, worksOffTable } from "@/lib/engine/console";
import { tabFor } from "./tab";
import { stageOf, type Stage } from "@/lib/engine/console";
import { cardLines, runCommand } from "@/lib/game/consoleStore";
import { activeStore, setStore } from "@/lib/game/gameStore";
import { deleteSave, homeDir, listSaves, newSave, openSave } from "@/lib/game/saves";
import { journalRows, seatsFor, usersFor } from "@/lib/game/store";
import { setReady } from "@/lib/game/lobbyStore";
import { memoryHandle } from "@/lib/game/gameStore";
import { journalLines, type JournalEntry } from "@/lib/engine/journalText";
import { asJournalKind } from "@/lib/engine/journal";
import type { Tables } from "@/lib/game/fakeDb";

/**
 * The fourth surface, and the one that needed no engine.
 *
 * Everything under this file already existed: the rules were pure from the
 * start, `GameStore` gave them somewhere to live that is not Postgres, and the
 * console grammar is the same one the browser types at. What is here is a
 * prompt, a save to point it at, and the hot-seat handover — nothing that
 * decides anything about the game.
 *
 * Deliberately not a full-screen interface. It dumps what you asked for and
 * gives you the prompt back, like any other terminal program: the point is to
 * *play*, and a widget layer would be a second way of drawing a board that has
 * to be kept honest against the first.
 *
 * Save management lives outside the shared vocabulary on purpose — `new`,
 * `load`, `saves` and `delete` act on the program rather than on the game, and
 * the browser could never carry them out. They are handled here, before a line
 * ever reaches `parseCommand`.
 */

/**
 * The words this prompt answers to that the game does not.
 *
 * Two families and a way out, rather than seven top-level verbs. `table` and
 * `test` group because that is what every CLI past a handful of commands does
 * — `git remote add`, `docker image ls` — and because it buys three things a
 * flat list does not: a fifth thing to do to a table is `table rename` rather
 * than a new word, `table ⇥` shows the family instead of scattering it across
 * n/o/d/s, and `new`, `load`, `save`, `delete` and `list` stay free for the
 * game, which is where the words are actually wanted.
 *
 * The cost is a prefix on commands typed once a session. Tab pays it back.
 */
const LOCAL = ["table", "test", "quit", "exit"];

/** What each family answers to, for `help` and for Tab. */
const FAMILIES: Record<string, string[]> = {
  table: ["new", "open", "delete"],
  test: ["on", "off"],
};

/** Where a stack trace goes, so a session stays readable and a bug is a path. */
const LOG = join(homeDir(), "mm.log");

function trace(what: unknown): string {
  mkdirSync(homeDir(), { recursive: true });
  const when = new Date().toISOString();
  appendFileSync(LOG, `\n[${when}] ${what instanceof Error ? (what.stack ?? what.message) : String(what)}\n`);
  return LOG;
}

interface Table {
  code: string;
  gameId: string;
  tables: Tables;
}

let table: Table | null = null;
let testmode = false;
/** The last seat we announced, so a handover is printed once and not per line. */
let announced: number | null = null;
/** Set by `quit`, read by the loop — `rl.close()` mid-question hangs. */
let leaving = false;
/**
 * Who is at the table, for Tab.
 *
 * Cached rather than read on each keypress: readline's completer is
 * synchronous, and the answer only changes when a command changes it.
 */
let players: string[] = [];
/**
 * Where the game has got to, for Tab.
 *
 * Cached beside the names and for the same reason: readline's completer cannot
 * await, and this only changes when a command changes it.
 */
let stage: Stage = "none";

/**
 * Opened after the startup reads, not before.
 *
 * `readline` starts consuming stdin the moment it exists, so creating it and
 * then awaiting the list of saves let piped input reach EOF while nothing was
 * asking for it — the first prompt then rejected and `mm` exited without
 * running a line. A human never notices; a script always does, and a program
 * you cannot script is one nobody can test.
 */
let rl: ReturnType<typeof createInterface>;

function say(text: string): void {
  stdout.write(`${text}\n`);
}

/* --------------------------------------------------------------------------
 * The table: opening one, and finding the one to open.
 * ----------------------------------------------------------------------- */

/** A line that reads the box rather than a game — see `worksOffTable`. */
function offTable(line: string): boolean {
  const parsed = parseCommand(line);
  return "ok" in parsed && worksOffTable(parsed.ok);
}

async function knowTable(): Promise<void> {
  if (!table) {
    players = [];
    // Not "lobby". No game open is its own state, and calling it a poczekalnia
    // put `ready`, `start` and `pick` in front of somebody who had no table.
    stage = "none";
    return;
  }
  players = (await usersFor(table.gameId))
    .map((one) => one.name)
    .filter((one): one is string => !!one);
  const game = (await activeStore().load(table.gameId)).game;
  stage = stageOf(game.status, (game.turn_state as { phase?: string }).phase);
}

async function openTable(code: string): Promise<void> {
  const { gameId, tables, store } = await openSave(code);
  setStore(store);
  table = { code, gameId, tables };
  announced = null;
  await knowTable();
  say(`Stół ${code}.`);
  await show();
}

async function makeTable(names: string[]): Promise<void> {
  if (names.length === 0) return say("Kto gra? Wypisz graczy: `table new Michał, Ola`.");
  const { code, gameId, tables, store } = await newSave(names);
  setStore(store);
  table = { code, gameId, tables };
  announced = null;
  await knowTable();
  say(`Stół ${code} — ${names.join(", ")}.`);
  say("Każdy wybiera Postać — `pick MAGOG`, albo `pick` losowo. `unseat` pomija.");
  say("Kiedy wszyscy mają Postacie: `start`.");
  await show();
}

/* --------------------------------------------------------------------------
 * Hot seat: who is typing.
 * ----------------------------------------------------------------------- */

/**
 * The actor follows the active seat.
 *
 * Six players share one terminal, so "me" is whoever the game is waiting for.
 * Before the game starts there is no active seat and the host stands in, which
 * is what lets the first `pick` land somewhere.
 */
async function actorNow(): Promise<{ userId: string; seatId: string | null; label: string }> {
  const at = table!;
  const [seats, people] = await Promise.all([seatsFor(at.gameId), usersFor(at.gameId)]);
  const game = (await activeStore().load(at.gameId)).game;
  /**
   * In the poczekalnia it is whoever is not finished, and it stays with them.
   *
   * Not "the first seat with no Postać": that moved on the moment somebody
   * picked, so `pick` then `ready` readied the *next* player. Somebody is done
   * when they have said so, which is the same thing `start` checks.
   */
  const seat =
    game.active_seat === null
      ? (seats.find((one) => {
          const who = people.find((p) => p.seat_index === one.seat_index);
          return who !== undefined && !who.ready;
        }) ?? seats[0])
      : (seats.find((one) => one.seat_index === game.active_seat) ?? seats[0]);
  const driver = people.find((one) => one.seat_index === seat?.seat_index) ?? people[0];
  return {
    userId: driver?.id ?? "",
    seatId: seat?.id ?? null,
    label: driver?.name ?? `Miejsce ${(seat?.seat_index ?? 0) + 1}`,
  };
}

/**
 * The handover, which is the whole of what hot seat needs.
 *
 * Not a screen clear and not a secret: one terminal has one scrollback and
 * anybody can read up. What this buys is that changing seats is a deliberate
 * act rather than something you notice three commands later.
 */
async function handover(): Promise<void> {
  const game = (await activeStore().load(table!.gameId)).game;
  if (game.active_seat === null || game.active_seat === announced) return;
  const who = await actorNow();
  if (announced !== null) {
    say("");
    // A script has nobody to press enter, and waiting for one would hang it.
    if (stdin.isTTY) await rl.question(`— tura: ${who.label} — [enter] `);
    else say(`— tura: ${who.label} —`);
  }
  announced = game.active_seat;
}

/* --------------------------------------------------------------------------
 * What you see between commands.
 * ----------------------------------------------------------------------- */

async function show(): Promise<void> {
  await run("look");
}

/**
 * The journal, rendered by exactly the code the browser renders it with.
 *
 * The mapping is the journal route's, because a second way of turning rows
 * into sentences would be a second set of sentences to keep true.
 */
async function recent(count: number): Promise<void> {
  const at = table!;
  const [seats, users] = await Promise.all([seatsFor(at.gameId), usersFor(at.gameId)]);
  const rows = await journalRows(at.gameId, { after: 0, limit: count }, memoryHandle(at.tables));
  const entries: JournalEntry[] = rows.flatMap((row) => {
    const kind = asJournalKind(row.kind);
    if (!kind) return [];
    return [
      {
        seq: row.seq as number,
        seatId: (row.seat_id as string | null) ?? null,
        actorName: (row.actor_name as string | null) ?? null,
        turn: row.turn as number,
        kind,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        manual: Boolean(row.manual),
      },
    ];
  });
  const view = seats.map((one) => ({
    id: one.id,
    seatIndex: one.seat_index,
    playerName: users.find((who) => who.seat_index === one.seat_index)?.name ?? null,
    characterId: one.character_id,
  }));
  for (const line of journalLines(entries.reverse(), view, null)) say(`  ${line.text}`);
}

/* --------------------------------------------------------------------------
 * One line in, one line back.
 * ----------------------------------------------------------------------- */

async function run(line: string): Promise<void> {
  const parsed = parseCommand(line);
  if ("error" in parsed) return say(parsed.error);

  const allowed = permits(parsed.ok, { testmode });
  if (!allowed.ok) return say(allowed.why);

  const who = await actorNow();
  const inLobby = stage === "lobby";
  try {
    say(await runCommand(table!.gameId, { userId: who.userId, seatId: who.seatId }, parsed.ok));

    /**
     * Picking is the whole of it, at one terminal.
     *
     * `ready` exists because players sit at different devices and somebody has
     * to know they are all done (docs/LOBBY.md). Six people sharing one
     * keyboard have nobody to tell: choosing a Postać *is* the commitment, and
     * making them say so again is a word typed to satisfy a protocol that has
     * no other end. So a lobby `pick` readies the picker and the prompt moves
     * on, which is what somebody typing for the whole table expects.
     *
     * Said out loud rather than done quietly, and `unready` still takes it
     * back for anybody who wants to think again.
     */
    if (inLobby && parsed.ok.kind === "pick") {
      await setReady(table!.gameId, who.userId, true);
      say("Gotów.");
    }
    // `rename`, `kick` and `seat` all change who Tab should offer.
    await knowTable();
  } catch (error) {
    // The message is the game refusing something and belongs on screen; the
    // stack is a bug and belongs in a file.
    say((error as Error).message ?? "Coś poszło nie tak.");
    if (!(error as Error).message) say(`(zapisane w ${trace(error)})`);
  }
}

async function local(line: string): Promise<boolean> {
  const [word, second, ...rest] = line.split(/\s+/);
  const family = word.toLowerCase();
  const verb = (second ?? "").toLowerCase();
  const tail = rest.join(" ").trim();

  if (family === "quit" || family === "exit") {
    leaving = true;
    return true;
  }

  if (family === "test") {
    // Bare `test` says which way it is, because a switch you cannot read is
    // one you have to try.
    if (verb === "") {
      say(testmode ? "Tryb testowy: włączony." : "Tryb testowy: wyłączony.");
      return true;
    }
    if (verb !== "on" && verb !== "off") {
      say("`test on` albo `test off`.");
      return true;
    }
    testmode = verb === "on";
    say(
      testmode
        ? "Tryb testowy włączony — komendy łamiące zasady są dostępne."
        : "Tryb testowy wyłączony.",
    );
    return true;
  }

  if (family !== "table") return false;

  // Bare `table` lists them, the way a bare noun does in every CLI that has
  // families: it is the question you ask before you know a code to name.
  if (verb === "") {
    const found = await listSaves();
    if (found.length === 0) say("Nie ma żadnych stołów. `table new Kowi, Ola` otwiera jeden.");
    for (const one of found) {
      say(`  ${one.code}  ${one.status}  tura ${one.turn}  ${one.players.join(", ")}`);
    }
    return true;
  }

  const named = [second, ...rest].join(" ").trim();
  switch (verb) {
    case "new":
      await makeTable(
        tail
          .split(",")
          .map((one) => one.trim())
          .filter(Boolean),
      );
      return true;
    case "open":
      if (!tail) return say("Który stół? `table` pokazuje listę."), true;
      await openTable(tail.toUpperCase());
      return true;
    case "delete":
      if (!tail) return say("Który stół?"), true;
      await deleteSave(tail.toUpperCase());
      say(`Skasowany: ${tail.toUpperCase()}.`);
      return true;
    default:
      say(`\`table ${named}\`? Znam: ${FAMILIES.table.join(", ")} — albo samo \`table\`.`);
      return true;
  }
}

async function main(): Promise<void> {
  const found = await listSaves();
  rl = createInterface({
    input: stdin,
    output: stdout,
    completer: (line: string) => tabFor(line, players, LOCAL, { stage, testmode }, FAMILIES),
  });

  say("Magiczny Miecz — konsola.");
  if (found.length > 0) {
    say(`Zapisy: ${found.map((one) => one.code).join(", ")}  (\`load KOD\`)`);
  }
  // The names are the *players*, and saying so is the whole point of this
  // line: `new Michał, Ola` reads like naming the table, and the first person
  // to run it read it that way.
  say("`table new <gracze>` otwiera stół — np. `table new Michał, Ola`.");
  say("`table` wypisuje stoły, `help` komendy, `quit` wychodzi.");

  /**
   * The line iterator rather than a loop of `question`.
   *
   * `readline` closes as soon as piped input runs dry, and every command here
   * awaits the store — so with `question` the first slow command let stdin
   * reach EOF and the next read rejected, ending the session after one line. A
   * human never sees it; a script sees nothing else. The iterator buffers, so
   * both work.
   */
  const prompt = async () => {
    if (table) await handover();
    const who = table ? (await actorNow()).label : "—";
    rl.setPrompt(`\n${table ? `${table.code} ${who}` : "mm"}> `);
    rl.prompt();
  };

  await prompt();
  for await (const raw of rl) {
    const line = raw.trim();
    if (line !== "") {
      if (await local(line)) {
        if (leaving) break;
      } else if (/^(help|\?)\b/.test(line)) {
        // Shared, so the local list must not shadow it — and it needs to know
        // which half of the vocabulary is reachable.
        const asked = line.split(/\s+/)[1] ?? null;
        const all = asked === "all";
        for (const one of helpLines(all ? null : asked, { testmode, stage, all })) say(one);
        // The families, spelled out: `table` alone would not say what it takes.
        say(
          `  table [${FAMILIES.table.join("|")}] · test [on|off] · quit` +
            "  — stoły, tryb testowy, wyjście",
        );
      } else if (offTable(line)) {
        // Reading a Karta touches no game, so it must not need one. Somebody
        // deciding whether to play wants to read what they would be playing.
        try {
          for (const one of cardLines(line.replace(/^\S+\s*/, ""))) say(one);
        } catch (error) {
          say((error as Error).message);
        }
      } else if (!table) {
        say("Najpierw otwórz stół: `table new Michał, Ola` albo `table open KOD`.");
      } else if (/^journal\b/.test(line)) {
        await recent(Number(line.split(/\s+/)[1] ?? 10) || 10);
      } else {
        await run(line);
      }
    }
    await prompt();
  }
  say("Do zobaczenia.");
}

void main();
