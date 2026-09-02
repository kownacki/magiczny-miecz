"use client";

/** Sztuki Złota lying on an Obszar: the pile, and how much of it you are taking (12.1). */

import { useState } from "react";
import { OBSZAR_TILES, TILE_ART_HEIGHT, TILE_GAP_PX, TILE_WIDTH } from "@/lib/view/cardImages";
import { clampCoins, stackOverlap } from "@/lib/view/tokens";
import { CoinStack } from "./token-pile";

/**
 * The gold's geometry, fitted to the Karta tile it stands beside.
 *
 * **Two columns of three fill one tile exactly**, in both directions and with
 * nothing left over: two coins and the row's own gap make 86, and one coin plus
 * two more at their overlap makes 75. So six Sztuki Złota are one Karta's worth
 * of room, and a glance at an Obszar reads the money against the Karty next to
 * it rather than in a unit of its own.
 *
 * Everything here falls out of that. The width gives the coin — 39 — and
 * `gold.png` is square, so that is its height too; the height then gives the
 * overlap, 18, which is what `stackOverlap` is for.
 *
 * Three deep and not five. Five 39px coins fitted to 75 leaves nine pixels of
 * each showing, and at this size that is not a coin but a ruled line — the
 * ingot printed on it disappears. Eighteen leaves nearly half. `tokens.test.ts`
 * holds that as a floor rather than as a comment: a fitted stack has to leave
 * at least a third of every coin, or the box is too small for the pile.
 */
const GAP = TILE_GAP_PX;
/** Columns of coins across one Karta tile. */
const PER_TILE = 2;
const PER_STACK = 3;
const COIN = Math.floor((TILE_WIDTH - (PER_TILE - 1) * GAP) / PER_TILE);
const OVERLAP = stackOverlap(TILE_ART_HEIGHT, COIN, PER_STACK);

/**
 * How wide the panel this sits in is, in Karta tiles.
 *
 * The Obszar's drawer, which is three tiles across by construction — so the
 * count is taken from the same constant the drawer's width is built out of
 * rather than measured back out of a pixel figure. It used to be
 * `tilesAcross(512 - 32)`: the right answer, reached by re-deriving a number
 * that already existed, and stale about which panel it was describing within a
 * day of being written.
 *
 * It is the *caller's* number and not this file's, which is why it is still a
 * prop: this component knows how a pile is drawn and nothing about the box it
 * is drawn in. The default is the one box that draws one today.
 */
const PANEL_TILES = OBSZAR_TILES;

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
  tiles = PANEL_TILES,
}: {
  gold: number;
  /** 12.1's three conditions, decided by the caller — see `refuseUnlessCollectable`. */
  canTake: boolean;
  busy: boolean;
  onTake: (gold: number) => void;
  /**
   * How many Karta tiles the container is wide, which is what the pile may fill
   * before it stops counting.
   *
   * A full row is eighteen — three tiles, six columns, three deep — and
   * eighteen Sztuki Złota is a fortune in this game: a Miecz is one, the most
   * expensive thing the Targowisko sells is three, and a Medyk charges one a
   * wound. Past that the last coin stands down and says so, and the numeral in
   * the heading goes on being exact.
   *
   * A row rather than an arbitrary ceiling, because that is the thing a reader
   * can actually see: the coins stop where the panel does.
   */
  tiles?: number;
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
        maxColumns={tiles * PER_TILE}
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
