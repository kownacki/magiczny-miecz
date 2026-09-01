"use client";

/** Sztuki Złota lying on an Obszar: the pile, and how much of it you are taking (12.1). */

import { useState } from "react";
import { TILE_ART_HEIGHT, TILE_WIDTH } from "@/lib/view/cardImages";
import { clampCoins, stackOverlap } from "@/lib/view/tokens";
import { CoinStack } from "./token-pile";

/**
 * The gold's geometry, fitted to the Karta tile it stands beside.
 *
 * **Fifteen Sztuki Złota take up exactly one Karta's worth of room**: three
 * columns of five, so a glance at an Obszar reads the money against the Karty
 * next to it rather than in a unit of its own. Both halves fall out of that.
 *
 * The width gives the coin. Three across a tile's 86 with the row's own gap
 * twice between them makes each 23, and `gold.png` is square, so that is its
 * height too. (Eighty-five against eighty-six: a pixel is the price of three
 * whole numbers, and it is under rather than over, which is the side to be on.)
 *
 * The height gives the overlap: 23 and four more at 13 is exactly 75, the
 * tile's picture. That is `stackOverlap`, which used to be the only rule and
 * was wrong as one — dividing the room by the coins made the overlap a function
 * of how many there were, and at a 39px coin it left nine pixels of an ingot
 * showing. At 23 it answers 13 where half a coin is 12, so the fitted stack is
 * the *looser* of the two and the shape costs the picture nothing. The test
 * beside it holds that: a fitted overlap under `coinOverlap` means the box is
 * too small for the pile.
 */
// `TILE_GAP.card` is `gap-2`, and a margin cannot be set from a class name.
const GAP = 8;
const PER_STACK = 5;
/** Three columns is what fifteen means; nothing stops a richer square at four. */
const COLUMNS = 3;
const COIN = Math.floor((TILE_WIDTH - (COLUMNS - 1) * GAP) / COLUMNS);
const OVERLAP = stackOverlap(TILE_ART_HEIGHT, COIN, PER_STACK);

/**
 * What is lying here, and the one control that takes it.
 *
 * No "weź" under each coin, the way there is under each Karta, because a coin
 * is not a Karta: they are all the same and the only question is how many.
 * 12.1 makes that the player's — "zabrać leżące złoto", with no amount named,
 * and Talisman's 12:1, the sentence it is adapted from, says *any* Gold
 * Counters may be taken — so the amount is typed, and `weź wszystko` is the
 * shortcut for the answer it almost always is.
 */
export function FieldGold({
  gold,
  canTake,
  busy,
  onTake,
}: {
  gold: number;
  /** 12.1's three conditions, decided by the caller — see `refuseUnlessCollectable`. */
  canTake: boolean;
  busy: boolean;
  onTake: (gold: number) => void;
}) {
  /**
   * What has been typed, already held to what is lying there.
   *
   * Clamped on the way in rather than checked on the way out: asking for 99 off
   * a square holding 6 plainly means all of it, and a disabled button with
   * nothing saying why is the worst answer to a clear request. `clampCoins`
   * owns every case — over, under, fractional, unreadable, empty — and is
   * tested, because "what can be typed into a number field" is a longer list
   * than it looks.
   */
  const [want, setWant] = useState("");
  const asked = Number.parseInt(want, 10);
  const ok = Number.isFinite(asked) && asked >= 1;

  /**
   * The pile, and nothing saying how big it is.
   *
   * There was a "104 Sztuki Złota" beside it, which is the number the Fold's
   * own heading is already carrying two lines above — the same fact twice, and
   * the second one in the place a reader is looking at the coins.
   *
   * And no ceiling on the columns. The rail beside a Karta Postaci stops at
   * three and marks the last coin, because it is a fixed strip that cannot grow;
   * this is inside a panel that scrolls, so the pile simply is as big as it is
   * and wraps. A mark here would say "more than thirty" where the coins
   * themselves say a hundred and four.
   */
  return (
    <div className="flex flex-col gap-2">
      <CoinStack
        count={gold}
        src="/tokens/gold.png"
        size={COIN}
        perStack={PER_STACK}
        overlap={OVERLAP}
        gap={GAP}
      />
      {canTake && (
        /**
         * The same plain underlined word the Karty use for the same act, rather
         * than a bordered button: two boxed controls under a shelf of tiles
         * whose own take is a link made the money look like a different kind of
         * business from the loot beside it, when 12.1 names them in one breath.
         *
         * `weź wszystko` sits under the pair instead of beside it. It is the
         * second reading of one question — "how much?", then "all of it" — and
         * on one line the eye takes the three as three separate controls.
         */
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={gold}
              value={want}
              onChange={(event) => setWant(clampCoins(event.target.value, gold))}
              placeholder="ile"
              aria-label="Ile Sztuk Złota zabrać"
              className="tnum w-14 rounded border border-edge bg-night/40 px-1.5 py-0.5 text-[11px] text-ink"
            />
            <button
              disabled={busy || !ok}
              onClick={() => {
                onTake(asked);
                setWant("");
              }}
              className="text-[9px] text-verdigris underline transition hover:text-ink disabled:text-muted/50 disabled:no-underline"
            >
              weź
            </button>
          </div>
          <button
            disabled={busy}
            onClick={() => {
              onTake(gold);
              setWant("");
            }}
            className="text-[9px] text-verdigris underline transition hover:text-ink disabled:text-muted/50 disabled:no-underline"
          >
            weź wszystko
          </button>
        </div>
      )}
    </div>
  );
}
