"use client";

/**
 * Every `(5.3)` in the app, made into the rule it names.
 *
 * The numbers were already everywhere — in refusals, in card notes, in the
 * coverage line under a Karta, in tooltips — and every one of them assumed the
 * reader owns the printed rulebook and will go and find it. For anybody else
 * they were noise with a full stop in the middle. "Naturę można zmienić
 * najwyżej raz na turę (7.3)" is an assertion until you can read 7.3, and an
 * argument the moment you can.
 *
 * So they are links, and nothing else about the app had to change: the
 * sentences are already written, and the engine has been citing rule numbers
 * from the beginning because that is how its own comments are checked.
 */

import { createContext, useContext } from "react";
import rules from "@/data/rules.json";

/** Every rule the transcript actually has, so a link is never offered to nothing. */
const KNOWN = new Set(
  (rules as { rules: { id: string | null }[] }[])
    .flatMap((chapter) => chapter.rules)
    .map((rule) => rule.id)
    .filter((id): id is string => id !== null),
);

/**
 * The book has `12.1`; the code says `12.1a` and `12.1b`.
 *
 * Those letters are the app's own, for the three separate things one long rule
 * says — take nothing while a Wróg stands, draw first, then pick up — and they
 * earn their keep in a refusal, which has to name which clause it is quoting.
 * They just have nowhere of their own to point at, so they point at the rule
 * they are a clause of.
 */
function resolve(said: string): string | null {
  if (KNOWN.has(said)) return said;
  const withoutLetter = said.replace(/[a-z]$/, "");
  return KNOWN.has(withoutLetter) ? withoutLetter : null;
}

/**
 * Opens the Księga at a rule. Absent where there is no Księga to open — the
 * lobby, the gates — and the numbers are then plain text again rather than
 * buttons that do nothing.
 */
export const OpenRule = createContext<((id: string) => void) | null>(null);

/**
 * Two digits either side of a dot, and a letter if the app added one.
 *
 * Deliberately narrow. Card prose is full of numbers — "2 punkty Miecza", "1
 * Sz. Z." — and a looser pattern would turn arithmetic into links. This one
 * needs the dot with digits on both sides, which no quantity in the box has.
 */
const CITATION = /\b(\d{1,2}\.\d{1,2}[a-z]?)\.?(?=[)\s,;:.]|$)/g;

/**
 * A sentence with its rule numbers made clickable.
 *
 * Text in, text out, one span per piece — so this can wrap anything already
 * being rendered without knowing what it is or where it came from.
 */
export function WithRules({ text, className }: { text: string; className?: string }) {
  const open = useContext(OpenRule);
  if (!open) return <span className={className}>{text}</span>;

  const pieces: React.ReactNode[] = [];
  let at = 0;
  for (const hit of text.matchAll(CITATION)) {
    const said = hit[1];
    const id = resolve(said);
    const start = hit.index ?? 0;
    if (id === null) continue;
    if (start > at) pieces.push(text.slice(at, start));
    pieces.push(
      <button
        key={`${start}-${said}`}
        type="button"
        onClick={(event) => {
          // The number often sits inside something else that is clickable — a
          // toast dismisses itself, a card tile opens the card — and following
          // a reference is not either of those.
          event.stopPropagation();
          open(id);
        }}
        title={`Przeczytaj zasadę ${id}`}
        className="cursor-pointer underline decoration-dotted underline-offset-2 transition hover:text-ochre"
      >
        {said}
      </button>,
    );
    at = start + said.length;
  }
  if (pieces.length === 0) return <span className={className}>{text}</span>;
  if (at < text.length) pieces.push(text.slice(at));
  return <span className={className}>{pieces}</span>;
}
