"use client";

/**
 * How this browser reads the table — not what the table is.
 *
 * Deliberately not the same door as the ones that change the game. Nothing here
 * is sent anywhere, nothing here is anybody else's business, and two people at
 * one table can disagree about all of it. The mode, the variant and who is
 * playing are the table's and live in the bar and the poczekalnia; this is the
 * one place for the reader's own answers.
 *
 * One setting so far. It gets a drawer rather than a menu because the next few
 * are already obvious — how loud the journal is, whether a card opens on hover
 * — and a menu that grows into a panel is a panel that was a menu for too long.
 */

import { Drawer } from "./drawer";
import { setPreference, usePreferences, type Preferences } from "./preferences";

export function Settings({ onClose }: { onClose: () => void }) {
  const prefs = usePreferences();
  return (
    <Drawer side="right" width="max-w-sm" title="Ustawienia" onClose={onClose}>
      <div className="flex flex-col gap-4 p-4">
        <Switch
          name="ruleLinks"
          on={prefs.ruleLinks}
          label="Odnośniki do zasad"
          said="Numery w rodzaju (5.3) otwierają Instrukcję w Księdze. Wyłącz, jeśli znasz zasady i wolisz czysty tekst."
        />
        <p className="border-t border-edge pt-3 text-[11px] leading-relaxed text-muted/70">
          Ustawienia są tego okna, nie stołu — nikt inny ich nie widzi i nie zmieniają gry.
        </p>
      </div>
    </Drawer>
  );
}

function Switch({
  name,
  on,
  label,
  said,
}: {
  name: keyof Preferences;
  on: boolean;
  label: string;
  said: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setPreference(name, !on)}
      className="flex items-start gap-3 rounded border border-edge bg-raised/40 p-3 text-left transition hover:border-ochre/60"
    >
      {/* Drawn rather than a checkbox: the rest of this app is drawn, and a
          browser's own checkbox in the middle of it is a piece of somebody
          else's furniture. */}
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full border p-0.5 transition ${
          on ? "justify-end border-ochre bg-ochre/25" : "justify-start border-edge bg-night"
        }`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${on ? "bg-ochre" : "bg-muted/60"}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{said}</span>
      </span>
    </button>
  );
}
