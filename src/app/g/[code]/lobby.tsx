"use client";

import { useState } from "react";
import Image from "next/image";
import type { Character } from "@/data/types";
import { characterImageUrl } from "@/lib/engine/cardImages";

export interface LobbySeat {
  id: string;
  seatIndex: number;
  playerName: string | null;
  characterId: string | null;
  isHost: boolean;
  /** Nobody is behind this seat — see `leaveGame`. */
  abandoned: boolean;
  /** Device has gone quiet, which is not the same as having left. */
  away: boolean;
  /** Said they are ready to start. */
  ready: boolean;
}

/**
 * Where a game is put together before anybody rolls anything.
 *
 * Its own screen rather than a band above the board, because the two are
 * different jobs: here you are deciding who is playing and as whom, and none of
 * the board, the turn order or the card panels mean anything yet. Mixing them
 * made the lobby a preamble you scrolled past and left no room for the one
 * thing it has to support — changing your mind about who is at the table.
 */
export function Lobby({
  code,
  mode,
  seats,
  mySeatIndex,
  characters,
  taken,
  pickingFor,
  busy,
  onMode,
  onJoin,
  onAddLocal,
  onPickFor,
  onChooseCharacter,
  onRemove,
  onMakeHost,
  onReady,
  onRename,
  isHost,
  hostAway,
  onStart,
  onLibrary,
}: {
  code: string;
  mode: string;
  seats: LobbySeat[];
  mySeatIndex: number | null;
  characters: Character[];
  taken: Set<string | null>;
  /** The seat currently choosing a character, if any. */
  pickingFor: LobbySeat | null;
  busy: boolean;
  onMode: (mode: "simulation" | "companion") => void;
  onJoin: (name: string) => void;
  onAddLocal: (name: string) => void;
  onPickFor: (seat: LobbySeat | null) => void;
  onChooseCharacter: (seat: LobbySeat, characterId: string) => void;
  onRemove: (seat: LobbySeat) => void;
  onMakeHost: (seat: LobbySeat) => void;
  onReady: (ready: boolean) => void;
  onRename: (name: string) => void;
  /** Whether THIS device is the host — see docs/LOBBY.md. */
  isHost: boolean;
  /** The host walked away, so anybody may take the role. */
  hostAway: boolean;
  onStart: () => void;
  onLibrary: () => void;
}) {
  const ready = seats.filter((seat) => seat.characterId);
  const byId = new Map(characters.map((character) => [character.id, character]));
  // Seat management belongs to people actually at the table. A visitor who has
  // not joined yet gets one thing to do — join — rather than a row of buttons
  // the server will refuse.
  const seated = mySeatIndex !== null;
  // Administration belongs to the host (docs/LOBBY.md). The one exception is a
  // host who has walked away: without it a table can never be started again.
  const canAdminister = isHost || hostAway;
  const me = seats.find((seat) => seat.seatIndex === mySeatIndex) ?? null;
  // Only players with a character are asked; an empty chair cannot answer.
  const waitingOn = ready.filter((seat) => !seat.ready && !seat.abandoned);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ochre">
            Magiczny Miecz
          </h1>
          <p className="text-sm text-muted">
            Poczekalnia · {ready.length} z {seats.length} gotowych
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs uppercase tracking-widest text-muted">
            Dołączcie tym kodem
          </p>
          <p className="tnum font-[family-name:var(--font-display)] text-4xl tracking-[0.25em] text-ink">
            {code}
          </p>
          <button
            onClick={onLibrary}
            className="mt-1 block text-[11px] text-ochre/80 underline underline-offset-2 hover:text-ochre"
          >
            Karty do wglądu
          </button>
        </div>
      </header>

      {/* The join instruction is the lobby's real job and belongs at the top,
          not buried under the seat list: somebody is standing there with a
          phone waiting to be told what to do with it. */}
      <p className="mb-6 rounded border border-edge/60 bg-panel/50 px-3 py-2 text-sm text-muted">
        Każdy gracz otwiera tę stronę u siebie — osobne urządzenie albo osobna
        karta przeglądarki — i wpisuje kod <span className="text-ink">{code}</span>. Będzie
        miał wtedy swój prywatny widok: postać, Przedmioty i zakryte Zaklęcia.
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-xs uppercase tracking-widest text-muted">Tryb gry</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ModeChoice
            active={mode === "simulation"}
            disabled={busy || !canAdminister}
            onPick={() => onMode("simulation")}
            title="Pełna symulacja"
            blurb="Aplikacja prowadzi całą grę: tasuje talię, ciągnie Karty Zdarzeń i rzuca kostką. Plansza i karty nie są potrzebne."
          />
          <ModeChoice
            active={mode === "companion"}
            disabled={busy || !canAdminister}
            onPick={() => onMode("companion")}
            title="Sędzia przy planszy"
            blurb="Gracie na prawdziwej planszy prawdziwymi kartami. Aplikacja liczy, pilnuje kolejności i podpowiada."
          />
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Trybu nie można zmienić po rozpoczęciu gry.
          {!canAdminister && " Tryb i start ustala gospodarz."}
        </p>
      </section>

      {me && (
        <section className="mb-6 rounded-lg border border-ochre/40 bg-panel p-3">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-muted">To ty</h2>
          <div className="flex flex-wrap items-center gap-2">
            <RenameField name={me.playerName} busy={busy} onRename={onRename} />
            <button
              disabled={busy || !me.characterId}
              onClick={() => onReady(!me.ready)}
              title={me.characterId ? undefined : "Najpierw wybierz postać"}
              className={`rounded border px-3 py-1 text-sm transition disabled:opacity-40 ${
                me.ready
                  ? "border-verdigris bg-verdigris/10 text-verdigris"
                  : "border-edge text-ink hover:border-ochre"
              }`}
            >
              {me.ready ? "Jestem gotów ✓" : "Jestem gotów"}
            </button>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">
          Przy stole ({seats.length}/6)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {seats.map((seat) => {
            const character = seat.characterId ? byId.get(seat.characterId) : null;
            const portrait = character ? characterImageUrl(character.id) : null;
            return (
              <div
                key={seat.id}
                className={`rounded-lg border p-3 ${
                  seat.seatIndex === mySeatIndex
                    ? "border-ochre/60 bg-panel"
                    : "border-edge bg-panel/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  {portrait ? (
                    <Image
                      src={portrait}
                      alt={character?.name ?? ""}
                      width={56}
                      height={80}
                      className="rounded border border-edge"
                    />
                  ) : (
                    <div className="flex h-20 w-14 items-center justify-center rounded border border-dashed border-edge text-[10px] text-muted">
                      brak
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-[family-name:var(--font-display)] text-ink">
                      {seat.playerName ?? `Miejsce ${seat.seatIndex + 1}`}
                      {seat.seatIndex === mySeatIndex && (
                        <span className="ml-1 text-[10px] text-ochre">(ty)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {character ? character.name : "wybiera postać…"}
                      {seat.isHost && <span className="ml-1 text-ochre/80">· gospodarz</span>}
                      {seat.characterId && !seat.abandoned && (
                        <span className={seat.ready ? "ml-1 text-verdigris" : "ml-1 text-muted/70"}>
                          · {seat.ready ? "gotów" : "jeszcze nie"}
                        </span>
                      )}
                      {seat.abandoned ? (
                        <span className="ml-1 text-vermilion/80">· bez gracza</span>
                      ) : seat.away ? (
                        <span className="ml-1 text-muted/70">· nieobecny</span>
                      ) : null}
                    </p>
                    {character && (
                      <p className="text-[11px] text-muted/80">
                        Miecz {character.miecz} · Magia {character.magia} · {character.nature}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  {/* Choosing for yourself needs no permission; choosing for
                      somebody else is the host filling in for a player with no
                      device of their own. */}
                  {seated && (canAdminister || seat.seatIndex === mySeatIndex) && (
                  <button
                    disabled={busy}
                    onClick={() => onPickFor(seat)}
                    className="rounded border border-edge px-2 py-0.5 text-ink transition hover:border-ochre disabled:opacity-50"
                  >
                    {character ? "zmień postać" : "wybierz postać"}
                  </button>
                  )}
                  {/* Anybody at the table may remove anybody, including
                      themselves. Before a game starts there is nothing to
                      protect, and a lobby you cannot correct is the thing that
                      sends people back to the home page to start over. */}
                  {seated && (canAdminister || seat.seatIndex === mySeatIndex) && (
                    <button
                      disabled={busy}
                      onClick={() => onRemove(seat)}
                      className="rounded border border-edge px-2 py-0.5 text-muted transition hover:border-vermilion hover:text-vermilion disabled:opacity-50"
                    >
                      {seat.seatIndex === mySeatIndex ? "wyjdź" : "usuń"}
                    </button>
                  )}
                  {canAdminister && !seat.isHost && !seat.abandoned && (
                    <button
                      disabled={busy}
                      onClick={() => onMakeHost(seat)}
                      className="rounded border border-edge px-2 py-0.5 text-muted transition hover:border-ochre hover:text-ochre disabled:opacity-50"
                    >
                      zrób gospodarzem
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {seats.length < 6 && (
            <JoinTile
              seated={seated}
              busy={busy}
              onSubmit={(name) => (seated ? onAddLocal(name) : onJoin(name))}
            />
          )}
        </div>
      </section>

      {seated && pickingFor && (
        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xs uppercase tracking-widest text-muted">
              Postać dla: {pickingFor.playerName ?? `Miejsce ${pickingFor.seatIndex + 1}`}
            </h2>
            <button
              onClick={() => onPickFor(null)}
              className="text-[11px] text-muted underline hover:text-ink"
            >
              anuluj
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {characters.map((character) => {
              const used = taken.has(character.id) && character.id !== pickingFor.characterId;
              const portrait = characterImageUrl(character.id);
              return (
                <button
                  key={character.id}
                  disabled={busy || used}
                  onClick={() => onChooseCharacter(pickingFor, character.id)}
                  title={`${character.name} — Miecz ${character.miecz}, Magia ${character.magia}, ${character.nature}`}
                  className={`w-[84px] overflow-hidden rounded border transition ${
                    used
                      ? "border-edge opacity-30"
                      : "border-edge hover:border-ochre"
                  }`}
                >
                  {portrait ? (
                    <Image src={portrait} alt={character.name} width={84} height={119} />
                  ) : (
                    <span className="block p-2 text-[10px] text-ink">{character.name}</span>
                  )}
                  <span className="block truncate px-1 py-0.5 text-[9px] text-muted">
                    {character.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="border-t border-edge pt-6">
        {!seated ? (
          <p className="text-sm text-muted">
            Nie masz jeszcze miejsca przy tym stole — dołącz, żeby wybrać postać.
          </p>
        ) : !canAdminister ? (
          <p className="text-sm text-muted">
            Czekacie na gospodarza — to on rozpoczyna grę.
          </p>
        ) : ready.length >= 2 && waitingOn.length > 0 ? (
          <p className="text-sm text-muted">
            Czekamy na:{" "}
            <span className="text-ink">
              {waitingOn
                .map((seat) => seat.playerName ?? `miejsce ${seat.seatIndex + 1}`)
                .join(", ")}
            </span>
            .
          </p>
        ) : ready.length >= 2 ? (
          <button
            onClick={onStart}
            disabled={busy}
            className="rounded border border-ochre bg-ochre/10 px-6 py-3 font-[family-name:var(--font-display)] text-lg tracking-wide text-ochre transition hover:bg-ochre/20 disabled:opacity-50"
          >
            Rozpocznij grę
          </button>
        ) : (
          <p className="text-sm text-muted">
            Do gry potrzeba co najmniej 2 postaci — brakuje {2 - ready.length}.
          </p>
        )}
      </section>
    </main>
  );
}

/**
 * Taking a seat, or adding somebody who has no device of their own.
 *
 * The name is typed here rather than into a browser prompt. A native dialog
 * stops the page dead behind it, cannot be styled to match anything, and on a
 * phone arrives as a system alert in the middle of a game.
 */
function JoinTile({
  seated,
  busy,
  onSubmit,
}: {
  seated: boolean;
  busy: boolean;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name);
        setName("");
      }}
      className="flex flex-col justify-center gap-2 rounded-lg border border-dashed border-edge p-3"
    >
      <label className="text-[11px] uppercase tracking-widest text-muted">
        {seated ? "Dodaj gracza bez urządzenia" : "Dołącz do stołu"}
      </label>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="imię"
        maxLength={24}
        className="rounded border border-edge bg-panel px-2 py-1 text-sm text-ink outline-none focus:border-ochre"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded border border-edge px-2 py-1 text-sm text-ink transition hover:border-ochre disabled:opacity-50"
      >
        {seated ? "+ Dodaj" : "+ Usiądź"}
      </button>
    </form>
  );
}

/**
 * Changing the name you are shown under.
 *
 * People join in a hurry and type nothing, or type it wrong; a table where the
 * only fix is to leave and rejoin is a table where somebody plays the whole
 * evening as "Miejsce 3".
 */
function RenameField({
  name,
  busy,
  onRename,
}: {
  name: string | null;
  busy: boolean;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(name ?? "");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onRename(value);
      }}
      className="flex items-center gap-2"
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="twoje imię"
        maxLength={24}
        className="w-40 rounded border border-edge bg-night px-2 py-1 text-sm text-ink outline-none focus:border-ochre"
      />
      <button
        type="submit"
        disabled={busy || value.trim() === (name ?? "")}
        className="rounded border border-edge px-2 py-1 text-[11px] text-muted transition hover:border-ochre hover:text-ink disabled:opacity-40"
      >
        zmień
      </button>
    </form>
  );
}

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
      className={`flex-1 rounded border p-3 text-left transition disabled:opacity-50 ${
        active ? "border-ochre bg-ochre/10" : "border-edge hover:border-ochre/60"
      }`}
    >
      <span className={`block text-sm ${active ? "text-ochre" : "text-ink"}`}>{title}</span>
      <span className="mt-1 block text-[11px] leading-snug text-muted">{blurb}</span>
    </button>
  );
}
