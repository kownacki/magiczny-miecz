"use client";

/**
 * The ways into a table and the way out: the two gates a newcomer meets, the
 * code they were let in with, and the button that gives a seat back.
 *
 * None of these is the poczekalnia. `JoinGate` and `TakeOverGate` are whole
 * screens shown *instead* of it, `LeaveButton` is on screen during play as well
 * as before it, and `JoinCode` is the lobby's job for everybody who is not at
 * the table yet. What they have in common is the threshold.
 */

import { useState } from "react";
import { namedSeats, tableIsFull, type LobbySeat } from "./lobby-view";

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
  notice,
}: {
  code: string;
  seats: LobbySeat[];
  busy: boolean;
  onJoin: (name: string) => void;
  /** Said above the list of who is here — see `SecondTabNotice`. */
  notice?: React.ReactNode;
}) {
  const [name, setName] = useState("");
  const here = namedSeats(seats);
  const full = tableIsFull(seats);

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
          disabled={busy || !name.trim() || full}
          className="rounded-lg border border-ochre bg-ochre/10 px-6 py-3 font-[family-name:var(--font-display)] text-lg tracking-wide text-ochre transition hover:bg-ochre/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
        >
          {full ? "Stół jest pełny" : "Dołącz do stołu"}
        </button>
      </form>

      {notice}

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
 * "Wróć jako Michał" — the door for somebody who has been here before.
 *
 * A tab closing takes the claim with it deliberately (`seatToken.ts`), so a
 * browser coming back to a table it was at holds nothing and used to be a
 * stranger: the only way in was to join again as a second person, leaving the
 * first sitting there driving a Postać nobody could reach. The `device_id` in
 * localStorage is what recognises them — see `deviceId.ts` for why that is a
 * different secret from the claim and not a contradiction of it.
 *
 * Offered, never done. Two people share a laptop, and a tester drives four
 * seats from four tabs on purpose; a browser that silently became whoever it
 * was last time would make both of those impossible to do deliberately.
 */
export function ReturnGate({
  code,
  name,
  seatIndex,
  busy,
  onResume,
  onSomebodyElse,
}: {
  code: string;
  name: string;
  /** The chair they were driving, or null if they were watching. */
  seatIndex: number | null;
  busy: boolean;
  onResume: () => void;
  onSomebodyElse: () => void;
}) {
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

      <p className="max-w-xs text-center text-sm leading-relaxed text-muted">
        Ta przeglądarka była już przy tym stole
        {seatIndex === null ? " — jako widz" : ` — na miejscu ${seatIndex + 1}`}.
      </p>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <button
          onClick={onResume}
          disabled={busy}
          className="rounded-lg border border-ochre bg-ochre/10 px-6 py-3 font-[family-name:var(--font-display)] text-lg tracking-wide text-ochre transition hover:bg-ochre/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
        >
          Wróć jako {name}
        </button>
        <button
          onClick={onSomebodyElse}
          disabled={busy}
          className="rounded-lg border border-edge px-3 py-2 text-sm text-muted transition hover:text-ink disabled:opacity-40"
        >
          Dołącz jako ktoś inny
        </button>
      </div>
    </main>
  );
}

/**
 * The same door, for a browser that is already somebody here in another window.
 *
 * Not a refusal: two tabs is a thing people do on purpose at this table — it is
 * how one person drives four seats to try something out — and coming back as
 * somebody *live* would take the table out from under the window using it. So
 * this says what is true and hands over the one way forward.
 */
export function SecondTabNotice({ busy, onSomebodyElse }: { busy: boolean; onSomebodyElse: () => void }) {
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <p className="text-center text-[12px] leading-relaxed text-muted">
        Ta przeglądarka gra już przy tym stole w innym oknie.
      </p>
      <button
        onClick={onSomebodyElse}
        disabled={busy}
        className="rounded-lg border border-edge px-3 py-2 text-sm text-muted transition hover:text-ink disabled:opacity-40"
      >
        Dołącz jako ktoś inny
      </button>
    </div>
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
export function JoinCode({ code }: { code: string }) {
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
  room,
  busy,
  onTakeOver,
  onJoin,
  onWatch,
}: {
  code: string;
  /** Characters with nobody behind them. */
  free: { seatId: string; playerName: string | null; characterName: string; why: string }[];
  /** How many seats are being played, for when none are free. */
  taken: number;
  /** Whether the table has room for one more (2-6 players). */
  room: boolean;
  busy: boolean;
  onTakeOver: (seatId: string, name: string | null) => void;
  /** Sit down as somebody new, mid-game. */
  onJoin: (name: string | null) => void;
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
          {/* `taken` counts the Postacie still standing, and it reaches zero:
              kill the only one and the sentence read "Wszystkie 0 postaci mają
              swoich graczy". There is nobody left to have a player. */}
          {taken === 0
            ? "Żadna Postać nie czeka w tej chwili na gracza."
            : `Wszystkie ${taken} postaci mają swoich graczy.`}
          {room
            ? " Możesz dosiąść się nową Postacią albo oglądać."
            : " Stół jest pełny (2-6 graczy) — możesz oglądać. Jeśli ktoś odejdzie, jego postać pojawi się tutaj do przejęcia."}
        </p>
      )}

      {/* Sitting down at a table that is already running. A late arrival takes
          a Postać nobody is holding and starts from its MGR, which is what 4.4
          already does for a player whose character died — the same act, and
          the same machinery. The alternative was watching until somebody left,
          which is not a thing to ask of somebody who came to play. */}
      {room && (
        <div className="flex w-full max-w-sm flex-col gap-2">
          {free.length === 0 && (
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="twoje imię"
              maxLength={24}
              className="rounded border border-edge bg-panel px-3 py-2 text-center text-sm text-ink outline-none placeholder:text-muted/60 focus:border-ochre"
            />
          )}
          <button
            onClick={() => onJoin(name.trim() || null)}
            disabled={busy}
            className="rounded-lg border border-ochre/60 px-3 py-2 text-sm text-ochre transition hover:bg-ochre/10 disabled:opacity-40"
          >
            Dosiądź się nową Postacią
          </button>
        </div>
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
