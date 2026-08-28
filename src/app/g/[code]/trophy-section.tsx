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
   * Which rule this table plays.
   *
   * It buys one sentence now, and nothing else: both variants hold trophies and
   * trade them the same way, and all this decides is whether to say that the
   * Karty have already gone back to the stos zużytych.
   */
  mode: "points" | "cards";
  busy: boolean;
  /** Absent on somebody else's card: you cash in your own trofea. */
  onTrade?: (swords: number) => void;
  onInspect: (card: TileCard) => void;
}) {
  /** Which trade is being looked at, by count. Null means "the most it buys". */
  const [wanted, setWanted] = useState<number | null>(null);
  /**
   * Open to start with, like the pack and the Zaklęcia it stands beside.
   *
   * `Fold` reads a missing `onToggle` as "this section does not fold", which is
   * what this was: a heading with a triangle's worth of nothing beside it. The
   * tally is what makes folding it cheap — „14 pkt · 2 punkty Miecza" stays on
   * the bar when the row is shut, so what a player checks trofea for is legible
   * without opening them.
   */
  const [showing, setShowing] = useState(true);

  const byPoints = mode === "points";
  const held = seat.holdings.filter((one) => one.kind === "trophy");
  /** Everyone beaten, and which of them are still held. */
  const shelf = shelfFor(seat.trophy_beaten ?? [], held.map((one) => one.cardId));
  const gone = shelf.filter((one) => one.gone);
  const counting = held.reduce((sum, one) => sum + trophyValue(one.cardId), 0);

  /**
   * Every trade this hand can make, each by its cheapest set — the engine's
   * answer, not a second opinion computed here.
   *
   * One list for both variants, because there is one trade. „Punkty" used to
   * be a pool converted in sevens, and had its own branch here and a notional
   * trophy standing in for the total; it is not a pool. It holds trophies like
   * the printed rule and differs only in where the cardboard is, so the choice,
   * the rate and the waste are all this function's, in both.
   */
  const offers: Offer[] = offersFor(
    held.map((one) => ({ cardId: one.cardId, points: trophyValue(one.cardId) })),
  );

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
  for (const cardId of offer?.cardIds ?? []) {
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
                key={`${one.cardId}-${at}`}
                cardId={one.cardId}
                gone={one.gone}
                inTrade={!one.gone && takes(one.cardId)}
                onInspect={onInspect}
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
               the stos zużytych when he fell, so 9.5 can deal him to somebody
               else while you are still holding him here. */
            <p className="text-[11px] leading-snug text-muted/70">
              <Rules>
                Karty pokonanych Wrogów wróciły na stos zużytych — trofea
                zostają u ciebie (1.4, 9.5).
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

              {offer && <Ledger offer={offer} total={counting} />}

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
 * to wait, so it is named, and named as a loss because it is one in both
 * variants: „punkty ponad wielokrotność 7 są stracone" does not ask where the
 * cardboard is. What is *not* handed in is a different number and stays yours,
 * which is why the two are printed apart.
 *
 * This used to take a `keepsRest` flag, for a „Punkty" that kept the remainder
 * of a pool. There is no pool — see docs/TROFEA.md.
 */
function Ledger({ offer, total }: { offer: Offer; total: number }) {
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
        <span className="text-muted/70">, reszta zostaje u ciebie</span>
      )}
    </p>
  );
}

/** One beaten Wróg, with what he is worth printed where a name goes. */
function TrophyTile({
  cardId,
  gone,
  inTrade,
  onInspect,
}: {
  cardId: string;
  /** Beaten, and no longer held: traded away (1.4) or put down. */
  gone: boolean;
  /** The trade being weighed would hand this one in. */
  inTrade: boolean;
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
      // The cup is what says a Wróg can still be spent, so it goes with him
      // when he is. Position and fade both say the same thing from across the
      // row; this is the one that survives being looked at directly.
      marks={gone ? [] : ["trofeum"]}
      onClick={() => onInspect(card)}
    />
  );
}
