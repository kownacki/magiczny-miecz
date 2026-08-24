"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { normaliseJoinCode } from "@/lib/game/codes";
import characters from "@/data/characters.json";
import type { Character } from "@/data/types";

interface GameSummary {
  joinCode: string;
  status: string;
  mode: string;
  turn: number;
  lastPlayedAt: string;
  players: { name: string | null; characterId: string | null; abandoned: boolean }[];
}

const CHARACTER_NAMES = new Map(
  (characters as Character[]).map((character) => [character.id, character.name]),
);

/**
 * "Wczoraj", "3 dni temu" — a date is not what anybody is asking.
 *
 * The question behind this list is "which of these were we playing?", and the
 * answer is almost always in terms of how long ago rather than of a calendar.
 */
function whenPlayed(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) {
    const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    if (hours <= 0) return "przed chwilą";
    return `${hours} godz. temu`;
  }
  if (days === 1) return "wczoraj";
  if (days < 7) return `${days} dni temu`;
  return new Date(iso).toLocaleDateString("pl-PL");
}

const STATUS_LABEL: Record<string, string> = {
  lobby: "poczekalnia",
  playing: "w trakcie",
  finished: "zakończona",
};

/** Entry point: start a new table, or join one whose code is being read out across it. */
export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<GameSummary[] | null>(null);
  /** Which table is one more click from being deleted. */
  const [deleting, setDeleting] = useState<string | null>(null);

  // A game of this length spans several sittings, so the first question on
  // opening the app is usually "which table were we on?" rather than "start a
  // new one".
  useEffect(() => {
    fetch("/api/games")
      .then((response) => response.json())
      .then((data) => setGames(data.games ?? []))
      .catch(() => setGames([]));
  }, []);

  async function remove(joinCode: string) {
    await fetch(`/api/games/${joinCode}`, { method: "DELETE" });
    setDeleting(null);
    setGames((current) => (current ?? []).filter((game) => game.joinCode !== joinCode));
  }

  async function startTable() {
    // The name is required. A table of "Miejsce 2" and "Miejsce 4" is nobody's
    // game, and asking later never happens.
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) throw new Error("Nie udało się otworzyć stołu.");
      const { joinCode, token } = await response.json();
      // The host's token is kept per-table so one device can sit at several.
      localStorage.setItem(`mm:${joinCode}`, token);
      router.push(`/g/${joinCode}`);
    } catch (problem) {
      setError((problem as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-10 px-6 py-16">
      <header className="text-center">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-wide text-ochre">
          Magiczny Miecz
        </h1>
        <p className="mt-3 text-sm text-muted">
          Zagraj całą partię tutaj albo przy planszy — liczenie, rzuty i kolejność
          kart aplikacja bierze na siebie w obu trybach.
        </p>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          startTable();
        }}
        className="flex flex-col gap-2"
      >
        <label className="text-xs uppercase tracking-widest text-muted" htmlFor="name">
          Twoje imię
        </label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="np. Michał"
          maxLength={24}
          className="rounded border border-edge bg-panel px-3 py-2 text-ink outline-none focus:border-ochre"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg border border-edge bg-raised px-6 py-4 font-[family-name:var(--font-display)] text-lg font-medium text-ink transition hover:border-ochre hover:bg-edge disabled:opacity-50"
        >
          {busy ? "Otwieram stół…" : "Otwórz nowy stół"}
        </button>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const clean = normaliseJoinCode(code);
          if (clean.length >= 4) router.push(`/g/${clean}`);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="code" className="text-xs uppercase tracking-widest text-muted">
          albo dołącz kodem
        </label>
        <div className="flex gap-2">
          <input
            id="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="np. K7DQM"
            autoCapitalize="characters"
            autoComplete="off"
            className="tnum flex-1 rounded-lg border border-edge bg-panel px-4 py-3 text-center text-2xl tracking-[0.3em] text-ink uppercase placeholder:text-muted/50 focus:border-ochre focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg border border-edge bg-raised px-5 text-sm text-ink transition hover:border-ochre"
          >
            Dołącz
          </button>
        </div>
      </form>

      {error && <p className="text-center text-sm text-vermilion">{error}</p>}

      {games !== null && games.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-widest text-muted">Stoły</h2>
          {games.map((game) => (
            <div
              key={game.joinCode}
              className="rounded-lg border border-edge bg-panel/50 transition hover:border-ochre"
            >
            <button
              onClick={() => router.push(`/g/${game.joinCode}`)}
              className="block w-full px-3 py-2 text-left"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="tnum font-[family-name:var(--font-display)] tracking-[0.2em] text-ink">
                  {game.joinCode}
                </span>
                <span className="text-[11px] text-muted">
                  {STATUS_LABEL[game.status] ?? game.status}
                  {game.status === "playing" ? ` · tura ${game.turn}` : ""} ·{" "}
                  {whenPlayed(game.lastPlayedAt)}
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] text-muted">
                {game.players.length === 0
                  ? "nikogo jeszcze nie ma"
                  : game.players
                      .map((player) => {
                        const who =
                          player.name ??
                          (player.characterId
                            ? (CHARACTER_NAMES.get(player.characterId) ?? "?")
                            : "wolne");
                        // A seat somebody walked away from still holds its
                        // character, so it is listed — and marked, because
                        // that is the thing worth knowing before you sit down.
                        return player.abandoned ? `${who} (bez gracza)` : who;
                      })
                      .join(" · ")}
              </span>
            </button>
            {/* Deleting is final and there is no undo, so it takes two clicks
                and says what it is doing. Every table here is public — the code
                is the only lock — so the guard is the confirmation, not a
                permission check the server could not meaningfully make. */}
            <div className="flex justify-end border-t border-edge/50 px-3 py-1">
              {deleting === game.joinCode ? (
                <span className="flex items-center gap-2 text-[11px]">
                  <span className="text-vermilion">Skasować stół bez śladu?</span>
                  <button
                    onClick={() => remove(game.joinCode)}
                    className="rounded border border-vermilion/60 px-1.5 text-vermilion"
                  >
                    tak
                  </button>
                  <button onClick={() => setDeleting(null)} className="text-muted hover:text-ink">
                    nie
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setDeleting(game.joinCode)}
                  className="text-[11px] text-muted/70 hover:text-vermilion"
                >
                  skasuj
                </button>
              )}
            </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
