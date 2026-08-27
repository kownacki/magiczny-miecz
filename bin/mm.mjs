#!/usr/bin/env node
/**
 * `mm` on the PATH.
 *
 * A shim rather than a build step: the CLI is the same TypeScript the Next.js
 * routes import, and `tsx` is what resolves the `@/` alias that Node's own type
 * stripping does not. When this wants to be a single distributable file it
 * becomes an esbuild bundle and nothing above it changes.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { status } = spawnSync(
  process.execPath,
  [join(root, "node_modules", "tsx", "dist", "cli.mjs"), join(root, "src", "cli", "mm.ts"), ...process.argv.slice(2)],
  { stdio: "inherit", cwd: root },
);
process.exit(status ?? 0);
