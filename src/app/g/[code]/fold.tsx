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
  /**
   * `width` is the caller's because the two branches want different things: a
   * heading that does not fold fills its line, and one that does is only as
   * wide as what it says — see the summary below.
   */
  const row = (width: string) => (
    <span className={`inline-flex ${width} items-center gap-3 align-middle`}>
      <span className="shrink-0">
        {title}
        {tally !== undefined && <span className="ml-2 text-muted/70">{tally}</span>}
      </span>
      {aside}
    </span>
  );

  if (!onToggle) {
    return (
      <div className={outside}>
        <p className={heading}>{row("w-[calc(100%-1.25rem)]")}</p>
        <div className="mt-2">{children}</div>
      </div>
    );
  }

  return (
    <details open={open} className={outside}>
      <summary
        onClick={(event) => {
          // Controlled outright: the browser's own toggling and a piece of
          // React state both setting one attribute agree right up until they
          // do not, and then a section is shut with something in it that has
          // to be open (see the pack, which holds itself open for a card in
          // the air).
          event.preventDefault();
          onToggle();
        }}
        /**
         * `w-fit`, so the hit area is the heading and not the line it sits on.
         *
         * A `<summary>` is a block and takes the whole width, so every one of
         * these used to fold on a click anywhere across the panel — including
         * the empty half to the right of a short name, which is nobody's idea
         * of a button. It is `width: fit-content` now: the marker, the name,
         * the tally and whatever rides on the bar, and nothing after them.
         *
         * `max-w-full` is what keeps that honest in the other direction. The
         * bar carries an `aside` when it is shut — the Karty a group is hiding,
         * truncated — and a box that only ever fits its content would grow to
         * whatever that says and push the panel sideways. Capped, the aside
         * truncates as it always did.
         *
         * `display` is left alone on purpose. A summary is a `list-item` and
         * that is what draws the triangle; laying it out as a flex box or an
         * inline-block takes the marker away, which is why the row inside does
         * the aligning instead.
         */
        className={`w-fit max-w-full cursor-pointer ${heading}`}
      >
        {/* One flex line, so the name, the tally and whatever rides on the bar
            are centred on each other rather than each sitting on the summary's
            own baseline. `align-middle` puts the line itself next to the
            marker, which stays outside it. */}
        {row("max-w-full")}
      </summary>
      {/* The gap belongs to what is inside, not to the heading: a margin under
          the summary is height a *shut* section is still paying for, and that
          is the other half of why these did not match. */}
      <div className="mt-2">{children}</div>
    </details>
  );
}
