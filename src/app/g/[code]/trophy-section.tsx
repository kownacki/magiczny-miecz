"use client";

/** Trofea (1.4): who you beat, what it buys, and what a trade would waste. */

import { useState } from "react";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import { combatValueOf } from "@/lib/engine/cards";
import { TROPHY_RATE, offersFor, type Offer } from "@/lib/engine/trophies";
import { plural as polishPlural } from "@/lib/engine/polish";
import { Fold } from "./fold";
import { Rules } from "./rule-ref";
import { ItemSlot } from "./item-slot";
import { CARD_NAMES, tileFor, type Seat } from "./table";
import type { CardId } from "@/data/ids";
import { shelfFor } from "./trophy-shelf";

const EVENTS = events as EventCard[];

/**
 * What one beaten Wróg is worth, by the number printed on his Karta.
 *
 * Read here rather than sent, because the browser holds the card id and
 * `combatValueOf` is the same function the engine prices trophies with — so the
 * ledger and `tradeTrophies` cannot disagree about a Cyklop.
 *
 * Zero for anything that is not a foe with a Miecz. Only those become trophies
 * at all — a Demon is fought magically, beaten and gone — so this should never
 * fire; it is here so a stray holding cannot silently inflate a total.
 */
export function trophyValue(cardId: string): number {
  const card = EVENTS.find((one) => one.id === cardId);
  const worth = card ? combatValueOf(card) : null;
  return worth?.kind === "ordinary" ? worth.total : 0;
}

/**
 * The trofea a character has, and the trade worth making.
 *
 * They used to be drawn inside the Plecak, dimmed, in the row of squares 5.4's
 * four are drawn as — though `carriedCount` counts `kind === "item"` and a
 * trophy never occupied one of them. The same category error the Przyjaciele
 * had, and the same fix.
 *
 * **The control is the number of Miecze, not the Karty.** Nobody wants a subset
 * of dead Wrogowie; they want Miecz points, and the Karty are how it is paid.
 * `offersFor` does the choosing, exhaustively, because greedy gets it wrong: a
 * hand of 6, 5, 2, 2 buys a sword with 5+2 and wastes nothing, where taking the
 * biggest first spends 6+5 and burns four.
 *
 * Two modes, one section:
 *
 * - **Karty pokonanych** — the Karty are held. They are shown, and the offer
 *   lights the ones it would take.
 * - **Punkty** — the Karta went to the stos zużytych as the Wróg died and the
 *   seat carries a total. The shelf still shows everyone beaten, from
 *   `trophy_beaten`, because that is a memorial rather than a wallet: points
 *   are fungible, so no portrait can be the one that vanishes when you cash a
 *   seven.
 */
export function TrophySection({
  seat,
  isMine,
  mode,
  busy,
  onTrade,
}: {
  seat: Seat;
  isMine: boolean;
  /**
   * Which rule this table plays.
   *
   * It buys one sentence now, and nothing else: both variants hold trophies and
   * trade them the same way, and all this decides is whether to say that the
   * Karty have already gone back to the stos zużytych.
   */
  mode: "points" | "cards";
  busy: boolean;
  /**
   * Absent on somebody else's card: you cash in your own trofea.
   *
   * A list of Karty, not a count. It used to send the count and let the engine
   * pick — right while the buttons were the only way to choose, and wrong the
   * moment a player can pick the set themselves, because a hand-made set is
   * frequently not the one the solver would have found. The deal travels with
   * it so the confirmation can say what is about to happen without doing the
   * arithmetic a second time.
   */
  onTrade?: (
    cardIds: readonly string[],
    deal: { swords: number; points: number; wasted: number },
  ) => void;
}) {
  /**
   * The trophies the player has picked out, by holding id.
   *
   * `null` is not "none" — it is "nobody has chosen yet", and the best trade
   * the hand can make stands in. That distinction is the whole of the state
   * machine here: an empty Set is a player who has deliberately deselected
   * everything and should see a trade of nothing, where `null` is a section
   * just opened and should show what it is worth.
   */
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  /**
   * Open to start with, like the pack and the Zaklęcia it stands beside.
   *
   * `Fold` reads a missing `onToggle` as "this section does not fold". The
   * tally is what makes folding it cheap — „14 pkt · 2 punkty Miecza" stays on
   * the bar when the row is shut, so what a player checks trofea for is legible
   * without opening them.
   */
  const [showing, setShowing] = useState(true);

  const byPoints = mode === "points";
  const held = seat.holdings
    .filter((one) => one.kind === "trophy")
    .map((one) => ({ holdingId: one.id, cardId: one.cardId }));
  /** Everyone beaten, and which of them are still held. */
  const shelf = shelfFor(seat.trophy_beaten ?? [], held);
  const gone = shelf.filter((one) => one.gone);
  const counting = held.reduce((sum, one) => sum + trophyValue(one.cardId), 0);

  /**
   * Every trade this hand can make, each by its cheapest set — the engine's
   * answer, not a second opinion computed here.
   *
   * One list for both variants, because there is one trade. „Punkty" used to
   * be a pool converted in sevens, and had its own branch here; it is not a
   * pool. It holds trophies like the printed rule and differs only in where
   * the cardboard is, so the choice, the rate and the waste are all shared.
   */
  /**
   * The living trophies, oldest first — which is the row reversed.
   *
   * Both halves of the automatic choice read this order, and it is the whole
   * of what makes „+1 Miecza" reach for the Wilkołak you beat in turn two
   * rather than the one from turn nine. `offersFor` keeps the first witness it
   * finds for a sum at a given size, and it walks the hand in the order it is
   * given, so ties fall to whatever came earlier here. Where the arithmetic
   * genuinely needs a particular Karta it still gets it: this decides nothing
   * about waste, only about which of two equally good answers to give.
   */
  const oldestFirst = [...shelf.filter((one) => !one.gone)].reverse();

  const offers: Offer[] = offersFor(
    oldestFirst.map((one) => ({ cardId: one.cardId, points: trophyValue(one.cardId) })),
  );
  const most = offers[offers.length - 1] ?? null;

  /**
   * An offer, which names Karty, resolved to the trophies on this shelf.
   *
   * A multiset walk rather than `includes`, for the reason the shelf is one:
   * holding two Nobbiny and handing in one, a name test is true for both and
   * would select the pair. Each name takes one holding out of the row.
   */
  const idsFor = (of: Offer | null): ReadonlySet<string> => {
    if (!of) return new Set();
    // Oldest first here too. The offer names Karty, and two Wilkołaki are one
    // name — so which tile lights up is decided here, and it should be the
    // same one the solver was thinking of.
    const left = [...oldestFirst];
    const out = new Set<string>();
    for (const cardId of of.cardIds) {
      const at = left.findIndex((one) => one.cardId === cardId);
      if (at === -1) continue;
      const [taken] = left.splice(at, 1);
      if (taken.holdingId) out.add(taken.holdingId);
    }
    return out;
  };

  /**
   * What is actually selected right now.
   *
   * Stale ids are dropped rather than remembered: a trade deletes holdings and
   * a won fight adds one, and a Set left over from before either would light a
   * tile that is not there or miss one that is.
   */
  const alive = new Set(held.map((one) => one.holdingId));
  const chosen: ReadonlySet<string> =
    picked === null
      ? idsFor(most)
      : new Set([...picked].filter((id) => alive.has(id)));

  /**
   * The deal on the table, computed from the selection rather than looked up.
   *
   * This is what lets a hand-picked set answer the same questions a button's
   * set does — how many Mieczy, how many points lost — without the two paths
   * having separate arithmetic. 1.4 is one sentence and it applies to whatever
   * you decided to hand in.
   */
  const points = shelf
    .filter((one) => one.holdingId && chosen.has(one.holdingId))
    .reduce((sum, one) => sum + trophyValue(one.cardId), 0);
  const swords = Math.floor(points / TROPHY_RATE);
  const wasted = points - swords * TROPHY_RATE;
  const cardIds = shelf
    .filter((one) => one.holdingId && chosen.has(one.holdingId))
    .map((one) => one.cardId);

  const toggle = (holdingId: string) => {
    const next = new Set(chosen);
    if (next.has(holdingId)) next.delete(holdingId);
    else next.add(holdingId);
    setPicked(next);
  };

  // Somebody else's empty shelf is not worth a row; your own is, because it is
  // where the count appears the moment you win a fight. Asked of the shelf and
  // not the count: a player who has cashed in everything is at zero points and
  // still has Wrogowie worth showing.
  if (!isMine && shelf.length === 0) return null;

  return (
    <Fold
      title="Trofea"
      tally={
        <span className={most ? "text-ochre" : undefined}>
          {counting} pkt{most ? ` · ${most.swords} ${plural(most.swords)}` : ""}
        </span>
      }
      open={showing}
      onToggle={() => setShowing(!showing)}
    >
      {shelf.length === 0 ? (
        <p className="p-1 text-[11px] leading-snug text-muted">
          {/* Linked here and plain in the buttons below: this is the app
              explaining itself, and a label is a label. */}
          {/* The trade is the same sentence in both variants — you keep whom
              you beat and hand in whom you choose — so only the clause about
              the cardboard differs. */}
          <Rules>
            {`Nikogo jeszcze nie pokonałeś. Zatrzymasz każdego pokonanego Wroga i oddasz wybranych, gdy zechcesz — za każde ${TROPHY_RATE} punktów Miecza dostaniesz 1 punkt Miecza (1.4).`}
          </Rules>
        </p>
      ) : (
        <div className="flex flex-col gap-2 p-1">
          {/* One row, in the order the shelf hands back: newest first, spent
              pushed to the end. Nothing is arranged by hand here — see
              `shelfFor` for why a shelf is not a pack. */}
          <div className="flex flex-wrap gap-2">
            {shelf.map((one, at) => (
              <TrophyTile
                key={one.holdingId ?? `${one.cardId}-${at}`}
                cardId={one.cardId}
                gone={one.gone}
                inTrade={!!one.holdingId && chosen.has(one.holdingId)}
                // A trophy you hold is a thing you are deciding about, so the
                // click decides — and the Karta is a hover away either way. One
                // that has gone is not up for anything, so its click keeps the
                // meaning every other tile in the app has.
                onPick={
                  isMine && one.holdingId && !one.gone
                    ? () => toggle(one.holdingId as string)
                    : undefined
                }
              />
            ))}
          </div>

          {gone.length > 0 && (
            <p className="text-[11px] leading-snug text-muted/70">
              {/* Not "sprzedane". A trade is the usual way a trophy goes and not
                  the only one — it can also be put down — and which of the two
                  happened is recorded nowhere. So the sentence says what is
                  certainly true and names the rule only for the half that has
                  one. */}
              <Rules>
                Wyblakłe na końcu to pokonani, których już nie masz — oddanych za
                punkty Miecza (1.4) albo odrzuconych.
              </Rules>
            </p>
          )}

          {byPoints && (
            /* The whole of what this variant changes, and the only place the
               seat card still needs to know which one is being played: the
               trophy is yours to spend either way, but its Karta went back to
               the stos zużytych when he fell, so he can be dealt to somebody
               else while you are still holding him here.

               No rule number, and „(1.4, 9.5)" was wrong twice. 9.5 is the
               *Zaklęcia* pile — it is Karty Zaklęć that are reshuffled when the
               stos runs out, and the Instrukcja has no equivalent sentence for
               Zdarzenia anywhere. And 1.4 sends the Karta back when it is
               *traded*; sending it back at the kill is this table's variant,
               not the printed rule. A house rule is one of the things the
               rulebook does not cover, and saying nothing beats a number that
               reads as a promise and is not one. */
            <p className="text-[11px] leading-snug text-muted/70">
              Karty pokonanych Wrogów wróciły na stos zużytych — trofea zostają
              u ciebie.
            </p>
          )}

          {most === null && chosen.size === 0 ? (
            <p className="text-[11px] leading-snug text-muted">
              {counting} pkt — na jeden punkt Miecza trzeba {TROPHY_RATE}, czyli
              jeszcze {TROPHY_RATE - counting}.
            </p>
          ) : (
            <>
              {/* One button per number of Mieczy the hand can reach, because
                  that is the decision a player is making — and each is a
                  shortcut, not a mode: pressing it replaces whatever is picked
                  with the set that buys that many for the least waste. The one
                  matching what is picked lights up, so a hand-made selection
                  finds its own answer on the same row rather than being told
                  nothing about itself. */}
              {offers.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {offers.map((one) => (
                    <button
                      key={one.swords}
                      type="button"
                      onClick={() => setPicked(idsFor(one))}
                      aria-pressed={swords === one.swords}
                      title={
                        one.wasted > 0
                          ? `${one.points} pkt, ${one.wasted} przepadnie`
                          : `${one.points} pkt, nic nie przepadnie`
                      }
                      className={`rounded border px-2 py-0.5 text-[11px] transition ${
                        swords === one.swords
                          ? "border-ochre bg-ochre/10 text-ochre"
                          : "border-edge text-muted hover:border-ochre/60"
                      }`}
                    >
                      {one.swords} {plural(one.swords)}
                    </button>
                  ))}
                </div>
              )}

              <Ledger
                points={points}
                swords={swords}
                wasted={wasted}
                total={counting}
                cards={chosen.size}
              />

              {isMine && onTrade && (
                <button
                  type="button"
                  disabled={busy || swords < 1}
                  onClick={() =>
                    onTrade(cardIds, { swords, points, wasted })
                  }
                  /* The one thing in this section that changes the game, drawn
                     the way the app draws those: the Obszar's „Rzuć i rozpatrz"
                     and the door's own button are this, and a trade that costs
                     Karty deserves the same weight as either. It was the same
                     grey outline as a filter above it. */
                  className="rounded border border-ochre bg-ochre/10 px-3 py-2 font-[family-name:var(--font-display)] text-sm tracking-wide text-ochre transition hover:bg-ochre/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
                >
                  {swords < 1
                    ? `Wybierz co najmniej ${TROPHY_RATE} pkt`
                    : `Wymień ${points} pkt na ${swords} ${plural(swords)}`}
                  {swords >= 1 && wasted > 0 ? ` (${wasted} przepadnie)` : ""}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Fold>
  );
}

/**
 * So a button never reads „1 punkty Miecza" — nor „5 punkty", which the
 * two-case version got wrong and a hand of trofea can reach: 75 points of
 * Wrogowie are hoardable and seven buy a Miecz.
 */
function plural(swords: number): string {
  return `${polishPlural(swords, "punkt", "punkty", "punktów")} Miecza`;
}

/**
 * What this trade costs, said before it is made.
 *
 * The waste is the half 1.4 hides in a subordinate clause and the only reason
 * to wait, so it is named, and named as a loss because it is one in both
 * variants: „punkty ponad wielokrotność 7 są stracone" does not ask where the
 * cardboard is. What is *not* handed in is a different number and stays yours,
 * which is why the two are printed apart.
 *
 * Takes the selection rather than an `Offer`, since the player may have made
 * one the solver would not have. The arithmetic is 1.4's either way.
 */
function Ledger({
  points,
  swords,
  wasted,
  total,
  cards,
}: {
  points: number;
  swords: number;
  wasted: number;
  /** Everything held, so the part staying behind can be named. */
  total: number;
  /** How many Karty are picked, for the case where they buy nothing yet. */
  cards: number;
}) {
  const left = total - points;
  if (cards === 0) {
    return (
      <p className="text-[11px] leading-snug text-muted">
        Nic nie wybrano — kliknij trofea, które chcesz oddać.
      </p>
    );
  }
  return (
    <p className="text-[11px] leading-snug text-muted">
      Weźmie {points} z {total} pkt
      {swords < 1 ? (
        <span className="text-muted/70">
          {" "}
          — za mało na Miecz, trzeba {TROPHY_RATE}
        </span>
      ) : (
        <>
          {wasted > 0 && (
            <>
              {", "}
              <span className="text-vermilion/90">{wasted} przepadnie</span>
            </>
          )}
          {left > 0 && <span className="text-muted/70">, reszta zostaje u ciebie</span>}
        </>
      )}
    </p>
  );
}

/** One beaten Wróg, with what he is worth printed where a name goes. */
function TrophyTile({
  cardId,
  gone,
  inTrade,
  onPick,
}: {
  cardId: string;
  /** Beaten, and no longer held: traded away (1.4) or put down. */
  gone: boolean;
  /** The trade being weighed would hand this one in. */
  inTrade: boolean;
  /**
   * Put this one in the trade or take it out.
   *
   * The only thing a click does here. A trophy tile used to open the Karta like
   * every other card in the app, and on a row where the click is a *choice*
   * that is one gesture with two meanings — pick this one, or read it — decided
   * by which trophy you happened to hit. Absent for a spent one, which is a
   * record and has nothing to decide.
   */
  onPick?: () => void;
}) {
  const worth = trophyValue(cardId);
  const name = CARD_NAMES.get(cardId) ?? cardId;
  // `trophy_beaten` is a `text[]` off the wire, so it is narrowed here rather
  // than trusted — the one boundary this component has. An id the box does not
  // know draws its own name and no picture, which is what `tileFor` does with
  // anything it cannot place.
  const card = tileFor({ id: cardId, cardId: cardId as CardId, kind: "trophy", face: "open" });
  return (
    <ItemSlot
      item={{ holdingId: cardId, cardId, card, inert: false }}
      // The number is the point of the tile: a trophy's name is a memory and
      // its Miecz is the currency, and the currency is what a choice is made on.
      label={`${name} · ${worth}`}
      eqMode="classic"
      /**
       * One fade, one meaning.
       *
       * Both halves live in one row now, so dimming had to stop being the
       * answer to two different questions. It says „gone" and nothing else; the
       * trade picks its own out with `chosen` instead of fading everything it
       * is leaving. That also puts the emphasis the right way round — a trade
       * is a handful of cards out of a shelf, so lighting a few beats dulling
       * the rest.
       */
      tone={inTrade ? "chosen" : "filled"}
      dimmed={gone}
      struck={gone}
      // The cup is what says a Wróg can still be spent, so it goes with him
      // when he is. Position and fade both say the same thing from across the
      // row; this is the one that survives being looked at directly.
      marks={gone ? [] : ["trofeum"]}
      // Inert exactly when there is nothing to decide: a spent trophy, or
      // anybody's shelf but your own. Both used to be live buttons that either
      // did nothing or opened a window, and one fact settles both.
      //
      // The Karta is still a hover away — the preview lives on the square
      // rather than on the button, so switching the button off does not take it
      // with it — which is why nothing is lost by refusing the click.
      disabled={!onPick}
      onClick={onPick}
    />
  );
}
