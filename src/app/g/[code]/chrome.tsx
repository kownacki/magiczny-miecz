"use client";

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
  children,
}: {
  title: React.ReactNode;
  tone?: string;
  aside?: React.ReactNode;
  controls: React.ReactNode;
  /** A row under the title — a search box, a rank of shelves. */
  children?: React.ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-edge px-3 py-1.5">
      {/* Centred, not baselined. A baseline is a property of text and an SVG
          has none, so the browser falls back to the bottom edge of the button
          box — which sat the glyphs a few pixels above the words they share the
          row with. The middle is the one thing a glyph and a word both have. */}
      <div className="flex items-center justify-between gap-3">
        <h2 className={`shrink-0 text-[11px] uppercase tracking-widest ${tone}`}>{title}</h2>
        {aside}
        <div className="flex shrink-0 items-center gap-3">{controls}</div>
      </div>
      {children}
    </header>
  );
}

type Glyph = "minimise" | "restore" | "expand" | "collapse" | "pin" | "unpin";

const PATHS: Record<Glyph, React.ReactNode> = {
  // Down into the edge it is docked against.
  minimise: <path d="M5 8l7 7 7-7" />,
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
export function ChromeButton({
  glyph,
  title,
  active = false,
  onClick,
}: {
  glyph: Glyph;
  title: string;
  /** Doing its thing right now — a pin that is holding. */
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
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
      className={`-my-1 -mx-0.5 rounded p-1 transition ${
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
    </button>
  );
}
