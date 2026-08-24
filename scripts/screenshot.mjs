/** Drives the running dev server in a real browser to capture screenshots and surface console errors. */

import { chromium } from "playwright";

/**
 * Usage: node scripts/screenshot.mjs <url> <out.png> [width] [height]
 *
 * Exists because the table screen and the phone view are the product — a
 * type-check says nothing about whether a stat row wraps on a 390px screen or
 * whether the active-seat highlight actually reads as highlighted. Console and
 * page errors are reported alongside, since a hydration failure is invisible in
 * a screenshot but obvious here.
 */
const [url, out, width = "1280", height = "900"] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/screenshot.mjs <url> <out.png> [width] [height]");
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
page.on("requestfailed", (request) =>
  problems.push(`request failed: ${request.url()} ${request.failure()?.errorText ?? ""}`),
);

await page.goto(url, { waitUntil: "networkidle" });
// The table polls every two seconds; one full cycle guarantees the first
// response has landed and rendered before the shot is taken.
await page.waitForTimeout(2200);
await page.screenshot({ path: out, fullPage: true });

console.log(`shot: ${out}`);
if (problems.length) {
  console.log("problems:");
  for (const problem of problems) console.log(`  ${problem}`);
} else {
  console.log("no console/page errors");
}

await browser.close();
