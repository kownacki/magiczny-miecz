"use client";

/**
 * A panel laid over a column, with the board left showing beside it.
 *
 * Both of the table's own surfaces are one of these — who is playing, and every
 * card in the box — and they used to be two different things: a roster tucked
 * into the right-hand column, and a library that took the whole screen. Neither
 * shape was right. The questions they answer are asked *while* something else is
 * on screen ("what is the Wilkołak's Miecz", "what is Karol carrying"), so
 * covering the board to answer one is covering the thing being asked about.
 *
 * `side` is which column it eats. Right for the players, because that column is
 * yours and they are the same kind of thing; left for the cards, over the board,
 * because a card you are looking up is not about the board at that moment.
 *
 * It is laid *inside* the layout's content row rather than fixed to the window,
 * so it begins under the bar instead of level with it — see `table-layout.tsx`.
 * Its z still counts globally, which is what keeps it over the modals.
 */

import { useEffect, useRef } from "react";
import { LAYER } from "./layers";
import { useEscape } from "./overlay";

/**
 * Every drawer currently on screen, in the order they were opened.
 *
 * A click has to be tested against all of them at once: with the shelf out on
 * the left and the roster on the right, a click in one is outside the other,
 * and each would have dismissed the one it was not in.
 *
 * Ordered, and not a Set, for the other half of the same problem. Every drawer
 * listens, so a click on the board reached both and closed the pair of them —
 * one gesture undoing two decisions, the second of which you never asked about.
 * Last in is the one that leaves, the way `overlay.tsx` already does Escape.
 * Only mounting and unmounting may reorder this: it is the order they were
 * opened in, and a re-render is not an opening.
 */
const open: HTMLElement[] = [];

/**
 * The two ways out, for anything laid over the table.
 *
 * Extracted because the console is one of these and was not built as one. It
 * is docked along the bottom rather than down a side and keeps its own chrome,
 * but "Escape closes the newest thing" and "a click on the game closes the
 * newest thing" are not properties of a shape — they are the rules of the
 * surface, and a surface outside them is the one that breaks them for
 * everybody. The console had an Escape of its own on its input, so one press
 * ran that *and* the stack: the console closed and a drawer went with it.
 *
 * Pass null to switch it off. The console stays mounted and renders nothing
 * while shut, so without that it would sit in both registries invisibly and
 * swallow the first Escape meant for something else.
 */
export function useDismissable<T extends HTMLElement>(onClose: (() => void) | null) {
  useEscape(onClose);

  const panel = useRef<T>(null);
  const enabled = onClose !== null;

  useEffect(() => {
    const element = panel.current;
    if (!enabled || !element) return;
    open.push(element);
    return () => {
      const at = open.lastIndexOf(element);
      if (at !== -1) open.splice(at, 1);
    };
    // Only opening and closing may reorder this — see the note on `open`. The
    // callback is deliberately not a dependency: a parent re-rendering with a
    // fresh closure would otherwise move this surface back to the top and hand
    // it a dismissal meant for whatever is really newest.
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      // Inside *any* of them, not just this one. With the shelf out on the
      // left and the roster on the right, a click in one is outside the other,
      // and each would have dismissed the one it was not in.
      for (const element of open) if (element.contains(target)) return;
      // Nor is the bar elsewhere. It is what opens these, so a click on it is
      // most often "and the other one too" — closing this one on the way would
      // make them mutually exclusive by accident.
      if (target instanceof Element && target.closest("[data-table-bar]")) return;
      // And only the newest leaves. Whichever edge it is on, one click away
      // closes one surface and the next closes the one under it.
      if (open[open.length - 1] !== panel.current) return;
      onClose?.();
    };
    // `pointerdown`, not `click`: a drag that starts outside and ends inside
    // should still count as having left, and a click that never lands — the
    // pointer moving off before release — should not leave it open.
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [enabled, onClose]);

  return panel;
}

export function Drawer({
  side,
  title,
  /** Tailwind max-width. The cards want more room than the players do. */
  width = "max-w-sm",
  head,
  onClose,
  children,
}: {
  side: "left" | "right";
  title: React.ReactNode;
  width?: string;
  /** A row under the title — a search box, a tally, whatever the surface needs. */
  head?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  /**
   * Clicking away, without covering the page to notice it.
   *
   * This was a transparent catcher stretched over the columns, which worked for
   * clicks and quietly ate everything else — the wheel included. With a drawer
   * open the board and the panels behind it stopped scrolling, which is most of
   * what a drawer is for: you open the roster *because* you want to look at
   * something else at the same time.
   *
   * A listener sees the same clicks and covers nothing. The page stays live
   * underneath — scroll it, and the drawer scrolls on its own when the pointer
   * is over it, because that is simply where the wheel is pointing.
   *
   * The cost is that a click outside both dismisses and lands. That follows
   * from the page being live rather than being a separate decision: a drawer
   * you can scroll behind is a drawer you can click behind.
   */
  const panel = useDismissable<HTMLElement>(onClose);

  return (
    <aside
      ref={panel}
      role="dialog"
      aria-label={typeof title === "string" ? title : undefined}
      className={`absolute inset-y-0 flex w-full flex-col bg-night ${width} ${LAYER.drawer} ${
        side === "right"
          ? "right-0 border-l border-ochre/40 shadow-[-8px_0_30px_rgba(0,0,0,0.6)]"
          : "left-0 border-r border-ochre/40 shadow-[8px_0_30px_rgba(0,0,0,0.6)]"
      }`}
    >
      <header className="shrink-0 border-b border-edge px-3 py-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] uppercase tracking-widest text-ochre">{title}</h2>
          <button onClick={onClose} className="text-[11px] text-muted hover:text-ink">
            zamknij
          </button>
        </div>
        {head}
      </header>

      {/* A gutter that is always there, so a drawer sized to fit its contents
          fits them whether the list is long enough to scroll or not — and so
          the arithmetic behind `width` has one fewer unknown in it. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
        {children}
      </div>
    </aside>
  );
}
