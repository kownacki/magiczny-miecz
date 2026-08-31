/** Screenshots the table as a seated player, by planting a claim token the way the app does. */

import { chromium } from "playwright";

/**
 * Usage: node scripts/screenshot-seated.mjs <tableUrl> <out.png> <claimToken> [w] [h]
 *
 * The table screen shows a player their own controls only when it owns a seat,
 * and seat ownership lives in `sessionStorage` — see `seatToken.ts`, which says
 * why: a seat is held by a window rather than by a machine, so two tabs are two
 * players. Without planting the token first every screenshot shows the
 * spectator view, which is not the thing worth looking at.
 *
 * This script planted it in `localStorage` for a while after the move, which
 * fails in exactly the way that is hardest to notice: the page loads, renders,
 * throws nothing, and quietly shows the join screen instead.
 */
const [url, out, token, width = "1280", height = "1000"] = process.argv.slice(2);
if (!url || !out || !token) {
  console.error("usage: node scripts/screenshot-seated.mjs <url> <out.png> <token> [w] [h]");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(height) },
  deviceScaleFactor: 2,
});

const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`page: ${error}`));

const origin = new URL(url).origin;
const code = new URL(url).pathname.split("/").pop().toUpperCase();
// Storage is per-origin, so the token has to be planted from a page on that
// origin before the table itself loads — and in the same tab, because
// `sessionStorage` is scoped to exactly this one.
await page.goto(origin);
await page.evaluate(([key, value]) => sessionStorage.setItem(key, value), [`mm:${code}`, token]);

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2400);
await page.screenshot({ path: out, fullPage: true });

console.log(`shot: ${out}`);
if (problems.length) {
  console.log("problems:");
  for (const problem of problems) console.log(`  ${problem}`);
} else {
  console.log("no console/page errors");
}

await browser.close();
