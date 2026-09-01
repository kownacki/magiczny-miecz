"use client";

import type { CardId } from "@/data/ids";
import { CARD_CLASS_LABEL } from "@/data/types";
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

/**
 * What kind of thing this frame is, in the word the Karta prints.
 *
 * It was the Roman numeral — `II` for a Wilk, off `Wróg II Bestia` — on the
 * reasoning that the row should show its own reason for being in that order.
 * Two vertical strokes at chip size read as a pause icon and not as a numeral,
 * which is what the first person to see it asked about. The ordering is
 * already visible from left to right; what the numeral alone carried that
 * nothing else did is II against III, and the word says that better than the
 * numeral ever did — a Demon is fought with Magia and a Bestia with Miecz, and
 * "Demon" says so where "III" needs the rulebook.
 *
 * The numeral is not lost: it is in the `title`, with the rule beside it.
 */
function kindOf(frame: KolejkaFrame): string {
  return CARD_CLASS_LABEL[frame.cards[0].cardClass];
}

function whyOf(frame: KolejkaFrame): string {
  switch (frame.kind) {
    case "placed":
      return "Trafia na wskazany Obszar — rozpatrywana w pierwszej kolejności (15.1)";
    case "spotkanie":
      return "Spotkanie I — należy wykonać instrukcję Karty (16.1)";
    case "wrogowie-miecz":
      return frame.cards.length > 1
        ? "Wróg II — atakują razem, Miecze się sumują (17.5)"
        : "Wróg II — atakuje natychmiast, walka Mieczem (16.2)";
    case "wrogowie-magia":
      return frame.cards.length > 1
        ? "Wróg III — atakują razem, Magie się sumują (18.2)"
        : "Wróg III (Demon) — walka magiczna (16.3, 18.1)";
    case "nieznajomy":
      return "Nieznajomy IV — konieczne jest wykonanie instrukcji Karty (16.5)";
    case "miejsce":
      return "Miejsce VI — należy wykonać instrukcję Karty (16.7)";
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
  onInspect?: (cardId: CardId) => void;
}) {
  const frames = kolejkaFor(cards, settled);
  /**
   * Nothing to draw for none, and nothing worth drawing for one.
   *
   * An Obszar holding only loot and services owes the turn nothing, so there is
   * no queue. And a queue of one is not a queue: the sheet this sits on is
   * already showing that Karta at full size, so a row above it saying "1 z 1"
   * and naming it again is the same fact twice. The line it replaced had the
   * same guard for the same reason — it only said "N Karty na tym Obszarze"
   * when N was more than one.
   */
  if (frames.length < 2) return null;

  const at = frames.findIndex((frame) => !frame.done);
  const left = frames.filter((frame) => !frame.done).length;

  return (
    <section>
      {/* No border and no ground of its own: this is inside the Obszar's
          window, which is already a panel, and a box in a box for one chip is
          more chrome than content — which is what it looked like standing in
          the column. */}
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
                onClick={() => onInspect?.(frame.cards[0].cardId as CardId)}
                title={whyOf(frame)}
                className={`flex max-w-[220px] items-center gap-1.5 rounded border px-2 py-1 text-left transition ${
                  frame.done
                    ? "border-edge/50 bg-transparent text-muted/50"
                    : current
                      ? "border-ochre bg-ochre/10 text-ink"
                      : "border-edge bg-transparent text-muted"
                } ${onInspect ? "hover:border-ochre/70" : ""}`}
              >
                {/* Small capitals, so it reads as a label on the thing beside
                    it rather than as another name. */}
                <span className="shrink-0 text-[9px] uppercase tracking-widest text-muted/70">
                  {kindOf(frame)}
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
