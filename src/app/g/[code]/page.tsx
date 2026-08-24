"use client";

import { use, useCallback, useEffect, useState } from "react";
import characters from "@/data/characters.json";
import type { Character } from "@/data/types";
import { DOLNY_KRAG } from "@/lib/engine/board";

const CHARACTERS = characters as Character[];

interface Seat {
  id: string;
  seat_index: number;
  player_name: string | null;
  character_id: string | null;
  field_id: string | null;
  miecz_own: number;
  magia_own: number;
  zycie: number;
  zloto: number;
  nature: string | null;
  is_host: boolean;
}

interface Game {
  id: string;
  join_code: string;
  status: string;
  active_seat: number | null;
  turn: number;
  revision: number;
}

const FIELD_NAMES = new Map(DOLNY_KRAG.map((field) => [field.id, field.name]));

/** The shared table screen: who is sitting where, and what each of them is carrying. */
export default function Table({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/games/${code}`);
    if (!response.ok) {
      setError((await response.json()).error ?? "Błąd");
      return;
    }
    const data = await response.json();
    setGame(data.game);
    setSeats(data.seats);
  }, [code]);

  useEffect(() => {
    setToken(localStorage.getItem(`mm:${code}`));
    refresh();
    // Polling for now. This is the seam where the Realtime revision ping goes:
    // the server bumps `revision`, clients hear it and refetch. Until that is
    // wired, two seconds is imperceptible at a table where a turn takes a
    // minute, and it keeps the whole secrecy model intact — every refetch still
    // goes through the route handler.
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [code, refresh]);

  async function join() {
    const name = prompt("Twoje imię?");
    const response = await fetch(`/api/games/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    localStorage.setItem(`mm:${code}`, data.token);
    setToken(data.token);
    refresh();
  }

  async function pickCharacter(characterId: string) {
    if (!token) return;
    const response = await fetch(`/api/games/${code}/character`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, characterId }),
    });
    if (!response.ok) setError((await response.json()).error);
    refresh();
  }

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-vermilion">{error}</p>
      </main>
    );
  }
  if (!game) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-muted">Wczytuję stół…</p>
      </main>
    );
  }

  const taken = new Set(seats.map((seat) => seat.character_id).filter(Boolean));
  const mySeat = seats.find((seat) => seat.character_id === null && token) ?? null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4 border-b border-edge pb-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ochre">
            Magiczny Miecz
          </h1>
          <p className="text-sm text-muted">
            Tura {game.turn} · {seats.filter((s) => s.player_name).length} graczy
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-muted">Kod stołu</p>
          <p className="tnum font-[family-name:var(--font-display)] text-3xl tracking-[0.25em] text-ink">
            {game.join_code}
          </p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {seats.map((seat) => (
          <SeatCard key={seat.id} seat={seat} />
        ))}
        {seats.length < 6 && (
          <button
            onClick={join}
            className="rounded-lg border border-dashed border-edge px-4 py-8 text-sm text-muted transition hover:border-ochre hover:text-ink"
          >
            + Dołącz do stołu
          </button>
        )}
      </section>

      {token && mySeat && (
        <section className="mt-12">
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-lg text-ink">
            Wybierz postać
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CHARACTERS.map((character) => (
              <button
                key={character.id}
                disabled={taken.has(character.id)}
                onClick={() => pickCharacter(character.id)}
                className="rounded border border-edge bg-panel px-3 py-2 text-left text-sm transition hover:border-ochre disabled:opacity-30"
              >
                <span className="block font-medium text-ink">{character.name}</span>
                <span className="tnum text-xs text-muted">
                  Miecz {character.miecz} · Magia {character.magia} · {character.nature}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function SeatCard({ seat }: { seat: Seat }) {
  const character = CHARACTERS.find((c) => c.id === seat.character_id);
  return (
    <article className="rounded-lg border border-edge bg-panel p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="font-[family-name:var(--font-display)] text-ink">
          {seat.player_name ?? <span className="text-muted">wolne miejsce</span>}
        </h3>
        {seat.is_host && <span className="text-[10px] uppercase text-muted">gospodarz</span>}
      </header>

      {character ? (
        <>
          <p className="mb-3 text-sm text-ochre">{character.name}</p>
          <dl className="tnum grid grid-cols-4 gap-2 text-center text-sm">
            <Stat label="Miecz" value={seat.miecz_own} className="text-miecz" />
            <Stat label="Magia" value={seat.magia_own} className="text-magia" />
            <Stat label="Życie" value={seat.zycie} className="text-zycie" />
            <Stat label="Złoto" value={seat.zloto} className="text-zloto" />
          </dl>
          <p className="mt-3 text-xs text-muted">
            {seat.field_id ? (FIELD_NAMES.get(seat.field_id) ?? seat.field_id) : "—"}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">bez postaci</p>
      )}
    </article>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`text-xl font-medium ${className}`}>{value}</dd>
    </div>
  );
}
