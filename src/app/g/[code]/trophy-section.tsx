"use client";

/** Trofea (1.4): who you beat, what it buys, and what a trade would waste. */

import { useState } from "react";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import { combatValueOf } from "@/lib/engine/cards";
import { TROPHY_RATE, offersFor, type Offer } from "@/lib/engine/trophies";
import { Fold } from "./fold";
import { Rules } from "./rule-ref";
import { ItemSlot } from "./item-slot";
import { CARD_NAMES, tileFor, type Seat } from "./table";
import type { TileCard } from "./card-tile";
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
  onInspect,
}: {
  seat: Seat;
  isMine: boolean;
  /**
   * Which rule this table plays, said outright rather than inferred.
   *
   * It was inferred from whether a total arrived, which stopped working when
   * the engine landed: `trophy_points` is `not null` and reads `0` in "cards",
   * so an absent total and a table with no kills look identical.
   */
  mode: "points" | "cards";
  busy: boolean;
  /** Absent on somebody else's card: you cash in your own trofea. */
  onTrade?: (swords: number) => void;
  onInspect: (card: TileCard) => void;
}) {
  /** Which trade is being looked at, by count. Null means "the most it buys". */
  const [wanted, setWanted] = useState<number | null>(null);

  const byPoints = mode === "points";
  const held = seat.holdings.filter((one) => one.kind === "trophy");
  /** Everyone beaten, and which of them are still in hand. */
  const shelf = shelfFor(seat.trophy_beaten ?? [], held.map((one) => one.cardId), byPoints);
  const gone = shelf.filter((one) => one.gone);
  const counting = byPoints
    ? (seat.trophy_points ?? 0)
    : held.reduce((sum, one) => sum + trophyValue(one.cardId), 0);

  /**
   * Every trade this hand can make, each by its cheapest set — the engine's
   * answer, not a second opinion computed here.
   *
   * In „Punkty" there are no Karty, so the hand is one notional trophy worth
   * the running total and the same function answers the same question.
   */
  const offers: Offer[] = byPoints
    ? offersFor(counting > 0 ? [{ cardId: "", points: counting }] : [])
    : offersFor(held.map((one) => ({ cardId: one.cardId, points: trophyValue(one.cardId) })));

  const most = offers[offers.length - 1] ?? null;
  const offer = offers.find((one) => one.swords === wanted) ?? most;

  /**
   * Whether *this* tile is one the trade takes, asked once per tile as the row
   * is drawn.
   *
   * A countdown rather than `cardIds.includes`, for the reason the shelf is a
   * multiset: holding two Nobbiny and handing in one, `includes` is true for
   * both and lights the pair. The offer names a bag of Karty and each tile
   * takes one out of it, so the second Nobbin stays dark and the count on the
   * screen matches the count in the trade.
   *
   * Rebuilt on every render, which is what makes it safe to spend while
   * mapping: the bag is this render's, and the next one starts full again.
   */
  const bag = new Map<string, number>();
  for (const cardId of offer && !byPoints ? offer.cardIds : []) {
    bag.set(cardId, (bag.get(cardId) ?? 0) + 1);
  }
  const takes = (cardId: string): boolean => {
    const left = bag.get(cardId) ?? 0;
    if (left === 0) return false;
    bag.set(cardId, left - 1);
    return true;
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
    >
      {shelf.length === 0 ? (
        <p className="p-1 text-[11px] leading-snug text-muted">
          {/* Linked here and plain in the buttons below: this is the app
              explaining itself, and a label is a label. */}
          <Rules>
            {byPoints
              ? `Nikogo jeszcze nie pokonałeś. Za każde ${TROPHY_RATE} punktów Miecza pokonanych Wrogów dostaniesz 1 punkt Miecza; reszta zostaje na później (1.4).`
              : `Nikogo jeszcze nie pokonałeś. Zatrzymasz Kartę każdego pokonanego Wroga i oddasz wybrane, gdy zechcesz — za każde ${TROPHY_RATE} punktów Miecza dostaniesz 1 punkt Miecza (1.4).`}
          </Rules>
        </p>
      ) : (
        <div className="flex flex-col gap-2 p-1">
          {/* Those still in hand, which are the only ones a trade can reach. In
              „Punkty" every one of them is here and none lights up: the Karta is
              long gone, points are fungible, and no particular corpse paid for a
              given Miecz. */}
          <div className="flex flex-wrap gap-2">
            {shelf
              .filter((one) => !one.gone)
              .map((one, at) => (
                <TrophyTile
                  key={`${one.cardId}-${at}`}
                  cardId={one.cardId}
                  spent={takes(one.cardId)}
                  choosing={!byPoints && offer !== null}
                  onInspect={onInspect}
                />
              ))}
          </div>

          {byPoints && (
            <p className="text-[11px] leading-snug text-muted/70">
              <Rules>
                Karty pokonanych Wrogów wracają na stos zużytych — zostaje pamięć i
                punkty (1.4).
              </Rules>
            </p>
          )}

          {most === null ? (
            <p className="text-[11px] leading-snug text-muted">
              {counting} pkt — na jeden punkt Miecza trzeba {TROPHY_RATE}, czyli
              jeszcze {TROPHY_RATE - counting}.
            </p>
          ) : (
            <>
              {/* One button per number of Miecze, because that is the decision a
                  player is making. Each carries its own cost, so choosing two
                  over one happens with the waste in view rather than after it. */}
              {offers.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {offers.map((one) => (
                    <button
                      key={one.swords}
                      type="button"
                      onClick={() => setWanted(one.swords)}
                      aria-pressed={offer?.swords === one.swords}
                      title={
                        one.wasted > 0
                          ? `${one.points} pkt, ${one.wasted} przepadnie`
                          : `${one.points} pkt, nic nie przepadnie`
                      }
                      className={`rounded border px-2 py-0.5 text-[11px] transition ${
                        offer?.swords === one.swords
                          ? "border-ochre bg-ochre/10 text-ochre"
                          : "border-edge text-muted hover:border-ochre/60"
                      }`}
                    >
                      {one.swords} {plural(one.swords)}
                    </button>
                  ))}
                </div>
              )}

              {offer && <Ledger offer={offer} total={counting} keepsRest={byPoints} />}

              {isMine && onTrade && offer && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onTrade(offer.swords);
                    setWanted(null);
                  }}
                  className="rounded border border-edge px-2 py-1.5 text-left text-xs text-ink transition hover:border-ochre disabled:opacity-50"
                >
                  Wymień {offer.points} pkt na {offer.swords} {plural(offer.swords)}
                  {offer.wasted > 0 ? ` (${offer.wasted} przepadnie)` : ""}
                </button>
              )}
            </>
          )}

          {gone.length > 0 && (
            /* Last, and after the trade, because nothing here can be traded:
               these Karty are on the stos zużytych and the row is a record. It
               is a row of its own rather than the tail of the one above, so the
               dimming reads as "gone" rather than as the trade's "not this
               time" — the same fade meaning two things in one row is what the
               caption and the gap are here to stop. */
            <div className="flex flex-col gap-1 border-t border-edge/50 pt-2">
              <p className="text-[11px] leading-snug text-muted/70">
                {/* Not "sprzedane". A trade is the usual way a trophy leaves a
                    hand and not the only one — a Karta can also be put down —
                    and which of the two happened is not recorded anywhere. So
                    the sentence says what is certainly true and names the rule
                    only for the half that has one. */}
                <Rules>
                  Pokonani, których Kart już nie masz — oddanych za punkty Miecza
                  (1.4) albo odrzuconych.
                </Rules>
              </p>
              <div className="flex flex-wrap gap-2">
                {gone.map((one, at) => (
                  <TrophyTile
                    key={`gone-${one.cardId}-${at}`}
                    cardId={one.cardId}
                    spent={false}
                    choosing
                    onInspect={onInspect}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Fold>
  );
}

/** So a button never reads "1 punkty Miecza". */
function plural(swords: number): string {
  return swords === 1 ? "punkt Miecza" : "punkty Miecza";
}

/**
 * What this trade costs, said before it is made.
 *
 * The waste is the half 1.4 hides in a subordinate clause and the only reason
 * to wait, so it is named — and named as a *loss* only where it is one. In
 * „Punkty" the remainder stays on the seat, so the same number is a remainder;
 * writing "przepadnie" over it would invent a cost the rule does not charge.
 */
function Ledger({
  offer,
  total,
  keepsRest,
}: {
  offer: Offer;
  total: number;
  keepsRest: boolean;
}) {
  const left = total - offer.points;
  return (
    <p className="text-[11px] leading-snug text-muted">
      Weźmie {offer.points} z {total} pkt
      {offer.wasted > 0 && (
        <>
          {", "}
          <span className="text-vermilion/90">{offer.wasted} przepadnie</span>
        </>
      )}
      {left > 0 && (
        <span className="text-muted/70">
          {keepsRest ? `, ${left} zostaje` : `, reszta zostaje w ręku`}
        </span>
      )}
    </p>
  );
}

/** One beaten Wróg, with what he is worth printed where a name goes. */
function TrophyTile({
  cardId,
  spent,
  choosing,
  onInspect,
}: {
  cardId: string;
  /** This trade would hand him in. */
  spent: boolean;
  /** There is a trade on offer at all, so unlit means "stays behind". */
  choosing: boolean;
  onInspect: (card: TileCard) => void;
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
      // Always `filled`. A trophy tile always has a Karta in it, and `empty` is
      // the dashed outline of a *vacant place* — the look the body uses for a
      // slot with nothing on it. Borrowing it to mean "not in this trade" said
      // the wrong thing twice over: dashed reads as "something could go here",
      // and every unpicked Wróg looked like a hole in the shelf.
      //
      // What is and is not being spent is the dimming's job, and it is enough:
      // one signal, not two, and the one that does not collide with a meaning
      // the rest of the card already has.
      tone="filled"
      marks={["trofeum"]}
      // Dimmed only while a trade is being weighed, and only for the ones it
      // would leave. With nothing on offer there is nothing to contrast with.
      dimmed={choosing && !spent}
      onClick={() => onInspect(card)}
    />
  );
}
