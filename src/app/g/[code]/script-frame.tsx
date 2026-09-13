"use client";

/** The card the turn is suspended on, and the question it is waiting to have answered. */

import { questionOn } from "@/lib/engine/question";
import type { TurnPhase } from "@/lib/engine/turn";
import type { FieldId } from "@/lib/engine/board";
import { fieldName } from "@/lib/engine/polish";
import { Overlay } from "./overlay";
import { ActionButton } from "./action-button";

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
  at,
  busy,
  onAnswer,
}: {
  frame: Extract<TurnPhase, { phase: "script" }>;
  /** Whose answer it is — the frame's own seat, named (law 5). */
  who: string;
  canAct: boolean;
  /**
   * Where the Postać stands and who is in the way.
   *
   * The two facts a destination needs, handed to `questionOn` rather than
   * turned into buttons here. This used to be a `ring` prop — the caller worked
   * out `ringFields(active.field_id)` and this drew one button per entry, which
   * is an interface keeping 11.2 on its own. It kept it correctly and the
   * server kept nothing, so the same card answered from the console put a
   * Postać in the middle of the board.
   */
  at: { standingOn: FieldId | null; occupied: readonly FieldId[] };
  busy: boolean;
  onAnswer: (decided: { choices?: number[]; destination?: FieldId }) => void;
}) {
  const question = questionOn(frame, at);

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

        {question?.kind === "wybor" && (
          <div className="mt-3 flex flex-col gap-2">
            {question.options.map((label, index) => (
              <ActionButton
                key={index}
                weight="quiet"
                size="lg"
                align="left"
                disabled={busy || !canAct}
                onClick={() => onAnswer({ choices: [index] })}
              >
                {label}
              </ActionButton>
            ))}
          </div>
        )}

        {question?.kind === "gdzie" && (
          <div className="mt-3 flex flex-wrap gap-1">
            {question.fields.map((fieldId) => (
              <ActionButton
                key={fieldId}
                weight="quiet"
                size="sm"
                disabled={busy || !canAct}
                onClick={() => onAnswer({ destination: fieldId })}
              >
                {fieldName(fieldId)}
              </ActionButton>
            ))}
          </div>
        )}

        {/* „jeśli nie ma takiego Obszaru, odłóż Kartę" — the Lewiatan's own
            sentence, and the one state a row of buttons cannot show. */}
        {question?.kind === "gdzie" && question.fields.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            Żaden Obszar tej Karty nie jest wolny.
          </p>
        )}

        {question?.kind === "nieobslugiwane" && (
          // A question no surface can ask yet — named honestly rather than
          // guessed at, and named the same way at the prompt, which is where
          // this used to send the table to read a blank line.
          <p className="mt-3 text-sm text-vermilion/90">
            Ta Karta czeka na odpowiedź, której nikt jeszcze nie umie zadać
            ({question.op}).
          </p>
        )}
      </div>
    </Overlay>
  );
}
