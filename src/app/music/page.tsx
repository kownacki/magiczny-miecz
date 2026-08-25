"use client";

/**
 * Bench for the music system, wired to nothing.
 *
 * The board is not connected yet, so this stands in for it: pick the zone by
 * hand and hear what the table would hear. It exists because the one open
 * question — how long a zone should hold the room before another takes over —
 * cannot be answered by reading the code, only by listening to it. The hold is
 * a slider here for that reason.
 */

import { useState, useSyncExternalStore } from "react";
import { useMusic } from "@/lib/music/useMusic";
import {
  getAssetState,
  getServerAssetState,
  subscribeAssetState,
} from "@/lib/music/assets";
import {
  MISSING_ZONES,
  MUSIC_ZONES,
  MUSIC_ZONE_LABEL,
  TRACKS,
  trackForZone,
  trackUrl,
  type MusicZone,
} from "@/lib/music/tracks";

export default function MusicBench() {
  const [zone, setZone] = useState<MusicZone>("lobby");
  const [hold, setHold] = useState(0);
  const [fade, setFade] = useState(2.5);
  // Auditioning a track must not disturb the zone selection, so this rides
  // alongside the director rather than changing what it is following.
  const [preview, setPreview] = useState<string | null>(null);
  const assets = useSyncExternalStore(
    subscribeAssetState,
    getAssetState,
    getServerAssetState,
  );

  const music = useMusic(zone, {
    enabled: true,
    director: { hold: hold * 1000 },
    player: { fade },
    override: preview,
  });

  const zoneTrack = trackForZone(music.playing);
  const previewTrack = preview
    ? (TRACKS.find((entry) => trackUrl(entry) === preview) ?? null)
    : null;
  // A preview overrides the zone track, so the readout has to follow the ears
  // rather than the board.
  const track = previewTrack ?? zoneTrack;
  const pending = music.playing !== zone;

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-10 text-ink">
      <h1 className="text-2xl">Muzyka — stanowisko testowe</h1>
      <p className="mt-2 text-sm text-muted">
        Nie jest podłączone do gry. Zmieniaj krąg ręcznie i słuchaj, jak brzmi
        przejście.
      </p>

      {assets === "missing" && (
        <p className="mt-6 rounded border border-vermilion/40 bg-vermilion/10 px-4 py-3 text-sm text-vermilion">
          Brak plików w <code>public/music</code>. System działa, ale nie ma czego
          odtworzyć — skopiuj folder <code>Music</code> z Might and Magic VI do{" "}
          <code>assets/music/</code> i uruchom <code>npm run music</code>.
        </p>
      )}
      {MISSING_ZONES.length > 0 && (
        <p className="mt-4 rounded border border-ochre/40 bg-ochre/10 px-4 py-3 text-sm text-ochre">
          Kręgi bez przypisanego utworu: {MISSING_ZONES.join(", ")}.
        </p>
      )}

      {!music.unlocked && (
        <button
          onClick={music.enable}
          className="mt-6 w-full rounded border border-ochre bg-ochre/15 px-4 py-3 text-ochre"
        >
          Włącz dźwięk
        </button>
      )}

      <section className="mt-8">
        <h2 className="text-sm uppercase tracking-wide text-muted">Gdzie jest gra</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MUSIC_ZONES.map((option) => (
            <button
              key={option}
              onClick={() => {
                setZone(option);
                // Both controls mean the same thing — play this. Leaving a
                // preview running would make the zone buttons look dead.
                setPreview(null);
                music.enable();
              }}
              className={`rounded border px-3 py-2 text-sm ${
                zone === option ? "border-ochre bg-ochre/15 text-ochre" : "border-edge bg-panel"
              }`}
            >
              {MUSIC_ZONE_LABEL[option]}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded border border-edge bg-panel px-4 py-4">
        <h2 className="text-sm uppercase tracking-wide text-muted">Co brzmi</h2>
        <p className="mt-2 text-lg">
          {track ? track.title : <span className="text-muted">cisza</span>}
        </p>
        <p className="mt-1 text-sm text-muted">
          {previewTrack ? (
            <span className="text-ochre">
              podgląd — krąg bez zmian
              {zoneTrack ? ` (${MUSIC_ZONE_LABEL[music.playing ?? "lobby"]})` : ""}
            </span>
          ) : (
            <>
              {music.playing ? MUSIC_ZONE_LABEL[music.playing] : "—"}
              {pending && (
                <span className="text-ochre">
                  {" "}
                  · czeka na zmianę na {MUSIC_ZONE_LABEL[zone]}
                </span>
              )}
            </>
          )}
        </p>
      </section>

      <section className="mt-8 space-y-5">
        <Slider
          label="Blokada kręgu"
          hint="0 = muzyka zmienia się od razu za turą. Wyżej: krótkie wejście w inny krąg nie przerywa."
          value={hold}
          min={0}
          max={60}
          step={1}
          format={(value) => `${value} s`}
          onChange={setHold}
        />
        <Slider
          label="Przenikanie"
          hint="Długość crossfade'u."
          value={fade}
          min={0.5}
          max={8}
          step={0.5}
          format={(value) => `${value.toFixed(1)} s`}
          onChange={setFade}
        />
        <Slider
          label="Głośność"
          value={music.volume}
          min={0}
          max={1}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={music.setVolume}
        />
      </section>

      <button
        onClick={() => music.setMuted(!music.muted)}
        className="mt-6 rounded border border-edge bg-panel px-4 py-2 text-sm"
      >
        {music.muted ? "Wyciszone" : "Gra"}
      </button>

      <section className="mt-10">
        <h2 className="text-sm uppercase tracking-wide text-muted">
          Ścieżka — Might and Magic VI
        </h2>
        <p className="mt-1 text-xs text-muted">
          Posłuchaj dowolnego utworu. Krąg wybrany wyżej się nie zmienia — po
          zatrzymaniu muzyka wraca do niego.
        </p>
        <ol className="mt-3 space-y-1 text-sm">
          {TRACKS.map((entry) => {
            const url = trackUrl(entry);
            const playing = preview === url;
            return (
              <li
                key={entry.id}
                className={`flex items-center gap-3 rounded px-2 py-1 ${
                  playing ? "bg-ochre/15" : ""
                }`}
              >
                <button
                  onClick={() => {
                    if (playing) return setPreview(null);
                    setPreview(url);
                    // A play button that makes no sound is a broken play
                    // button: this unlocks audio and unmutes if needed.
                    music.enable();
                  }}
                  aria-label={playing ? `Zatrzymaj ${entry.title}` : `Odtwórz ${entry.title}`}
                  className={`h-7 w-7 shrink-0 rounded border text-xs ${
                    playing
                      ? "border-ochre bg-ochre/20 text-ochre"
                      : "border-edge bg-panel text-muted hover:text-ink"
                  }`}
                >
                  {playing ? "■" : "▶"}
                </button>
                <span className={`flex-1 ${entry.zone ? "text-ink" : "text-muted"}`}>
                  {entry.index}. {entry.title}
                </span>
                <span className="shrink-0 text-muted">
                  {entry.zone ? MUSIC_ZONE_LABEL[entry.zone] : "—"}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

    </main>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-ochre"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
