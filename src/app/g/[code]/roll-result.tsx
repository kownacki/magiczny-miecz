"use client";

/** What the die did, held on screen until the player who threw it has read it. */

import { Overlay } from "./overlay";
import { ActionButton } from "./action-button";
import { DieMark } from "./die-mark";
import { WithRules } from "./rule-ref";

/**
 * The face, and what it cost — the one moment the app decides and the player
 * only watches.
 *
 * Everything else under a Karta is pressed: you choose, and what follows is
 * what you chose. A die table is the opposite — „Rzuć kostką" is the whole of
 * the player's part, the app throws, and six lines above the button say what
 * *could* happen. Without this panel the turn simply moved on: the Karta was
 * gone, the next one was up, and the only record that a 5 had cost a point of
 * Życie was a line in the Dziennik nobody was looking at, plus a number on the
 * Karta Postaci that had quietly changed.
 *
 * So the kolejka waits here. Not because anything is undecided — the roll is
 * committed, the effect is applied, and this cannot refuse any of it — but
 * because a referee that decides for you owes you the sentence saying what it
 * decided. „Dalej" is an acknowledgement, and it is why the button says that
 * rather than „OK": what it does is let the turn go on.
 *
 * The rest of the table gets the same thing where the rest of the table gets
 * everything — the Dziennik, in the order it happened. This is for the pair of
 * eyes that were on the button.
 */
export function RollResult({
  /** The Karta or the Obszar the die was thrown for, in its own words. */
  title,
  face,
  did,
  onDone,
}: {
  title: string;
  face: number;
  /** What the app applied, as the command reported it. */
  did: readonly string[];
  onDone: () => void;
}) {
  return (
    // Escape and a click outside mean the same as the button: this is a notice,
    // and dismissing a notice is reading it.
    <Overlay label={`${title} — wypadło ${face}`} onDismiss={onDone} alert>
      <div className="w-full max-w-sm rounded-lg border border-edge bg-panel p-4 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">{title}</h2>

        {/* The number at the size of the thing that just happened. The glyph
            beside it is the one on the button that threw it, so the two read as
            the same act finishing. */}
        <p className="mt-3 flex items-center gap-2 text-ochre">
          <span className="text-[11px] uppercase tracking-widest text-muted">Wypadło</span>
          <span className="font-[family-name:var(--font-display)] text-4xl tabular-nums">
            {face}
          </span>
          <span className="text-ochre/70">
            <DieMark />
          </span>
        </p>

        <ul className="mt-3 flex flex-col gap-1 border-t border-edge/60 pt-3">
          {did.length > 0 ? (
            did.map((line, at) => (
              <li key={at} className="text-sm leading-snug text-ink">
                {/* A rule number in an outcome is a link like every other one —
                    „zamiana w Kamień na 3 tury (20.1)" comes through here. */}
                <WithRules text={line} />
              </li>
            ))
          ) : (
            <li className="text-sm text-muted">nic się nie dzieje</li>
          )}
        </ul>

        <ActionButton
          weight="lead"
          size="lg"
          className="mt-4 w-full"
          /* Nothing to take back and nothing to warn the table about: it has
             happened already, and this button only puts the notice away. */
          immediate
          onClick={onDone}
        >
          Dalej
        </ActionButton>
      </div>
    </Overlay>
  );
}
