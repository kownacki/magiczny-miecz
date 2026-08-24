"use client";

import { use, useCallback, useEffect, useState } from "react";
import characters from "@/data/characters.json";
import type { Character } from "@/data/types";
import { DOLNY_KRAG, KAMIENNY_MOST } from "@/lib/engine/board";
import type { TurnPhase } from "@/lib/engine/turn";
import { TurnPanel } from "./turn-panel";

const CHARACTERS = characters as Character[];
const FIELD_NAMES = new Map(
  [...DOLNY_KRAG, ...KAMIENNY_MOST].map((field) => [field.id, field.name]),
);

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
  turns_lost: number;
  eliminated: boolean;
  is_host: boolean;
}

interface Game {
  id: string;
  join_code: string;
  status: string;
  active_seat: number | null;
  turn: number;
  revision: number;
  die_source: string;
  turn_state: TurnPhase;
}

/** The shared table screen: the whole game state everyone is allowed to see. */
export default function Table({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mySeatIndex, setMySeatIndex] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const stored = localStorage.getItem(`mm:${code}`);
    const query = stored ? `?token=${encodeURIComponent(stored)}` : "";
    const response = await fetch(`/api/games/${code}${query}`);
    if (!response.ok) return setError((await response.json()).error ?? "Błąd");
    const data = await response.json();
    setGame(data.game);
    setSeats(data.seats);
    setMySeatIndex(data.mySeatIndex);
  }, [code]);

  useEffect(() => {
    // Polling stands in for the Realtime revision ping. Two seconds is
    // imperceptible at a table where a turn takes a minute, and every refetch
    // still goes through the route handler, so the secrecy model is unchanged.
    //
    // The lint rule cannot see that `refresh` is async: its every setState runs
    // after `await fetch`, so nothing is set synchronously during the effect.
    // This is exactly the "subscribe to an external system" shape the rule's
    // own message endorses — the external system here being the table's state
    // on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [code, refresh]);

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        // Read the token at call time rather than holding it in state: it only
        // exists in localStorage, which is unavailable while this renders on
        // the server, and mirroring it into state meant setting state inside an
        // effect for no gain.
        const response = await fetch(`/api/games/${code}/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, token: localStorage.getItem(`mm:${code}`) }),
        });
        if (!response.ok) setError((await response.json()).error);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [code, refresh],
  );

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
    refresh();
  }

  if (error && !game) {
    return <Centered>{<span className="text-vermilion">{error}</span>}</Centered>;
  }
  if (!game) return <Centered>Wczytuję stół…</Centered>;

  const mySeat = seats.find((seat) => seat.seat_index === mySeatIndex);
  const active = seats.find((seat) => seat.seat_index === game.active_seat);
  const seated = seats.filter((seat) => seat.character_id);
  const taken = new Set(seats.map((seat) => seat.character_id).filter(Boolean));
  const playing = game.status === "playing";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4 border-b border-edge pb-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ochre">
            Magiczny Miecz
          </h1>
          <p className="text-sm text-muted">
            {playing ? `Tura ${game.turn}` : "Poczekalnia"} · {seated.length} postaci
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-muted">Kod stołu</p>
          <p className="tnum font-[family-name:var(--font-display)] text-3xl tracking-[0.25em] text-ink">
            {game.join_code}
          </p>
        </div>
      </header>

      {error && <p className="mb-4 text-sm text-vermilion">{error}</p>}

      {playing && active && (
        <div className="mb-8">
          <TurnPanel
            phase={game.turn_state}
            isMine={mySeatIndex !== null && active.seat_index === mySeatIndex}
            playerName={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
            fieldName={
              active.field_id ? (FIELD_NAMES.get(active.field_id) ?? active.field_id) : "—"
            }
            dieSource={game.die_source}
            busy={busy}
            onAction={(body) => post("turn", body)}
          />
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {seats.map((seat) => (
          <SeatCard
            key={seat.id}
            seat={seat}
            active={playing && seat.seat_index === game.active_seat}
            canAdjust={mySeatIndex !== null}
            onAdjust={(stat, delta) => post("adjust", { seatId: seat.id, stat, delta })}
          />
        ))}
        {seats.length < 6 && !playing && (
          <button
            onClick={join}
            className="rounded-lg border border-dashed border-edge px-4 py-8 text-sm text-muted transition hover:border-ochre hover:text-ink"
          >
            + Dołącz do stołu
          </button>
        )}
      </section>

      {!playing && mySeat && !mySeat.character_id && (
        <section className="mt-12">
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-lg text-ink">
            Wybierz postać
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CHARACTERS.map((character) => (
              <button
                key={character.id}
                disabled={taken.has(character.id) || busy}
                onClick={() => post("character", { characterId: character.id })}
                className="rounded border border-edge bg-panel px-3 py-2 text-left text-sm transition hover:border-ochre disabled:opacity-30"
              >
                <span className="block font-medium text-ink">{character.name}</span>
                <span className="tnum text-xs text-muted">
                  Miecz {character.miecz} · Magia {character.magia} · {character.nature}
                </span>
                <span className="block text-[11px] text-muted/70">start: {character.start}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!playing && seated.length >= 2 && (
        <button
          disabled={busy}
          onClick={() => post("start", {})}
          className="mt-10 rounded-lg border border-ochre/50 bg-raised px-6 py-3 font-[family-name:var(--font-display)] text-ink transition hover:bg-edge disabled:opacity-50"
        >
          Rozpocznij grę
        </button>
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-muted">
      {children}
    </main>
  );
}

function SeatCard({
  seat,
  active,
  canAdjust,
  onAdjust,
}: {
  seat: Seat;
  active: boolean;
  canAdjust: boolean;
  onAdjust: (stat: string, delta: number) => void;
}) {
  const character = CHARACTERS.find((c) => c.id === seat.character_id);
  return (
    <article
      className={`rounded-lg border bg-panel p-4 transition ${
        active ? "border-ochre shadow-[0_0_0_1px_var(--color-ochre)]" : "border-edge"
      }`}
    >
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-[family-name:var(--font-display)] text-ink">
          {seat.player_name ?? <span className="text-muted">wolne miejsce</span>}
        </h3>
        {seat.turns_lost > 0 && (
          <span className="text-[10px] uppercase text-vermilion">
            traci {seat.turns_lost}
          </span>
        )}
      </header>

      {character ? (
        <>
          <p className="mb-3 text-sm text-ochre">{character.name}</p>
          <dl className="tnum grid grid-cols-4 gap-2 text-center text-sm">
            <Stat label="Miecz" value={seat.miecz_own} tone="text-miecz" stat="miecz" canAdjust={canAdjust} onAdjust={onAdjust} />
            <Stat label="Magia" value={seat.magia_own} tone="text-magia" stat="magia" canAdjust={canAdjust} onAdjust={onAdjust} />
            <Stat label="Życie" value={seat.zycie} tone="text-zycie" stat="zycie" canAdjust={canAdjust} onAdjust={onAdjust} />
            <Stat label="Złoto" value={seat.zloto} tone="text-zloto" stat="zloto" canAdjust={canAdjust} onAdjust={onAdjust} />
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

/**
 * One tracked value with its correction buttons.
 *
 * The +/- are always available to any seated player, not just the value's
 * owner. At a table people spot each other's miscounts, and an override that
 * only the owner can use is useless in the moment someone else notices.
 */
function Stat({
  label,
  value,
  tone,
  stat,
  canAdjust,
  onAdjust,
}: {
  label: string;
  value: number;
  tone: string;
  stat: string;
  canAdjust: boolean;
  onAdjust: (stat: string, delta: number) => void;
}) {
  return (
    <div className="group">
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`text-xl font-medium ${tone}`}>{value}</dd>
      {canAdjust && (
        <div className="mt-1 flex justify-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={() => onAdjust(stat, -1)}
            className="h-5 w-5 rounded border border-edge text-[11px] leading-none text-muted hover:border-vermilion hover:text-ink"
          >
            −
          </button>
          <button
            onClick={() => onAdjust(stat, 1)}
            className="h-5 w-5 rounded border border-edge text-[11px] leading-none text-muted hover:border-verdigris hover:text-ink"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
