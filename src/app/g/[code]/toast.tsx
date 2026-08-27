"use client";

/**
 * What the app has to tell *you*, said where it does not move the table.
 *
 * A refusal is private. "Twoja Natura nie pozwala ci tego użyć (5.3)" is about
 * the thing you just tried, nobody else at the table has a stake in it, and it
 * is over the moment you have read it — none of which was true of where it used
 * to appear. It was a full-width band, pinned across the top in three of the
 * four gates and shoved into the column in the fourth, and it pushed the Karta
 * Postaci down the page every time somebody mis-clicked. A message that moves
 * the board is a message that costs more than it says.
 *
 * So: bottom right, over everything, gone by itself. The rail takes no pointer
 * events at all and each notice takes its own back, which is what lets these
 * sit over the console — the one thing that also lives in that corner — without
 * eating a keystroke meant for it.
 */

import { useEffect, useState } from "react";
import { WithRules } from "./rule-ref";

export interface Notice {
  id: number;
  text: string;
}

/**
 * Long enough to read a sentence twice, which is what a rule reference asks
 * for: "(5.3)" is only useful if you get to the end of it.
 */
const LINGER = 7000;

export function Toasts({
  notices,
  onDismiss,
}: {
  notices: readonly Notice[];
  onDismiss: (id: number) => void;
}) {
  if (notices.length === 0) return null;
  return (
    // `items-end` so a short notice is short: these are read at a glance and a
    // one-word refusal stretched to the width of the longest one that came
    // before it reads as a panel rather than as a remark.
    <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex max-w-[min(24rem,calc(100vw-2rem))] flex-col items-end gap-2">
      {notices.map((notice) => (
        <Toast key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Two timers rather than one: the notice fades where it stands and is only
    // taken out of the list once it has finished. Removing it outright makes
    // everything under it jump up by its height, which draws the eye to the
    // corner exactly as the reason to look there disappears.
    const fade = setTimeout(() => setLeaving(true), LINGER);
    const gone = setTimeout(() => onDismiss(notice.id), LINGER + 300);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [notice.id, onDismiss]);

  return (
    <button
      type="button"
      onClick={() => onDismiss(notice.id)}
      title="Zamknij"
      className={`pointer-events-auto rounded border border-vermilion/50 bg-night/95 px-3 py-2 text-left text-sm text-vermilion shadow-[0_4px_20px_rgba(0,0,0,0.55)] transition duration-300 hover:border-vermilion ${
        leaving ? "translate-y-1 opacity-0" : "opacity-100"
      }`}
    >
      {/* The rule number in a refusal is the whole reason it names one: "(5.3)"
          is an assertion until you can read 5.3. */}
      <WithRules text={notice.text} />
    </button>
  );
}
