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

const MAX_SEATS = 6;

/**
 * Where a game is put together, laid out like the game screen: one viewport,
 * nothing scrolls away.
 *
 * The shape follows what people actually do here. The seats are a row across
 * the middle because six of them side by side *is* the table you are about to
 * sit at; the characters are a strip along the bottom because choosing one is a
 * hand of cards you look along.
 *
 * Picking is direct — aim at a slot, tap a character, it is theirs — rather than
 * a button that opens a picker. That button existed to make room for a layout
 * where the characters were somewhere else on a long page, and the layout is
 * gone.
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
  onAddLocal,
  onJoin,
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
  pickingFor: LobbySeat | null;
  busy: boolean;
  onMode: (mode: "simulation" | "companion") => void;
  onAddLocal: (name: string) => void;
  onJoin: (name: string) => void;
  onPickFor: (seat: LobbySeat | null) => void;
  onChooseCharacter: (seat: LobbySeat, characterId: string) => void;
  onRemove: (seat: LobbySeat) => void;
  onMakeHost: (seat: LobbySeat) => void;
  onReady: (ready: boolean) => void;
  onRename: (name: string) => void;
  isHost: boolean;
  hostAway: boolean;
  onStart: () => void;
  onLibrary: () => void;
}) {
  const canAdminister = isHost || hostAway;
  const me = seats.find((seat) => seat.seatIndex === mySeatIndex) ?? null;
  const chosen = seats.filter((seat) => seat.characterId);
  const waitingOn = chosen.filter((seat) => !seat.ready && !seat.abandoned);
  const byId = new Map(characters.map((character) => [character.id, character]));

  // Whose character the strip at the bottom is choosing. Your own unless the
  // host has aimed it at somebody they are filling in for.
  const target = pickingFor ?? me;

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-edge px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-lg text-ochre">
            Magiczny Miecz
          </h1>
          <span className="text-xs text-muted">
            Poczekalnia · kod <span className="tnum tracking-[0.2em] text-ink">{code}</span>
          </span>
        </div>

        {canAdminister && (
          <div className="flex items-center gap-1 text-[11px]">
            <ModeButton
              active={mode === "simulation"}
              disabled={busy}
              onPick={() => onMode("simulation")}
              label="Pełna symulacja"
              hint="Aplikacja prowadzi całą grę — plansza i karty nie są potrzebne."
            />
            <ModeButton
              active={mode === "companion"}
              disabled={busy}
              onPick={() => onMode("companion")}
              label="Sędzia przy planszy"
              hint="Gracie prawdziwą planszą; aplikacja liczy i pilnuje kolejności."
            />
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px]">
          <button onClick={onLibrary} className="text-ochre/80 hover:text-ochre">
            Karty
          </button>
          {/* Somebody who opened the link without joining. The name is required
              — a table of "Miejsce 2" and "Miejsce 4" is nobody's game. */}
          {!me && <JoinForm busy={busy} onJoin={onJoin} />}
          {me && <RenameField name={me.playerName} busy={busy} onRename={onRename} />}
          {me && (
            <button
              disabled={busy || !me.characterId}
              onClick={() => onReady(!me.ready)}
              title={me.characterId ? undefined : "Najpierw wybierz postać"}
              className={`rounded border px-3 py-1 transition disabled:opacity-40 ${
                me.ready
                  ? "border-verdigris bg-verdigris/10 text-verdigris"
                  : "border-edge text-ink hover:border-ochre"
              }`}
            >
              {me.ready ? "Gotów ✓" : "Jestem gotów"}
            </button>
          )}
          {canAdminister &&
            (chosen.length >= 2 && waitingOn.length === 0 ? (
              <button
                onClick={onStart}
                disabled={busy}
                className="rounded border border-ochre bg-ochre/10 px-4 py-1 font-[family-name:var(--font-display)] tracking-wide text-ochre transition hover:bg-ochre/20 disabled:opacity-50"
              >
                Rozpocznij grę
              </button>
            ) : (
              <span className="text-muted">
                {chosen.length < 2
                  ? `brakuje ${2 - chosen.length} postaci`
                  : `czekamy na: ${waitingOn
                      .map((seat) => seat.playerName ?? `miejsce ${seat.seatIndex + 1}`)
                      .join(", ")}`}
              </span>
            ))}
        </div>
      </header>

      <section className="flex min-h-0 flex-1 items-center justify-center gap-3 overflow-x-auto px-4 py-3">
        {Array.from({ length: MAX_SEATS }, (_, index) => {
          const seat = seats[index];
          if (!seat) {
            return (
              <EmptySlot
                key={`empty-${index}`}
                // Only companion mode adds players by hand. There, one screen
                // sits in the middle of a real table and nobody else has a
                // device. In simulation everyone has their own and joins with
                // the code, so a slot the host fills in would be a way of
                // taking somebody else's seat before they arrive.
                canAdd={canAdminister && mode === "companion"}
                busy={busy}
                onAdd={onAddLocal}
              />
            );
          }
          const character = seat.characterId ? byId.get(seat.characterId) : null;
          return (
            <SeatSlot
              key={seat.id}
              seat={seat}
              character={character ?? null}
              isMine={seat.seatIndex === mySeatIndex}
              isTarget={target?.id === seat.id}
              canAdminister={canAdminister}
              busy={busy}
              onSelect={() => onPickFor(target?.id === seat.id ? null : seat)}
              onRemove={() => onRemove(seat)}
              onMakeHost={() => onMakeHost(seat)}
            />
          );
        })}
      </section>

      <section className="shrink-0 border-t border-edge px-4 py-2">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-widest text-muted">
            {target
              ? `Postać dla: ${target.playerName ?? `miejsce ${target.seatIndex + 1}`}`
              : "Postacie"}
          </h2>
          {pickingFor && (
            <button
              onClick={() => onPickFor(null)}
              className="text-[11px] text-muted underline hover:text-ink"
            >
              anuluj wybór
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {characters.map((character) => {
            const used = taken.has(character.id) && character.id !== target?.characterId;
            const isTargets = target?.characterId === character.id;
            const portrait = characterImageUrl(character.id);
            return (
              <button
                key={character.id}
                disabled={busy || used || !target}
                onClick={() => target && onChooseCharacter(target, character.id)}
                title={`${character.name} — Miecz ${character.miecz}, Magia ${character.magia}, ${character.nature}, start: ${character.start}`}
                className={`w-[78px] shrink-0 overflow-hidden rounded border transition disabled:cursor-default ${
                  isTargets
                    ? "border-ochre"
                    : used
                      ? "border-edge opacity-25"
                      : "border-edge hover:border-ochre disabled:opacity-40"
                }`}
              >
                {portrait ? (
                  <Image src={portrait} alt={character.name} width={78} height={111} />
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
    </main>
  );
}

/**
 * One seat, tall rather than wide: six have to sit side by side, and what a slot
 * shows — a portrait, a name, a state — stacks naturally.
 */
function SeatSlot({
  seat,
  character,
  isMine,
  isTarget,
  canAdminister,
  busy,
  onSelect,
  onRemove,
  onMakeHost,
}: {
  seat: LobbySeat;
  character: Character | null;
  isMine: boolean;
  isTarget: boolean;
  canAdminister: boolean;
  busy: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMakeHost: () => void;
}) {
  const portrait = character ? characterImageUrl(character.id) : null;

  return (
    <div
      className={`relative flex max-h-full w-[190px] shrink-0 flex-col rounded-lg border p-2 ${
        isTarget
          ? "border-ochre bg-panel"
          : isMine
            ? "border-ochre/50 bg-panel"
            : "border-edge bg-panel/50"
      }`}
    >
      {canAdminister && (
        <button
          onClick={onRemove}
          disabled={busy}
          title="Usuń ze stołu"
          className="absolute right-1 top-1 z-10 rounded px-1 text-xs text-muted transition hover:text-vermilion disabled:opacity-40"
        >
          ×
        </button>
      )}

      <p className="truncate pr-4 font-[family-name:var(--font-display)] text-base text-ink">
        {seat.playerName ?? `Miejsce ${seat.seatIndex + 1}`}
      </p>
      <p className="mb-1 h-4 truncate text-[10px]">
        {seat.isHost && <span className="text-ochre">gospodarz</span>}
        {seat.isHost && (seat.abandoned || seat.away || isMine) && (
          <span className="text-muted"> · </span>
        )}
        {seat.abandoned ? (
          <span className="text-vermilion/80">bez gracza</span>
        ) : seat.away ? (
          <span className="text-muted/70">nieobecny</span>
        ) : isMine ? (
          <span className="text-ochre/70">to ty</span>
        ) : null}
      </p>

      {/* Tapping the slot aims the character strip at it. */}
      {/* A fixed portrait box rather than a stretched one: the card is what a
          character card is, and a slot that grows to whatever height is left
          over turns an empty seat into a very tall grey rectangle. */}
      <button
        onClick={onSelect}
        disabled={busy}
        className="h-[270px] w-full shrink-0 overflow-hidden rounded border border-edge/60 transition hover:border-ochre disabled:opacity-50"
      >
        {portrait && character ? (
          <Image
            src={portrait}
            alt={character.name}
            width={174}
            height={270}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center p-2 text-center text-[11px] leading-snug text-muted">
            postać jeszcze niewybrana
          </span>
        )}
      </button>

      <div className="mt-1 flex items-baseline justify-between gap-1">
        <span className="truncate text-[10px] text-muted">{character?.name ?? "—"}</span>
        {seat.characterId && !seat.abandoned && (
          <span
            className={seat.ready ? "text-[10px] text-verdigris" : "text-[10px] text-muted/60"}
          >
            {seat.ready ? "gotów" : "czeka"}
          </span>
        )}
      </div>

      {canAdminister && !seat.isHost && !seat.abandoned && (
        <button
          onClick={onMakeHost}
          disabled={busy}
          className="mt-1 rounded border border-edge px-1 py-0.5 text-[9px] text-muted transition hover:border-ochre hover:text-ochre disabled:opacity-40"
        >
          zrób gospodarzem
        </button>
      )}
    </div>
  );
}

function JoinForm({ busy, onJoin }: { busy: boolean; onJoin: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onJoin(name);
      }}
      className="flex items-center gap-1"
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="twoje imię"
        maxLength={24}
        autoFocus
        className="w-32 rounded border border-ochre/50 bg-night px-2 py-1 text-[11px] text-ink outline-none focus:border-ochre"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded border border-ochre bg-ochre/10 px-3 py-1 text-ochre transition hover:bg-ochre/20 disabled:opacity-40"
      >
        Usiądź
      </button>
    </form>
  );
}

function EmptySlot({
  canAdd,
  busy,
  onAdd,
}: {
  canAdd: boolean;
  busy: boolean;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");

  if (!canAdd) {
    return (
      <div className="flex h-[340px] w-[190px] shrink-0 items-center justify-center rounded-lg border border-dashed border-edge/60 p-2 text-center text-[11px] leading-snug text-muted/60">
        wolne miejsce — dołączcie kodem
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onAdd(name);
        setName("");
      }}
      className="flex h-[340px] w-[190px] shrink-0 flex-col justify-center gap-2 rounded-lg border border-dashed border-edge p-2"
    >
      <span className="text-center text-[10px] uppercase tracking-widest text-muted">
        Dodaj gracza
      </span>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="imię"
        maxLength={24}
        className="rounded border border-edge bg-night px-2 py-1 text-center text-sm text-ink outline-none focus:border-ochre"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded border border-edge px-2 py-1 text-sm text-ink transition hover:border-ochre disabled:opacity-40"
      >
        + Dodaj
      </button>
    </form>
  );
}

/**
 * Changing the name you are shown under.
 *
 * People join in a hurry and type it wrong, and a table where the only fix is to
 * leave and rejoin is one where somebody plays the whole evening as "Miejsce 3".
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
        if (value.trim()) onRename(value);
      }}
      className="flex items-center gap-1"
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="twoje imię"
        maxLength={24}
        className="w-28 rounded border border-edge bg-night px-2 py-1 text-[11px] text-ink outline-none focus:border-ochre"
      />
      <button
        type="submit"
        disabled={busy || !value.trim() || value.trim() === (name ?? "")}
        className="text-muted transition hover:text-ink disabled:opacity-30"
      >
        zmień
      </button>
    </form>
  );
}

function ModeButton({
  active,
  disabled,
  onPick,
  label,
  hint,
}: {
  active: boolean;
  disabled: boolean;
  onPick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      title={hint}
      className={`rounded border px-2 py-1 transition disabled:opacity-50 ${
        active ? "border-ochre bg-ochre/10 text-ochre" : "border-edge text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
