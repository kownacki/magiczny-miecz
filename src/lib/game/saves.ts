/** A game kept in a file: the offline half of `GameStore`, and the list you pick one from. */

import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Changeset, Snapshot } from "./change";
import { emptyTables, memoryHandle, memoryStore, type GameStore } from "./gameStore";
import type { Tables } from "./fakeDb";
import type { Recorded } from "./record";
import { createGame, joinGame } from "./store";
import type { EqMode } from "@/lib/engine/slots";

/**
 * Why a file is a `GameStore` and not a special case.
 *
 * A saved game is not a summary of a game, it is the rows — which is a thing
 * `fakeDb`'s `Tables` already spells out exactly, because it was written to
 * hold a game in memory for the commit tests. So "save" is `JSON.stringify` of
 * something that already existed, and "load" is `JSON.parse`, and everything
 * between them is the same `storeOver(handle)` the browser runs on.
 *
 * The one rule this must not break is in `gameStore.ts`: an offline game keeps
 * the compare-and-swap. A single terminal has no second writer and does not
 * need one — but the moment offline gets cheaper rules there are two games to
 * keep honest, which is the argument that parked companion mode. Nothing here
 * touches the commit; it only writes down what the commit produced.
 */

/** Where saves live. Overridable so a test does not write into a real home. */
export function homeDir(): string {
  return process.env.MM_HOME ?? join(homedir(), ".magiczny-miecz");
}

export function savesDir(): string {
  return join(homeDir(), "saves");
}

function fileFor(code: string): string {
  return join(savesDir(), `${code}.json`);
}

/**
 * A saved game on disk.
 *
 * `version` is here from the first file written rather than added when it is
 * first needed, because the one thing a save format cannot do later is work out
 * what an unversioned file meant.
 */
export interface SaveFile {
  version: 1;
  savedAt: string;
  /** The rows that are the game, exactly as a store holds them. */
  tables: Tables;
  /**
   * Every input that produced the state, for winding it back.
   *
   * What somebody typed and what the dice said while it ran — see `record.ts`
   * for why those two and nothing else. Written from the first save rather than
   * added when rewind arrives, because a game saved without it can never be
   * wound back.
   */
  log: Recorded[];
}

/** What the picker shows: enough to recognise a game without loading it. */
export interface SaveSummary {
  code: string;
  savedAt: string;
  turn: number;
  status: string;
  /** Which ekwipunek it is playing — the two count a pack differently (5.4). */
  eqMode: string;
  players: string[];
}

function summarise(code: string, file: SaveFile): SaveSummary {
  const game = (file.tables.games[0] ?? {}) as Record<string, unknown>;
  return {
    code,
    savedAt: file.savedAt,
    turn: typeof game.turn === "number" ? game.turn : 0,
    status: typeof game.status === "string" ? game.status : "?",
    eqMode: typeof game.eq_mode === "string" ? game.eq_mode : "?",
    players: file.tables.users
      .map((row) => (row as Record<string, unknown>).name)
      .filter((name): name is string => typeof name === "string"),
  };
}

export async function listSaves(): Promise<SaveSummary[]> {
  let names: string[];
  try {
    names = await readdir(savesDir());
  } catch {
    // No directory yet is not an error — it is a machine nobody has played on.
    return [];
  }
  const found: SaveSummary[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const code = name.slice(0, -".json".length);
    try {
      found.push(summarise(code, await readSave(code)));
    } catch {
      // One unreadable file must not hide the rest of somebody's saves.
    }
  }
  return found.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function readSave(code: string): Promise<SaveFile> {
  const raw = await readFile(fileFor(code), "utf8");
  const file = JSON.parse(raw) as SaveFile;
  if (file.version !== 1) throw new Error(`Nieznana wersja zapisu: ${String(file.version)}`);
  return file;
}

/**
 * Written beside the real file and moved onto it.
 *
 * A save is rewritten after every single change, so the window in which a
 * crash could land mid-write is not theoretical — it is most of the time the
 * program is running. `rename` within a directory is atomic, so a reader sees
 * the old file or the new one and never half of either.
 */
export async function writeSave(code: string, file: SaveFile): Promise<void> {
  await mkdir(savesDir(), { recursive: true });
  const target = fileFor(code);
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(file, null, 2), "utf8");
  await rename(temp, target);
}

export async function deleteSave(code: string): Promise<void> {
  await rm(fileFor(code), { force: true });
}

/**
 * A store that writes itself down.
 *
 * Wraps the in-memory one rather than reimplementing it: the rows are held in
 * the `Tables` object the caller owns, and every commit that succeeds is
 * followed by the file. A commit that throws — a `Conflict`, a rule refusing —
 * never reaches the write, so a refused change cannot leave a save behind that
 * no game ever had.
 */
export function fileStore(code: string, tables: Tables, log: Recorded[] = []): GameStore {
  const inner = memoryStore(tables);
  return {
    handle: inner.handle,
    load: (gameId) => inner.load(gameId),
    async commit(snapshot: Snapshot, writes: Changeset): Promise<number> {
      const revision = await inner.commit(snapshot, writes);
      await writeSave(code, {
        version: 1,
        savedAt: new Date().toISOString(),
        tables,
        log,
      });
      return revision;
    },
  };
}

/**
 * A table opened on this machine, with everybody already at it.
 *
 * Takes the whole list rather than a host, because seating the others is part
 * of opening the table and was being done afterwards by the caller — which
 * meant the file on disk held one player until the next commit happened to
 * rewrite it. Quit before that and the rest of the table was gone. Opening a
 * table and who is at it are one act, so they are one call.
 */
export async function newSave(
  players: readonly string[],
  eqMode: EqMode = "slots",
): Promise<{
  code: string;
  gameId: string;
  hostToken: string;
  tables: Tables;
  log: Recorded[];
  store: GameStore;
}> {
  const [host, ...others] = players;
  const tables = emptyTables();
  const handle = memoryHandle(tables);
  const { game, hostToken } = await createGame(host ?? null, "simulation", eqMode, null, handle);

  // Through the same door a browser uses, so a local table is seated the way
  // any other is.
  for (const name of others) await joinGame(game.id, name, null, false, null, handle);

  const log: Recorded[] = [];
  const store = fileStore(game.join_code, tables, log);
  await writeSave(game.join_code, {
    version: 1,
    savedAt: new Date().toISOString(),
    tables,
    log,
  });
  return { code: game.join_code, gameId: game.id, hostToken, tables, log, store };
}

/** A table opened before, picked off the list. */
export async function openSave(
  code: string,
): Promise<{ gameId: string; tables: Tables; log: Recorded[]; store: GameStore }> {
  const file = await readSave(code);
  const gameId = (file.tables.games[0] as Record<string, unknown> | undefined)?.id;
  if (typeof gameId !== "string") throw new Error(`Zapis ${code} nie zawiera gry.`);
  const log = file.log ?? [];
  return { gameId, tables: file.tables, log, store: fileStore(code, file.tables, log) };
}
