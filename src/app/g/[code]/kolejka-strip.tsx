"use client";

import { CARD_CLASS } from "@/data/types";
import { cardName } from "@/lib/engine/polish";
import { kolejkaFor, type KolejkaFrame } from "@/lib/engine/kolejka";
import type { TurnCard } from "@/lib/engine/state";
import { WithRules } from "./rule-ref";

/**
 * What the Obszar still owes this turn, laid out left to right.
 *
 * # Why it is a strip and not a list
 *
 * The kolejka is an *order*, and an order read down a column is a set of things
 * that happen to be stacked. Across the top it is a queue: what is being dealt
 * with, what is behind it, and how much is left — the shape a table reads off
 * the row of Karty lying in front of somebody without anybody saying a word.
 *
 * # Why everyone sees it
 *
 * Not gated on whose turn it is. Half of what makes a physical game legible is
 * that the table watches one player work through what they turned over, and
 * this is that. The active player acts on it; everybody else reads it. Nothing
 * here is secret — 9.3 conceals a hand of Zaklęcia, and 16.8 does the opposite
 * for what lies on an Obszar: "koszulkami do dołu, tak, by ich treść była
 * widoczna dla wszystkich graczy".
 *
 * # What is not in it
 *
 * Everything optional. A Cudotwórca, a Targowisko, a Miecz lying there — 12.1
 * gives those the run of the turn and they belong in the Obszar's window, not
 * in a queue that says "next". `kolejkaFor` draws that line and this only
 * renders what comes back, so the two cannot disagree.
 */

const NUMERAL = ["I", "II", "III", "IV", "V", "VI"];

/**
 * The one label that is not a card's name.
 *
 * A pack is one fight and prints as one thing — 17.5 sums the Miecze of
 * everything attacking at once and 18.2 does the same for Magia — so a Wilk and
 * a Wilkołak side by side under one numeral is the truth, and two chips would
 * be two problems where the rules have one.
 */
function labelOf(frame: KolejkaFrame): string {
  return frame.cards.map((card) => cardName(card.cardId)).join(" + ");
}

function numeralOf(frame: KolejkaFrame): string {
  const rank = CARD_CLASS[frame.cards[0].cardClass];
  return NUMERAL[rank - 1] ?? "";
}

function whyOf(frame: KolejkaFrame): string {
  switch (frame.kind) {
    case "placed":
      return "Trafia na wskazany Obszar — rozpatrywana w pierwszej kolejności (15.1)";
    case "spotkanie":
      return "Spotkanie — należy wykonać instrukcję Karty (16.1)";
    case "wrogowie-miecz":
      return frame.cards.length > 1
        ? "Wrogowie atakują razem, Miecze się sumują (17.5)"
        : "Wróg atakuje natychmiast (16.2)";
    case "wrogowie-magia":
      return frame.cards.length > 1
        ? "Demony atakują razem, Magie się sumują (18.2)"
        : "Demon — walka magiczna (16.3, 18.1)";
    case "nieznajomy":
      return "Nieznajomy — konieczne jest wykonanie instrukcji Karty (16.5)";
    case "miejsce":
      return "Miejsce — należy wykonać instrukcję Karty (16.7)";
  }
}

export function KolejkaStrip({
  cards,
  settled,
  onInspect,
}: {
  /** The turn's own `drawn`, in `resolutionOrder`'s order. */
  cards: readonly TurnCard[];
  /** Resolved and fought together: 17.4 settles a Wróg whether he was beaten or fled. */
  settled: readonly string[];
  onInspect?: (cardId: string) => void;
}) {
  const frames = kolejkaFor(cards, settled);
  // An Obszar holding nothing but loot and services owes the turn nothing, and
  // a heading over an empty row is a box saying it has nothing to say.
  if (frames.length === 0) return null;

  const at = frames.findIndex((frame) => !frame.done);
  const left = frames.filter((frame) => !frame.done).length;

  return (
    <section className="rounded-lg border border-edge bg-panel p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-widest text-muted">
          <WithRules text="Kolejka (15.2)" />
        </h2>
        <span className="shrink-0 text-[11px] uppercase tracking-widest text-muted/70 tabular-nums">
          {left > 0 ? `${left} z ${frames.length}` : "gotowe"}
        </span>
      </div>
      {/* Scrolls in its own box rather than widening the column: a Płaskowyż
          Mgieł that has silted up can hold more frames than fit, and a page
          that scrolls sideways is a page nobody can read. */}
      <ol className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
        {frames.map((frame, index) => {
          const current = index === at;
          return (
            <li
              key={`${frame.kind}-${frame.cards.map((c) => c.cardId).join("-")}`}
              className="shrink-0"
            >
              <button
                type="button"
                disabled={!onInspect}
                onClick={() => onInspect?.(frame.cards[0].cardId)}
                title={whyOf(frame)}
                className={`flex max-w-[220px] items-center gap-1.5 rounded border px-2 py-1 text-left transition ${
                  frame.done
                    ? "border-edge/50 bg-transparent text-muted/50"
                    : current
                      ? "border-ochre bg-ochre/10 text-ink"
                      : "border-edge bg-transparent text-muted"
                } ${onInspect ? "hover:border-ochre/70" : ""}`}
              >
                {/* The numeral the Karta actually prints, which is what 15.2
                    orders by — so the row shows its own reason for being in
                    this order rather than asking to be trusted. */}
                <span className="shrink-0 text-[10px] tabular-nums tracking-widest text-muted/70">
                  {numeralOf(frame)}
                </span>
                <span
                  className={`truncate text-[11px] ${frame.done ? "line-through" : ""}`}
                >
                  {labelOf(frame)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
