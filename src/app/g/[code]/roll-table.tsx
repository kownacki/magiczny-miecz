"use client";

import { useState } from "react";
import { parseRollTable } from "@/lib/engine/rollTable";
import { suggestActions } from "@/lib/engine/cardEffects";

/**
 * A printed die table, rolled in place.
 *
 * Local state rather than server state on purpose: this is a lookup, not a move.
 * The rules that matter — Karczma's "tracisz 1 turę", Kurhan's Duch — still have
 * to be applied by the player through the ordinary controls, and the outcome
 * text says so. Recording the lookup as a game action would imply the referee
 * had applied it.
 */
export function RollTable({
  text,
  busy = false,
  typedRolls = true,
  onSuggestion,
}: {
  text: string;
  busy?: boolean;
  /**
   * Whether the face that came up may be picked by hand.
   *
   * True at a physical table, where somebody has just thrown a real die and the
   * app's job is to look up what it means. False in a simulation, where there
   * is no die but this one and choosing your own result is not a game.
   */
  typedRolls?: boolean;
  /** Applies an outcome's bookkeeping. Omitted for viewers who cannot act. */
  onSuggestion?: (stat: string, delta: number, reason: string) => void;
}) {
  const table = parseRollTable(text);
  const [rolled, setRolled] = useState<number | null>(null);

  // Null is the normal answer for most prose. A field whose table could not be
  // read safely simply shows its text, which is already on screen above.
  if (!table) return null;

  return (
    <div className="mt-3 rounded border border-edge bg-night/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted">
          {table.label || "Rzuć kostką"}
        </span>
        <button
          onClick={() => setRolled(1 + Math.floor(Math.random() * 6))}
          className="rounded border border-edge px-2 py-1 text-xs text-ink transition hover:border-ochre"
        >
          Rzuć
        </button>
        {typedRolls &&
          [1, 2, 3, 4, 5, 6].map((face) => (
            <button
              key={face}
              onClick={() => setRolled(face)}
              className={`tnum h-6 w-6 rounded border text-xs transition ${
                rolled === face
                  ? "border-ochre text-ochre"
                  : "border-edge text-muted hover:border-ochre"
              }`}
            >
              {face}
            </button>
          ))}
        {rolled !== null && (
          <button
            onClick={() => setRolled(null)}
            className="ml-auto text-[11px] text-muted underline hover:text-ink"
          >
            wyczyść
          </button>
        )}
      </div>

      {rolled === null ? (
        <ol className="flex flex-col gap-1 text-xs text-muted">
          {[1, 2, 3, 4, 5, 6].map((face) => (
            <li key={face}>
              <span className="tnum mr-2 text-muted/60">{face}</span>
              {table.outcomes[face]}
            </li>
          ))}
        </ol>
      ) : (
        <div>
          <p className="text-sm text-ink">
            <span className="tnum mr-2 text-2xl font-medium text-ochre">{rolled}</span>
            {table.outcomes[rolled]}
          </p>
          {/* Once the die has settled the outcome is a single unconditional
              instruction, so the same suggestion rules that read card text
              apply to it — and this is where the friction was: the table would
              say "wygrałeś 1 Sz. Z." and leave you to find the +/- yourself. */}
          {onSuggestion && (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestActions({ text: table.outcomes[rolled] }).map((suggestion) => (
                <button
                  key={suggestion.label}
                  disabled={busy}
                  onClick={() =>
                    onSuggestion(suggestion.stat, suggestion.delta, table.label || "rzut")
                  }
                  className="rounded border border-verdigris/50 px-3 py-1 text-xs text-ink transition hover:bg-verdigris/20 disabled:opacity-50"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
