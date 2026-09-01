"use client";

/** Sztuki Złota lying on an Obszar: the pile, and how much of it you are taking (12.1). */

import { useState } from "react";
import { TILE_WIDTH } from "@/lib/view/cardImages";
import { CoinStack } from "./token-pile";

/**
 * The gold's geometry, derived from the Karta tile it stands beside.
 *
 * The width is the tile's: `gold.png` is square — 101 by 101 — so two coins and
 * the gap between them fill 86, which makes each 39, and ten of them read as a
 * pile against the Karty next to it rather than in a unit of their own.
 *
 * The height is nobody's. It used to be the tile's too, on the arithmetic that
 * ten Sztuki Złota should take exactly one Karta's worth of room — and fitting
 * five coins into 75 pixels left nine of each showing, which at this size is
 * not a coin but a ruled line. Coins overlap by half of themselves now,
 * wherever they are drawn (`coinOverlap`), which is the proportion the purse
 * beside a Karta Postaci has always used. So the stack is as tall as it is, and
 * what makes the two piles look like the same object is that they are drawn the
 * same way rather than fitted to the same box.
 */
// `TILE_GAP.card` is `gap-2`, and a margin cannot be set from a class name.
const GAP = 8;
const COIN = Math.floor((TILE_WIDTH - GAP) / 2);
const PER_STACK = 5;

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
  const [want, setWant] = useState("");

  const asked = Number.parseInt(want, 10);
  const ok = Number.isFinite(asked) && asked >= 1 && asked <= gold;

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
      <CoinStack count={gold} src="/tokens/gold.png" size={COIN} perStack={PER_STACK} gap={GAP} />
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
              onChange={(event) => setWant(event.target.value)}
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
