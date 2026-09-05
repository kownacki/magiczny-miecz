import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

/**
 * Every transcript in the folder, played for real.
 *
 * A transcript is the cheapest test this repo can write: the lines somebody
 * would type to reproduce a bug, plus an `expect` saying what should have
 * happened. No fixture is built, no `Snapshot` is assembled by hand, and the
 * thing under test is the whole program — the console grammar, the commands,
 * the store and the save file — rather than a slice of it somebody had to
 * arrange first. `mm --script` decides pass or fail and answers with an exit
 * code; this only has to find the files and report which one said no.
 *
 * The directory is read at run time on purpose: **adding a transcript is adding
 * a file**, and needing a code change here as well would put a second step in
 * front of the one thing this is for.
 *
 * Each run gets its own `MM_HOME`, so a transcript cannot see the saves of
 * another one or of whoever is playing on this machine.
 */
const HERE = fileURLToPath(new URL(".", import.meta.url));
const MM = join(HERE, "mm.ts");
const DIR = join(HERE, "transcripts");
const TSX = fileURLToPath(new URL("../../node_modules/.bin/tsx", import.meta.url));

const transcripts = readdirSync(DIR)
  .filter((name) => name.endsWith(".mm"))
  .sort();

describe("the transcripts play through", () => {
  it("finds some, so this suite cannot pass by checking nothing", () => {
    expect(transcripts.length).toBeGreaterThan(0);
  });

  it.each(transcripts)(
    "%s",
    async (name) => {
      const home = mkdtempSync(join(tmpdir(), "mm-transcript-"));
      // `execFile` rejects on a non-zero exit, and the rejection carries the
      // output — which is where `mm` writes the FAIL lines. Reported whole,
      // because the useful half is the file and line it names.
      try {
        await run(TSX, [MM, "--script", join(DIR, name)], {
          env: { ...process.env, MM_HOME: home },
          maxBuffer: 8 * 1024 * 1024,
        });
      } catch (error) {
        const said = error as { stdout?: string; stderr?: string };
        throw new Error(`${name} failed:\n${said.stdout ?? ""}${said.stderr ?? ""}`);
      }
    },
    60_000,
  );
});
