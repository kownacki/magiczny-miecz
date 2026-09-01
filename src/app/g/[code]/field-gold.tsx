"use client";

/** Sztuki Złota lying on an Obszar: the pile, and how much of it you are taking (12.1). */

import { useState } from "react";
import { TILE_WIDTH } from "@/lib/view/cardImages";
import { CoinStack } from "./token-pile";
import { plural } from "@/lib/engine/polish";

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
 * Two stacks and no more, which is the ceiling the rail's own gold has for the
 * same reason: past ten the pile stops growing, the mark on the last coin says
 * so, and the numeral beside it goes on being exact. The coins are all ones, so
 * the picture was only ever an impression of how much is lying here.
 *
 * A third column would say more and cost what the first two bought: at 39 a
 * coin it would be 133 wide against a Karta's 86, and a pile wider than the
 * cards beside it is not being read against them any more.
 */
const STACKS_MAX = 2;

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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <CoinStack
          count={gold}
          src="/tokens/gold.png"
          size={COIN}
          perStack={PER_STACK}
          maxColumns={STACKS_MAX}
          gap={GAP}
        />
        <p className="text-xs text-muted">
          <span className="tnum text-zloto">{gold}</span>{" "}
          {plural(gold, "Sztuka Złota", "Sztuki Złota", "Sztuk Złota")}
        </p>
      </div>
      {canTake && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={gold}
            value={want}
            onChange={(event) => setWant(event.target.value)}
            placeholder="ile"
            aria-label="Ile Sztuk Złota zabrać"
            className="tnum w-16 rounded border border-edge bg-night/40 px-2 py-1 text-xs text-ink"
          />
          <button
            disabled={busy || !ok}
            onClick={() => {
              onTake(asked);
              setWant("");
            }}
            className="rounded border border-verdigris/60 px-2 py-1 text-[11px] text-verdigris transition hover:border-verdigris disabled:border-edge disabled:text-muted/50"
          >
            weź
          </button>
          <button
            disabled={busy}
            onClick={() => {
              onTake(gold);
              setWant("");
            }}
            className="rounded border border-edge px-2 py-1 text-[11px] text-muted transition hover:border-ochre/70 hover:text-ochre disabled:opacity-40"
          >
            weź wszystko
          </button>
        </div>
      )}
    </div>
  );
}
