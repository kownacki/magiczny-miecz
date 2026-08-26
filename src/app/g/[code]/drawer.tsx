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

import { LAYER } from "./layers";
import { useEscape } from "./overlay";

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
  useEscape(onClose);

  return (
    <>
      {/* Clicking away, without the board going dark for it.
          
          The drawer is a thing you opened to look something up, over a game
          that is still there — dimming it would undo the reason it is a drawer
          and not a modal. So the catcher is invisible, and what it costs is
          that a click on the board closes the drawer instead of reaching the
          board. That is the right trade: the alternative is dismissing a
          roster by moving somebody's figure. */}
      <div
        aria-hidden
        onClick={onClose}
        className={`absolute inset-0 ${LAYER.drawerAway}`}
      />
      <aside
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
    </>
  );
}
