"use client";

/** A field's compulsory table (16.5) — the thing an Obszar does to you for arriving. */

import { useState } from "react";
import { DrawSheet, type SheetChrome } from "./draw-sheet";
import { summariseEffect } from "@/lib/engine/effectText";
import { sentence } from "@/lib/engine/polish";
import { pendingIn } from "@/lib/engine/resolve";
import type { Effect } from "@/lib/engine/cardScript";
import { ActionButton } from "../action-button";
import { DieMark } from "../die-mark";
import { RollSaid, type Rolled } from "./roll-result";

/**
 * Nothing drawn to deal with, but the Obszar itself demands something.
 *
 * The same shape as a card: it happened to you, here is what you can do about
 * it. "MUSISZ RZUCIĆ KOSTKĄ" at the Karczma, and the Strażnik's toll — two
 * things that happen to you rather than being offered, which puts them in the
 * same class as a drawn Karta. The Osada's Czarownica and Płatnerz stay in the
 * panel: those are a visit, and a visit is optional.
 */
export function FieldOffer({
  who,
  chrome,
  offer,
  busy,
  rolled,
  onRollRead,
  onResolveField,
}: {
  who: string;
  chrome: SheetChrome;
  offer: { name: string; effect: Effect };
  busy: boolean;
  /** A die thrown for this Obszar's table and not yet read — see `RollSaid`. */
  rolled?: Rolled | null;
  /** „Dalej": the face has been read, and the turn may go on. */
  onRollRead?: () => void;
  /**
   * Throws the field's own table and applies the row.
   *
   * The promise is what the buttons below wait on — see `sent`.
   */
  onResolveField: (choices: number[]) => void | Promise<void>;
}) {
  /**
   * The answer that has gone to the server and has not come back.
   *
   * The same rule as the Karta's own panel, and it is here for the same reason
   * — see `sent` in `drawn-actions.tsx`. This used to append the option to a
   * local list, ask `pendingIn` again with the longer one, and so replace the
   * Strażnik's two answers with „Rozpatrz" the instant one of them was pressed:
   * a control nobody chose, greyed out while the request flew and live again
   * for as long as the new turn state took to arrive.
   *
   * An option pressed here is the table's first question, and a question left
   * over after it is the server's to ask, as a `script` frame. So the panel
   * keeps what it is showing, marks the button that was pressed, and waits.
   */
  const [sent, setSent] = useState<{ option: number | null } | null>(null);
  const owed = pendingIn(offer.effect, []);
  /** The app throws for this one, so the button says so and carries a die. */
  const rolls = !owed && offer.effect.op === "rzut";

  /** Sends one answer and holds it on screen until the server has answered. */
  const answer = async (was: { option: number | null }, choices: number[]) => {
    setSent(was);
    try {
      await onResolveField(choices);
    } finally {
      setSent((current) => (current === was ? null : current));
    }
  };

  return (
    <DrawSheet
      {...chrome}
      label={offer.name}
      art={null}
      watching={`${who} na polu: ${offer.name}`}
    >
      <FieldEffect effect={offer.effect} />
      {chrome.canAct && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-edge pt-3">
          {/* The face where the button that threw it stood — the Obszar's table
              reads the same way a Karta's does. */}
          {rolled ? (
            <RollSaid
              face={rolled.face}
              did={rolled.did}
              onDone={onRollRead ?? (() => {})}
            />
          ) : owed?.op === "wybor" ? (
            owed.options.map((option, index) => (
              <ActionButton
                key={option.label}
                disabled={busy}
                sent={sent?.option === index}
                onClick={() => void answer({ option: index }, [index])}
              >
                {option.label}
              </ActionButton>
            ))
          ) : (
            <ActionButton
              weight="lead"
              size="lg"
              /* The Obszar's die is the Karta's die: pressed and thrown, with
                 no window to take back a throw nobody chose — see `immediate`. */
              immediate={rolls}
              after={rolls ? <DieMark /> : undefined}
              disabled={busy}
              sent={sent !== null}
              onClick={() => void answer({ option: null }, [])}
            >
              {rolls ? "Rzuć kostką" : "Rozpatrz"}
            </ActionButton>
          )}
        </div>
      )}
    </DrawSheet>
  );
}

/** A field's table, written out. The app rolls it; nothing here is pressable. */
function FieldEffect({ effect }: { effect: Effect }) {
  if (effect.op === "rzut") {
    return (
      <ol className="flex flex-col gap-0.5 text-xs">
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <li key={face} className="flex items-baseline gap-2">
            <span className="tnum w-3 text-ochre">{face}</span>
            <span className="text-muted">{summariseEffect(effect.faces[face])}</span>
          </li>
        ))}
      </ol>
    );
  }
  // A line on its own, so it starts like one. The rows above do not: each is
  // the value of the die face beside it, and it is the same fragment that
  // appears mid-sentence when `CardFacts` writes the whole table out as one
  // line — „Rzut kostką: 1 — +3 Złota; 2 — …". The two presentations of one
  // table should be the same words.
  return <p className="text-xs text-muted">{sentence(summariseEffect(effect))}</p>;
}
