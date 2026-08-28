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
import type { EqMode } from "@/lib/engine/slots";
import { Rules } from "./rule-ref";
import { setPreference, usePreferences, type Preferences } from "./preferences";

export function Settings({
  onClose,
  eqMode,
  endlessStock,
  onEndlessStock,
}: {
  onClose: () => void;
  eqMode: EqMode;
  /** The table's answer to 21.2, which only ever moves one way. */
  endlessStock: boolean;
  onEndlessStock: () => void;
}) {
  const prefs = usePreferences();
  return (
    <Drawer side="right" width="max-w-sm" title="Ustawienia" onClose={onClose}>
      <div className="flex flex-col gap-4 p-4">
        {/* Not a preference — the table's, chosen when it was opened, and the
            same for everybody sitting at it. It is here because this is where
            somebody goes to ask "what is this game doing", and it was a bare
            word in the bar that said "slotowy" to people who had never met the
            word. Fixed for the life of the table: half the rules below have
            already been applied to cards that are lying on the board. */}
        <Switch
          on={eqMode === "slots"}
          label="Ekwipunek slotowy"
          fixed="Wybrane przy otwieraniu stołu — w trakcie gry już nie do zmiany."
          said="Działa tylko to, co Postać ma na sobie; reszta czeka w Plecaku. Wyłączone znaczy zasady z pudełka: cztery Przedmioty i wszystkie działają. Szczegóły w Księdze, na półce Wariant."
        />
        {/* The one table setting that can still be moved, and only one way.
            Turning it on changes nothing that already happened — the pile
            simply stops being counted from here. Turning it off could not say
            the same, so it is refused rather than hidden: by then there may be
            six Miecze on a board that holds five. */}
        <Switch
          on={endlessStock}
          label="Zwykłego Wyposażenia nie brakuje"
          onAsk={endlessStock ? undefined : onEndlessStock}
          fixed={
            endlessStock
              ? "Włączone na dobre — do skończonego stosu wraca się tylko przy nowym stole."
              : undefined
          }
          said="Zwykłego Wyposażenia — Miecza, Hełmu, Sztyletu, Zbroi, Tarczy — nigdy nie zabraknie. Wyjątkiem są Magiczne Miecze i Tarcze Tolimana: tych zostaje po cztery, jak w pudełku. To nie przeoczenie — bez Magicznego Miecza nie wejdziesz na Most (11.9), bez Tarczy do Zamku (14.7), a 16.6 pilnuje, żeby wyciągnięty ze stosu Zdarzeń nie był piątym."
        />
        <Switch
          name="ruleRefs"
          on={prefs.ruleRefs}
          label="Numery zasad"
          said="Zdania kończą się numerem w rodzaju (5.3), który otwiera Instrukcję w Księdze. Wyłącz, a numery znikną ze zdań."
        />
        <p className="border-t border-edge pt-3 text-[11px] leading-relaxed text-muted/70">
          Dwa górne należą do stołu i widzą je wszyscy; reszta jest tego okna —
          nikt inny ich nie widzi i nie zmieniają gry.
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
  fixed,
  onAsk,
}: {
  /** Absent where the switch is showing something rather than deciding it. */
  name?: keyof Preferences;
  /**
   * Asks somebody else to decide, for a switch that is not a preference.
   *
   * A table's setting is not this browser's, so it goes through a command and
   * — where it cannot be taken back — through a question first. Absent once
   * the answer can no longer change, which is what `fixed` then explains.
   */
  onAsk?: () => void;
  on: boolean;
  label: string;
  said: string;
  /**
   * Why this one cannot be moved.
   *
   * Shown rather than hidden. A setting that is simply missing leaves a reader
   * wondering where it went; one that is there and will not move, with the
   * reason under it, answers the question it raises.
   */
  fixed?: string;
}) {
  /**
   * The explanation is outside the button, not inside it.
   *
   * It carries a rule number and rule numbers are links, and a `<button>` in a
   * `<button>` is not something HTML allows — the browser closes the outer one
   * where the inner starts, and what you get is two controls in a row where
   * the markup said one inside another.
   */
  const locked = name === undefined && onAsk === undefined;
  return (
    <div
      className={`rounded border border-edge bg-raised/40 p-3 ${
        locked ? "" : "transition hover:border-ochre/60"
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={locked}
        title={fixed}
        onClick={() => (name ? setPreference(name, !on) : onAsk?.())}
        className={`flex w-full items-center gap-3 text-left ${locked ? "cursor-default" : ""}`}
      >
        {/* Drawn rather than a checkbox: the rest of this app is drawn, and a
          browser's own checkbox in the middle of it is a piece of somebody
          else's furniture. */}
        <span
          aria-hidden
          className={`flex h-4 w-7 shrink-0 items-center rounded-full border p-0.5 transition ${
            on
              ? `justify-end ${locked ? "border-muted/50 bg-muted/15" : "border-ochre bg-ochre/25"}`
              : "justify-start border-edge bg-night"
          }`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              on ? (locked ? "bg-muted/70" : "bg-ochre") : "bg-muted/60"
            }`}
          />
        </span>
        <span className="min-w-0 text-sm text-ink">{label}</span>
      </button>
      {/* Linked, so the switch demonstrates what it just turned on: this is the
        nearest rule number to the control that governs them, and a reader who
        flips it and looks straight down is looking here. */}
      <p className="mt-1 pl-10 text-[11px] leading-relaxed text-muted">
        <Rules>{said}</Rules>
      </p>
      {fixed && <p className="mt-1 pl-10 text-[11px] text-muted/60">{fixed}</p>}
    </div>
  );
}
