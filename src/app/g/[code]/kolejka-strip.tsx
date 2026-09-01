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

/**
 * Every Karta on the Obszar is a chip; only some of them stop the turn.
 *
 * The strip drew `kolejkaFor`'s frames, which is what the turn must stop for —
 * and that is the wrong list to *read*. An Obszar with a Wilk, a Czarodziej and
 * a Miecz on it has one frame, so a player who had just turned over three Karty
 * was shown one chip, or none at all once the "a queue of one is not a queue"
 * guard fired. Three Karty and one chip is not the row anybody came to look at.
 *
 * So there are two lists and they have different jobs. `kolejkaFor` still
 * decides what the turn owes — the duties, the refusals, the disabled button —
 * and never changes. This shows **everything lying here in 15.2 order**, and
 * marks which of them the turn will not walk past. A Cudotwórca is on the
 * Obszar and worth seeing; what he is not is a reason the turn cannot end.
 */
type Chip = {
  card: TurnCard;
  /** Part of a frame: the turn stops here (16.1-16.7). */
  stops: boolean;
  /** Settled this turn — resolved, or fought under 17.4. */
  done: boolean;
  /** The frame this belongs to, when it belongs to one. */
  frame?: KolejkaFrame;
};

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
  const frameOf = new Map<string, KolejkaFrame>();
  for (const frame of frames) for (const card of frame.cards) frameOf.set(card.cardId, frame);

  const chips: Chip[] = cards.map((card) => {
    const frame = frameOf.get(card.cardId);
    return {
      card,
      stops: frame !== undefined,
      done: settled.includes(card.cardId),
      ...(frame ? { frame } : {}),
    };
  });

  /**
   * One Karta is not a row.
   *
   * The sheet this sits on is already showing it at full size, so a strip above
   * naming it again is the same fact twice — which is the guard the sentence it
   * replaced also had, only ever saying "N Karty na tym Obszarze" when N was
   * more than one. Counted in Karty now rather than in frames, which is what
   * made it disappear on an Obszar holding three.
   */
  if (chips.length < 2) return null;

  // What the turn is stopped at, and how much of the Obszar is left to settle.
  const at = chips.findIndex((chip) => chip.stops && !chip.done);
  const left = chips.filter((chip) => !chip.done).length;

  return (
    <section>
      {/* No border and no ground of its own: this is inside a panel already,
          and a box in a box is more chrome than content. */}
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-widest text-muted">
          <WithRules text="Kolejka (15.2)" />
        </h2>
        <span className="shrink-0 text-[11px] uppercase tracking-widest text-muted/70 tabular-nums">
          {left > 0 ? `${left} z ${chips.length}` : "gotowe"}
        </span>
      </div>
      {/* Scrolls in its own box rather than widening the column: an Obszar that
          has silted up holds more than fits, and a page that scrolls sideways
          is a page nobody can read. */}
      <ol className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
        {chips.map((chip, index) => {
          const current = index === at;
          return (
            <li key={`${index}-${chip.card.cardId}`} className="shrink-0">
              <button
                type="button"
                disabled={!onInspect}
                onClick={() => onInspect?.(chip.card.cardId as CardId)}
                title={
                  chip.frame
                    ? whyOf(chip.frame)
                    : // 12.1 gives these the run of the turn, which is exactly
                      // why they are not in anybody's way.
                      "Możesz, ale nie musisz — w każdej chwili do końca tury (12.1)"
                }
                className={`flex max-w-[220px] items-center gap-1.5 rounded border px-2 py-1 text-left transition ${
                  chip.done
                    ? "border-edge/50 bg-transparent text-muted/50"
                    : current
                      ? "border-ochre bg-ochre/10 text-ink"
                      : chip.stops
                        ? "border-edge bg-transparent text-muted"
                        : // Offered rather than owed: dashed, because the
                          // difference between "you must" and "you may" is the
                          // one thing this row exists to show.
                          "border-dashed border-edge/60 bg-transparent text-muted/70"
                } ${onInspect ? "hover:border-ochre/70" : ""}`}
              >
                <span className="shrink-0 text-[9px] uppercase tracking-widest text-muted/70">
                  {CARD_CLASS_LABEL[chip.card.cardClass]}
                </span>
                <span className={`truncate text-[11px] ${chip.done ? "line-through" : ""}`}>
                  {cardName(chip.card.cardId)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
