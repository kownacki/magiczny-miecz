/** Which piece of music belongs to which part of the board, read off the transcribed manifest. */

import manifest from "@/data/music.json";
import type { Region } from "@/data/types";

/**
 * Somewhere the music can be "at".
 *
 * The four board regions plus the lobby, which is not a place on the board but
 * is the other thing a screen can be showing. Deliberately the same shape as
 * `Region` so that the common case — take the active player's field, look up
 * its region — needs no mapping at all.
 */
export type MusicZone = Region | "lobby";

export const MUSIC_ZONES: readonly MusicZone[] = [
  "lobby",
  "dolny",
  "srodkowy",
  "gorny",
  "most",
];

/** Polish labels, for anything that shows a zone to a player. */
export const MUSIC_ZONE_LABEL: Record<MusicZone, string> = {
  lobby: "Stół",
  dolny: "Dolny Krąg",
  srodkowy: "Środkowy Krąg",
  gorny: "Górny Krąg",
  most: "Kamienny Most",
};

export interface MusicTrack {
  /** Position on the source disc, 1-based. */
  index: number;
  id: string;
  title: string;
  /** The zone this track owns, or null if it is banked for later. */
  zone: MusicZone | null;
}

/**
 * The manifest is hand-maintained JSON, so it arrives as `string | null` and is
 * narrowed here rather than trusted. An unrecognised zone is a typo in the
 * manifest and is dropped to null — better a silent zone than a crash at the
 * table, and `MISSING_ZONES` below makes it visible.
 */
export const TRACKS: readonly MusicTrack[] = manifest.tracks.map((track) => ({
  index: track.index,
  id: track.id,
  title: track.title,
  zone: (MUSIC_ZONES as readonly string[]).includes(track.zone ?? "")
    ? (track.zone as MusicZone)
    : null,
}));

const BY_ZONE = new Map<MusicZone, MusicTrack>();
for (const track of TRACKS) {
  if (track.zone && !BY_ZONE.has(track.zone)) BY_ZONE.set(track.zone, track);
}

/** Zones with no track assigned. Empty in a healthy manifest; drives the harness warning. */
export const MISSING_ZONES: readonly MusicZone[] = MUSIC_ZONES.filter(
  (zone) => !BY_ZONE.has(zone),
);

export function trackForZone(zone: MusicZone | null): MusicTrack | null {
  return zone ? (BY_ZONE.get(zone) ?? null) : null;
}

/**
 * Where the encoded loop lives.
 *
 * `scripts/export-music.mjs` writes `public/music/{id}.m4a`, so this is the one
 * place that knows the naming, and it is the only coupling between the asset
 * pipeline and the player.
 */
export function trackUrl(track: MusicTrack): string {
  return `/music/${track.id}.m4a`;
}

export function urlForZone(zone: MusicZone | null): string | null {
  const track = trackForZone(zone);
  return track ? trackUrl(track) : null;
}
