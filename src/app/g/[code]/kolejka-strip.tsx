"use client";

import type { CardId } from "@/data/ids";
import type { EqMode } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";
import { CardTile } from "./card-tile";
import { tileFor } from "./table";
import { isSpent, kolejkaFor, type KolejkaFrame } from "@/lib/engine/kolejka";
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

/**
 * Whether there is a row here at all — asked by the caller as well as by this.
 *
 * One Karta is not a row: the sheet this sits on is already showing it at full
 * size, so a strip naming it again is the same fact twice. That is the guard
 * the sentence it replaced also had, only ever saying "N Karty na tym Obszarze"
 * when N was more than one.
 *
 * Exported because a component returning null is invisible to the thing that
 * wrapped it. `DrawSheet` puts its footer in a bordered box, and a box that
 * asked `footer &&` would have drawn a rule across the sheet with nothing under
 * it — which is the exact empty-divider fault this file has now been on both
 * sides of.
 */
export function worthShowing(cards: readonly unknown[]): boolean {
  return cards.length > 1;
}

export function KolejkaStrip({
  cards,
  settled,
  current,
  onInspect,
  eqMode,
  nature,
}: {
  /** The turn's own `drawn`, in `resolutionOrder`'s order. */
  cards: readonly TurnCard[];
  /** Resolved and fought together: 17.4 settles a Wróg whether he was beaten or fled. */
  settled: readonly string[];
  /**
   * The Karta being dealt with, as the sheet around this decides it.
   *
   * Handed in rather than worked out, because working it out is how the two
   * came to disagree: the sheet shows the first Karta that is neither settled
   * nor fought, and this marked the first that *stops the turn* — so on an
   * Obszar whose first Karta was a Czarodziej the sheet held the Czarodziej
   * while the row lit the Dobre Bóstwo behind him.
   *
   * There is one Karta in front of the player and one thing on screen may
   * decide which it is.
   */
  current?: string | null;
  onInspect?: (cardId: CardId) => void;
  /** Passed through to the tiles, whose hover says where a Przedmiot must go. */
  eqMode?: EqMode;
  nature?: Nature | null;
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

  if (!worthShowing(cards)) return null;

  // What the sheet is holding, and how much of the Obszar is left to settle.
  // The fallback is for a caller with no sheet around it: the first Karta not
  // yet settled, which is the same rule the sheet applies.
  const at =
    current != null
      ? chips.findIndex((chip) => chip.card.cardId === current)
      : chips.findIndex((chip) => !chip.done);
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
      {/**
       * The same tiles as the Plecak, the Księga and the Obszar's own window.
       *
       * They were chips with the name in them, which is the one thing a row of
       * Karty does not need spelling out: a card is recognised by its picture,
       * and every other shelf in the app had already learned that. `CardTile`
       * brings the illustration, the name under it, the conjured wrench and —
       * the reason this matters here — the hover that opens the whole Karta.
       * Reading what is three places down the queue without settling what is in
       * front of you is exactly what a player wants from this row.
       *
       * Scrolls in its own box rather than widening the sheet: an Obszar that
       * has silted up holds more than fits, and a page that scrolls sideways is
       * a page nobody can read.
       */}
      <ol className="flex items-start gap-2 overflow-x-auto pb-1">
        {chips.map((chip, index) => {
          const current = index === at;
          return (
            <li
              key={`${index}-${chip.card.cardId}`}
              className="shrink-0"
              /* Why this Karta is in the way, with its rule. The tile's own
                 hover opens the whole Karta, which says what it *is*; this says
                 what the turn is doing about it, which the Karta cannot. */
              title={
                chip.frame
                  ? whyOf(chip.frame)
                  : "Możesz, ale nie musisz — w każdej chwili do końca tury (12.1)"
              }
            >
              <CardTile
                card={tileFor({
                  cardId: chip.card.cardId as CardId,
                  granted: chip.card.granted,
                })}
                dimmed={chip.done}
                /* Two kinds of done, and the row is the only place that can
                   tell them apart: dimmed is settled and still lying here,
                   struck is settled and gone — a DOBRE BÓSTWO that has judged
                   you is on the used pile, not on the Obszar. */
                struck={isSpent(chip.card, settled)}
                /* "You are here", in the paint the trofea already use for a
                   card picked out of a row. It was a ring round the whole
                   `<li>`, which drew a second frame outside the tile's own and
                   enclosed the caption with it. */
                chosen={current}
                /* 12.1 gives these the run of the turn, so they are in the row
                   to be seen and not to be got past. The badge says which is
                   which in the one word the cards themselves use. */
                badge={chip.done ? undefined : chip.stops ? undefined : "możesz"}
                eqMode={eqMode}
                nature={nature}
                onClick={onInspect ? () => onInspect(chip.card.cardId as CardId) : undefined}
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
