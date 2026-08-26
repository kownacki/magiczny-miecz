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

import type { TurnStep, TurnWindow, WindowId } from "@/lib/engine/turnWindows";
import { Lookable } from "./lookable";

export function NowBox({
  playerName,
  isMine,
  fieldName,
  fieldId,
  windows,
  steps,
  canEnd,
  whyNotEnd,
  canRoll,
  canDraw,
  busy,
  onOpen,
  onRoll,
  onDraw,
  onEnd,
}: {
  playerName: string;
  /** Whether the viewer is the one who has to do something about it. */
  isMine: boolean;
  fieldName: string;
  /** The id behind it, so the Obszar you are standing on can be looked at. */
  fieldId: string | null;
  /** What this turn is offering — see `windowsFor`. */
  windows: readonly TurnWindow[];
  /** How far through the turn it is — see `turnSteps`. */
  steps: readonly TurnStep[];
  canEnd: boolean;
  /** Said on the disabled control, so a refusal explains itself (see `duties.ts`). */
  whyNotEnd?: string | null;
  /** The turn has not been rolled yet — 10.2 makes this the first thing it does. */
  canRoll: boolean;
  /** The Obszar still owes cards (13.4 counts what is already lying there). */
  canDraw: boolean;
  busy: boolean;
  onOpen: (id: WindowId) => void;
  onRoll: () => void;
  onDraw: () => void;
  onEnd: () => void;
}) {
  return (
    <section
      aria-label="Teraz"
      // A fixed width and a floor, stretching to whatever the queue beside it
      // is tall. Half again as wide as it was: three steps and a row of window
      // buttons were wrapping onto second lines in a box that had the height
      // for them and not the width. Nothing below moves when a window appears or the Obszar turns
      // out to have more to say than the last one did — and a hard height
      // clipped the buttons the moment a field offered two.
      className="flex min-h-[180px] w-[270px] shrink-0 flex-col rounded-lg border border-ochre/40 bg-panel p-3"
    >
      <header className="mb-2 min-w-0">
        <p className="truncate font-[family-name:var(--font-display)] text-sm text-ochre">
          {isMine ? "Twoja tura" : playerName}
        </p>
        {/* Where the figure is standing. The board says it too, but the board
            is on the other side of the screen and this is the line you read
            without looking away from what you are about to press. */}
        <p className="truncate text-[11px] text-muted" title={fieldName}>
          {fieldId ? (
            <Lookable kind="field" id={fieldId} name={fieldName} />
          ) : (
            fieldName
          )}
        </p>
      </header>

      {/* How far through the turn this is.
      
          When the roll was a panel that appeared, and then a different panel
          appeared in its place, the screen changing WAS the progress report.
          Now that both are buttons in one box, a player who looks away comes
          back to a box that looks much like it did and cannot tell whether they
          have already rolled. */}
      {steps.length > 0 && (
        <p className="mb-2 flex shrink-0 flex-wrap items-center gap-x-1 text-[10px] uppercase tracking-wide">
          {steps.map((step, at) => (
            <span key={step.label} className="flex items-center gap-1">
              {at > 0 && <span className="text-edge">·</span>}
              <span
                className={
                  step.state === "zrobione"
                    ? "text-verdigris"
                    : step.state === "teraz"
                      ? "text-ochre"
                      : "text-muted/50"
                }
              >
                {step.label}
                {step.state === "zrobione" && " \u2713"}
              </span>
            </span>
          ))}
        </p>
      )}

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
      {/* Drawing is the roll's twin: the field says how many and there is
          nothing to decide, so it is a button here rather than a window. What
          comes off the deck is the decision, and that opens one. */}
      {isMine && canDraw && (
        <button
          onClick={onDraw}
          disabled={busy}
          className="mt-2 shrink-0 rounded border border-ochre bg-ochre/10 px-2 py-2 font-[family-name:var(--font-display)] text-[13px] tracking-wide text-ochre transition hover:bg-ochre/20 disabled:opacity-40"
        >
          Wyciągnij kartę
        </button>
      )}

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
          // A disabled control that does not say why is a control that looks
          // broken. The reason is the rule, quoted.
          title={canEnd ? undefined : (whyNotEnd ?? undefined)}
          className="mt-2 shrink-0 rounded border border-edge px-2 py-1 text-[11px] text-muted transition hover:border-ochre hover:text-ink disabled:opacity-40"
        >
          Zakończ turę
        </button>
      )}
    </section>
  );
}
