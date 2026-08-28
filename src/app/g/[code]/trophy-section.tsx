"use client";

/** Trofea (1.4): what you beat, what it is worth, and what a trade would waste. */

import { useState } from "react";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import { combatValueOf } from "@/lib/engine/cards";
import { Fold } from "./fold";
import { ItemSlot } from "./item-slot";
import { CARD_NAMES, tileFor, type Held, type Seat } from "./table";
import type { TileCard } from "./card-tile";

const EVENTS = events as EventCard[];

/** 1.4: one point of Miecz for every seven points of beaten Wrogowie. */
const RATE = 7;

/**
 * What one beaten Wróg is worth, by the number printed on his Karta.
 *
 * Read here rather than sent, because the browser already holds the card id and
 * `combatValueOf` is the same function the engine prices trophies with — so the
 * ledger below and `tradeTrophies` cannot disagree about what a Cyklop is worth.
 *
 * Zero for anything that is not a foe with a Miecz. Since `dd74cba` only those
 * become trophies at all — a Demon is fought magically, beaten and gone — so
 * this should never fire; it is here so that a stray holding cannot silently
 * inflate somebody's total.
 */
export function trophyValue(cardId: string): number {
  const card = EVENTS.find((one) => one.id === cardId);
  const worth = card ? combatValueOf(card) : null;
  return worth?.kind === "ordinary" ? worth.total : 0;
}

/**
 * The trofea a character is carrying, and the arithmetic that decides when to
 * cash them.
 *
 * They used to be drawn inside the Plecak, dimmed, with a `trofeum` mark — in
 * the row of squares that 5.4's four are drawn as. `carriedCount` has only ever
 * counted `kind === "item"`, so a trophy never occupied one of those four; the
 * picture said it did. The same category error the Przyjaciele had, and the same
 * fix: a section of its own.
 *
 * The heading carries the ledger because the ledger *is* the decision. 1.4 lets
 * you exchange "w dowolnym momencie" and says "punkty ponad wielokrotność 7 są
 * stracone", so the only real question a player has is whether to trade now or
 * wait — and the button used to read "Wymień trofea na punkty Miecza (1.4)" with
 * no numbers anywhere near it.
 *
 * Two modes, and the section is the same object in both:
 *
 * - **Karty pokonanych** — the Karty are held, so they are shown and picked
 *   between. Michał ruled the subset reading, so the trade takes exactly what
 *   you select.
 * - **Punkty** — the Karta went to the stos zużytych when the Wróg died and the
 *   seat carries a running total. Nothing to select; the ledger is the whole of
 *   it.
 */
export function TrophySection({
  seat,
  isMine,
  points,
  busy,
  onTrade,
  onInspect,
}: {
  seat: Seat;
  isMine: boolean;
  /**
   * The running total in „Punkty" mode, or undefined in „Karty pokonanych".
   *
   * Undefined is the signal, not a separate flag: in the printed mode there is
   * no total to send because the Karty are the total, and the browser adds them
   * up itself. When the engine lands the variant this arrives from the seat and
   * the cards do not.
   */
  points?: number;
  busy: boolean;
  /** Absent on somebody else's card: you cash in your own trofea. */
  onTrade?: (cardIds: string[]) => void;
  onInspect: (card: TileCard) => void;
}) {
  const held = seat.holdings.filter((one) => one.kind === "trophy");
  const [picked, setPicked] = useState<string[]>([]);

  const counting = points ?? held.reduce((sum, one) => sum + trophyValue(one.cardId), 0);
  // What the trade would actually hand in: the chosen Karty, or everything when
  // nothing is chosen — the same rule the command uses for an absent list.
  const chosen = held.filter((one) => picked.includes(one.id));
  const offering = points ?? (chosen.length > 0 ? sum(chosen) : counting);
  const swords = Math.floor(offering / RATE);
  const wasted = offering - swords * RATE;

  // Somebody else's empty shelf is not worth a row; your own is, because it is
  // where the count appears the moment you win a fight.
  if (!isMine && held.length === 0 && !points) return null;

  return (
    <Fold
      title="Trofea"
      tally={
        <span className={swords > 0 ? "text-ochre" : undefined}>
          {counting} pkt{swords > 0 ? ` · ${swords} Miecz${swords > 1 ? "a" : ""}` : ""}
        </span>
      }
    >
      {counting === 0 ? (
        <p className="p-1 text-[11px] leading-snug text-muted">
          Nikogo jeszcze nie pokonałeś. Za każde {RATE} punktów Miecza pokonanych Wrogów
          dostaniesz 1 punkt Miecza (1.4).
        </p>
      ) : (
        <div className="flex flex-col gap-2 p-1">
          {/* The Karty, only where there are Karty. In „Punkty" the Wróg went to
              the stos zużytych as he died and there is nothing to draw. */}
          {held.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {held.map((one) => (
                <TrophyTile
                  key={one.id}
                  held={one}
                  picked={picked.includes(one.id)}
                  choosable={isMine && onTrade !== undefined}
                  onPick={() =>
                    setPicked((was) =>
                      was.includes(one.id)
                        ? was.filter((id) => id !== one.id)
                        : [...was, one.id],
                    )
                  }
                  onInspect={onInspect}
                />
              ))}
            </div>
          )}

          <Ledger
            offering={offering}
            swords={swords}
            wasted={wasted}
            picking={chosen.length > 0}
            total={counting}
          />

          {isMine && onTrade && (
            <button
              type="button"
              disabled={busy || swords < 1}
              onClick={() => {
                onTrade(chosen.map((one) => one.cardId));
                setPicked([]);
              }}
              title={
                swords < 1
                  ? `Potrzeba ${RATE} punktów — masz ${offering}`
                  : undefined
              }
              className="rounded border border-edge px-2 py-1.5 text-left text-xs text-ink transition hover:border-ochre disabled:opacity-50"
            >
              {swords < 1
                ? `Za mało na Miecz — ${offering} z ${RATE}`
                : `Wymień ${offering} pkt na ${swords} ${swords === 1 ? "punkt" : "punkty"} Miecza` +
                  (wasted > 0 ? ` (${wasted} przepadnie)` : "")}
            </button>
          )}
        </div>
      )}
    </Fold>
  );
}

function sum(cards: readonly Held[]): number {
  return cards.reduce((total, one) => total + trophyValue(one.cardId), 0);
}

/**
 * The arithmetic, said in words rather than left to the reader.
 *
 * Three numbers and only two of them are obvious. What you hold and what it buys
 * are plain; what a trade *right now* would burn is the one that decides whether
 * to wait, and it is the one 1.4 hides in a subordinate clause.
 */
function Ledger({
  offering,
  swords,
  wasted,
  picking,
  total,
}: {
  offering: number;
  swords: number;
  wasted: number;
  picking: boolean;
  total: number;
}) {
  const toNext = RATE - (offering % RATE);
  return (
    <p className="text-[11px] leading-snug text-muted">
      {picking ? `Wybrane: ${offering} z ${total} pkt` : `${total} pkt`}
      {swords > 0 && (
        <>
          {" — "}
          <span className="text-ochre">
            {swords} {swords === 1 ? "punkt" : "punkty"} Miecza
          </span>
        </>
      )}
      {wasted > 0 && (
        <>
          {", "}
          <span className="text-vermilion/90">{wasted} przepadnie</span>
          {/* The useful half of the warning: not that you would lose six, but
              that two more points would save them. */}
          <span className="text-muted/70">
            {" "}
            — jeszcze {toNext} i nie przepadnie nic
          </span>
        </>
      )}
    </p>
  );
}

/** One beaten Wróg, with what he is worth printed where a name goes. */
function TrophyTile({
  held,
  picked,
  choosable,
  onPick,
  onInspect,
}: {
  held: Held;
  picked: boolean;
  choosable: boolean;
  onPick: () => void;
  onInspect: (card: TileCard) => void;
}) {
  const worth = trophyValue(held.cardId);
  const name = CARD_NAMES.get(held.cardId) ?? held.cardId;
  return (
    <ItemSlot
      item={{
        holdingId: held.id,
        cardId: held.cardId,
        card: tileFor(held),
        granted: held.granted,
        inert: false,
      }}
      // The number is the point of the tile. A trophy's name is a memory and its
      // Miecz is the currency, and the currency is what the choice is made on.
      label={`${name} · ${worth}`}
      eqMode="classic"
      tone={picked ? "filled" : "empty"}
      marks={["trofeum"]}
      // Picked reads as lit rather than as dimmed: choosing is the ordinary act
      // here, and the unchosen are what stays behind.
      dimmed={choosable && !picked}
      onClick={() => (choosable ? onPick() : onInspect(tileFor(held)))}
    />
  );
}
