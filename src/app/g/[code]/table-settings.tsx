"use client";

/** The table's house rules, settled in the room rather than in the dialog that opened it. */

import type { EqMode } from "@/lib/engine/slots";

/**
 * What the table has agreed to play, while it can still change its mind.
 *
 * These two were answered in the "Nowy stół" dialog, which meant they were
 * answered before anybody else had arrived: the person who clicked fastest
 * settled a house rule for five other people, who found out later by
 * discovering they had a Plecak. Neither has to be decided then — nothing is
 * dealt until the game starts — and the poczekalnia is the one place where the
 * table is all present and has nothing else to do but talk.
 *
 * So they live here, and anybody sitting down may move them. A setting only the
 * host can touch is not discussed, it is requested; and the two things worth
 * protecting are protected by the commands rather than by hiding the control —
 * the variant is refused once the game starts, and the finite pile is refused
 * once cards are on the board.
 *
 * The mode — whether there is a real board in the room — is deliberately not
 * here. It is the one answer that has to precede the table rather than the
 * game: it decides what the app *is* for this group, it is asked once at the
 * door, and while companion play is parked it is not a question at all.
 */
export function TableSettings({
  eqMode,
  endlessStock,
  busy,
  canChange,
  onEqMode,
  onEndlessStock,
}: {
  eqMode: EqMode;
  endlessStock: boolean;
  busy: boolean;
  /**
   * Whether this device may move them, which means: whether it is the host's.
   *
   * Everybody still *sees* them, and that is most of the point — a table
   * settles its house rules by reading them together. What the rest cannot do
   * is press one, and one of these does not come back.
   */
  canChange: boolean;
  onEqMode: (eqMode: EqMode) => void;
  onEndlessStock: (on: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Group
        legend="Ekwipunek"
        // Slotowy first because it is how this table plays; klasyczny is still
        // the game as printed, which is why both are offered rather than one
        // assumed. The order says which is expected, not which is legitimate.
        options={[
          {
            active: eqMode === "slots",
            label: "Slotowy",
            // Not "działa tylko to, co założone": nineteen of the forty-five
            // Przedmioty have no place at all — an Eliksir, a Relikwiarz, the
            // Graal — and those work out of the Plecak exactly as the book has
            // them. The line is whether a thing *can* be worn, not whether it
            // happens to be, and "reszta czeka" said the pack was dead weight.
            hint: "Co da się założyć, działa tylko założone. Reszta działa z Plecaka, w którym mieszczą się cztery Przedmioty.",
            onPick: () => onEqMode("slots"),
          },
          {
            active: eqMode === "classic",
            label: "Klasyczny",
            // Opening on the exact negation of the line above, so the two read
            // as one choice rather than two descriptions. Not "cztery miejsca":
            // miejsca are the variant's, and having none is what klasyczny is.
            hint: "Nic się nie zakłada. Najwyżej cztery Przedmioty i każdy działa, gdziekolwiek leży (5.4).",
            onPick: () => onEqMode("classic"),
          },
        ]}
        busy={busy}
        canChange={canChange}
      />

      <Group
        /* Not "Wyposażenie": chapter 21 is titled "MAGICZNE MIECZE, TARCZE
           TOLIMANA I KARTY WYPOSAŻENIA", three things joined by *i*, and both
           relics are printed on the Wyposażenie sheet all the same. A legend
           reading "Wyposażenie" over a setting that deliberately spares those
           two would be read as covering them. */
        legend="Zapas Wyposażenia"
        options={[
          {
            active: endlessStock,
            // One word, like Slotowy and Klasyczny above. These two were
            // sentences pretending to be names, so the pair said everything
            // twice — once in the label and again underneath — which is what
            // pushed the hints into chat.
            label: "Niewyczerpany",
            // Why the two relics are excepted is not said here. It is said in
            // Ustawienia and at length on the Wariant shelf, which is where a
            // reader goes for a reason; this dialog states the choice.
            hint: "Zwykłego Wyposażenia nigdy nie zabraknie. Magiczne Miecze i Tarcze Tolimana zostają po cztery.",
            onPick: () => onEndlessStock(true),
          },
          {
            active: !endlessStock,
            label: "Skończony",
            hint: "Zapas jest ten z pudełka i może się skończyć (21.2).",
            onPick: () => onEndlessStock(false),
          },
        ]}
        busy={busy}
        canChange={canChange}
      />

      {/* Said once, under both, rather than on each of the four options. It is
          the same fact about all of them and the reason the panel is here at
          all: after the start these stop being questions. */}
      <p className="text-[11px] leading-snug text-muted/70">
        Ustalacie to razem, dopóki gra się nie zaczęła — potem ekwipunku już nie
        zmienicie, a skończony stos wraca dopiero przy nowym stole.
      </p>
    </div>
  );
}

/** One question, and the two answers to it. */
function Group({
  legend,
  options,
  busy,
  canChange,
}: {
  legend: string;
  options: { active: boolean; label: string; hint: string; onPick: () => void }[];
  busy: boolean;
  canChange: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[11px] uppercase tracking-widest text-muted">{legend}</legend>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={option.onPick}
          disabled={busy || option.active || !canChange}
          title={canChange ? undefined : "Zasady stołu ustala gospodarz"}
          aria-pressed={option.active}
          // Disabled on the one already chosen rather than merely lit: pressing
          // it would post a change to what it already is, and the only thing
          // that could do is lose a race with somebody else's press.
          // A guest sees what the table has settled on and cannot press it —
          // but the one in force is still lit, because reading it is the part
          // that matters to everybody.
          className={`rounded-lg border px-3 py-2 text-left transition disabled:cursor-default ${
            option.active
              ? "border-ochre bg-ochre/10"
              : `border-edge bg-panel/40 disabled:opacity-50 ${
                  canChange ? "hover:border-ochre/60" : ""
                }`
          }`}
        >
          <span
            className={`block font-[family-name:var(--font-display)] text-[13px] ${
              option.active ? "text-ochre" : "text-ink"
            }`}
          >
            {option.label}
          </span>
          {/* The rule numbers here are plain text, not links.
              
              `Rules` turns "(5.4)" into a button, and a button inside a button
              is not something HTML allows — the browser closes the outer one
              where the inner starts, so what looks like one control becomes
              two, and the second does not choose anything. The Instrukcja is a
              click away on its own shelf; these two numbers are here to say
              which rule is being set aside, not to be followed. */}
          <span className="mt-0.5 block text-[11px] leading-snug text-muted">{option.hint}</span>
        </button>
      ))}
    </fieldset>
  );
}
