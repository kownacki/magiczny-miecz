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

function run() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const from = args.find((arg) => !arg.startsWith("--"));

  if (!from) {
    console.error("usage: node scripts/export-music.mjs <music-folder> [--all]\n");
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

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const tracks = manifest.tracks;

  // CD order. The OST tracklist and the ripped folder are both the disc read
  // start to finish, so position is the mapping — durations only confirm it.
  const files = fs.readdirSync(from)
    .filter((file) => AUDIO.test(file))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? NaN);
      const nb = Number(b.match(/\d+/)?.[0] ?? NaN);
      return Number.isNaN(na) || Number.isNaN(nb) ? a.localeCompare(b) : na - nb;
    });

  if (files.length !== tracks.length) {
    console.error(`Found ${files.length} audio files in ${from}, expected ${tracks.length}.`);
    console.error("Listing them against the manifest so you can see where they diverge:\n");
  }

  fs.mkdirSync(OUT, { recursive: true });
  const codec = encoder();
  let written = 0;
  let bytes = 0;
  let suspect = 0;

  for (const [at, track] of tracks.entries()) {
    const file = files[at];
    if (!file) {
      console.log(`  ${String(track.index).padStart(2)}. ${track.title} — no file`);
      suspect += 1;
      continue;
    }

    const source = path.join(from, file);
    const actual = duration(source);
    // The last track has no published end time, so it has nothing to check against.
    const drift = track.duration === null ? 0 : actual - track.duration;
    const off = Math.abs(drift) > 3;
    if (off) suspect += 1;

    const label = `${String(track.index).padStart(2)}. ${track.title}`;
    const clock = `${Math.floor(actual / 60)}:${String(actual % 60).padStart(2, "0")}`;
    const mark = off ? `  ⚠ ${drift > 0 ? "+" : ""}${drift}s vs tracklist` : "";

    if (!track.zone && !all) {
      console.log(`  ${label} — ${file} (${clock}) skipped, no zone${mark}`);
      continue;
    }

    const destination = path.join(OUT, `${track.id}.m4a`);
    const normalised = encode(source, destination, codec);
    const size = fs.statSync(destination).size;
    written += 1;
    bytes += size;
    console.log(
      `  ${label} — ${file} (${clock}) → ${track.id}.m4a ` +
      `${(size / 1e6).toFixed(1)} MB${normalised ? "" : " (loudness unmeasured)"}` +
      `${track.zone ? `  [${track.zone}]` : ""}${mark}`,
    );
  }

  console.log(`\n${written} tracks, ${(bytes / 1e6).toFixed(1)} MB, ${codec} @ ${BITRATE}, ${LUFS} LUFS.`);
  if (suspect > 0) {
    console.log(
      `${suspect} track(s) do not match the published tracklist. The folder is probably in a\n` +
      `different order, or is not the base MM6 disc — check before committing public/music.`,
    );
    process.exit(1);
  }
}

run();
