"use client";

/**
 * What a character is under, in words rather than as a row of pictures.
 *
 * The marks beside the name have been here a while and are right for what they
 * are: a reminder that something holds, small enough to sit on a folded card.
 * What they cannot do is answer the question a player has the moment they see
 * one — *how long*, and *which round does that fall in* — because the answer is
 * a sentence and the mark is a picture with a hover on it. A hover is not a
 * place to put something a player is planning around: it is invisible on a
 * touch screen, invisible while reading anything else, and gone the moment the
 * cursor moves.
 *
 * So the same set is drawn twice, exactly as the folded bar and the marks
 * already are. Deliberately in a different register, though, and this is the
 * whole reason it does not simply repeat `EffectMark`: the header is pictures
 * and this is words. Two identical card tiles thirty pixels apart would read as
 * a bug rather than as two views of one thing.
 */

import { type Seat } from "./table";

type Effect = Seat["effects"][number];

/**
 * What a second copy of an effect did, in the words the console uses.
 *
 * Shared vocabulary on purpose — somebody who reads "bez zmian" at a terminal
 * and "bez zmian" on a card is reading one app. Only ever drawn where there
 * *was* a second copy: a card that visibly does nothing is what a table argues
 * about two turns later, and the argument is always the same one.
 */
const STACK_SAID: Record<Effect["stacking"], string> = {
  sums: "sumuje się",
  queues: "po kolei",
  refreshes: "odnawia",
  exclusive: "bez zmian",
};

const TONE_TEXT: Record<Effect["tone"], string> = {
  dobry: "text-verdigris",
  zly: "text-vermilion",
  obojetny: "text-muted",
};

export function EffectList({ effects }: { effects: readonly Effect[] }) {
  if (effects.length === 0) return null;

  // Said once, under the list, and only where a round was actually worked out.
  // A round read off a column is exact; one reached by walking the turn order
  // can be moved by the next Karta anybody draws. On every line it would be
  // noise, and noise is what stops the real warnings being read.
  const forecast = effects.some((effect) => effect.certainty === "prognoza");

  return (
    <div className="mb-3">
      <ul className="flex flex-col gap-1">
        {effects.map((effect) => (
          <li key={effect.id} className="flex items-baseline gap-1.5 text-[12px] leading-tight">
            {/* A fixed box, so every line's words start in the same column
                whatever shape the glyph is. The typeface sizes ▲ and ■ for
                reading rather than for standing under each other, which is the
                same thing `ToneGlyph` was drawn to work around beside the
                name — here one width is enough, because a list only has to
                align down its left edge. */}
            <span
              aria-hidden
              className={`w-3 shrink-0 text-center ${TONE_TEXT[effect.tone]}`}
            >
              {effect.glyph}
            </span>
            <span className="min-w-0 flex-1">
              <span className={TONE_TEXT[effect.tone]}>{effect.label}</span>
              {effect.count > 1 && (
                // Two of them, and what the second one did. Never a bare "×2",
                // which says only that something happened twice and leaves the
                // question it raises unanswered.
                <span className="tnum ml-1.5 text-muted/70">
                  ×{effect.count} ({STACK_SAID[effect.stacking]})
                </span>
              )}
              {/* Its own line, because it is the half being read. The label
                  names the thing; this is what a player is deciding around, and
                  side by side on a narrow card it was the half that wrapped. */}
              <span className="block text-[11px] text-muted/80">{effect.when}</span>
            </span>
          </li>
        ))}
      </ul>
      {forecast && (
        <p className="mt-1.5 text-[10px] leading-tight text-muted/60">
          Rundy liczone w turach są prognozą — jedna Karta może je przesunąć.
        </p>
      )}
    </div>
  );
}
