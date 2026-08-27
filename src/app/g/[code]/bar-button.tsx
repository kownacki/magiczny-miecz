"use client";

/**
 * The openers along the table's own bar.
 *
 * They had grown one at a time and each said its whole name: "Księga Tolimana",
 * "Gracze 1/6", "slotowy", the code, "tryb testowy". Five phrases in a row at
 * eleven pixels, none of them the game, and the two that mattered — whose turn
 * it is, and what the turn is waiting for — were reading as items in the same
 * list.
 *
 * So the doors take a glyph, and the words go where words belong: the tooltip,
 * which already had to carry the keyboard shortcut. What stays visible beside a
 * glyph is only what a glyph cannot say — a count. `Gracze 1/6` becomes a
 * figure with `1/6` next to it, and the row is a row of controls again rather
 * than a sentence.
 */

const PATHS = {
  /** Księga Tolimana: a book, opened. */
  book: (
    <>
      <path d="M2 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2H2Z" />
      <path d="M22 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2H22Z" />
    </>
  ),
  /** Gracze: two figures, because one is a Postać and two are a table. */
  people: (
    <>
      <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M2 20a7 7 0 0 1 14 0" />
      <path d="M16.5 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 13.5a7 7 0 0 1 4 6.5" />
    </>
  ),
  /** Ustawienia: the gear everything else in the world uses. */
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.61.77 1 1.42 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
} as const;

export type BarGlyph = keyof typeof PATHS;

export function BarButton({
  glyph,
  title,
  tally,
  active = false,
  onClick,
}: {
  glyph: BarGlyph;
  /** The whole name, and the shortcut: everything the glyph is not saying. */
  title: string;
  /** The one thing a glyph cannot carry — "1/6", "12/45". */
  tally?: React.ReactNode;
  /** Its drawer is open, so the bar says which door you came through. */
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex items-center gap-1 rounded px-1 py-0.5 transition ${
        active ? "bg-ochre/15 text-ochre" : "text-ochre/80 hover:text-ochre"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {PATHS[glyph]}
      </svg>
      {tally !== undefined && <span className="tnum text-[11px] text-muted">{tally}</span>}
    </button>
  );
}
