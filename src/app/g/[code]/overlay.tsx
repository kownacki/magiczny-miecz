"use client";

/**
 * What every sheet over the table does, in one place.
 *
 * There were six of these and five of them had written it out themselves —
 * the same `keydown` effect, the same backdrop with `onClick`, the same
 * `stopPropagation` on the panel inside it — which is how the sixth came to be
 * missing half of it. The Karta you open to read had no Escape at all, and the
 * drawers had neither.
 *
 * The two ways out are the ones people expect and never read about: Escape, and
 * a click on anything that is not the sheet. Both mean the same thing, so both
 * go through `onDismiss` and neither is optional — except where a sheet is
 * *un*dismissable, which is a real category and not an oversight.
 *
 * Undismissable is for a sheet that is the game asking, rather than something
 * you opened to look at: a fight is not over because you pressed Escape, and a
 * dead character still has to choose. Those pass `dismissable={false}` and say
 * why, so the next person to wonder does not "fix" it.
 */

import { useEffect, useRef } from "react";
import { LAYER } from "./layers";

/**
 * Everything currently dismissable, innermost last.
 *
 * A stack rather than a listener each, because Escape means *the top one* and
 * nothing else. Six separate `keydown` handlers all fire, so a Karta opened
 * over a drawn card would close the Karta and — through the draw sheet's own
 * Escape, which puts the card back on the field (16.8) — throw the card away
 * with it. One press, two things, one of them irreversible.
 */
const stack: Array<() => void> = [];

/** Whether anything on screen would answer an Escape of its own. */
export function dismissableOpen(): boolean {
  return stack.length > 0;
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    stack[stack.length - 1]?.();
  });
}

/**
 * Escape, wherever the focus happens to be.
 *
 * On `window` rather than the panel, because the thing you want to close is
 * rarely the thing you last clicked — you have just read a card and your hands
 * are nowhere.
 */
export function useEscape(onDismiss: (() => void) | null) {
  /**
   * The callback, kept current without moving the sheet in the stack.
   *
   * Registering `onDismiss` itself put the effect at the mercy of whoever
   * passes it: a parent re-rendering with a fresh closure would unregister and
   * re-register, which pushes that sheet back onto the *top* — so an Escape
   * would then close the drawer opened first rather than the one opened last,
   * depending on which component happened to re-render. The order has to be the
   * order they opened in, and only mounting and unmounting may change it.
   */
  const latest = useRef(onDismiss);
  // Written in an effect rather than during the render, which is the rule the
  // lint is enforcing: a ref assigned while rendering is a value React has not
  // agreed to yet, and a render that gets thrown away would leave it behind.
  useEffect(() => {
    latest.current = onDismiss;
  }, [onDismiss]);

  const enabled = onDismiss !== null;
  useEffect(() => {
    if (!enabled) return;
    const slot = () => latest.current?.();
    stack.push(slot);
    return () => {
      const at = stack.lastIndexOf(slot);
      if (at !== -1) stack.splice(at, 1);
    };
  }, [enabled]);
}

/**
 * A sheet in the middle of the screen, over a darkened table.
 *
 * `onDismiss` is null for the undismissable ones: no Escape, no click-away, and
 * the backdrop stops being a way out without stopping being a backdrop.
 */
export function Overlay({
  label,
  onDismiss,
  layer = LAYER.modal,
  tone = "bg-night/85",
  alert = false,
  children,
}: {
  label?: string;
  onDismiss: (() => void) | null;
  /** Where it sits — `LAYER.card` for a Karta, which opens from the drawers. */
  layer?: string;
  /** How dark the table goes behind it. */
  tone?: string;
  /** Reports something that already happened, rather than asking. */
  alert?: boolean;
  children: React.ReactNode;
}) {
  useEscape(onDismiss);

  return (
    <div
      role={alert ? "alertdialog" : "dialog"}
      aria-modal="true"
      aria-label={label}
      onClick={onDismiss ?? undefined}
      className={`fixed inset-0 ${layer} flex items-center justify-center p-4 ${tone}`}
    >
      {/* The sheet itself is not "elsewhere": clicking inside one must not
          close it, which is the half of this that is easy to leave out. */}
      <div className="contents" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
