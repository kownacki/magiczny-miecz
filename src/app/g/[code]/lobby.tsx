"use client";

import { useEffect, useRef, useState } from "react";
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
  seats: seatsFromServer,
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

  /**
   * What you have typed into the name field but the server has not been told
   * about yet.
   *
   * Your name appears above your character and across the foot of the card you
   * took, and it should follow the keystrokes — waiting for a round trip to see
   * your own typing is what makes a field feel broken. What the server hears is
   * debounced; what you see is not.
   */
  const [draftName, setDraftName] = useState<string | null>(null);
  const seats =
    draftName === null
      ? seatsFromServer
      : seatsFromServer.map((seat) =>
          seat.seatIndex === mySeatIndex
            ? // An empty field keeps showing the saved name rather than
              // flashing "Miejsce 2" at somebody who is only retyping it.
              { ...seat, playerName: draftName.trim() || seat.playerName }
            : seat,
        );

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

  /** characterId -> the seat holding it. */
  const ownerOf = new Map<string, LobbySeat>();
  for (const seat of seats) {
    if (seat.characterId) ownerOf.set(seat.characterId, seat);
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
            className="text-[12px] text-muted"
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

        <div className="flex items-center gap-3 text-[12px]">
          <button onClick={onLibrary} className="text-ochre/80 hover:text-ochre">
            Karty
          </button>
          {me && <LeaveButton playing={false} busy={busy} onLeave={onLeave} />}
          {/* Anybody at the table may start it, not only the host.
              Everybody with a character has already said they are ready — that
              is what the button waits for — so by the time it lights up there
              is nothing left for a host to decide, and making four people wait
              on a fifth to press a button they are all entitled to press is a
              rule with no work to do.

              Always on screen, disabled with the reason written on it. A
              button that only appears once the conditions are met leaves
              everybody hunting for it and nobody knowing what is missing. */}
          {me && (
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
        {/* `min-w-0`: a flex child defaults to `min-width: auto`, so this column
            refused to shrink below the width of the character strip and pushed
            the reading column clean off the screen. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          <h2 className="text-[12px] uppercase tracking-widest text-muted">
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
                className="text-[12px] text-ochre/80 underline transition hover:text-ochre disabled:opacity-40"
              >
                rozlosuj postacie
              </button>
            )}
            {pickingFor && (
              <button
                onClick={() => onPickFor(null)}
                className="text-[12px] text-muted underline hover:text-ink"
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
          {/* The columns share whatever width is left, so all 27 are on screen
              at once and each is as large as that allows — capped, because past
              a point they stop being easier to read and start being a poster.
              Sizing them in fixed pixels instead pushed five characters off the
              right-hand edge, which is the drag-to-find problem that put them
              in two rows in the first place. */}
          <div
            style={{ gridAutoColumns: "minmax(0, 1fr)" }}
            className="mx-auto grid w-full max-w-[1708px] grid-flow-col grid-rows-2 gap-2"
          >
          {characters.map((character) => {
            // Every character somebody holds is out, and wears the colour of
            // whoever holds it — the same colour as their dot on the board and
            // the stripe on their slot. Who took Kapłanka is a question people
            // ask out loud, and the answer was only readable by comparing the
            // strip against six seat cards one at a time.
            const ownerSeat = ownerOf.get(character.id) ?? null;
            const owner = ownerSeat
              ? SEAT_COLOURS[ownerSeat.seatIndex % SEAT_COLOURS.length]
              : null;
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
            // The dimming goes on the picture, not on the card. Fading the
            // whole tile faded the border with it, which is the one part
            // carrying information — whose it is — and the only reason the
            // colour is there at all. Yours a shade brighter than the rest,
            // since "which did I pick?" is the one you go looking for.
            // Every opacity in this tile lives here, on the picture.
            //
            // It used to be split: the owner-dimming on the picture and the
            // waiting-dimming on the button. Clicking a character dropped the
            // first instantly and faded the second in over the transition, so
            // every already-taken card flashed to full brightness for a moment
            // and then sank — which is exactly what it looked like.
            const dim = isPending
              ? "opacity-100"
              : waiting
                ? "opacity-20"
                : owner
                  ? isTargets
                    ? "opacity-70"
                    : "opacity-35"
                  : target
                    ? "opacity-100"
                    : "opacity-40";
            return (
              // Pointing at a card reads it, and that has to work for cards
              // nobody can choose. A disabled button fires no mouse events at
              // all, so with the handlers on the button itself every character
              // somebody had already taken became unreadable — which is exactly
              // when you most want to know what it does.
              <div
                key={character.id}
                className="min-w-0"
                onMouseEnter={() => setPreview(character.id)}
                onMouseLeave={() => setPreview(null)}
              >
              <button
                // Already theirs: nothing to ask for. Re-sending it would
                // rewrite the seat with the values it already has and, worse,
                // clear the ready flag — so the one thing a second click on
                // your own character could do is un-ready you.
                disabled={busy || owner !== null || !target || pendingCharacterId !== null}
                onClick={() => target && onChooseCharacter(target, character.id)}
                onFocus={() => setPreview(character.id)}
                onBlur={() => setPreview(null)}
                title={`${character.name} — Miecz ${character.miecz}, Magia ${character.magia}, ${character.nature}, start: ${character.start}`}
                // Whoever holds it, holds it — including while somebody else's
                // pick is in flight. Dropping the colour during `waiting` left
                // the border with no colour class at all, so it fell back to
                // `currentColor` and every taken card turned gold for as long
                // as the request took.
                style={owner && !isPending ? { borderColor: owner, borderWidth: 2 } : undefined}
                className={`relative block w-full overflow-hidden rounded border transition disabled:cursor-default ${
                  isPending
                    ? "animate-pulse border-ochre"
                    : owner
                      ? "" // the border colour is set inline, and stays lit
                      : "border-edge hover:border-ochre"
                }`}
              >
                {standee ? (
                  <Image
                    src={standee}
                    alt={character.name}
                    width={114}
                    height={190}
                    className={`h-auto w-full transition-opacity ${dim}`}
                  />
                ) : (
                  <span
                    className={`flex aspect-[114/190] items-center p-2 text-center text-[12px] text-ink transition-opacity ${dim}`}
                  >
                    {character.name}
                  </span>
                )}
                {/* Whose it is, written across the foot of the card in their
                    colour. The colour alone says somebody has it; six people
                    round a table need it to say *who*, and the seat cards are
                    too far from the strip to answer that by comparison. */}
                {ownerSeat && (
                  <span
                    style={{ background: owner ?? undefined }}
                    className="absolute inset-x-0 bottom-0 flex h-[14.3%] min-h-[21px] items-center justify-center overflow-hidden px-0.5 text-[13px] font-medium leading-none text-night"
                  >
                    <span className="truncate">
                      {ownerSeat.playerName ?? `miejsce ${ownerSeat.seatIndex + 1}`}
                    </span>
                  </span>
                )}
              </button>
              </div>
            );
          })}
          </div>
        </div>
      </section>
        </div>

        {/* Settings at the top, the card at the foot, and the space between
            them belongs to whatever else turns out to need a home here.

            The card is pinned to the bottom because it is the thing your eye
            goes back to — it sits directly above the roster it is read against
            — while the settings are touched once, at the start, and then never
            again. */}
        <aside className="hidden w-[300px] shrink-0 flex-col gap-4 border-l border-edge p-3 lg:flex xl:w-[380px]">
          <h2 className="text-[12px] uppercase tracking-widest text-muted">Ustawienia</h2>
          {me && (
            <label className="flex flex-col gap-1 text-[12px] text-muted">
              Twoje imię
              {/* The *saved* name, not the one on screen. Handing it the
                  drafted name would tell it nothing had changed — the draft is
                  its own output — and it would never save anything. */}
              <RenameField
                name={
                  seatsFromServer.find((seat) => seat.seatIndex === mySeatIndex)?.playerName ??
                  null
                }
                onDraft={setDraftName}
                onSave={onRename}
              />
            </label>
          )}

          {/* The Karta Postaci, big enough to read. A character is four numbered
              clauses of Charakterystyka and two numbers, and every one of them
              matters to the choice being made to the left of it — but at strip
              size the print is a grey smudge, and a player picking Kat has no
              way to find out what Kat does without picking it first. */}
          <div className="mt-auto flex min-h-0 flex-col items-center justify-end">
            {reading ? (
              <BigCard character={byId.get(reading) ?? null} />
            ) : (
              <p className="max-w-[16rem] text-center text-[12px] leading-relaxed text-muted/70">
                Najedź na postać, żeby przeczytać jej Kartę.
              </p>
            )}
          </div>
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
      <p className="text-center text-[12px] text-muted">
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
      <p className="mb-1 h-4 truncate text-[12px]">
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
      {/* Your own slot is not a button. The strip is already aimed at you, so
          clicking it could only un-aim it, and lighting up under the cursor
          promised something there was nothing behind. The host aiming at a
          player they seated by hand is the one case where tapping a slot does
          anything, so that one keeps the affordance. */}
      <button
        onClick={onSelect}
        disabled={busy || !selectable || isMine}
        title={
          isMine
            ? undefined
            : selectable
              ? "Wybierz postać dla tego miejsca"
              : "Tylko właściciel miejsca wybiera swoją postać"
        }
        className={`max-h-[270px] min-h-[120px] w-full flex-1 overflow-hidden rounded border transition ${
          selectable && !isMine
            ? "border-edge/60 hover:border-ochre"
            : "cursor-default border-edge/40"
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
          // The empty card says what is happening; the line below stays quiet
          // until there is something else to report. Saying it twice, once in
          // the box and once under it, was one sentence broken in half.
          <span className="flex h-full items-center justify-center p-2 text-center text-[12px] leading-snug text-muted">
            wybiera postać…
          </span>
        )}
      </button>

      {/* The three states a player is ever in: still choosing, chosen, ready —
          and the same line says which, for you and for everybody else. Yours is
          a button because saying you are ready is the only thing left to do
          once you have a character; theirs is a word because it is news. */}
      {onReady ? (
        <button
          disabled={busy || !seat.characterId}
          onClick={() => onReady(!seat.ready)}
          title={seat.characterId ? undefined : "Najpierw wybierz postać"}
          className={`mt-1 rounded border px-2 py-1 text-[12px] transition disabled:opacity-40 ${
            seat.ready
              ? "border-verdigris bg-verdigris/10 text-verdigris"
              : "border-edge text-ink hover:border-ochre"
          }`}
        >
          {seat.ready ? "Gotów ✓" : "Jestem gotów"}
        </button>
      ) : (
        <p
          className={`mt-1 h-[27px] truncate pt-1 text-[12px] ${
            seat.ready ? "text-verdigris" : "text-muted/60"
          }`}
        >
          {seat.abandoned || !seat.characterId ? "" : seat.ready ? "gotów ✓" : "niegotowy"}
        </p>
      )}

      {canAdminister && !seat.isHost && !seat.abandoned && (
        <button
          onClick={onMakeHost}
          disabled={busy}
          className="mt-1 rounded border border-edge px-1 py-0.5 text-[12px] text-muted transition hover:border-ochre hover:text-ochre disabled:opacity-40"
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
      <div className="flex h-full max-h-[340px] w-[190px] shrink-0 items-center justify-center rounded-lg border border-dashed border-edge/60 p-2 text-center text-[12px] leading-snug text-muted/60">
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
      <span className="text-center text-[12px] uppercase tracking-widest text-muted">
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
/** Long enough that a name is typed rather than transmitted letter by letter. */
const RENAME_DEBOUNCE_MS = 600;

function RenameField({
  name,
  onDraft,
  onSave,
}: {
  name: string | null;
  /** Every keystroke, so the table shows the name as it is being typed. */
  onDraft: (name: string) => void;
  /** Once the typing stops. */
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(name ?? "");

  // Held in a ref so the effect below depends on what was typed and not on the
  // identity of a callback the parent rebuilds every render — which would reset
  // the timer on every render and save nothing, ever. Kept current in an effect
  // rather than during render, which is where refs are allowed to be written.
  const save = useRef(onSave);
  useEffect(() => {
    save.current = onSave;
  });

  // A confirm button for your own name was a step that existed only to be
  // forgotten: people type it, see it appear on their card, and move on —
  // leaving the server still calling them what they were called before.
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === (name ?? "")) return;
    const timer = setTimeout(() => save.current(trimmed), RENAME_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, name]);

  return (
    <input
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onDraft(event.target.value);
      }}
      placeholder="twoje imię"
      maxLength={24}
      className="min-w-0 rounded border border-edge bg-night px-2 py-1 text-[12px] text-ink outline-none focus:border-ochre"
    />
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
        <p className="max-w-sm text-center text-[12px] leading-relaxed text-muted">
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
      <span className="mb-1 text-[12px] uppercase tracking-widest text-muted">
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
      <span className="mt-1 h-3 text-[12px] text-muted">
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
              <span className="block text-[12px] text-muted">
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
        className="text-[12px] text-muted underline transition hover:text-ink"
      >
        oglądaj stół
      </button>
    </main>
  );
}
