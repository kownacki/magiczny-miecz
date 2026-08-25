"use client";

/**
 * Where the turn is, in a box that does not change size.
 *
 * This replaces a panel that grew and shrank with whatever the Obszar happened
 * to be — a Karczma's die table, a Gród's price list, a crossing's two buttons —
 * so the one thing a player looks up to check ("is it me, where am I, what can
 * I do") moved down the screen every turn. Everything that used to expand here
 * is a window now, and this only lists them.
 *
 * Square, and beside the queue rather than under it: the queue answers "when",
 * this answers "now", and they are the same question asked twice.
 */

import type { TurnWindow, WindowId } from "@/lib/engine/turnWindows";

export function NowBox({
  playerName,
  isMine,
  fieldName,
  windows,
  canEnd,
  canRoll,
  busy,
  onOpen,
  onRoll,
  onEnd,
}: {
  playerName: string;
  /** Whether the viewer is the one who has to do something about it. */
  isMine: boolean;
  fieldName: string;
  /** What this turn is offering — see `windowsFor`. */
  windows: readonly TurnWindow[];
  canEnd: boolean;
  /** The turn has not been rolled yet — 10.2 makes this the first thing it does. */
  canRoll: boolean;
  busy: boolean;
  onOpen: (id: WindowId) => void;
  onRoll: () => void;
  onEnd: () => void;
}) {
  return (
    <section
      aria-label="Teraz"
      // A fixed width and a floor, stretching to whatever the queue beside it
      // is tall. Nothing below moves when a window appears or the Obszar turns
      // out to have more to say than the last one did — and a hard height
      // clipped the buttons the moment a field offered two.
      className="flex min-h-[180px] w-[180px] shrink-0 flex-col rounded-lg border border-ochre/40 bg-panel p-3"
    >
      <header className="mb-2 min-w-0">
        <p className="truncate font-[family-name:var(--font-display)] text-sm text-ochre">
          {isMine ? "Twoja tura" : playerName}
        </p>
        {/* Where the figure is standing. The board says it too, but the board
            is on the other side of the screen and this is the line you read
            without looking away from what you are about to press. */}
        <p className="truncate text-[11px] text-muted" title={fieldName}>
          {fieldName}
        </p>
      </header>

      {/* The windows, most pressing first — the order is 16.4's. Everyone gets
          them, not only the player whose turn it is: at a table the others read
          the Obszar aloud and argue about it, and a window only one device can
          open is a rule only one person can check. What differs is what may be
          pressed inside, which each window decides for itself. */}
      <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1 overflow-y-auto">
        {windows.map((window) => (
          <button
            key={window.id}
            onClick={() => onOpen(window.id)}
            disabled={busy}
            className={`rounded border px-2 py-1 text-[11px] leading-none transition disabled:opacity-40 ${
              window.compulsory
                ? "border-ochre bg-ochre/10 text-ochre hover:bg-ochre/20"
                : "border-edge text-muted hover:border-ochre hover:text-ink"
            }`}
          >
            {window.label}
            {window.count !== undefined && (
              <span className="ml-1 opacity-70">{window.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* The two controls pressed every single turn, so they keep their place
          at the bottom rather than being buried a window deep with the rest.
          The roll is the whole of 10.2's first half — "wykonanie rzutu kostką"
          — and there is nothing to decide about it, so it is a button and not
          a window. What the die then asks IS a decision, and that opens the
          action window like everything else. */}
      {isMine && canRoll && (
        <button
          onClick={onRoll}
          disabled={busy}
          className="mt-2 shrink-0 rounded border border-ochre bg-ochre/10 px-2 py-2 font-[family-name:var(--font-display)] text-[13px] tracking-wide text-ochre transition hover:bg-ochre/20 disabled:opacity-40"
        >
          Rzuć kostką
        </button>
      )}
      {isMine && (
        <button
          onClick={onEnd}
          disabled={busy || !canEnd}
          className="mt-2 shrink-0 rounded border border-edge px-2 py-1 text-[11px] text-muted transition hover:border-ochre hover:text-ink disabled:opacity-40"
        >
          Zakończ turę
        </button>
      )}
    </section>
  );
}
