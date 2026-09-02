"use client";

/**
 * A section that folds away, with a heading that says what is in it.
 *
 * There were four of these written by hand — the Plecak, the Zaklęcia, the
 * sheet itself, the Zdolności under it — and they had drifted the way four
 * copies do: one at 11px and one at 10, one tracking-widest and one
 * tracking-wide, margins of 2 and 3, and a border on the top of some but not
 * all. Folded, two of them sitting next to each other were visibly different
 * heights, which is the tell that they were four things and not one thing used
 * four times.
 *
 * So this is the one thing. What varies is what a section *says* — its name,
 * its tally, whatever it carries on the bar while it is shut — and what it
 * holds. Everything about how a section looks is settled here.
 *
 * The marker is the browser's own. A `<summary>` laid out as a flex box stops
 * being a `list-item` and loses its triangle, so the summary stays a plain
 * block and the row inside it does the aligning: the heading is small capitals
 * and what sits beside it is usually neither, and text with no shared baseline
 * lines up by accident.
 */

export function Fold({
  title,
  tally,
  aside,
  open,
  onToggle,
  tone = "text-muted",
  first = false,
  children,
}: {
  title: React.ReactNode;
  /** The count beside the name — "1 / 16", "5". Dimmed, and part of the name. */
  tally?: React.ReactNode;
  /**
   * What the heading carries while the section is shut.
   *
   * A folded section that says only its own name says the one thing anybody
   * already knows, so this is where the part worth keeping goes: the newest
   * journal line, a character's four parameters, what is on the body. Given
   * the slack, and truncated by the caller if it can be long.
   */
  aside?: React.ReactNode;
  open?: boolean;
  /**
   * Absent where a section does not fold.
   *
   * A heading is not only a handle: the rule above it, the small capitals, the
   * tally beside the name and the space it leaves are what make a column of
   * sections read as one thing, and a section that happens to be always open
   * wants every part of that except the triangle. Browsing the Księga is the
   * case — one shelf, already chosen by the tabs above it, and a control that
   * folds away the only thing on screen is a control with nothing behind it.
   *
   * So no handler means no marker and no click, and everything else identical.
   */
  onToggle?: () => void;
  /** The heading's colour, for the one section that is not the others' grey. */
  tone?: string;
  /** The first in a stack has no rule above it — see the border below. */
  first?: boolean;
  children: React.ReactNode;
}) {
  /**
   * A rule above every section but the first, which is what makes a column of
   * them read as a stack rather than as a list of unrelated boxes. The spacing
   * is the border's, so the gap between two sections is the same whether either
   * of them is open — and the same in every place these are used, which is the
   * whole reason there is one component.
   */
  const outside = first ? "" : "mt-3 border-t border-edge pt-3";
  const heading = `text-[11px] uppercase tracking-widest ${tone}`;
  const row = (
    <>
      <span>
        {title}
        {tally !== undefined && <span className="ml-2 text-muted/70">{tally}</span>}
      </span>
      {aside}
    </>
  );

  if (!onToggle) {
    return (
      <div className={outside}>
        <p className={`${heading} flex items-center gap-3`}>{row}</p>
        <div className="mt-2">{children}</div>
      </div>
    );
  }

  return (
    <details open={open} className={outside}>
      <summary
        /**
         * Full width, and not the hit area.
         *
         * A `<summary>` is a block and takes the whole line, so every one of
         * these folded on a click anywhere across the panel — including the
         * empty half to the right of a short name, which is nobody's idea of a
         * button. Shrinking the summary itself is the obvious fix and is a
         * trap: its width would then depend on its content, and the `max-width`
         * percentages inside it resolve against *that*, which is circular. The
         * result was headings wrapping a word early — „PLECAK 0 /" and then the
         * „4" underneath — and asides that stopped truncating.
         *
         * So the summary keeps a width nothing has to guess at, and the span
         * inside it is what shrink-wraps and what is clicked.
         */
        className="list-none [&::-webkit-details-marker]:hidden"
        onClick={(event) => {
          // Controlled outright: the browser's own toggling and a piece of
          // React state both setting one attribute agree right up until they
          // do not, and then a section is shut with something in it that has
          // to be open (see the pack, which holds itself open for a card in
          // the air).
          event.preventDefault();
        }}
      >
        {/**
         * The marker is drawn here rather than left to the browser.
         *
         * It used to be the `::marker`, which was the right call while the
         * whole summary was the button — a marker outside the content costs
         * nothing when everything is clickable. Now that the hit area is this
         * span, a marker outside it would be the one part of the heading that
         * looks like a control and is not one, and it is the part most people
         * aim at.
         *
         * One flex line, so the triangle, the name, the tally and whatever
         * rides on the bar are centred on each other rather than each sitting
         * on their own baseline.
         */}
        <span
          onClick={onToggle}
          className={`inline-flex w-fit max-w-full cursor-pointer items-center gap-3 ${heading}`}
        >
          <span
            aria-hidden
            className={`shrink-0 text-[9px] leading-none transition-transform ${
              open ? "rotate-90" : ""
            }`}
          >
            ▶
          </span>
          {row}
        </span>
      </summary>
      {/* The gap belongs to what is inside, not to the heading: a margin under
          the summary is height a *shut* section is still paying for, and that
          is the other half of why these did not match. */}
      <div className="mt-2">{children}</div>
    </details>
  );
}
