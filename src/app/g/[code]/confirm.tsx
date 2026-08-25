"use client";

import { useEffect, useRef } from "react";

/**
 * The one place this app asks "are you sure?".
 *
 * Three things in the poczekalnia cannot be taken back by the person they
 * happen to: starting the game ends everybody's chance to change their
 * character, removing a player takes their seat, and handing over the host role
 * gives away the only thing that distinguishes it. None of them is dangerous,
 * all of them are irreversible from the other side of the table, and all three
 * used to happen on one click of a small button next to four other small
 * buttons.
 *
 * Deliberately not `window.confirm`. A native dialog blocks the whole page,
 * which stops the poll and freezes everybody else's view of the table for as
 * long as the question is on screen — and it cannot say who it is about.
 */
export interface Confirmation {
  title: string;
  /** What is about to happen, in the words of the thing that happens. */
  body: string;
  /** The button that does it. Says the verb, not "OK". */
  confirmLabel: string;
  /** Red for anything that takes something away from somebody. */
  tone?: "normal" | "grave";
  onConfirm: () => void;
}

export function ConfirmDialog({
  ask,
  busy,
  onCancel,
}: {
  /** The pending question, or null when there is nothing to ask. */
  ask: Confirmation | null;
  busy: boolean;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Escape closes it, and the confirming button takes focus so the question can
  // be answered from the keyboard without hunting for it.
  useEffect(() => {
    if (!ask) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, onCancel]);

  if (!ask) return null;
  const grave = ask.tone === "grave";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ask.title}
      // Clicking away is a "no". The safest answer is the one you get by
      // dismissing it, which is why cancelling is what the backdrop does.
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-edge bg-panel p-4 shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
      >
        <h2 className="mb-1 font-[family-name:var(--font-display)] text-lg text-ink">
          {ask.title}
        </h2>
        <p className="mb-4 text-[13px] leading-relaxed text-muted">{ask.body}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-edge px-3 py-1 text-[13px] text-muted transition hover:border-ochre hover:text-ink disabled:opacity-40"
          >
            Anuluj
          </button>
          <button
            ref={confirmRef}
            onClick={ask.onConfirm}
            disabled={busy}
            className={`rounded border px-3 py-1 text-[13px] transition disabled:opacity-40 ${
              grave
                ? "border-vermilion/60 bg-vermilion/10 text-vermilion hover:bg-vermilion/20"
                : "border-ochre bg-ochre/10 text-ochre hover:bg-ochre/20"
            }`}
          >
            {ask.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
