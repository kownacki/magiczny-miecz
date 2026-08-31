/** Throws away Turbopack's dev cache when it has grown past all reason. Runs before `next dev`. */

import { execFileSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * # Why this exists
 *
 * Next does not garbage-collect `.next/dev`. Nothing in it is ever too old to
 * keep, so a project developed in for a few weeks accumulates every compiled
 * shape it has ever had: this one reached **3.7 GB**, of which a cold start and
 * one full page load rebuilt **123 MB**. Thirty times more cache than the
 * project has ever needed, and every start reading and writing through it.
 *
 * There is no setting for it — `cacheMaxMemorySize` is production's in-memory
 * ISR cache, a different thing — so the choice is to prune it or to let it
 * grow.
 *
 * # Why a threshold rather than always
 *
 * Clearing on every start would trade a real problem for a smaller one: the
 * cache is doing its job at any sane size, and a cold rebuild on every `npm run
 * dev` is a worse tax than the disk. So this only fires when the size has
 * stopped being explicable — see `LIMIT`.
 *
 * # Why it matters beyond disk
 *
 * Disk is the cheap half. The machine this was found on was at 22 GB of 23.5 GB
 * swap, and `next dev` — the largest process on it — is what the kernel squeezes
 * first. "The dev server keeps stopping" was memory pressure, and a cache this
 * size is both a symptom and a contributor.
 */

/**
 * Fifteen times a warm cache. Below this it is a cache; above it, it is silt.
 *
 * Overridable so the pruning branch can be exercised without waiting weeks for
 * one to accumulate — which is the only way to find out that it works.
 */
const LIMIT_MB = Number(process.env.MM_DEV_CACHE_LIMIT_MB ?? 2000);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const next = join(root, ".next");

if (existsSync(next)) {
  // `du` rather than a walk: it is one process, it is what a person would type,
  // and the answer is wanted in full — a short-circuiting walk would be faster
  // in the bad case and this runs in the good case every time.
  const size = Number(execFileSync("du", ["-sk", next], { encoding: "utf8" }).split(/\s+/)[0]);
  const mb = Math.round(size / 1024);

  if (mb > LIMIT_MB) {
    // `.next/dev` and `.next/cache` are the two that grow; `.next/server` and
    // `.next/static` are a build's own output and are small. Taking only the
    // two keeps a `next build` sitting beside a `next dev` intact, which since
    // Next 16 is a thing that happens — the two write to separate directories.
    for (const part of ["dev", "cache"]) rmSync(join(next, part), { recursive: true, force: true });
    console.log(`Dev cache was ${mb} MB — pruned. The next start is a cold one.`);
  }
}
