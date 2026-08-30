"use client";

/** The card the turn is suspended on, and the question it is waiting to have answered. */

import type { Effect } from "@/lib/engine/cardScript";
import { nodeAt } from "@/lib/engine/resolve";
import type { FieldId } from "@/lib/engine/board";
import { Overlay } from "./overlay";

/**
 * A `script` frame on screen (docs/STACK.md).
 *
 * Most cards never get here: a settled card resolves in one press, and even a
 * card full of choices resolves in one because the browser batches the answers
 * into the resolve. This panel is for the card that genuinely stopped — a
 * question left over after a mid-card fight, a decision the resolve was sent
 * without — and it is drawn for everybody, because the whole table is waiting
 * on it: the owner gets the buttons, the rest see whose answer is owed.
 */
export function ScriptFramePanel({
  frame,
  who,
  canAct,
  ring,
  busy,
  onAnswer,
}: {
  frame: { seatId: string; reason: string; effect: Effect; cursor: number[] };
  /** Whose answer it is — the frame's own seat, named (law 5). */
  who: string;
  canAct: boolean;
  /** The fields a destination question may point at. */
  ring: { fieldId: FieldId; name: string }[];
  busy: boolean;
  onAnswer: (decided: { choices?: number[]; destination?: FieldId }) => void;
}) {
  const asking = nodeAt(frame.effect, frame.cursor);

  return (
    // Not dismissable: the turn is stuck on this question and clicking away
    // would only hide the thing everybody is waiting for.
    <Overlay label={frame.reason} onDismiss={null} tone="bg-night/80">
      <div className="w-full max-w-md rounded-lg border border-edge bg-panel p-4 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">
          {frame.reason}
        </h2>
        <p className="mt-1 text-xs text-muted">
          Karta w trakcie rozpatrywania — {canAct ? "twoja odpowiedź" : `odpowiada ${who}`}.
        </p>

        {asking?.op === "wybor" && (
          <div className="mt-3 flex flex-col gap-2">
            {asking.options.map((option, index) => (
              <button
                key={index}
                type="button"
                disabled={busy || !canAct}
                onClick={() => onAnswer({ choices: [index] })}
                className="rounded border border-edge px-3 py-2 text-left text-sm text-ink transition hover:border-ochre disabled:opacity-50"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {asking?.op === "przenies" && asking.to.kind !== "pole" && (
          <div className="mt-3 flex flex-wrap gap-1">
            {ring.map((field) => (
              <button
                key={field.fieldId}
                type="button"
                disabled={busy || !canAct}
                onClick={() => onAnswer({ destination: field.fieldId })}
                className="rounded border border-edge px-2 py-1 text-[12px] text-ink transition hover:border-ochre disabled:opacity-50"
              >
                {field.name}
              </button>
            ))}
          </div>
        )}

        {asking && asking.op !== "wybor" && !(asking.op === "przenies" && asking.to.kind !== "pole") && (
          // A question this panel has no controls for yet — named honestly
          // rather than guessed at. The console's `answer` reaches it.
          <p className="mt-3 text-sm text-vermilion/90">
            Ta Karta czeka na odpowiedź, której ten panel jeszcze nie umie zadać
            ({asking.op}) — odpowiedzcie w konsoli.
          </p>
        )}
      </div>
    </Overlay>
  );
}
