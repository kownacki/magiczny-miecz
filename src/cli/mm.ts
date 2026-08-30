/** `mm` — a whole game of Magiczny Miecz at a prompt, offline, from a save file. */

import { createInterface } from "node:readline/promises";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import { helpLines, parseCommand, permits, worksOffTable } from "@/lib/engine/console";
import { tabFor } from "./tab";
import { paintFor } from "./paint";
import type { EqMode } from "@/lib/engine/slots";
import type { CommandSpec } from "@/lib/engine/console";
import { stageOf, type Stage } from "@/lib/engine/console";
import { top } from "@/lib/engine/stack";
import { cardLines, runCommand } from "@/lib/game/consoleStore";
import { activeStore, setStore } from "@/lib/game/gameStore";
import { deleteSave, homeDir, listSaves, newSave, openSave, writeSave } from "@/lib/game/saves";
import { startRecording, stopRecording, type Recorded } from "@/lib/game/record";
import { journalRows, seatsFor, usersFor } from "@/lib/game/store";
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
 * # Which language a line is in
 *
 * The audience decides, not the word — the rule that stopped this drifting.
 * Anything a *player* reads is Polish: the browser, the journal, and the
 * refusals the rules throw. Anything a *developer* reads is English: this
 * prompt, `help`, and everything the console answers with. And a name printed
 * on a component is Polish everywhere and always, because that is what the
 * thing is called.
 *
 * Which settles the borderline words rather than arguing them one at a time.
 * `BARBARZYŃCA`, `Karczma` and `Mgła` are names. `Sword 3 · Magic 3` is not —
 * you type `sword +1`, and a label you cannot type is a label in the wrong
 * language. `Postać` and `Zaklęcie` stay because they name a kind of thing.
 *
 * The one place this shows a seam: the hundred-odd refusals thrown below the
 * console — "Nie czas na rzut." — are the *browser's*, borrowed. Translating
 * them would fix this prompt by breaking the surface real players use, so they
 * stay Polish and are read here as what they are: somebody else's messages.
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
const LOCAL: CommandSpec[] = [
  {
    name: "table",
    aliases: [],
    usage: "table [new|open|delete]",
    summary: "list, open or start one — `table new Kowi, Ola`, `…, classic` for 5.4's rules",
    needs: "play",
    group: "table",
    offTable: true,
  },
  {
    name: "testmode",
    aliases: [],
    usage: "testmode [on|off]",
    summary: "unlock the commands that overrule the rules; bare `testmode` says which way it is",
    needs: "play",
    group: "override",
    offTable: true,
  },
  { name: "quit", aliases: ["exit"], usage: "quit", summary: "leave", needs: "play", group: "table", offTable: true },
];

/** What each family takes after its noun, for Tab and for the "I know:" answer. */
const FAMILIES: Record<string, string[]> = {
  table: ["new", "open", "delete"],
  testmode: ["on", "off"],
};

/** Every word this prompt answers to that the game does not, for Tab. */
const LOCAL_WORDS = LOCAL.flatMap((spec) => [spec.name, ...spec.aliases]);

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
  /** Every line typed at it and the dice that fell — see `record.ts`. */
  log: Recorded[];
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

/** Off unless there is a terminal on the other end — see `paintFor`. */
const paint = paintFor(stdin.isTTY);

function say(text: string): void {
  stdout.write(`${text}\n`);
}

/* --------------------------------------------------------------------------
 * The table: opening one, and finding the one to open.
 * ----------------------------------------------------------------------- */

/**
 * The one line above `help` that says which list you are looking at.
 *
 * `help` shows what applies where you are, so the list changes underneath you
 * — and without a heading there is no way to tell a short list from a broken
 * one. This is the difference between "these are your commands" and "these are
 * your commands *here*".
 */
async function whereWeAre(all: boolean): Promise<string> {
  const testing = testmode ? " · testmode on" : "";
  if (all) return `Every command, wherever it applies${testing}.`;
  if (!table) return `Landing — no table open${testing}.`;

  const snapshot = await activeStore().load(table.gameId);
  if (snapshot.game.status !== "playing") {
    return `Lobby — ${snapshot.users.length} at the table${testing}.`;
  }
  const active = snapshot.seats.find((one) => one.seat_index === snapshot.game.active_seat);
  const driver = snapshot.users.find((one) => one.seat_index === active?.seat_index);
  const whose = active ? (driver?.name ?? `seat ${active.seat_index + 1}`) : "nobody";
  return `Turn ${snapshot.game.turn} — ${whose}, ${stage}${testing}.`;
}

/** Whether the console knows this word at all, table or no table. */
function known(line: string): boolean {
  return "ok" in parseCommand(line);
}

/** A line that reads the box rather than a game — see `worksOffTable`. */
function offTable(line: string): boolean {
  const parsed = parseCommand(line);
  return "ok" in parsed && worksOffTable(parsed.ok);
}

/**
 * One line, written down with whatever the dice said while it ran.
 *
 * Saved on the spot rather than left for the next commit to carry: a line is
 * the unit somebody would replay, and a record that is one line behind the game
 * is a record of a game nobody played.
 */
async function remember(line: string, actor: string, was: number): Promise<void> {
  const at = table;
  if (!at) return;
  /**
   * Only what changed the game.
   *
   * `look`, `me` and `who` are reads, and `commit` says so itself: a changeset
   * that asks for nothing writes nothing, "not even the revision". So the
   * counter standing still is the game saying nothing happened, and a record of
   * nothing happening is a longer replay of the same game.
   */
  const now = (await activeStore().load(at.gameId)).game.revision;
  if (now === was) {
    stopRecording();
    return;
  }
  at.log.push({ seq: at.log.length + 1, actor, line, rolls: stopRecording() });
  await writeSave(at.code, {
    version: 1,
    savedAt: new Date().toISOString(),
    tables: at.tables,
    log: at.log,
  });
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
  stage = stageOf(game.status, top(game.turn_state).phase);
}

async function openTable(code: string): Promise<void> {
  const { gameId, tables, log, store } = await openSave(code);
  setStore(store);
  table = { code, gameId, tables, log };
  announced = null;
  await knowTable();
  say(`Table ${code}.`);
  await show();
}

async function makeTable(names: string[], eqMode: EqMode): Promise<void> {
  if (names.length === 0) return say("Who is playing? `table new Michał, Ola`");
  const { code, gameId, tables, log, store } = await newSave(names, eqMode);
  setStore(store);
  table = { code, gameId, tables, log };
  announced = null;
  await knowTable();
  say(`Table ${code} — ${names.join(", ")}.`);
  say("Everyone picks a Postać — `pick MAGOG`, or `pick` for a random one. `unseat` sits out.");
  say("Then `ready`, and `start` when everyone is.");
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
    if (stdin.isTTY) await rl.question(`— ${who.label}'s turn — [enter] `);
    else say(`— ${who.label}'s turn —`);
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
  /**
   * Italic, because the journal is the one thing here that is not the program
   * talking. It is the game's own record, in the game's own language, quoted
   * back — and a quotation that looks like everything around it reads as
   * something `mm` said.
   */
  for (const line of journalLines(entries.reverse(), view, null)) {
    say(`  ${paint.italic(line.text)}`);
  }
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
  /**
   * Recorded around the whole line, not around each change.
   *
   * One line can cause four of them — `fight` begins a fight, throws twice and
   * settles it — and the record wants what somebody *typed*, with the dice that
   * fell while it ran. See `record.ts`.
   */
  startRecording();
  const was = (await activeStore().load(table!.gameId)).game.revision;
  try {
    say(await runCommand(table!.gameId, { userId: who.userId, seatId: who.seatId }, parsed.ok));

    // `rename`, `kick` and `seat` all change who Tab should offer.
    await knowTable();
    await remember(line, who.label, was);
  } catch (error) {
    // The message is the game refusing something and belongs on screen; the
    // stack is a bug and belongs in a file.
    say((error as Error).message ?? "Something went wrong.");
    if (!(error as Error).message) say(`(written to ${trace(error)})`);
    // A refused line changed nothing, so there is nothing to replay — but the
    // dice have to be dropped or they would land on the next line's entry.
    stopRecording();
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

  if (family === "testmode") {
    // Bare `test` says which way it is, because a switch you cannot read is
    // one you have to try.
    /**
     * Bare `testmode` reports, and says how to change it — it does not toggle.
     *
     * A switch with no argument that flips does opposite things depending on
     * state you cannot see: you type it to find out where you are, and thereby
     * turn the rule-breaking commands on. `git config x` reads and
     * `git config x y` writes for the same reason. What was actually wrong is
     * that reporting alone left you no better off, so the report carries the
     * way to act on it.
     */
    if (verb === "") {
      say(
        testmode
          ? "Testmode: on. `testmode off` locks the commands that overrule the rules."
          : "Testmode: off. `testmode on` unlocks the commands that overrule the rules.",
      );
      return true;
    }
    if (verb !== "on" && verb !== "off") {
      say("`testmode on` or `testmode off`.");
      return true;
    }
    testmode = verb === "on";
    say(
      testmode
        ? "Testmode on — the commands that overrule the rules are available."
        : "Testmode off.",
    );
    return true;
  }

  if (family !== "table") return false;

  // Bare `table` lists them, the way a bare noun does in every CLI that has
  // families: it is the question you ask before you know a code to name.
  if (verb === "") {
    const found = await listSaves();
    if (found.length === 0) say("No tables. `table new Kowi, Ola` opens one.");
    for (const one of found) {
      say(
        `  ${one.code}  ${one.status}  turn ${one.turn}  ${one.eqMode}  ` +
          one.players.join(", "),
      );
    }
    return true;
  }

  const named = [second, ...rest].join(" ").trim();
  switch (verb) {
    case "new": {
      /**
       * `classic` last and bare, the way every other flag is.
       *
       * The browser asks which ekwipunek at the table-opening dialog and this
       * had no way to say — so every game `mm` opened was slotowy, and the
       * printed rules were unreachable from the one surface that can play a
       * whole game by itself.
       */
      const words = tail.split(",").map((one) => one.trim()).filter(Boolean);
      const last = words[words.length - 1]?.toLowerCase();
      const classic = last === "classic" || last === "klasyczny";
      await makeTable(classic ? words.slice(0, -1) : words, classic ? "classic" : "slots");
      return true;
    }
    case "open":
      if (!tail) return say("Which table? `table` lists them."), true;
      await openTable(tail.toUpperCase());
      return true;
    case "delete":
      if (!tail) return say("Which table?"), true;
      await deleteSave(tail.toUpperCase());
      say(`Deleted: ${tail.toUpperCase()}.`);
      return true;
    default:
      say(`\`table ${named}\`? I know: ${FAMILIES.table.join(", ")} — or bare \`table\`.`);
      return true;
  }
}

async function main(): Promise<void> {
  const found = await listSaves();
  rl = createInterface({
    input: stdin,
    output: stdout,
    completer: (line: string) => tabFor(line, players, LOCAL_WORDS, { stage, testmode }, FAMILIES),
  });

  say("Magiczny Miecz — console.");
  if (found.length > 0) {
    say(`Tables: ${found.map((one) => one.code).join(", ")}  (\`table open CODE\`)`);
  }
  // The names are the *players*, and saying so is the whole point of this
  // line: `new Michał, Ola` reads like naming the table, and the first person
  // to run it read it that way.
  say("`table new <players>` opens a table — e.g. `table new Michał, Ola`.");
  say("`table` lists tables, `help` lists commands, `quit` leaves.");

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
        // Where you are, before what you can do — the list is filtered by it,
        // so a list with no heading is a list you cannot check.
        if (asked === null || all) say(paint.dim(await whereWeAre(all)));
        for (const one of helpLines(all ? null : asked, { testmode, stage, all }, LOCAL)) say(one);
      } else if (offTable(line)) {
        // Reading a Karta touches no game, so it must not need one. Somebody
        // deciding whether to play wants to read what they would be playing.
        try {
          for (const one of cardLines(line.replace(/^\S+\s*/, ""))) say(one);
        } catch (error) {
          say((error as Error).message);
        }
      } else if (!table && !known(line)) {
        // A word nothing answers to is a word nothing answers to, whether or
        // not a table is open. Saying "open a table first" to `asdasdas` told
        // somebody to fix the wrong thing — and said the same to `sdf` as to
        // `start`, which is a real command that simply needs a game.
        const parsed = parseCommand(line);
        say("error" in parsed ? parsed.error : `No command \`${line.split(/\s+/)[0]}\`.`);
      } else if (!table) {
        say("`" + line.split(/\s+/)[0] + "` needs a table. `table new Michał, Ola` opens one.");
      } else if (/^journal\b/.test(line)) {
        await recent(Number(line.split(/\s+/)[1] ?? 10) || 10);
      } else {
        await run(line);
      }
    }
    await prompt();
  }
  /**
   * Closed here, and this is why `quit` looked broken.
   *
   * Breaking the loop leaves `readline` holding stdin open, so node has a
   * live handle and never exits: "Bye." printed, `main` returned, and the
   * interface went on prompting. `quit` typed three times said goodbye three
   * times and stayed. It cannot be closed from inside the handler either —
   * that kills the iterator mid-await — so it happens exactly here, once the
   * loop is done with it.
   */
  rl.close();
  say("Bye.");
}

void main();
