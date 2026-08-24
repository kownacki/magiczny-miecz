"use client";

import { use, useCallback, useEffect, useState } from "react";
import characters from "@/data/characters.json";
import type { Character } from "@/data/types";
import { FIELDS } from "@/lib/engine/board";
import { fieldWithText } from "@/lib/engine/fieldText";
import { abilitiesOf, skipsRollAt, type Ability } from "@/lib/engine/abilities";
import { manualNote } from "@/lib/engine/coverage";
import { abilitiesOfCharacter, notesForCharacter } from "@/lib/engine/characters";
import { characterImageUrl } from "@/lib/engine/cardImages";
import Image from "next/image";
import type { TurnPhase } from "@/lib/engine/turn";
import { TurnPanel } from "./turn-panel";
import { CardView, type ShownCard } from "./card-view";
import { SeatActions } from "./seat-actions";
import { SpellHand } from "./spell-hand";
import { momentOf } from "@/lib/engine/spells";
import { BoardMap } from "./board-map";
import events from "@/data/events.json";
import spells from "@/data/spells.json";
import items from "@/data/items.json";
import type { EventCard, Item, Spell } from "@/data/types";

const CHARACTERS = characters as Character[];
const EVENTS = events as EventCard[];

/**
 * Every card a seat can hold, by id, across all four decks.
 *
 * A hand mixes them: an item from the event deck, a Zaklęcie from the spell
 * pile, a trophy that was a Wróg. Looking only in the event deck left spells
 * showing their raw id.
 */
const CARD_NAMES = new Map<string, string>([
  ...EVENTS.map((c) => [c.id, c.name] as const),
  ...(spells as Spell[]).map((c) => [c.id, c.name] as const),
  ...(items as Item[]).map((c) => [c.id, c.name] as const),
]);
const FIELD_NAMES = new Map(
  [...FIELDS.values()].map((field) => [field.id, field.name]),
);

interface Held {
  id: string;
  cardId: string;
  kind: "spell" | "item" | "friend" | "trophy";
  face: "open" | "hidden";
}

interface Seat {
  id: string;
  seat_index: number;
  player_name: string | null;
  character_id: string | null;
  field_id: string | null;
  miecz_own: number;
  magia_own: number;
  /** Own points plus everything carried (1.5, 2.5), computed server-side. */
  miecz_total: number;
  magia_total: number;
  zycie: number;
  zloto: number;
  nature: string | null;
  turns_lost: number;
  eliminated: boolean;
  is_host: boolean;
  holdings: Held[];
  /** Cards this viewer is not allowed to see the faces of (9.3). */
  hidden_count: number;
}

interface FieldCard {
  fieldId: string;
  cardId: string;
}

interface Game {
  id: string;
  join_code: string;
  mode: string;
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
  /** Cards lying face up on the board (16.8) — public to every seat. */
  const [fieldCards, setFieldCards] = useState<FieldCard[]>([]);
  /** A field the player tapped on the map, to read what it says. */
  const [inspecting, setInspecting] = useState<string | null>(null);
  /** What the app just decided by itself, shown until the next action. */
  const [notice, setNotice] = useState<string | null>(null);
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
    setFieldCards(data.fieldCards ?? []);
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
        if (!response.ok) {
          setError((await response.json()).error);
        } else {
          // Anything the app decided on the player's behalf has to be visible,
          // or the table is being asked to take the referee's word for it. The
          // Trzęsawiska roll is the first of these; the roll is journalled too,
          // but the journal is not what someone is looking at mid-turn.
          setNotice(describeResult(await response.json().catch(() => null)));
        }
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [code, refresh],
  );

  async function leave() {
    const seated = mySeatIndex !== null;
    if (!seated) return;
    const confirmed = confirm(
      playing
        ? "Opuścić stół? Twoja postać wypada z gry — tego nie da się cofnąć."
        : "Opuścić stół?",
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/games/${code}/leave`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: localStorage.getItem(`mm:${code}`) }),
      });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      // Forget the seat locally too, or this browser keeps showing the
      // controls for a seat it no longer holds.
      localStorage.removeItem(`mm:${code}`);
      setMySeatIndex(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Claims a seat for THIS device. Only offered when it holds none — joining
   * twice from one browser used to overwrite its identity.
   */
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

  /**
   * Adds a player who is sitting at this table but has no device of their own.
   *
   * This is the ordinary case, not an edge case: one laptop in the middle and
   * everyone playing on it. The seat's token is deliberately discarded rather
   * than stored — this device already has an identity, and taking on a second
   * one is the bug that stranded a player earlier. The table screen acts for
   * them the same way it acts for anyone whose turn it is.
   */
  async function addLocalPlayer() {
    const name = prompt("Imię gracza?");
    if (name === null) return;
    const response = await fetch(`/api/games/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) return setError((await response.json()).error);
    refresh();
  }

  if (error && !game) {
    return <Centered>{<span className="text-vermilion">{error}</span>}</Centered>;
  }
  if (!game) return <Centered>Wczytuję stół…</Centered>;

  const mySeat = seats.find((seat) => seat.seat_index === mySeatIndex);
  // The shared screen in the middle of the table. Whoever's turn it is reaches
  // over and taps it, so it drives the active player rather than sitting idle
  // saying "waiting".
  const isTableScreen = mySeat?.is_host === true && game.mode === "companion";
  const tableScreenHolder = seats.find((seat) => seat.is_host)?.player_name ?? null;

  // Whose character is being chosen. This device's own seat first, then any
  // seat with no device of its own — otherwise a locally-added player could
  // never be given a character.
  const pickingFor =
    mySeat && !mySeat.character_id
      ? mySeat
      : (seats.find((seat) => !seat.character_id) ?? null);

  // Cards in play this turn. A fight keeps the stack it interrupted, so the
  // panel does not empty out mid-combat.
  const shown: ShownCard[] = (() => {
    const state = game.turn_state;
    const drawn =
      state?.phase === "pole"
        ? state.drawn
        : state?.phase === "walka"
          ? state.fight.drawn
          : [];
    return drawn.map((entry) => ({
      cardId: entry.cardId,
      cardClass: entry.cardClass,
      ref: entry.ref,
      name: EVENTS.find((c) => c.id === entry.cardId)?.name ?? entry.cardId,
    }));
  })();
  const active = seats.find((seat) => seat.seat_index === game.active_seat);
  const seated = seats.filter((seat) => seat.character_id);
  const taken = new Set(seats.map((seat) => seat.character_id).filter(Boolean));
  const playing = game.status === "playing";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ochre">
            Magiczny Miecz
          </h1>
          <p className="text-sm text-muted">
            {playing ? `Tura ${game.turn}` : "Poczekalnia"} · {seated.length} postaci
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs uppercase tracking-widest text-muted">Kod stołu</p>
          <p className="tnum font-[family-name:var(--font-display)] text-3xl tracking-[0.25em] text-ink">
            {game.join_code}
          </p>
          {mySeatIndex !== null && (
            <button
              onClick={leave}
              disabled={busy}
              className="mt-1 text-[11px] text-muted underline underline-offset-2 transition hover:text-vermilion disabled:opacity-50"
            >
              Opuść stół
            </button>
          )}
        </div>
      </header>

      {error && <p className="mb-4 text-sm text-vermilion">{error}</p>}
      {notice && !error && (
        <p className="mb-4 rounded border border-ochre/30 bg-panel/60 px-3 py-2 text-sm text-ochre">
          {notice}
        </p>
      )}

      {!playing && mySeatIndex !== null && (
        <section className="mb-6 rounded border border-edge/60 bg-panel/50 p-3">
          <p className="mb-2 text-xs uppercase tracking-widest text-muted">Tryb gry</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ModeChoice
              active={game.mode === "simulation"}
              disabled={busy}
              onPick={() => post("mode", { mode: "simulation" })}
              title="Pełna symulacja"
              blurb="Aplikacja prowadzi całą grę: tasuje talię, ciągnie Karty Zdarzeń i rzuca kostką. Plansza i karty nie są potrzebne."
            />
            <ModeChoice
              active={game.mode === "companion"}
              disabled={busy}
              onPick={() => post("mode", { mode: "companion" })}
              title="Sędzia przy planszy"
              blurb="Gracie na prawdziwej planszy prawdziwymi kartami. Aplikacja liczy, pilnuje kolejności i podpowiada — mówicie jej, co wyciągnęliście."
            />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Tryb można zmienić tylko przed rozpoczęciem gry.
          </p>
        </section>
      )}

      {playing && mySeatIndex !== null && game.mode === "companion" && (
        <section className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-edge/60 bg-panel/50 px-3 py-2 text-xs">
          {isTableScreen ? (
            <>
              <span className="text-ochre">To urządzenie obsługuje wszystkich graczy.</span>
              <span className="text-muted">
                Podaj je dookoła stołu — każdy gra na nim w swojej turze.
              </span>
            </>
          ) : (
            <>
              <span className="text-muted">
                Wszystkich graczy obsługuje urządzenie gracza{" "}
                <span className="text-ink">{tableScreenHolder ?? "—"}</span>. To urządzenie
                gra tylko w turze gracza{" "}
                <span className="text-ink">{mySeat?.player_name ?? "—"}</span>.
              </span>
              <button
                onClick={() => post("host", {})}
                disabled={busy}
                className="rounded border border-edge px-2 py-1 text-ink transition hover:border-ochre disabled:opacity-50"
              >
                Graj tu za wszystkich
              </button>
            </>
          )}
        </section>
      )}

      {playing && (
        <section className="mb-8 flex flex-col items-center gap-3 lg:flex-row lg:items-start lg:gap-6">
          <BoardMap
            seats={seats.map((seat) => ({
              id: seat.id,
              seatIndex: seat.seat_index,
              name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
              fieldId: seat.field_id,
              eliminated: seat.eliminated,
            }))}
            activeSeatIndex={game.active_seat}
            cardsOnFields={fieldCards.reduce<Record<string, number>>((count, card) => {
              count[card.fieldId] = (count[card.fieldId] ?? 0) + 1;
              return count;
            }, {})}
            // While the active character is choosing a direction, both landing
            // squares are lit so the choice is made by looking at the board
            // rather than by reading two field names.
            highlight={
              game.turn_state.phase === "ruch"
                ? game.turn_state.options.map((option) => option.fieldId)
                : []
            }
            onPick={(fieldId) => setInspecting(fieldId)}
          />
          <FieldNote
            fieldId={inspecting ?? active?.field_id ?? null}
            pinned={inspecting !== null}
            onClear={() => setInspecting(null)}
          />
        </section>
      )}

      {playing && active && (
        <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
          <TurnPanel
            phase={game.turn_state}
            isMine={
              (mySeatIndex !== null && active.seat_index === mySeatIndex) || isTableScreen
            }
            actingForOther={isTableScreen && active.seat_index !== mySeatIndex}
            playerName={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
            fieldName={
              active.field_id ? (FIELD_NAMES.get(active.field_id) ?? active.field_id) : "—"
            }
            fieldText={
              active.field_id ? (fieldWithText(active.field_id)?.text ?? null) : null
            }
            fieldId={active.field_id}
            rollSkippedBy={rollSkippedBy(active)}
            dieSource={game.die_source}
            mode={game.mode}
            busy={busy}
            onAction={(body) => post("turn", body)}
            onSuggestion={(stat, delta, reason) =>
              post("adjust", { seatId: active.id, stat, delta, reason })
            }
            onTake={(cardId) => post("holdings", { action: "take", seatId: active.id, cardId })}
          />
          <CardView cards={shown} />
        </div>
      )}

      {/* 9.3 keeps a hand secret, so this renders only for the seat that holds
          it — and 17.7 means a spell can be spoken during somebody else's
          fight, so it is not gated on whose turn it is. */}
      {playing && mySeat && (
        <SpellHand
          spells={mySeat.holdings
            .filter((held) => held.kind === "spell")
            .map((held) => ({ holdingId: held.id, cardId: held.cardId }))}
          moment={momentOf(game.turn_state.phase, game.turn_state.phase !== "rzut")}
          opponents={seats
            .filter((seat) => seat.character_id && seat.seat_index !== mySeat.seat_index)
            .map((seat) => ({
              seatIndex: seat.seat_index,
              name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
            }))}
          busy={busy}
          onCast={(holdingId, targetSeat) =>
            post("holdings", {
              action: "cast",
              seatId: mySeat.id,
              holdingId,
              ...(targetSeat !== undefined ? { targetSeat } : {}),
            })
          }
        />
      )}

      {playing && active && (mySeatIndex === active.seat_index || isTableScreen) && (
        <div className="mb-8">
          <SeatActions
            busy={busy}
            nature={active.nature}
            canFightBeast={active.field_id === "zamek-bestii"}
            onSpell={() => post("holdings", { action: "spell", seatId: active.id })}
            onNature={(nature) =>
              post("holdings", { action: "nature", seatId: active.id, nature })
            }
            onStone={() => post("holdings", { action: "stone", seatId: active.id })}
            // Healing is not the same as gaining Życie: 4.7 caps it at the
            // starting four while 4.6 leaves gains uncapped, so it goes through
            // its own endpoint rather than the generic adjustment.
            onHeal={() => post("holdings", { action: "heal", seatId: active.id })}
            onBeast={() => post("turn", { action: "beast" })}
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
            isMine={seat.seat_index === mySeatIndex}
            onAdjust={(stat, delta) => post("adjust", { seatId: seat.id, stat, delta })}
            onDrop={(holdingId) => post("holdings", { action: "drop", holdingId })}
            onTrade={() => post("holdings", { action: "trade", seatId: seat.id })}
          />
        ))}
        {seats.length < 6 && !playing && (
          <button
            onClick={mySeatIndex === null ? join : addLocalPlayer}
            className="rounded-lg border border-dashed border-edge px-4 py-8 text-sm text-muted transition hover:border-ochre hover:text-ink"
          >
            {mySeatIndex === null ? "+ Dołącz do stołu" : "+ Dodaj gracza"}
          </button>
        )}
      </section>

      {!playing && pickingFor && (
        <section className="mt-12">
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-lg text-ink">
            Wybierz postać{pickingFor.seat_index !== mySeatIndex
              ? ` — ${pickingFor.player_name ?? `miejsce ${pickingFor.seat_index + 1}`}`
              : ""}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CHARACTERS.map((character) => (
              <button
                key={character.id}
                disabled={taken.has(character.id) || busy}
                onClick={() =>
                  post("character", { characterId: character.id, seatId: pickingFor.id })
                }
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

const KIND_LABEL: Record<Held["kind"], string> = {
  item: "Przedmiot",
  friend: "Przyjaciel",
  trophy: "Trofeum",
  spell: "Zaklęcie",
};

/**
 * What a seat is carrying.
 *
 * Another player's concealed spells never reach this component — the server
 * strips them and sends a count instead (9.3) — so there is nothing here that
 * could leak by rendering carelessly.
 */
function Hand({
  seat,
  isMine,
  canAct,
  trophies,
  onDrop,
  onTrade,
}: {
  seat: Seat;
  isMine: boolean;
  canAct: boolean;
  trophies: number;
  onDrop: (holdingId: string) => void;
  onTrade: () => void;
}) {
  if (seat.holdings.length === 0 && seat.hidden_count === 0) return null;

  return (
    <div className="mt-3 border-t border-edge pt-2">
      <ul className="flex flex-col gap-1">
        {seat.holdings.map((held) => (
          <li key={held.id} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-ink">
                {CARD_NAMES.get(held.cardId) ?? held.cardId}
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="text-[10px] uppercase text-muted">
                  {KIND_LABEL[held.kind]}
                </span>
                {canAct && (
                  <button
                    onClick={() => onDrop(held.id)}
                    className="text-[10px] text-muted underline hover:text-vermilion"
                  >
                    odrzuć
                  </button>
                )}
              </span>
            </div>
            {/* What the card actually does, for the ones whose rule the app is
                holding to. Worth the line: half of these change what happens
                three fields away, and a player cannot be expected to remember
                which of their four Przyjaciele covers the Krypta Upiorów. */}
            {describeAbilities(held.cardId).length > 0 && (
              <p className="text-[10px] leading-snug text-verdigris/80">
                {describeAbilities(held.cardId).join(" · ")}
              </p>
            )}
            {/* And what it does that the app is NOT watching for. A held card
                is exactly where this matters: its rule fires somewhere else,
                turns later, when nobody is looking at the card any more. */}
            {manualNote(held.cardId) && (
              <p className="text-[10px] leading-snug text-ochre/70">
                ↳ {manualNote(held.cardId)}
              </p>
            )}
          </li>
        ))}
      </ul>

      {seat.hidden_count > 0 && (
        <p className="mt-1 text-[11px] text-muted">
          {seat.hidden_count} zakryt{seat.hidden_count === 1 ? "e Zaklęcie" : "ych Zaklęć"}
        </p>
      )}

      {isMine && trophies > 0 && (
        <button
          onClick={onTrade}
          className="mt-2 rounded border border-edge px-2 py-1 text-[11px] text-ink transition hover:border-ochre"
        >
          Wymień trofea na Miecz (1.4)
        </button>
      )}
    </div>
  );
}

/** One of the two ways to play, stated in full rather than as a label on a switch. */
function ModeChoice({
  active,
  disabled,
  onPick,
  title,
  blurb,
}: {
  active: boolean;
  disabled: boolean;
  onPick: () => void;
  title: string;
  blurb: string;
}) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={`flex-1 rounded border px-3 py-2 text-left transition disabled:opacity-50 ${
        active ? "border-ochre bg-raised" : "border-edge hover:border-ochre/60"
      }`}
    >
      <span className={`block text-sm ${active ? "text-ochre" : "text-ink"}`}>{title}</span>
      <span className="mt-1 block text-[11px] leading-relaxed text-muted">{blurb}</span>
    </button>
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
  isMine,
  onAdjust,
  onDrop,
  onTrade,
}: {
  seat: Seat;
  active: boolean;
  canAdjust: boolean;
  isMine: boolean;
  onAdjust: (stat: string, delta: number) => void;
  onDrop: (holdingId: string) => void;
  onTrade: () => void;
}) {
  const character = CHARACTERS.find((c) => c.id === seat.character_id);
  const trophies = seat.holdings.filter((h) => h.kind === "trophy");
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
          <div className="mb-3 flex items-center gap-3">
            {/* The character card itself, small. It carries the abilities,
                which no amount of stat display replaces — half of what a
                character can do is prose on this card. */}
            {characterImageUrl(character.id) && (
              <Image
                src={characterImageUrl(character.id)!}
                alt={character.name}
                width={64}
                height={92}
                className="h-auto w-16 shrink-0 rounded border border-edge"
                unoptimized
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm text-ochre">{character.name}</p>
              <p className="text-[10px] text-muted">
                {seat.nature ?? "natura nieustalona"}
              </p>
            </div>
          </div>
          <dl className="tnum grid grid-cols-4 gap-2 text-center text-sm">
            <Stat
              label="Miecz"
              value={seat.miecz_own}
              total={seat.miecz_total}
              tone="text-miecz"
              stat="miecz"
              canAdjust={canAdjust}
              onAdjust={onAdjust}
            />
            <Stat
              label="Magia"
              value={seat.magia_own}
              total={seat.magia_total}
              tone="text-magia"
              stat="magia"
              canAdjust={canAdjust}
              onAdjust={onAdjust}
            />
            <Stat label="Życie" value={seat.zycie} tone="text-zycie" stat="zycie" canAdjust={canAdjust} onAdjust={onAdjust} />
            <Stat label="Złoto" value={seat.zloto} tone="text-zloto" stat="zloto" canAdjust={canAdjust} onAdjust={onAdjust} />
          </dl>

          <Hand
            seat={seat}
            isMine={isMine}
            canAct={canAdjust}
            trophies={trophies.length}
            onDrop={onDrop}
            onTrade={onTrade}
          />
          <p className="mt-3 text-xs text-muted">
            {seat.field_id ? (FIELD_NAMES.get(seat.field_id) ?? seat.field_id) : "—"}
          </p>
          {character.abilities.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted">
                Zdolności ({character.abilities.length})
                {abilitiesOfCharacter(seat.character_id).length > 0 && (
                  <span className="ml-2 normal-case tracking-normal text-verdigris/80">
                    {abilitiesOfCharacter(seat.character_id).map(describeAbility).join(" · ")}
                  </span>
                )}
              </summary>
              {/* Which of them the app is watching for, and which the player has
                  to remember. A Charakterystyka overrides the general rules
                  (8.2), so a power nobody applies is a rule quietly dropped. */}
              {notesForCharacter(seat.character_id).length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5 border-l-2 border-ochre/40 pl-2 text-[10px] leading-snug text-ochre/80">
                  {notesForCharacter(seat.character_id).map((note) => (
                    <li key={note}>↳ {note}</li>
                  ))}
                </ul>
              )}
              <ol className="mt-1 flex list-decimal flex-col gap-1 pl-4 text-[11px] leading-relaxed text-muted">
                {character.abilities.map((ability, index) => (
                  <li key={index}>{ability}</li>
                ))}
              </ol>
            </details>
          )}
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
  total,
  tone,
  stat,
  canAdjust,
  onAdjust,
}: {
  label: string;
  value: number;
  /** Own points plus what is carried. Shown only when the two differ. */
  total?: number;
  tone: string;
  stat: string;
  canAdjust: boolean;
  onAdjust: (stat: string, delta: number) => void;
}) {
  return (
    <div className="group">
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`text-xl font-medium ${tone}`}>
        {/* The +/- move OWN points, which are what the rules floor at the
            starting value (1.3, 2.3). The total is derived from the cards on
            the table and is not editable — correcting it means changing what is
            held, not typing a different number. */}
        {total !== undefined && total !== value ? (
          <>
            {total}
            <span className="ml-1 text-[11px] text-muted">({value})</span>
          </>
        ) : (
          value
        )}
      </dd>
      {canAdjust && (
        // Always visible rather than revealed on hover. Phones are the primary
        // device at a table and have no hover, so a hover-gated override is an
        // override that does not exist for most of the people using it.
        <div className="mt-1 flex justify-center gap-1">
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

/**
 * What the field under the pointer says.
 *
 * The map can only ever show a field's name, and half the board's rules are
 * printed on the fields themselves — so tapping one has to produce the text, or
 * the map would send players back to squinting at the physical board for
 * something the app already knows.
 */
function FieldNote({
  fieldId,
  pinned,
  onClear,
}: {
  fieldId: string | null;
  pinned: boolean;
  onClear: () => void;
}) {
  const field = fieldId ? fieldWithText(fieldId) : null;
  if (!field) return null;
  return (
    <div className="w-full rounded-lg border border-edge/60 bg-panel/50 p-4 lg:max-w-xs">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-ochre">{field.name}</h3>
        {pinned && (
          <button onClick={onClear} className="text-[11px] text-muted hover:text-ink">
            wróć do pola gracza
          </button>
        )}
      </div>
      {field.draw ? (
        <p className="mb-2 text-[11px] uppercase tracking-wide text-verdigris">
          Wyciągnij {field.draw} {field.draw === 1 ? "kartę" : "karty"}
        </p>
      ) : null}
      <p className="whitespace-pre-line text-xs leading-relaxed text-muted">
        {field.text ?? "Brak przepisanego tekstu dla tego Obszaru."}
      </p>
    </div>
  );
}

/**
 * A one-line account of something the app worked out on its own.
 *
 * Only the results that were not visible as they happened need this. A card the
 * player drew is already on screen; two dice thrown inside a route handler are
 * not, and a referee that says only "you failed" is exactly the referee this
 * app exists to not be.
 */
function describeResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const data = result as {
    dice?: number[];
    magia?: number;
    outcome?: string;
    spell?: string;
    effect?: string;
  };
  // A spell has to be announced loudly: 9.6 reaches its victim anywhere on the
  // board, so the person it lands on may not be looking at this turn at all.
  if (data.spell) return `Rzucono Zaklęcie: ${data.spell}. ${data.effect ?? ""}`.trim();
  if (!Array.isArray(data.dice) || typeof data.magia !== "number") return null;
  const total = data.dice.reduce((sum, die) => sum + die, 0);
  const verdict =
    data.outcome === "udana" ? "przeprawa udana" : "porażka — tracisz 1 Życie";
  return `Trzęsawiska: ${data.dice.join(" + ")} = ${total} przeciw Magii ${data.magia} — ${verdict}.`;
}

/**
 * A card's standing rules, in the fewest words that still say what changes.
 *
 * Only the encoded ones appear. A card with no entry shows nothing here rather
 * than a placeholder, because its printed text is the authority and inventing a
 * summary for it would be the referee overstepping.
 */
function describeAbilities(cardId: string): string[] {
  return abilitiesOf(cardId).map(describeAbility);
}

function describeAbility(ability: Ability): string {
  switch (ability.kind) {
    case "punkty": {
      const parts = [];
      if (ability.miecz) parts.push(`+${ability.miecz} Miecza`);
      if (ability.magia) parts.push(`+${ability.magia} Magii`);
      return parts.join(", ");
    }
    case "oslona":
      return `osłona przy przegranej (rzut ≤ ${ability.upTo})`;
    case "bezpieczny": {
      const where = fieldNames(ability.fields);
      if (ability.from === "rzut") return `bez rzutu: ${where}`;
      if (ability.from === "zycie") return `bez straty Życia: ${where}`;
      return `bez straty Przedmiotu: ${where}`;
    }
    case "ucieczka":
      return `ucieczka przed Wrogiem: ${fieldNames(ability.fields)}`;
    case "udzwig":
      return ability.items === "bez-limitu"
        ? "niesie dowolną liczbę Przedmiotów"
        : `niesie +${ability.items} Przedmiotów`;
    case "ruch-bonus":
      return ability.min === ability.max
        ? `+${ability.max} do ruchu`
        : `+${ability.min}–${ability.max} do ruchu`;
    case "magia-do-miecza":
      return "w walce dodajesz Magię do Miecza";
    case "ginie-zamiast-ciebie":
      return ability.onRollUpTo
        ? `ginie zamiast ciebie (rzut ≤ ${ability.onRollUpTo})`
        : "ginie zamiast ciebie";
    case "wymagany":
      return ability.place === "most" ? "wstęp na Kamienny Most" : "wstęp do Zamku Bestii";
    case "bez-oplaty":
      return `bez opłaty: ${ability.fields.map(fieldName).filter((n, i, all) => all.indexOf(n) === i).join(", ")}`;
    case "zakazane":
      return `nie możesz używać: ${ability.cardIds.map((id) => CARD_NAMES.get(id) ?? id).join(", ")}`;
    case "przeprawa-kostki":
      return `Trzęsawiska na ${ability.dice} kostkę`;
    case "przeprawa-wszedzie":
      return ability.obstacle === "trzesawiska"
        ? "przeprawa przez Trzęsawiska w dowolnym miejscu"
        : "przeprawa przez Lodowy Las w dowolnym miejscu";
    case "uzdrowienie":
      return `do ${ability.upTo} Życia w: ${fieldName(ability.field)}`;
    case "walczy-za-ciebie":
      return `walczy za ciebie (Miecz ${ability.miecz}, Magia ${ability.magia})`;
    case "niedostepny":
      return "nie do zdobycia w Dolnym Kręgu";
    case "modyfikator-rzutu": {
      const sign = ability.dowolnyZnak
        ? `±${Math.abs(ability.delta)}`
        : `${ability.delta > 0 ? "+" : "−"}${Math.abs(ability.delta)}`;
      const where =
        ability.gdzie.na === "walke"
          ? ability.gdzie.rodzaj === "magiczna"
            ? "w walce magicznej"
            : "w walce zwykłej"
          : `na: ${ability.gdzie.fields.map(fieldName).join(", ")}`;
      return `${sign} do rzutu ${where}${ability.jednorazowy ? " (raz)" : ""}`;
    }
    case "zaklecia-ponad-limit":
      return `+${ability.count} Zaklęcie ponad limit (2.6)`;
  }
}

function fieldName(fieldId: string): string {
  return FIELDS.get(fieldId)?.name ?? fieldId;
}

/**
 * Field names for a list, without saying "Urwisko, Urwisko".
 *
 * Six places on the board are printed twice and carry suffixed ids, and a card
 * that names one almost always names both — so the ids are right and the label
 * is what needs to collapse.
 */
function fieldNames(fieldIds: readonly string[]): string {
  return [...new Set(fieldIds.map(fieldName))].join(", ");
}

/**
 * Which held card, if any, lets this character walk past the field's die roll.
 *
 * Returns the card's name rather than a boolean, because "you may skip this"
 * is much less useful to a player than "your Przewodnik lets you skip this" —
 * the second can be checked against the card lying on the table.
 */
function rollSkippedBy(seat: Seat): string | null {
  if (!seat.field_id) return null;
  for (const held of seat.holdings) {
    if (skipsRollAt(abilitiesOf(held.cardId), seat.field_id)) {
      return CARD_NAMES.get(held.cardId) ?? held.cardId;
    }
  }
  return null;
}
