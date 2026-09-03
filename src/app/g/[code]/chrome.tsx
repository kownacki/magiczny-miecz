"use client";

import { useContext } from "react";
import { AnswersEscape, type EscapeAnswer } from "./overlay";

/**
 * The buttons that act on a surface rather than on the game.
 *
 * There is a line here worth keeping sharp. `Zostaw`, `Zakończ turę`, `Zabierz`
 * and `Zastosuj i wróć` are moves — they change the game, they are journalled,
 * and a player has to read them before pressing them, so they stay words. What
 * this module draws is the other kind: shut it, shrink it, stretch it, hold it
 * still. Those act on the window and never on the table, they are the same four
 * everywhere, and a word for each turned the head of every panel into a row of
 * Polish verbs competing with the panel's own title.
 *
 * `zamknij` keeps its word. It is the one that throws something away — a drawn
 * Karta left on the Obszar (16.8), a console with a session in it — and it is
 * the one every surface has, so it reads as the way out rather than as chrome.
 *
 * Drawn as strokes rather than as the masked silhouettes `card-mark.tsx` uses.
 * Those are illustrations and need the detail; a chevron is a geometric fact and
 * survives being 14 pixels wide, which the hand-drawn wrench famously did not.
 */

/**
 * The bar along the top of a surface: what it is, and what you can do to it.
 *
 * There were three of these, hand-built three times, and they had drifted the
 * way hand-built things do — one aligned its row by the baseline and two by the
 * middle, two ruled a line under themselves and the console did not, the titles
 * were 10px in one place and 11px in the others. None of that was a decision.
 * A drawer and the console are the same kind of object seen from different
 * edges of the screen, and the heading is the part that should say so.
 *
 * The line under it is the point of having one at all: it is what separates the
 * chrome from the thing the surface is *for*, so the title stops reading as the
 * first line of the transcript.
 */
export function SurfaceHead({
  title,
  /** The title's colour. The console is the test console and says so in red. */
  tone = "text-ochre",
  /** Between the title and the controls, and free to take the slack. */
  aside,
  controls,
  onExpand,
  children,
}: {
  title: React.ReactNode;
  tone?: string;
  aside?: React.ReactNode;
  controls: React.ReactNode;
  /**
   * Given while the surface is shrunk to this bar, which then *is* the way
   * back. A strip of chrome with a title on it looks like a thing you press,
   * so it had better be one: aiming for a thirteen-pixel chevron to undo
   * something you did by pressing a thirteen-pixel chevron is a fiddle.
   */
  onExpand?: () => void;
  /** A row under the title — a search box, a rank of shelves. */
  children?: React.ReactNode;
}) {
  return (
    <header
      onClick={onExpand}
      className={`shrink-0 border-b border-edge px-3 ${
        onExpand ? "cursor-pointer transition hover:bg-panel/40" : ""
      }`}
    >
      {/* Centred, not baselined. A baseline is a property of text and an SVG
          has none, so the browser falls back to the bottom edge of the button
          box — which sat the glyphs a few pixels above the words they share the
          row with. The middle is the one thing a glyph and a word both have. */}
      {/**
       * A floor of 32, and the border is the 33rd pixel.
       *
       * It was `py-1.5` around whatever the title happened to be, so the bar
       * was as tall as its tallest word — which is fine until something else
       * goes in it, and a strip that grows by half a pixel when a Karta settles
       * somewhere is a strip that moves for reasons nobody can see.
       *
       * A floor rather than a fixed height, because a long name has to go
       * somewhere. RÓWNINA SAMOTNYCH SKAŁ in a drawer this narrow is wider than
       * the bar, and against a rigid `h-8` and a `shrink-0` title it went
       * *outwards*: the row overflowed its own header, `zamknij` was pushed off
       * the end, and the whole strip ran across the board behind it. Nothing
       * moves for a one-line title, which is every other surface and most
       * Obszary; a name that cannot fit wraps instead of escaping.
       */}
      {/**
       * Aligned to the top, and given a line box that makes the top the middle.
       *
       * `items-center` drifts the controls down past the first line of the name
       * the moment a title wraps, which is where a reader looks for the way
       * out. `items-start` alone fixes that and breaks the common case: with a
       * 20-pixel title in a 32-pixel row there are twelve pixels of slack, all
       * of it underneath, and a one-line header sits visibly high.
       *
       * So both children get the row's own height as their line box — `leading-6`
       * on the title, `min-h-6` on the controls — and 24 plus `py-1`'s eight is
       * the 32 the bar was always going to be. One line has no slack to fall
       * through and reads as centred; a wrapped one grows downwards and leaves
       * the controls where the first line is. The two cases are the same rule.
       */}
      <div className="flex min-h-8 items-start justify-between gap-3 py-1">
        {/**
         * `min-w-0`, not `shrink-0`.
         *
         * Two rigid children in one flex row cannot both be honoured, and the
         * one that has to give is the title: the controls are the way out of
         * the surface and a way out you cannot reach is not one. So the title
         * yields — wrapping, since nothing here truncates — and `shrink-0` on
         * the controls below finally means what it says.
         */}
        <h2 className={`min-w-0 leading-6 text-[13px] uppercase tracking-widest ${tone}`}>{title}</h2>
        {aside}
        {/* Their own clicks stop here. The bar restores the surface and the
            buttons on it do their own thing; without this, `zamknij` on a
            minimised console would close it and bring it back at once. */}
        <div
          className="flex min-h-6 shrink-0 items-center gap-3"
          onClick={(event) => event.stopPropagation()}
        >
          {controls}
        </div>
      </div>
      {/* Below the fixed row, and carrying the padding the header gave up: a
          search box or a rank of shelves is the surface's own content and may
          be any height it likes. */}
      {children && <div className="pb-1.5">{children}</div>}
    </header>
  );
}

/**
 * The way out, and whether Escape is one of them.
 *
 * The hint is read from the surface rather than written on the button, so it
 * cannot go stale: pin the console and it stops offering an Escape that would
 * no longer work, and the Karta, the Obszar and both drawers start offering one
 * they have always honoured and never mentioned.
 *
 * Dimmer than the word it follows. It is a reminder of a shortcut, not a second
 * thing you can press.
 *
 * Struck through rather than hidden when the surface will not answer it. A
 * hint that vanishes leaves you wondering whether it was ever there; one with
 * a line through it says the shortcut exists and this window has opted out,
 * which is the actual state of affairs and is what the pin just did.
 *
 * Either way it keeps its slot, and that part is a bug fix rather than a
 * preference. The controls sit at the right-hand end of the bar, so a label
 * that changes width shoves every glyph beside it sideways — pinning the
 * console took the hint away, the row slid across, and the next click at the
 * same spot was no longer on the pin. A few toggles and one landed on
 * `zamknij`, which is what "clicking the pin enough times closes the console"
 * was.
 */
export function CloseButton({
  onClose,
  /** For a surface where "close" is not the word — a Karta you are done reading. */
  label = "zamknij",
}: {
  onClose: () => void;
  label?: string;
}) {
  const escape = useContext(AnswersEscape);
  return (
    <button
      onClick={onClose}
      className="shrink-0 text-xs text-muted transition hover:text-ink"
    >
      {label}
      {/* Only where closing is the control Escape belongs to. Where it belongs
          to another — the console's chevron, which minimises — this button says
          nothing about it, live or not: a struck-through hint here would be
          striking out a key that was never on this button. */}
      {escape.on === "close" && <EscapeHint live={escape.live} />}
    </button>
  );
}

type Glyph = "minimise" | "shrink" | "restore" | "expand" | "collapse" | "pin" | "unpin";

const PATHS: Record<Glyph, React.ReactNode> = {
  // Down into the edge it is docked against.
  minimise: <path d="M5 8l7 7 7-7" />,
  // The sheet used the chevron, and a chevron says "down" — which is what a
  // console docked to the bottom edge does and not what this does. The sheet
  // does not slide anywhere: it becomes the pill at the foot of the screen.
  /**
   * Into the corner it goes to, which is what this one actually does.
   *
   * Drawn twice before this and wrong both times, because a glyph is not a
   * thing to reason about: the first was a corner bracket, an arrow and a
   * second square, which at sixteen pixels is more strokes than the box holds;
   * the second put the arrowhead where it belonged and still read as pointing
   * *out*, because a bracket and an arrow at that size make one shape. Four
   * candidates were rendered at 96 and at 16 and looked at, and this is the one
   * that says it: a closed frame, so the arrow has something to be inside of,
   * and the arrow into the corner it collapses to.
   */
  shrink: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M16 8l-5 5" />
      <path d="M11 9.5V13h3.5" />
    </>
  ),
  restore: <path d="M5 16l7-7 7 7" />,
  // Out to the corners, and back in from them.
  expand: (
    <>
      <path d="M4 10V4h6M20 14v6h-6" />
      <path d="M4 4l6 6M20 20l-6-6" />
    </>
  ),
  collapse: (
    <>
      <path d="M10 4v6H4M14 20v-6h6" />
      <path d="M10 10L4 4M14 14l6 6" />
    </>
  ),
  // A pin, head down. Struck through when it is holding, so the state is
  // legible without colour — the tone says the same thing twice on purpose.
  pin: (
    <>
      <path d="M9 4h6M12 4v7M7 11h10l-1.5 4h-7z" />
      <path d="M12 15v5" />
    </>
  ),
  unpin: (
    <>
      <path d="M9 4h6M12 4v7M7 11h10l-1.5 4h-7z" />
      <path d="M12 15v5" />
      <path d="M4 4l16 16" />
    </>
  ),
};

/**
 * One chrome control.
 *
 * `title` is not decoration here: with the word gone it is the only thing that
 * says what the button does, so it is required rather than optional, and it is
 * the accessible name as well.
 */
/**
 * The `(Esc)` beside whichever control the key presses.
 *
 * Struck through where the window has stopped answering — pinned, or already
 * shrunk as far as it goes. It says the same thing either way: this is the
 * button that key is for. It moves *off* only where the key belongs to a
 * different control entirely.
 */
function EscapeHint({ live }: { live: boolean }) {
  return (
    <span className={`text-xs ${live ? "text-muted/50" : "text-muted/30 line-through"}`}>
      {" "}
      (Esc)
    </span>
  );
}

export function ChromeButton({
  glyph,
  title,
  active = false,
  answers,
  onClick,
}: {
  glyph: Glyph;
  title: string;
  /** Doing its thing right now — a pin that is holding. */
  active?: boolean;
  /**
   * Which dismissal this button *is*, so it can claim Escape when Escape means
   * it.
   *
   * The surface says what Escape does (`AnswersEscape`) and the button says
   * what it does; where the two agree, this is the control the key presses and
   * the one that says so. Nothing else in the row mentions a key it does not
   * own, and a surface that changes its mind — pinning the console — moves the
   * hint rather than leaving it somewhere stale.
   */
  answers?: EscapeAnswer["on"];
  onClick: () => void;
}) {
  const escape = useContext(AnswersEscape);
  const mine = answers !== undefined && escape.on === answers;
  return (
    <button
      onClick={onClick}
      title={mine && escape.live ? `${title} (Esc)` : title}
      aria-label={title}
      aria-pressed={active || undefined}
      /**
       * A shade larger than the text beside it, and the negative margin is what
       * pays for that. The glyph is the whole of the button now that the word is
       * gone, and at thirteen pixels it was smaller than the word it replaced —
       * a control you had to look for. Nineteen was the other way: three of them
       * in a row read as the loudest thing in a panel that is not about them.
       *
       * Its own box would set the height of every heading it sits in, so the
       * padding that gives it somewhere to be pressed is taken back off the
       * outside: it lands on the title's line rather than making room for itself.
       */
      className={`-my-1 -mx-0.5 inline-flex items-center gap-1 rounded p-1 transition ${
        active ? "text-vermilion" : "text-ochre/70 hover:text-ochre"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {PATHS[glyph]}
      </svg>
      {/* Said out loud on the control the key presses, in the same dim the word
          `zamknij` wears it in — a shortcut a glyph carries is a shortcut
          nobody finds. */}
      {mine && <EscapeHint live={escape.live} />}
    </button>
  );
}
