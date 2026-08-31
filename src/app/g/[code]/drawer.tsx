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

import { useState } from "react";
import { LAYER } from "./layers";
import { AnswersEscape, useDismissable } from "./overlay";
import { ChromeButton, CloseButton, SurfaceHead } from "./chrome";

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
  /**
   * Pinned: open, and not going anywhere by accident.
   *
   * A drawer is normally something you opened to read and are finished with the
   * moment you look elsewhere, which is why a click on the game closes it. But
   * half of what these are for is reading *while* doing something — the Księga
   * open at a card you are deciding about, the roster open through a fight —
   * and a panel that shuts the moment you touch the board cannot be used that
   * way at all. So every drawer can opt out, the way the console already
   * could: pinned, it answers neither Escape nor a click away, and the only
   * ways out are `odepnij` and the close button, both deliberate.
   *
   * Per drawer and not remembered: it is a decision about what you are doing
   * now, and a drawer that came back pinned days later would be one nobody
   * could work out how to shut.
   */
  const [pinned, setPinned] = useState(false);
  // A drawer's dismissal is closing: it is something you opened to read, and
  // there is no smaller state for it to go to.
  const panel = useDismissable<HTMLElement>({ onDismiss: pinned ? null : onClose });

  return (
    // Escapable unless it is pinned — which is the one thing pinning means.
    // Escape closes a drawer — there is no smaller state for it to go to — so
    // the hint belongs on `zamknij`, which is where `CloseButton` puts it.
    <AnswersEscape.Provider value={{ on: "close", live: !pinned }}>
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
      <SurfaceHead
        title={title}
        controls={
          <>
            {/* Pinning first, because it changes what the other one means:
                pinned, Escape and a click on the game stop being ways out and
                this button is the only one left that is. */}
            <ChromeButton
              glyph={pinned ? "unpin" : "pin"}
              active={pinned}
              title={
                pinned
                  ? "Przypięta — nie zamknie jej ani Esc, ani kliknięcie w grę"
                  : "Przypnij, żeby została otwarta mimo klikania w grę"
              }
              onClick={() => setPinned(!pinned)}
            />
            <CloseButton onClose={onClose} />
          </>
        }
      >
        {head}
      </SurfaceHead>

      {/* The scrollbar takes its room when there is a scrollbar, and not
          before.

          This reserved it always (`scrollbar-gutter: stable`), on the argument
          that a drawer sized to fit its contents should fit them whether the
          list scrolls or not. It cost two things. A drawer with nothing to
          scroll — the roster with two seats in it — carried a visible strip of
          dead panel down its inside edge. And the reservation is the
          scrollbar's *device* width, which means its size in CSS pixels grows
          as you zoom out: 15px at 100% is 16.7 at 90%, and the Księga's shelf,
          budgeted to the pixel for five tiles across, silently became four.

          A width that only holds at one zoom level is not a width. So the room
          is guaranteed by the drawer's own `width` instead — see the note on
          the Księga's, which now has an allowance a scrollbar cannot outgrow —
          and the gutter appears with the scrollbar it belongs to. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </aside>
    </AnswersEscape.Provider>
  );
}
