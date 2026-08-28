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
  /** Konsola: a prompt, which is what it is. */
  prompt: (
    <>
      <path d="m4 17 5-5-5-5" />
      <path d="M12 19h8" />
    </>
  ),
  /** Opuść stół: a door with somebody going out of it. */
  door: (
    <>
      <path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9" />
      <path d="m18 16 4-4-4-4" />
      <path d="M22 12H9" />
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
  label,
  tally,
  active = false,
  tone,
  onClick,
}: {
  glyph: BarGlyph;
  /** The whole name, and the shortcut: everything the glyph is not saying. */
  title: string;
  /**
   * Said beside the glyph, for the one door that is worth naming.
   *
   * The Księga is not a control anybody arrives already looking for — it is
   * where the whole rulebook and every card now live, and a book glyph alone
   * asks a first-time reader to guess that. The others are conventional enough
   * to stand on their own: two figures are the people at the table, a gear is
   * settings, a door is the way out.
   */
  label?: string;
  /** The one thing a glyph cannot carry — "1/6", "12/45". */
  tally?: React.ReactNode;
  /** Its drawer is open, so the bar says which door you came through. */
  active?: boolean;
  /** For the two that are not the table's own colour: the console, the way out. */
  tone?: { rest: string; hover: string };
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex items-center gap-1 rounded px-1 py-0.5 transition ${
        active
          ? "bg-ochre/15 text-ochre"
          : `${tone?.rest ?? "text-ochre/80"} ${tone?.hover ?? "hover:text-ochre"}`
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
      {label !== undefined && <span className="text-[11px]">{label}</span>}
      {tally !== undefined && <span className="tnum text-[11px] text-muted">{tally}</span>}
    </button>
  );
}
