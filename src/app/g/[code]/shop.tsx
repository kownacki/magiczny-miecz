"use client";

/** A shelf you can buy off: the Osada's Płatnerz, and the TARGOWISKO that settled on a square (21.1, 21.2). */

import { goodsId } from "@/lib/engine/goods";
import { cardName } from "@/lib/engine/polish";
import { whyPackIsFull } from "@/lib/engine/holdings";
import type { Holding } from "@/lib/engine/state";
import type { Effect } from "@/lib/engine/cardScript";
import type { CardId } from "@/data/ids";
import { CardTile } from "./card-tile";
import { TileRow } from "./tile-row";
import { tileFor } from "./table";
import type { Confirmation } from "./confirm";
import type { EqMode } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";
import type { OnService } from "./turn-controls";

/**
 * The shop, as a shelf of cards.
 *
 * A price list is what the board prints, but what you walk away with is a piece
 * of card — so the goods are drawn the way every other card in this app is
 * drawn: the illustration at tile size, the name under it, the whole Karta one
 * hover away. It is the same row the Obszar's own Karty sit in two taps back,
 * with `kup` where `weź` is, because buying something off a shelf and picking
 * something up off the ground are the same gesture with a price on one of them.
 *
 * The price rides in the tile's `badge`, which is what that was built for — "a
 * short flag drawn over the corner — a price, a count".
 *
 * Nothing here decides what anything costs. The buttons say which card; the
 * server reads the price off the same board (`buyGoods`), and this draws the
 * same number only so the player can see it before spending.
 */
export function Shop({
  effect,
  gold,
  stock,
  pack,
  /**
   * Null while the shop is open to you; the rule that shuts it, when it is not.
   *
   * Read here only to grey the prices. The sentence itself is said once at the
   * top of the offer (`FieldService`), because it is a fact about the whole
   * visit rather than about this shelf.
   */
  blocked,
  busy,
  eqMode,
  nature,
  onInspect,
  onAsk,
  onService,
}: {
  effect: Extract<Effect, { op: "kup" }>;
  gold: number;
  /** How many of each Wyposażenie card are left in the box (21.2). */
  stock?: Record<string, number>;
  /**
   * What the buyer is holding and how much room 5.4 leaves them.
   *
   * Asked per good rather than once for the shelf, because in slotowy a full
   * Plecak does not stop a Hełm reaching an empty head — see `whyPackIsFull`.
   */
  pack?: { holdings: readonly Holding[]; carried: number; limit: number; eqMode: EqMode };
  blocked: string | null;
  busy: boolean;
  eqMode?: EqMode;
  nature?: Nature | null;
  onInspect: (cardId: CardId) => void;
  /** Spending is irreversible, so it is asked first — see `askToBuy`. */
  onAsk: (ask: Confirmation) => void;
  /** Absent on an Obszar being read about rather than stood on, where `blocked` already says so. */
  onService?: OnService;
}) {
  return (
    <div className="flex flex-col gap-2">

      <TileRow frame={false}>
        {effect.towar.map((towar) => {
          const cardId = goodsId(towar.co);
          // 21.2: a shop with none left is not offering it. Said plainly rather
          // than hidden, because "nieosiągalny" is information the table wants.
          const left = cardId && stock ? (stock[cardId] ?? Infinity) : Infinity;
          const gone = left <= 0;
          const poor = gold < towar.cena;
          // 5.4, asked of this card: in slotowy a Hełm goes on your head and a
          // full Plecak has nothing to say about it.
          const full =
            cardId && pack
              ? whyPackIsFull(
                  { cardId, kind: "item", eqMode: pack.eqMode, nature: nature ?? null },
                  pack.holdings,
                  { carried: pack.carried, limit: pack.limit },
                )
              : null;
          const can = !!cardId && !gone && !poor && full === null && blocked === null;

          return (
            <CardTile
              key={towar.co}
              card={{
                ...(cardId
                  ? tileFor({ cardId, granted: false })
                  : { cardId: towar.co, name: towar.co }),
                holdable: true,
              }}
              badge={`${towar.cena} Sz. Z.`}
              /* Greyed where it cannot be had, the same way a Karta whose take
                 is out greys where it lies. The reason is under the tile. */
              dimmed={gone || poor}
              eqMode={eqMode}
              nature={nature}
              onClick={cardId ? () => onInspect(cardId) : undefined}
            >
              {can ? (
                <button
                  disabled={busy}
                  onClick={() => askToBuy({ cardId: cardId!, cena: towar.cena, gold, onAsk, onService })}
                  /* The same control as „weź" on the Obszar's own shelf, and
                     deliberately: one gesture, learnt once. */
                  className="text-[9px] text-verdigris underline transition hover:text-ink disabled:text-muted/50 disabled:no-underline"
                >
                  kup
                </button>
              ) : gone || poor || full ? (
                /**
                 * Why *this* one cannot be had, where the reason is this one's.
                 *
                 * Nothing at all when the shop itself is shut — 12.1a's Wróg,
                 * 13.1's window — because that is said once above the shelf and
                 * repeating it under every tile is the same sentence three
                 * times in a row. An em dash there was worse than repetition:
                 * it looked like a price the app had failed to work out. The
                 * Obszar's own Karty already do this, where "weź" is simply
                 * absent on a turn you may not take.
                 */
                <span
                  className="text-[9px] text-muted/70"
                  /* The whole sentence on the hover: the tile has room for two
                     words and 5.4's refusal is an instruction. */
                  title={full ?? undefined}
                >
                  {gone ? "brak (21.2)" : poor ? "za drogo" : "pełny plecak"}
                </span>
              ) : null}
            </CardTile>
          );
        })}
      </TileRow>
    </div>
  );
}

/**
 * Asks before the coins go, because they do not come back.
 *
 * The same dialog dropping a Przedmiot and using a card go through, and for a
 * sharper reason than either: 21.2 puts the card back on its pile when you sell
 * or lose it, but the Sztuki Złota you paid are simply gone, and a misclick on
 * a Łódź is three of them on an Obszar where nothing else can be bought.
 *
 * The question says what is left afterwards, which is the part the player is
 * actually deciding and the button cannot say.
 */
function askToBuy({
  cardId,
  cena,
  gold,
  onAsk,
  onService,
}: {
  cardId: string;
  cena: number;
  gold: number;
  onAsk: (ask: Confirmation) => void;
  onService?: OnService;
}) {
  const name = cardName(cardId);
  onAsk({
    title: `Kup: ${name}`,
    body: `${name} kosztuje ${cena} ${cena === 1 ? "Sztukę" : cena < 5 ? "Sztuki" : "Sztuk"} Złota. Zostanie ci ${gold - cena} z ${gold}.`,
    confirmLabel: "Kup",
    onConfirm: () => onService?.({ action: "buy", cardId }),
  });
}
