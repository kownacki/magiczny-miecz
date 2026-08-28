"use client";

/**
 * The poczekalnia itself: the screen a table is put together on.
 *
 * What is left here is the arrangement and the two questions it asks. The
 * decisions behind it are `lobby-view.ts`'s, one chair is `seat-slot.tsx`'s,
 * choosing a Karta Postaci is `character-picker.tsx`'s, and the ways in and out
 * of a table are `door.tsx`'s.
 */

import { useEffect, useRef, useState } from "react";
import type { Character } from "@/data/types";
import { ConfirmDialog, type Confirmation } from "./confirm";
import { MAX_SEATS } from "@/lib/game/modes";
import { CharacterStrip } from "./character-picker";
import { JoinCode, LeaveButton } from "./door";
import { EmptySlot, SeatSlot } from "./seat-slot";
import {
  aimedAt,
  cardLookup,
  chosenSeats,
  mayAdminister,
  mayChooseFor,
  mySeat,
  seatName,
  seatNameInline,
  seatState,
  startRefusal,
  withDraftName,
  type Aiming,
  type LobbySeat,
} from "./lobby-view";

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
  users,
  mySeatIndex,
  journal,
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
  library,
}: {
  code: string;
  mode: string;
  seats: LobbySeat[];
  /** Everybody here, seated or not — see `watching` below. */
  users: { id: string; name: string; seatIndex: number | null; away: boolean }[];
  mySeatIndex: number | null;
  /**
   * The Dziennik, passed in rather than built here.
   *
   * It fetches for itself off the revision counter and needs nothing this
   * component knows, but it needs the table's code and this one is handed a
   * join code for display — so the owner of the fetch is `page.tsx`, the same
   * as at the table.
   */
  journal?: React.ReactNode;
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
  /**
   * Księga Tolimana, laid over this screen when it is open.
   *
   * Passed in rather than opened here, and it is the same element the table
   * hangs in its own drawer slot — one library, two places it can be read from.
   * The poczekalnia's button used to set a state nothing here rendered, so it
   * was a control wired to nothing.
   */
  library?: React.ReactNode;
}) {
  /**
   * What you have typed into the name field but the server has not been told
   * about yet. See `withDraftName`.
   */
  const [draftName, setDraftName] = useState<string | null>(null);
  const seats = withDraftName(seatsFromServer, mySeatIndex, draftName);

  /** Everybody at the table who is driving no chair. */
  const watching = users.filter((one) => one.seatIndex === null);

  const aiming: Aiming = { mySeatIndex, canAdminister: mayAdminister(isHost, hostAway), mode };
  const me = mySeat(seats, mySeatIndex);
  const target = aimedAt(seats, pickingFor, aiming);
  const chosen = chosenSeats(seats);
  const refusal = startRefusal(seats);
  const cardFor = cardLookup(characters);


  /**
   * The question on screen, or null.
   *
   * One at a time and held here rather than inside each slot: the three things
   * worth asking about — starting, removing, handing over the role — are asked
   * from three different places, and a dialog per place would be three dialogs
   * that could all be open at once.
   */
  const [ask, setAsk] = useState<Confirmation | null>(null);

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden">
      <ConfirmDialog ask={ask} busy={busy} onCancel={() => setAsk(null)} />
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
          <button
            onClick={onLibrary}
            title="Każda Karta i każdy Obszar w grze — zdradzi ci tajemnicę"
            className="text-ochre/80 hover:text-ochre"
          >
            Księga Tolimana
          </button>
          {me && <LeaveButton playing={false} busy={busy} onLeave={onLeave} />}
          {/* The host starts the table, and only the host. Everybody else has
              already said what they have to say by marking themselves ready;
              somebody has to decide that the waiting is over, and that is what
              the role is for.

              Shown only to them, rather than shown to everybody and refused:
              a button four people cannot use is four people wondering why.
              For the host it is always on screen, disabled with the reason
              written on it, because a button that appears only once the
              conditions are met leaves everybody hunting for it and nobody
              knowing what is missing.

              `isHost` and not `canAdminister`: the second also covers a host
              who has gone quiet, which is right for removing a stuck player but
              would put this button on a screen the server is about to refuse.
              A missing host is migrated away after a minute anyway, and then
              somebody really is the host. */}
          {isHost && (
            <button
              onClick={() =>
                setAsk({
                  title: "Rozpocząć grę?",
                  body:
                    `Do gry siada ${chosen.length} ${chosen.length === 1 ? "postać" : "postaci"}. ` +
                    "Po rozpoczęciu nikt nie zmieni już swojej Postaci. Dosiąść się " +
                    "można nadal — nowy gracz bierze wolną Postać i zaczyna od jej " +
                    "Obszaru startowego.",
                  confirmLabel: "Rozpocznij",
                  onConfirm: () => {
                    setAsk(null);
                    onStart();
                  },
                })
              }
              disabled={busy || refusal !== null}
              title={
                refusal === null
                  ? undefined
                  : refusal.because === "nobody"
                    ? "Nikt jeszcze nie wybrał Postaci"
                    : `Czekamy na: ${refusal.on.map(seatNameInline).join(", ")}`
              }
              className="rounded border border-ochre bg-ochre/10 px-4 py-1 font-[family-name:var(--font-display)] tracking-wide text-ochre transition hover:bg-ochre/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
            >
              {refusal === null
                ? "Rozpocznij grę"
                : refusal.because === "nobody"
                  ? "Rozpocznij grę — nikt nie wybrał Postaci"
                  : `Rozpocznij grę — czekamy na ${refusal.on.length}`}
            </button>
          )}
        </div>
      </header>

      {/* `relative`, for the same reason `table-layout.tsx` says: a drawer is
          laid over the columns and has to start *below* the bar rather than
          beside it. */}
      <div className="relative flex min-h-0 flex-1">
        {/* `min-w-0`: a flex child defaults to `min-width: auto`, so this column
            refused to shrink below the width of the character strip and pushed
            the reading column clean off the screen. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/**
           * Centred by auto margins on the ends rather than by `justify-center`.
           *
           * They look the same until the row does not fit, and then they are
           * opposite: `justify-center` splits the *negative* free space in two
           * and puts half of it off the left edge, where no amount of scrolling
           * reaches it — so an overflowing row of six chairs lost the first one
           * completely and cut the last in half. An auto margin clamps at zero
           * instead, so the row centres while it fits and scrolls from its own
           * start once it does not.
           */}
          <section className="flex min-h-0 flex-1 items-center gap-2 overflow-x-auto px-4 py-3 [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto">
            {Array.from({ length: MAX_SEATS }, (_, index) => {
              const seat = seats[index];
              /**
               * A chair with nobody in it and nothing standing on it is a free
               * place, whether or not a row for it happens to exist.
               *
               * Rows outlive people now: a chair whose player was kicked or
               * swept stays until somebody sits back down in it. Drawing that
               * as a seat — "Miejsce 2 · bez gracza" — advertised an absence
               * where the honest answer is an invitation. See `seatState`.
               */
              if (!seat || seatState(seat) === "free") {
                return (
                  <EmptySlot
                    key={seat ? seat.id : `empty-${index}`}
                    canAdd={aiming.canAdminister && mode === "companion"}
                    busy={busy}
                    onAdd={onAddLocal}
                  />
                );
              }
              return (
                <SeatSlot
                  key={seat.id}
                  seat={seat}
                  character={cardFor(seat.characterId)}
                  isMine={seat.seatIndex === mySeatIndex}
                  isTarget={target?.id === seat.id}
                  selectable={mayChooseFor(seat, aiming)}
                  canAdminister={aiming.canAdminister}
                  isHost={isHost}
                  busy={busy}
                  onSelect={() => onPickFor(target?.id === seat.id ? null : seat)}
                  // Both of these happen to somebody else and cannot be undone by
                  // the person they happen to, so both are asked first. The slot
                  // raises the question; the answer runs the same handler it always
                  // did.
                  onRemove={() =>
                    setAsk({
                      title: "Usunąć ze stołu?",
                      body:
                        `${seatName(seat)} straci swoje miejsce${seat.characterId ? " razem z wybraną Postacią" : ""}. ` +
                        "Może dołączyć ponownie, jeśli poda kod stołu.",
                      confirmLabel: "Usuń",
                      tone: "grave",
                      onConfirm: () => {
                        setAsk(null);
                        onRemove(seat);
                      },
                    })
                  }
                  onMakeHost={() =>
                    setAsk({
                      title: "Przekazać rolę gospodarza?",
                      body:
                        `${seatName(seat)} będzie od tej chwili prowadzić stół: rozpocznie grę, ` +
                        "usunie graczy i przekaże rolę dalej. Ty przestaniesz to móc.",
                      confirmLabel: "Przekaż",
                      onConfirm: () => {
                        setAsk(null);
                        onMakeHost(seat);
                      },
                    })
                  }
                  onReady={seat.seatIndex === mySeatIndex ? onReady : undefined}
                />
              );
            })}
          </section>

          {/**
           * The people who are here and not in a chair.
           *
           * Invisible until now, and not by an oversight: before people and
           * seats came apart there was no way to *be* one. Six chairs is a
           * limit on Postacie and not on people, so a seventh arrival is a
           * spectator — as is anybody who stood up and stayed — and a table
           * that draws only its chairs shows them nowhere at all.
           */}
          {watching.length > 0 && (
            <p className="shrink-0 border-t border-edge px-4 py-1 text-[12px] text-muted">
              Ogląda{watching.length === 1 ? "" : "ją"}:{" "}
              {watching.map((one) => (one.away ? `${one.name} (nieobecny)` : one.name)).join(", ")}
            </p>
          )}

          <section className="shrink-0 border-t border-edge px-4 py-2">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="text-[12px] uppercase tracking-widest text-muted">
                {target && target.seatIndex !== mySeatIndex
                  ? `Postać dla: ${seatNameInline(target)}`
                  : "Postacie"}
              </h2>
              <span className="flex items-center gap-3">
                {/* The book deals these at random and treats free choice as the
                    variant everybody has to agree to. Offered rather than imposed,
                    because the variant is the one every table I know plays. */}
                {/* `isHost`, like the start button: the deal route wants the
                    role outright, so a quiet host would otherwise put this on
                    five screens that cannot use it. */}
                {isHost && seats.some((seat) => !seat.characterId) && (
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
            <CharacterStrip
              characters={characters}
              seats={seats}
              target={target}
              pendingCharacterId={pendingCharacterId}
              busy={busy}
              onPick={(characterId) => target && onChooseCharacter(target, characterId)}
            />
          </section>
        </div>

        {/* Settings at the top, the card at the foot, and the space between
            them belongs to whatever else turns out to need a home here.

            The card is pinned to the bottom because it is the thing your eye
            goes back to — it sits directly above the roster it is read against
            — while the settings are touched once, at the start, and then never
            again. */}
        {/* No padding along the bottom, because the Dziennik is drawn to sit on
            it: `rounded-t` with `border-b-0`, a panel the column's own edge
            closes. Given twelve pixels underneath, that missing border stops
            being a join and becomes a gap — the box simply stops short with one
            side open. It is flush under the board for the same reason. */}
        <aside className="hidden w-[300px] shrink-0 flex-col gap-4 border-l border-edge px-3 pt-3 lg:flex xl:w-[380px]">
          <h2 className="text-[12px] uppercase tracking-widest text-muted">Ustawienia</h2>
          {me && (
            <label className="flex flex-col gap-1 text-[12px] text-muted">
              Twoje imię
              {/* The *saved* name, not the one on screen. Handing it the
                  drafted name would tell it nothing had changed — the draft is
                  its own output — and it would never save anything. */}
              <RenameField
                name={mySeat(seatsFromServer, mySeatIndex)?.playerName ?? null}
                onDraft={setDraftName}
                onSave={onRename}
              />
            </label>
          )}

          {/**
           * The Dziennik, at the foot of the column.
           *
           * It used to share this column with a reading panel — one big Karta
           * of whatever the cursor was last over. That panel is gone: the Karty
           * now come up on hover, beside the tile being pointed at, through the
           * same `useCardPreview` every other card in the game uses. A box you
           * have to look away from the strip to read is a worse answer to "what
           * does this one do" than one that appears where you are already
           * looking, and it cost this column two thirds of its height.
           *
           * `mt-auto` on the feed itself keeps it on the bottom edge, so what
           * the panel gave up goes to the settings above rather than to a gap
           * under the log.
           *
           * `relative`, because expanding it is `absolute inset-0` and wants an
           * ancestor to be inset-zero *of*. Without one it would lay itself over
           * the whole page rather than over this column.
           */}
          <div className="relative flex min-h-0 flex-1 flex-col">{journal}</div>
        </aside>

        {/* Last, so it lies over both columns — the seats and the reading
            card alike. Its own `absolute` does the rest. */}
        {library}
      </div>
    </main>
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
