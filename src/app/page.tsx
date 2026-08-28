"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { normaliseJoinCode } from "@/lib/game/codes";
import { readSeatToken, takeRemovedNotice, writeSeatToken } from "@/lib/game/seatToken";
import characters from "@/data/characters.json";
import type { Character } from "@/data/types";
import { isCharacterId } from "@/data/ids";
import { COMPANION_PARKED } from "@/lib/game/modes";
import { deviceId } from "@/lib/game/deviceId";

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

/** Which dialog is open, and what it is about to do. */
type Intent = { kind: "create" } | { kind: "join"; code: string } | null;

/**
 * Entry point, in the order the questions actually arrive.
 *
 * Joining comes first because it is the commonest thing anybody does here: five
 * people are in a room, one of them opened a table, and the other four are
 * typing the code being read out. Opening a table is the rarer act, and the
 * list of existing ones is what you scroll to when you cannot remember which
 * table last night's game was on.
 *
 * Both routes go through a dialog rather than fields on this page. The name is
 * required, and the mode has to be settled before a table exists; asking for
 * both inline meant a page of fields most of which were irrelevant to whichever
 * of the two things you had come to do.
 */
export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [intent, setIntent] = useState<Intent>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<GameSummary[] | null>(null);
  /** Which table is one more click from being deleted. */
  const [deleting, setDeleting] = useState<string | null>(null);
  /**
   * The table this window was just put out of, if it was.
   *
   * Read once and cleared by the reading, because it is about the journey that
   * ended here and not about this page: a second visit is somebody coming back,
   * and telling them again what happened last time is telling them about
   * nothing. Lazily rather than in an effect, so it is gone before the first
   * paint and cannot flash on and off.
   */
  const [removedFrom] = useState<string | null>(() =>
    typeof window === "undefined" ? null : takeRemovedNotice(),
  );

  // A game of this length spans several sittings, so "which table were we on?"
  // is a real question and the list is worth having before it is asked.
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

  async function createTable(
    name: string,
    mode: "simulation" | "companion",
    eqMode: "classic" | "slots",
    endlessStock: boolean,
  ) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, mode, eqMode, endlessStock, deviceId: deviceId() }),
      });
      if (!response.ok) throw new Error("Nie udało się otworzyć stołu.");
      const { joinCode, token } = await response.json();
      // The host's token is kept per-table so one device can sit at several.
      writeSeatToken(joinCode, token);
      router.push(`/g/${joinCode}`);
    } catch (problem) {
      setError((problem as Error).message);
      setIntent(null);
      setBusy(false);
    }
  }

  async function joinTable(joinCode: string, name: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/games/${joinCode}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, deviceId: deviceId() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Nie udało się dołączyć.");
      writeSeatToken(joinCode, data.token);
      router.push(`/g/${joinCode}`);
    } catch (problem) {
      setError((problem as Error).message);
      setIntent(null);
      setBusy(false);
    }
  }

  /**
   * Going to a table, from the list or from the code field.
   *
   * A tab that already holds a seat there walks straight in. Being asked your
   * name again at a table you are already sitting at is the app forgetting who
   * you are — and worse than forgetting, since a join with no token takes a
   * *second* seat and strands the first. A second tab holds no seat of its own,
   * so it gets the dialog and becomes its own player.
   */
  function open(joinCode: string) {
    if (readSeatToken(joinCode)) return router.push(`/g/${joinCode}`);
    setIntent({ kind: "join", code: joinCode });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-6 py-16">
      {intent?.kind === "create" && (
        <CreateDialog busy={busy} onCancel={() => setIntent(null)} onCreate={createTable} />
      )}
      {intent?.kind === "join" && (
        <JoinDialog
          code={intent.code}
          busy={busy}
          onCancel={() => setIntent(null)}
          onJoin={(name) => joinTable(intent.code, name)}
        />
      )}

      {/* Why this window is here rather than at the table it was at. Above the
          title, because it is the answer to a question the person arrived
          holding — anywhere further down it is a footnote to a page they did
          not ask for. */}
      {removedFrom && (
        <p
          role="status"
          className="rounded border border-vermilion/50 bg-vermilion/10 px-3 py-2 text-center text-sm text-vermilion"
        >
          Gospodarz usunął cię ze stołu {removedFrom}. Postać została w grze — możesz
          wrócić na to miejsce, jeśli nikt go nie zajmie.
        </p>
      )}

      <header className="text-center">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-wide text-ochre">
          Magiczny Miecz
        </h1>
        {/* Says what the app does today. While companion mode is parked there
            is one way to play, and promising two would be promising one that
            cannot be chosen. */}
        <p className="mt-3 text-sm text-muted">
          {COMPANION_PARKED
            ? "Zagraj całą partię tutaj — plansza, karty, kostka i kolejność po stronie aplikacji."
            : "Zagraj całą partię tutaj albo przy planszy — liczenie, rzuty i kolejność kart aplikacja bierze na siebie w obu trybach."}
        </p>
      </header>

      {/* First, because it is what most people came here to do: somebody is
          reading a code out and four other people are typing it. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const clean = normaliseJoinCode(code);
          if (clean.length >= 4) open(clean);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="code" className="text-xs uppercase tracking-widest text-muted">
          Dołącz kodem
        </label>
        <div className="flex gap-2">
          <input
            id="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="np. K7DQM"
            autoCapitalize="characters"
            autoComplete="off"
            className="tnum flex-1 rounded-lg border border-edge bg-panel px-4 py-3 text-center text-2xl uppercase tracking-[0.3em] text-ink placeholder:text-muted/50 focus:border-ochre focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || normaliseJoinCode(code).length < 4}
            className="rounded-lg border border-ochre bg-ochre/10 px-5 font-[family-name:var(--font-display)] text-ochre transition hover:bg-ochre/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
          >
            Dołącz
          </button>
        </div>
      </form>

      <button
        onClick={() => setIntent({ kind: "create" })}
        disabled={busy}
        className="rounded-lg border border-edge bg-raised px-6 py-4 font-[family-name:var(--font-display)] text-lg font-medium text-ink transition hover:border-ochre hover:bg-edge disabled:opacity-50"
      >
        Otwórz nowy stół
      </button>

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
                onClick={() => open(game.joinCode)}
                className="block w-full px-3 py-2 text-left"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="tnum font-[family-name:var(--font-display)] tracking-[0.2em] text-ink">
                    {game.joinCode}
                  </span>
                  <span className="text-[11px] text-muted">
                    {/* The mode is fixed at creation, so it is a property of the
                        table worth seeing before you open it. */}
                    {game.mode === "companion" ? "przy planszy" : "symulacja"} ·{" "}
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
                            (isCharacterId(player.characterId)
                              ? (CHARACTER_NAMES.get(player.characterId) ?? "?")
                              : player.characterId
                                ? "?"
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

/**
 * The frame both dialogs share.
 *
 * Deliberately not a `<dialog>` and never a `confirm()`: a native modal cannot
 * be styled to match the rest of this, and on a phone it interrupts with a
 * system alert. The backdrop and Escape both close it, which is what anybody
 * who opened it by accident will try.
 */
function Dialog({
  title,
  onCancel,
  children,
}: {
  title: React.ReactNode;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/85 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-edge bg-panel p-5"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <h2 className="mb-4 text-center font-[family-name:var(--font-display)] text-xl text-ochre">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** Both dialogs ask this first, and neither will proceed without it. */
function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <>
      <label htmlFor="dialog-name" className="text-xs uppercase tracking-widest text-muted">
        Twoje imię
      </label>
      <input
        id="dialog-name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="np. Michał"
        maxLength={24}
        autoFocus
        className="rounded border border-edge bg-night px-3 py-2 text-center text-lg text-ink outline-none focus:border-ochre"
      />
    </>
  );
}

function Actions({
  busy,
  disabled,
  label,
  onCancel,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-edge px-3 py-2 text-sm text-muted transition hover:text-ink"
      >
        Anuluj
      </button>
      <button
        type="submit"
        disabled={busy || disabled}
        className="flex-1 rounded border border-ochre bg-ochre/10 px-4 py-2 font-[family-name:var(--font-display)] tracking-wide text-ochre transition hover:bg-ochre/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
      >
        {label}
      </button>
    </div>
  );
}

function JoinDialog({
  code,
  busy,
  onCancel,
  onJoin,
}: {
  code: string;
  busy: boolean;
  onCancel: () => void;
  onJoin: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Dialog
      title={
        <>
          Dołączasz do stołu <span className="tnum tracking-[0.2em] text-ink">{code}</span>
        </>
      }
      onCancel={onCancel}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onJoin(name.trim());
        }}
        className="flex flex-col gap-2"
      >
        <NameField value={name} onChange={setName} />
        <Actions
          busy={busy}
          disabled={!name.trim()}
          label={busy ? "Dołączam…" : "Dołącz"}
          onCancel={onCancel}
        />
      </form>
    </Dialog>
  );
}

function CreateDialog({
  busy,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (
    name: string,
    mode: "simulation" | "companion",
    eqMode: "classic" | "slots",
    endlessStock: boolean,
  ) => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"simulation" | "companion">("simulation");
  /**
   * What a table opens with, before its players have talked about it.
   *
   * Both are moved in the poczekalnia now, so these are the defaults rather
   * than answers: slotowy because it is how this table plays, and the endless
   * pile because 21.2 is right about a Magiczny Miecz and odd about a Hełm.
   * Still sent explicitly rather than left to the route's own defaults — the
   * dialog is where a table's first state is decided, and a caller that sends
   * nothing is a caller that cannot be read.
   */
  const eqMode = "slots" as const;
  const endlessStock = true;

  return (
    <Dialog title="Nowy stół" onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onCreate(name.trim(), mode, eqMode, endlessStock);
        }}
        className="flex flex-col gap-2"
      >
        <NameField value={name} onChange={setName} />

        {/* The mode belongs to the table, so it is settled before the table
            exists rather than toggled in the lobby afterwards. It decides
            whether there is a board in the room, which is not a preference
            anybody changes their mind about between clicking twice. */}
        <fieldset className="mt-3 flex flex-col gap-2">
          <legend className="mb-2 text-xs uppercase tracking-widest text-muted">
            Jak gracie
          </legend>
          <ModeChoice
            active={mode === "simulation"}
            onPick={() => setMode("simulation")}
            label="Pełna symulacja"
            hint="Wszystko dzieje się tutaj — plansza i karty nie są potrzebne."
          />
          {/* Parked, not removed — see COMPANION_PARKED. Left on screen so
              that it reads as "later" rather than as a mode this app never
              had. */}
          <ModeChoice
            active={mode === "companion"}
            onPick={() => setMode("companion")}
            parked={COMPANION_PARKED}
            label="Sędzia przy planszy"
            hint={
              COMPANION_PARKED
                ? "Chwilowo wyłączone — wróci, gdy symulacja będzie gotowa."
                : "Gracie prawdziwą planszą; aplikacja liczy i pilnuje kolejności."
            }
          />
        </fieldset>

        {/* The variant and the pile are not asked here any more.

            They were, and that meant they were answered before anybody else had
            arrived: whoever clicked fastest settled a house rule for five other
            people, who found out later by discovering they had a Plecak.
            Neither has to be decided at the door, because nothing is dealt
            until the game starts — so both are in the poczekalnia now, where
            the table is all present and has nothing to do but talk about them.

            The mode stays. It is the one answer that really does precede the
            table: it decides whether there is a board in the room at all. */}

        <Actions
          busy={busy}
          disabled={!name.trim()}
          label={busy ? "Otwieram…" : "Otwórz stół"}
          onCancel={onCancel}
        />
      </form>
    </Dialog>
  );
}

function ModeChoice({
  active,
  onPick,
  label,
  hint,
  parked,
}: {
  active: boolean;
  onPick: () => void;
  label: string;
  hint: string;
  /** Shown, struck through and unselectable: not gone, just not now. */
  parked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={parked}
      aria-pressed={active}
      className={`rounded-lg border px-3 py-2 text-left transition ${
        parked
          ? "cursor-not-allowed border-edge/50 bg-panel/20"
          : active
            ? "border-ochre bg-ochre/10"
            : "border-edge bg-panel/40 hover:border-ochre/60"
      }`}
    >
      <span
        className={`block font-[family-name:var(--font-display)] text-sm ${
          parked ? "text-muted/60 line-through" : active ? "text-ochre" : "text-ink"
        }`}
      >
        {label}
      </span>
      <span
        className={`block text-[11px] leading-snug ${parked ? "text-muted/50" : "text-muted"}`}
      >
        {hint}
      </span>
    </button>
  );
}
