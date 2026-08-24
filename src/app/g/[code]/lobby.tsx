"use client";

import { useState } from "react";
import Image from "next/image";
import type { Character } from "@/data/types";
import { characterImageUrl, characterStandeeUrl } from "@/lib/engine/cardImages";
import { SEAT_COLOURS } from "@/lib/engine/boardMap";

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
  /** Seated by the host in companion mode; has no device of their own. */
  noDevice: boolean;
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
  pickingFor,
  pendingCharacterId,
  busy,
  onAddLocal,
  onPickFor,
  onChooseCharacter,
  onRemove,
  onMakeHost,
  onReady,
  onRename,
  onLeave,
  onDeal,
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
  pickingFor: LobbySeat | null;
  /** Asked for, not yet granted. Everything else in the strip waits with it. */
  pendingCharacterId: string | null;
  busy: boolean;
  onAddLocal: (name: string) => void;
  onPickFor: (seat: LobbySeat | null) => void;
  onChooseCharacter: (seat: LobbySeat, characterId: string) => void;
  onRemove: (seat: LobbySeat) => void;
  onMakeHost: (seat: LobbySeat) => void;
  onReady: (ready: boolean) => void;
  onRename: (name: string) => void;
  onLeave: () => void;
  onDeal: () => void;
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

  /**
   * Whose character you may choose.
   *
   * Your own, always — and it is what the strip is aimed at unless you say
   * otherwise. The one exception is companion mode, where the host seats people
   * who have no device of their own and so has to choose for them.
   *
   * Nobody else's. An earlier version let any visitor aim at any slot, which
   * meant a stranger could hand you a Kat.
   */
  const mayChooseFor = (seat: LobbySeat) =>
    seat.seatIndex === mySeatIndex ||
    (canAdminister && mode === "companion" && seat.noDevice);

  const target = pickingFor && mayChooseFor(pickingFor) ? pickingFor : me;

  // Which character the reading column shows. Whatever the cursor is over wins
  // — running along the strip and reading each one is how you choose — falling
  // back to the character of whoever you are choosing for, so the column is
  // never blank once anything has been picked.
  const [preview, setPreview] = useState<string | null>(null);
  const reading = preview ?? target?.characterId ?? me?.characterId ?? null;

  /** characterId -> the seat index holding it, which is also its colour. */
  const ownerOf = new Map<string, number>();
  for (const seat of seats) {
    if (seat.characterId) ownerOf.set(seat.characterId, seat.seatIndex);
  }

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-edge px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-lg text-ochre">
            Magiczny Miecz
          </h1>
          {/* Stated, not offered. The mode was settled when the table was
              opened — it decides whether there is a board in the room, and
              changing that halfway through setting up is not a thing anybody
              does. */}
          <span
            className="text-[11px] text-muted"
            title={
              mode === "companion"
                ? "Gracie prawdziwą planszą; aplikacja liczy i pilnuje kolejności."
                : "Wszystko dzieje się tutaj — plansza i karty nie są potrzebne."
            }
          >
            {mode === "companion" ? "Sędzia przy planszy" : "Pełna symulacja"}
          </span>
        </div>

        {/* The one thing everybody in the room needs off this screen. It was
            eight grey pixels next to the word "kod", and somebody reading it
            out across a table had to lean in. */}
        <JoinCode code={code} />

        <div className="flex items-center gap-3 text-[11px]">
          <button onClick={onLibrary} className="text-ochre/80 hover:text-ochre">
            Karty
          </button>
          {me && <RenameField name={me.playerName} busy={busy} onRename={onRename} />}
          {me && <LeaveButton playing={false} busy={busy} onLeave={onLeave} />}
          {/* Always on screen for the host, disabled with the reason on it.
              A button that only appears once the conditions are met leaves
              everybody hunting for it and nobody knowing what is missing. */}
          {canAdminister && (
            <button
              onClick={onStart}
              disabled={busy || chosen.length < 2 || waitingOn.length > 0}
              title={
                chosen.length < 2
                  ? `Brakuje ${2 - chosen.length} postaci`
                  : waitingOn.length > 0
                    ? `Czekamy na: ${waitingOn
                        .map((seat) => seat.playerName ?? `miejsce ${seat.seatIndex + 1}`)
                        .join(", ")}`
                    : undefined
              }
              className="rounded border border-ochre bg-ochre/10 px-4 py-1 font-[family-name:var(--font-display)] tracking-wide text-ochre transition hover:bg-ochre/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
            >
              {chosen.length < 2
                ? `Rozpocznij grę — brakuje ${2 - chosen.length} postaci`
                : waitingOn.length > 0
                  ? `Rozpocznij grę — czekamy na ${waitingOn.length}`
                  : "Rozpocznij grę"}
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
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
              selectable={mayChooseFor(seat)}
              canAdminister={canAdminister}
              busy={busy}
              onSelect={() => onPickFor(target?.id === seat.id ? null : seat)}
              onRemove={() => onRemove(seat)}
              onMakeHost={() => onMakeHost(seat)}
              onReady={seat.seatIndex === mySeatIndex ? onReady : undefined}
              onPreview={setPreview}
            />
          );
        })}
      </section>

      <section className="shrink-0 border-t border-edge px-4 py-2">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-widest text-muted">
            {target && target.seatIndex !== mySeatIndex
              ? `Postać dla: ${target.playerName ?? `miejsce ${target.seatIndex + 1}`}`
              : "Postacie"}
          </h2>
          <span className="flex items-center gap-3">
            {/* The book deals these at random and treats free choice as the
                variant everybody has to agree to. Offered rather than imposed,
                because the variant is the one every table I know plays. */}
            {canAdminister && seats.some((seat) => !seat.characterId) && (
              <button
                onClick={onDeal}
                disabled={busy}
                title="Potasuj Karty Postaci i rozłóż po jednej — tak, jak każe Instrukcja"
                className="text-[11px] text-ochre/80 underline transition hover:text-ochre disabled:opacity-40"
              >
                rozlosuj postacie
              </button>
            )}
            {pickingFor && (
              <button
                onClick={() => onPickFor(null)}
                className="text-[11px] text-muted underline hover:text-ink"
              >
                anuluj wybór
              </button>
            )}
          </span>
        </div>
        {/* Two rows deep: one row of 27 needed a long horizontal drag to reach
            the far half of the roster, and the characters at the end were the
            ones nobody ever looked at. Height is left to the content — a cap
            here silently cut the second row's names off. */}
        {/* `w-fit` + `mx-auto`: a full-width grid pushed the columns apart, so
            27 cards sat in a thin spread across the whole screen instead of
            side by side with margins either side of them. When they do not fit,
            the margins collapse to nothing and this scrolls. */}
        <div className="overflow-x-auto pb-1">
          <div className="mx-auto grid w-fit grid-flow-col grid-rows-2 gap-2">
          {characters.map((character) => {
            // Every character somebody holds is out, and wears the colour of
            // whoever holds it — the same colour as their dot on the board and
            // the stripe on their slot. Who took Kapłanka is a question people
            // ask out loud, and the answer was only readable by comparing the
            // strip against six seat cards one at a time.
            const ownerSeat = ownerOf.get(character.id);
            const owner = ownerSeat === undefined ? null : SEAT_COLOURS[ownerSeat % SEAT_COLOURS.length];
            const isTargets = target?.characterId === character.id;
            // While a request is out, the one card it is about stays lit and
            // the rest step back. Anything else — dimming all of them, or
            // dimming none — leaves the player unable to tell whether their
            // click registered, which is the whole complaint.
            const isPending = pendingCharacterId === character.id;
            const waiting = pendingCharacterId !== null && !isPending;
            // The mała Karta — the one that goes in a plastic stand. It carries
            // its own name in print and is a figure rather than a page, which
            // is what makes 27 of them scannable at this size where 27 pages of
            // small type were not.
            const standee = characterStandeeUrl(character.id);
            return (
              <button
                key={character.id}
                // Already theirs: nothing to ask for. Re-sending it would
                // rewrite the seat with the values it already has and, worse,
                // clear the ready flag — so the one thing a second click on
                // your own character could do is un-ready you.
                disabled={busy || owner !== null || !target || pendingCharacterId !== null}
                onClick={() => target && onChooseCharacter(target, character.id)}
                onMouseEnter={() => setPreview(character.id)}
                onMouseLeave={() => setPreview(null)}
                onFocus={() => setPreview(character.id)}
                onBlur={() => setPreview(null)}
                title={`${character.name} — Miecz ${character.miecz}, Magia ${character.magia}, ${character.nature}, start: ${character.start}`}
                style={owner && !isPending && !waiting ? { borderColor: owner, borderWidth: 2 } : undefined}
                className={`w-[76px] shrink-0 overflow-hidden rounded border transition disabled:cursor-default ${
                  isPending
                    ? "animate-pulse border-ochre opacity-100"
                    : waiting
                      ? "border-edge opacity-20"
                      : owner
                        ? // Dimmed because it is not on offer, coloured because
                          // whose it is still matters — and yours a shade
                          // brighter, since “which did I pick?” is the one
                          // you go looking for.
                          isTargets
                          ? "opacity-70"
                          : "opacity-35"
                        : "border-edge hover:border-ochre disabled:opacity-40"
                }`}
              >
                {standee ? (
                  <Image src={standee} alt={character.name} width={76} height={127} />
                ) : (
                  <span className="flex h-[127px] items-center p-2 text-center text-[10px] text-ink">
                    {character.name}
                  </span>
                )}
              </button>
            );
          })}
          </div>
        </div>
      </section>
        </div>

        {/* The Karta Postaci, big enough to read. A character is four numbered
            clauses of Charakterystyka and two numbers, and every one of them
            matters to the choice being made two feet to the left — but at strip
            size the print is a grey smudge, and a player picking Kat has no way
            to find out what Kat does without picking it first. */}
        <aside className="hidden w-[300px] shrink-0 flex-col items-center justify-center border-l border-edge p-3 lg:flex xl:w-[380px]">
          {reading ? (
            <BigCard character={byId.get(reading) ?? null} />
          ) : (
            <p className="max-w-[16rem] text-center text-[11px] leading-relaxed text-muted/70">
              Najedź na postać, żeby przeczytać jej Kartę.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

/** The big card, filling the column and never overflowing it. */
function BigCard({ character }: { character: Character | null }) {
  if (!character) return null;
  const src = characterImageUrl(character.id);
  if (!src) {
    return (
      <p className="text-center text-[11px] text-muted">
        {character.name} — brak skanu Karty
      </p>
    );
  }
  return (
    <Image
      src={src}
      alt={`Karta Postaci: ${character.name}`}
      width={780}
      height={972}
      className="max-h-full w-auto rounded border border-edge object-contain"
      // The one image on the page somebody actually reads, so it is worth
      // fetching before it is asked for rather than after.
      priority
    />
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
  selectable,
  canAdminister,
  busy,
  onSelect,
  onRemove,
  onMakeHost,
  onReady,
  onPreview,
}: {
  seat: LobbySeat;
  character: Character | null;
  isMine: boolean;
  isTarget: boolean;
  selectable: boolean;
  canAdminister: boolean;
  busy: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMakeHost: () => void;
  /** Only your own slot gets this. */
  onReady?: (ready: boolean) => void;
  /** Points the reading column at this player's character while pointed at. */
  onPreview: (characterId: string | null) => void;
}) {
  // The small card, because that is the piece standing on the board for this
  // player — it is what "which one are you?" is answered with at a table.
  const portrait = character ? characterStandeeUrl(character.id) : null;
  // The same colour this player's dot has on the board, and it never changes:
  // it comes from the seat index, so "the blue one" means one person all game.
  const colour = SEAT_COLOURS[seat.seatIndex % SEAT_COLOURS.length];

  return (
    <div
      onMouseEnter={() => onPreview(seat.characterId)}
      onMouseLeave={() => onPreview(null)}
      style={{ borderTopColor: colour, borderTopWidth: 3 }}
      className={`relative flex h-full max-h-[340px] w-[190px] shrink-0 flex-col rounded-lg border p-2 ${
        isTarget
          ? "border-ochre bg-panel"
          : seat.ready
            ? "border-verdigris/60 bg-panel"
            : isMine
              ? "border-ochre/50 bg-panel"
              : "border-edge bg-panel/50"
      }`}
    >
      {/* Not on your own slot: leaving is "Opuść stół", and a host who kicks
          themselves out of their own table has done something they meant to
          spell differently. */}
      {canAdminister && !isMine && (
        <button
          onClick={onRemove}
          disabled={busy}
          title="Usuń ze stołu"
          className="absolute right-1 top-1 z-10 rounded px-1 text-xs text-muted transition hover:text-vermilion disabled:opacity-40"
        >
          ×
        </button>
      )}

      <p className="flex items-center gap-1.5 truncate pr-4 font-[family-name:var(--font-display)] text-base text-ink">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: colour }}
          aria-hidden
        />
        <span className="truncate">{seat.playerName ?? `Miejsce ${seat.seatIndex + 1}`}</span>
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
      {/* The portrait gives height back on a short screen but is capped, since
          a slot that grows to whatever is left over turns an empty seat into a
          very tall grey rectangle. */}
      <button
        onClick={onSelect}
        disabled={busy || !selectable}
        title={selectable ? "Wybierz postać dla tego miejsca" : "Tylko właściciel miejsca wybiera swoją postać"}
        className={`max-h-[270px] min-h-[120px] w-full flex-1 overflow-hidden rounded border transition ${
          selectable ? "border-edge/60 hover:border-ochre" : "cursor-default border-edge/40"
        }`}
      >
        {portrait && character ? (
          <Image
            src={portrait}
            alt={character.name}
            width={174}
            height={270}
            // Contained, not cropped: the small card is a whole illustration
            // with its name printed at the top, and cropping it cuts the name
            // off — which is the one thing on it.
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="flex h-full items-center justify-center p-2 text-center text-[11px] leading-snug text-muted">
            postać jeszcze niewybrana
          </span>
        )}
      </button>

      {/* The three states a player is ever in: still choosing, chosen, ready —
          and the same line says which, for you and for everybody else. Yours is
          a button because saying you are ready is the only thing left to do
          once you have a character; theirs is a word because it is news. */}
      <p className="mt-1 truncate text-[10px] text-muted">{character?.name ?? "—"}</p>

      {onReady ? (
        <button
          disabled={busy || !seat.characterId}
          onClick={() => onReady(!seat.ready)}
          title={seat.characterId ? undefined : "Najpierw wybierz postać"}
          className={`mt-1 rounded border px-2 py-1 text-[11px] transition disabled:opacity-40 ${
            seat.ready
              ? "border-verdigris bg-verdigris/10 text-verdigris"
              : "border-edge text-ink hover:border-ochre"
          }`}
        >
          {seat.ready ? "Gotów ✓" : "Jestem gotów"}
        </button>
      ) : (
        <p
          className={`mt-1 h-[27px] truncate pt-1 text-[11px] ${
            seat.ready ? "text-verdigris" : "text-muted/60"
          }`}
        >
          {seat.abandoned
            ? ""
            : !seat.characterId
              ? "wybiera postać…"
              : seat.ready
                ? "gotów ✓"
                : "czeka"}
        </p>
      )}

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
      <div className="flex h-full max-h-[340px] w-[190px] shrink-0 items-center justify-center rounded-lg border border-dashed border-edge/60 p-2 text-center text-[11px] leading-snug text-muted/60">
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
      className="flex h-full max-h-[340px] w-[190px] shrink-0 flex-col justify-center gap-2 rounded-lg border border-dashed border-edge p-2"
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

/**
 * The door.
 *
 * There used to be a two-step way in: open the table as a spectator, then press
 * "Usiądź" to take a seat. That second step was invented for nobody. Everyone
 * plays on their own device and opens the link for exactly one reason, so the
 * link *is* the joining — and the only thing still missing at that point is a
 * name, which the table needs and which nobody ever supplies later if asked
 * later.
 *
 * So there is no seatless state to be in any more: you give a name and you are
 * at the table, with a character still to choose. (The host seating somebody
 * device-less in companion mode is the one way a seat appears without this.)
 */
export function JoinGate({
  code,
  seats,
  busy,
  onJoin,
}: {
  code: string;
  seats: LobbySeat[];
  busy: boolean;
  onJoin: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const here = seats.filter((seat) => seat.playerName);

  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center gap-6 px-6">
      <header className="text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-ochre">
          Magiczny Miecz
        </h1>
        <p className="mt-2 text-xs text-muted">
          stół <span className="tnum tracking-[0.25em] text-ink">{code}</span>
        </p>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onJoin(name);
        }}
        className="flex w-full max-w-xs flex-col gap-2"
      >
        <label htmlFor="join-name" className="text-xs uppercase tracking-widest text-muted">
          Twoje imię
        </label>
        <input
          id="join-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="np. Michał"
          maxLength={24}
          autoFocus
          className="rounded border border-edge bg-panel px-3 py-2 text-center text-lg text-ink outline-none focus:border-ochre"
        />
        <button
          type="submit"
          disabled={busy || !name.trim() || seats.length >= MAX_SEATS}
          className="rounded-lg border border-ochre bg-ochre/10 px-6 py-3 font-[family-name:var(--font-display)] text-lg tracking-wide text-ochre transition hover:bg-ochre/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
        >
          {seats.length >= MAX_SEATS ? "Stół jest pełny" : "Dołącz do stołu"}
        </button>
      </form>

      {here.length > 0 && (
        <p className="max-w-sm text-center text-[11px] leading-relaxed text-muted">
          Przy stole:{" "}
          {here.map((seat) => seat.playerName).join(", ")}
        </p>
      )}
    </main>
  );
}

/**
 * Leaving, confirmed by a second click rather than a browser dialog.
 *
 * It says what actually happens, which is much less than it used to: the
 * character stays in the game exactly as it is and somebody can pick it up
 * again. Only this device stops speaking for it.
 */
export function LeaveButton({
  playing,
  busy,
  onLeave,
}: {
  playing: boolean;
  busy: boolean;
  onLeave: () => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button onClick={() => setArmed(true)} className="text-muted hover:text-vermilion">
        Opuść stół
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span className="text-vermilion">
        {playing ? "Postać zostanie w grze bez gracza — na pewno?" : "Na pewno?"}
      </span>
      <button
        onClick={onLeave}
        disabled={busy}
        className="rounded border border-vermilion/60 px-1.5 text-vermilion disabled:opacity-50"
      >
        tak
      </button>
      <button onClick={() => setArmed(false)} className="text-muted hover:text-ink">
        nie
      </button>
    </span>
  );
}

/**
 * The join code, big enough to read across a room.
 *
 * This is the whole of the lobby's job for everybody not already at the table:
 * somebody reads it out, or sends the link. Clicking copies the link rather
 * than the code — the code is what you say, the link is what you paste, and
 * whichever one is wanted, one of them is now to hand.
 */
function JoinCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col items-center leading-none">
      <span className="mb-1 text-[10px] uppercase tracking-widest text-muted">
        Kod stołu
      </span>
      <button
        onClick={() => {
          navigator.clipboard
            ?.writeText(window.location.href)
            .then(() => setCopied(true))
            .catch(() => {});
        }}
        title="Skopiuj link do stołu"
        className="tnum font-[family-name:var(--font-display)] text-3xl tracking-[0.3em] text-ochre transition hover:text-ink"
      >
        {code}
      </button>
      <span className="mt-1 h-3 text-[10px] text-muted">
        {copied ? "skopiowano link" : ""}
      </span>
    </div>
  );
}

/**
 * Arriving at a table that is already playing.
 *
 * There is no joining a game in progress — the characters were dealt at setup
 * and the board is halfway round. What there *is* is picking up a character
 * nobody is behind any more: somebody left, or closed the tab, and the figure
 * is still standing on its Obszar with everything it owns. That is the game's
 * own answer to a player disappearing, so it is the first thing offered rather
 * than a button hidden inside somebody's card.
 *
 * Watching is the other option, and the honest one when every seat is taken.
 */
export function TakeOverGate({
  code,
  free,
  taken,
  busy,
  onTakeOver,
  onWatch,
}: {
  code: string;
  /** Characters with nobody behind them. */
  free: { seatId: string; playerName: string | null; characterName: string; why: string }[];
  /** How many seats are being played, for when none are free. */
  taken: number;
  busy: boolean;
  onTakeOver: (seatId: string, name: string | null) => void;
  onWatch: () => void;
}) {
  // Blank by default: the commonest takeover by a long way is the same person
  // on a new tab, and the table already knows what to call them. Somebody else
  // picking the character up types over it.
  const [name, setName] = useState("");

  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center gap-6 px-6">
      <header className="text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-ochre">
          Magiczny Miecz
        </h1>
        <p className="mt-2 text-xs text-muted">
          stół <span className="tnum tracking-[0.25em] text-ink">{code}</span> · gra już trwa
        </p>
      </header>

      {free.length > 0 ? (
        <div className="flex w-full max-w-sm flex-col gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="twoje imię — puste zostawia dotychczasowe"
            maxLength={24}
            className="rounded border border-edge bg-panel px-3 py-2 text-center text-sm text-ink outline-none placeholder:text-muted/60 focus:border-ochre"
          />
          <p className="text-xs uppercase tracking-widest text-muted">Wolne postacie</p>
          {free.map((seat) => (
            <button
              key={seat.seatId}
              onClick={() => onTakeOver(seat.seatId, name.trim() || null)}
              disabled={busy}
              className="rounded-lg border border-ochre/60 bg-ochre/5 px-3 py-2 text-left transition hover:bg-ochre/15 disabled:opacity-40"
            >
              <span className="block font-[family-name:var(--font-display)] text-ochre">
                {seat.characterName}
              </span>
              <span className="block text-[11px] text-muted">
                {seat.playerName ? `grał(a) ${seat.playerName} · ` : ""}
                {seat.why}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="max-w-sm text-center text-sm text-muted">
          Wszystkie {taken} postaci mają swoich graczy. Możesz oglądać — jeśli ktoś
          odejdzie, jego postać pojawi się tutaj do przejęcia.
        </p>
      )}

      <button
        onClick={onWatch}
        className="text-[11px] text-muted underline transition hover:text-ink"
      >
        oglądaj stół
      </button>
    </main>
  );
}
