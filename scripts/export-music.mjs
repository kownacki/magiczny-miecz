/** Turns a Might and Magic VI music folder into web-sized loops the app can play, keyed by track id. */

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const MANIFEST = "src/data/music.json";
const OUT = "public/music";

/** Extensions GOG and CD rippers actually produce. Sorted discovery, never a hardcoded filename. */
const AUDIO = /\.(mp3|ogg|flac|wav|m4a|wma|aiff?)$/i;

/**
 * Bitrate for the web copies. This is ambient music played under a UI at low
 * volume, not something anyone listens to closely — 96 kbps AAC is transparent
 * enough at that job and keeps five tracks near 15 MB, which is what makes them
 * committable next to public/cards.
 */
const BITRATE = "96k";

/**
 * Loudness target, in LUFS. Well below broadcast (-23 to -16) because the music
 * sits under the referee: the tracks were mastered at wildly different levels
 * and swapping rings mid-game must not make anyone reach for the volume knob.
 */
const LUFS = -20;
const TRUE_PEAK = -2;

/** Seconds a file may differ from the published tracklist before it counts as misaligned. */
const TOLERANCE = 3;

function ffmpeg(args) {
  return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function duration(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ], { encoding: "utf8" });
  return Math.round(Number(out.trim()));
}

/**
 * The AAC encoder to use.
 *
 * macOS ships AudioToolbox, which ffmpeg exposes as `aac_at` and which beats
 * ffmpeg's built-in encoder noticeably at this bitrate. Same reasoning as
 * export-card-images.mjs reaching for `sips`: the output is committed, so only
 * whoever regenerates it needs the good tool.
 */
function encoder() {
  const list = execFileSync("ffmpeg", ["-hide_banner", "-encoders"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return /\baac_at\b/.test(list) ? "aac_at" : "aac";
}

/**
 * Measures a track with EBU R128 so the encode pass can correct it exactly.
 *
 * Single-pass loudnorm guesses from the first few seconds and drifts; these are
 * four-minute pieces that open quietly and build, which is precisely the shape
 * that fools it. Two passes cost a few seconds per track, once.
 */
function measure(file) {
  const filter = `loudnorm=I=${LUFS}:TP=${TRUE_PEAK}:LRA=11:print_format=json`;
  // loudnorm reports on stderr and exits 0, so this needs spawnSync: execFileSync
  // hands back only stdout on the success path, which is where the JSON is not.
  const run = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", file, "-af", filter, "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 1 << 24 },
  );
  const match = (run.stderr ?? "").match(/\{[^{}]*"input_i"[\s\S]*?\}/);
  return match ? JSON.parse(match[0]) : null;
}

function encode(source, destination, codec) {
  const stats = measure(source);
  const filter = stats
    ? `loudnorm=I=${LUFS}:TP=${TRUE_PEAK}:LRA=11:measured_I=${stats.input_i}` +
      `:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}` +
      `:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`
    : `loudnorm=I=${LUFS}:TP=${TRUE_PEAK}:LRA=11`;

  ffmpeg([
    "-y",
    "-i", source,
    "-vn",                     // drops embedded cover art, which is a video stream
    "-map_metadata", "-1",     // the app names the tracks; ripper tags would only disagree
    "-af", filter,
    "-ar", "44100",
    "-ac", "2",
    "-c:a", codec,
    "-b:a", BITRATE,
    "-movflags", "+faststart", // so playback can start before the whole file lands
    destination,
  ]);
  return stats !== null;
}

function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function run() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const force = args.includes("--force");
  const from = args.find((arg) => !arg.startsWith("--"));

  if (!from) {
    console.error("usage: node scripts/export-music.mjs <music-folder> [--all] [--force]\n");
    console.error("Point it at the Music folder of a Might and Magic VI install. On a GOG");
    console.error("offline installer you can pull that folder out without installing:");
    console.error("  brew install innoextract");
    console.error("  innoextract -I app/Music setup_might_and_magic_6_*.exe");
    process.exit(1);
  }
  if (!fs.existsSync(from)) {
    console.error(`${from} does not exist.`);
    process.exit(1);
  }

  const { tracks } = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

  // CD order. The OST tracklist and the ripped folder are both the disc read
  // start to finish, so position is the mapping. MM6 puts game data on track 1,
  // so the files typically start at 2 — which is why this sorts on the number
  // in the name rather than the name, and why nothing keys off the number.
  const files = fs.readdirSync(from)
    .filter((file) => AUDIO.test(file))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? NaN);
      const nb = Number(b.match(/\d+/)?.[0] ?? NaN);
      return Number.isNaN(na) || Number.isNaN(nb) ? a.localeCompare(b) : na - nb;
    });

  /**
   * Everything is checked against the tracklist before a single file is
   * encoded. One missing or extra file shifts every later track by one, and a
   * half-written public/music of confidently-named wrong music is far worse
   * than no music: the names would still look right in the diff.
   */
  const plan = tracks.map((track, at) => {
    const file = files[at];
    if (!file) return { track, file: null, drift: null };
    const actual = duration(path.join(from, file));
    // The last track has no published end time, so there is nothing to check.
    const drift = track.duration === null ? 0 : actual - track.duration;
    return { track, file, actual, drift };
  });

  let suspect = 0;
  for (const { track, file, actual, drift } of plan) {
    const label = `${String(track.index).padStart(2)}. ${track.title.padEnd(36)}`;
    if (!file) {
      console.log(`  ${label} — no file`);
      suspect += 1;
      continue;
    }
    const off = Math.abs(drift) > TOLERANCE;
    if (off) suspect += 1;
    console.log(
      `  ${label} — ${file.padEnd(10)} ${clock(actual)}` +
      `${off ? `  ⚠ ${drift > 0 ? "+" : ""}${drift}s vs tracklist` : ""}` +
      `${track.zone ? `  [${track.zone}]` : ""}`,
    );
  }
  if (files.length > tracks.length) {
    console.log(`  ${files.length - tracks.length} extra file(s): ${files.slice(tracks.length).join(", ")}`);
    suspect += 1;
  }

  if (suspect > 0 && !force) {
    console.error(
      `\n${suspect} track(s) do not match the published tracklist, so nothing was written.\n` +
      `The folder is probably in a different order, or is not the base MM6 disc.\n` +
      `Re-run with --force once you have checked the list above by ear.`,
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const codec = encoder();
  let written = 0;
  let bytes = 0;

  for (const { track, file } of plan) {
    if (!file || (!track.zone && !all)) continue;
    const destination = path.join(OUT, `${track.id}.m4a`);
    const normalised = encode(path.join(from, file), destination, codec);
    bytes += fs.statSync(destination).size;
    written += 1;
    console.log(`  wrote ${track.id}.m4a${normalised ? "" : "  (loudness unmeasured)"}`);
  }

  console.log(`\n${written} tracks, ${(bytes / 1e6).toFixed(1)} MB, ${codec} @ ${BITRATE}, ${LUFS} LUFS.`);
  if (!all) console.log("Only zoned tracks were encoded; pass --all for the whole disc.");
}

run();
