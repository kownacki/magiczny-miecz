"use client";

import { useEffect, useState } from "react";
import { DrawSheet, type SheetChrome } from "./draw-sheet";
import { FightControls } from "./fight-controls";
import { SpellHand, type HeldSpell } from "./spell-hand";
import type { TileCard } from "./card-tile";
import type { OnAction, Simulated } from "./turn-controls";
import { cardImageUrl } from "@/lib/view/cardImages";
import { castableNow, spellScript, type SpellTiming } from "@/lib/engine/spells";
import type { Fight } from "@/lib/engine/turn";

/**
 * The fight, and everybody's hand beside it: what is happening, and what the
 * people watching it are holding while it happens.
 */

/** Who has claimed the moment before the dice (17.3), and until when. */
export interface SpellFloor {
  seat: number;
  until: number;
}

/**
 * A fight owns the sheet for as long as it lasts.
 *
 * You cannot change your equipment mid-fight — 17.3 puts the spells before the
 * dice and 17.4 gives you one weapon — so there is nothing behind this worth
 * reaching for, and the two dice are the only thing anyone at the table is
 * looking at.
 */
export function FightSheet({
  who,
  chrome,
  fight,
  simulated,
  busy,
  myEscape,
  onAction,
  spells,
  moment,
  opponents,
  floor,
  mySeatIndex,
  seatName,
  onClaimFloor,
  onReleaseFloor,
  onCastSpell,
  onInspect,
}: {
  who: string;
  chrome: SheetChrome;
  /** The fight in progress, which is fought here rather than behind the sheet. */
  fight: Fight;
  simulated: Simulated;
  busy: boolean;
  /**
   * Whether this device is the character being attacked in a duel (17.6).
   *
   * A fight has two sides, and both of the decisions taken before the dice — a
   * Zaklęcie, and whether to run — belong to whichever side the rule names, not
   * to whoever happens to be having their turn.
   */
  myEscape: boolean;
  onAction: OnAction;
  /**
   * This device's own hand, and everything a fight needs to let it speak.
   *
   * Shown to whoever is looking, fighting or watching: a Zaklęcie that says
   * "w dowolnej chwili" belongs to its holder wherever they are sitting, and
   * thirteen of the twenty-seven say exactly that.
   */
  spells: HeldSpell[];
  moment: readonly SpellTiming[];
  opponents: { seatIndex: number; name: string }[];
  floor: SpellFloor | null;
  mySeatIndex: number | null;
  seatName: (index: number) => string;
  onClaimFloor: () => void;
  onReleaseFloor: () => void;
  onCastSpell: (
    holdingId: string,
    target: { seatIndex?: number; fieldCardId?: string },
  ) => void;
  onInspect: (card: TileCard) => void;
}) {
  /**
   * The one clock the sheet keeps.
   *
   * A claim lapses by time, not by anybody writing it down, so every part of
   * the fight that cares — the dice, the cast buttons, the box itself — has to
   * agree on the moment it stops counting. Held once here and passed down: with
   * the countdown inside the box, the box went back to "Chcę rzucić" while the
   * dice stayed held, because nothing else had noticed the second go by.
   *
   * The number is a courtesy and the deadline is a fact: the server checks it
   * again, so two devices with different clocks cannot disagree about who may
   * speak.
   */
  const until = floor?.until ?? null;
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (until === null) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    // The first one a beat late rather than in the effect's own body, and the
    // rest on the interval: reading the clock while rendering is not allowed to
    // be a pure function of anything, and setting state as an effect runs is
    // the cascade the same rule is there to stop.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [until]);
  const held = floor !== null && left > 0 ? floor : null;

  return (
    <DrawSheet
      {...chrome}
      label={fight.cardName}
      art={cardImageUrl(fight.cardId.split("+")[0])}
      granted={fight.granted === true}
      watching={`${who} walczy`}
      wide
    >
      {/* Two columns inside the sheet: what is happening, and what you are
          holding while it happens. */}
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {chrome.canAct ? (
            <FightControls
              fight={fight}
              simulated={simulated}
              busy={busy}
              floorHeld={held !== null}
              // A duel's escape is the other player's (17.6) — except on the
              // shared screen, which acts for whoever is fleeing and so keeps it.
              canFlee={fight.opponentSeat === undefined || myEscape}
              onAction={onAction}
            />
          ) : (
            <>
              <WatchFight fight={fight} />
              {myEscape && fight.playerRoll === null && fight.enemyRoll === null && (
                <div className="rounded border border-ochre/50 bg-ochre/5 p-3">
                  <p className="text-xs text-ink">
                    Zaatakowano cię. Możesz spróbować się wymknąć, zanim padną
                    kostki (17.6) — udaje się to dzięki Charakterystyce albo
                    Zaklęciu Krąg Płomieni (19.1).
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {simulated ? (
                      <button
                        disabled={busy}
                        onClick={() => onAction({ action: "escape" })}
                        className="rounded border border-edge px-3 py-1 text-xs text-ink transition hover:border-ochre disabled:opacity-50"
                      >
                        Spróbuj się wymknąć (19.1)
                      </button>
                    ) : (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => onAction({ action: "escape", succeeded: true })}
                          className="rounded border border-edge px-3 py-1 text-xs text-ink transition hover:border-ochre disabled:opacity-50"
                        >
                          Wymknąłem się (19.1)
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => onAction({ action: "escape", succeeded: false })}
                          className="rounded border border-edge px-3 py-1 text-xs text-muted transition hover:border-vermilion disabled:opacity-50"
                        >
                          Próba nieudana
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Everybody's hand, beside everybody's fight. 17.3 puts a fighter's
            spells before their own roll, 17.7 gives a duel's other side the
            same, and the thirteen cards that say "w dowolnej chwili" give it to
            the rest of the table — so this is the same panel whoever reads it,
            and the only thing that differs is whose hand is in it. */}
        <aside className="flex w-[290px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-edge/60 pl-3">
          <SpellFloorControl
            floor={held}
            left={left}
            mySeatIndex={mySeatIndex}
            seatName={seatName}
            canClaim={
              !fight.result &&
              spells.some((entry) => {
                const script = spellScript(entry.cardId);
                return script ? castableNow(script, moment) : true;
              })
            }
            busy={busy}
            onClaim={onClaimFloor}
            onRelease={onReleaseFloor}
          />
          <SpellHand
            spells={spells}
            moment={moment}
            blocked={
              held === null
                ? "Najpierw zgłoś, że chcesz rzucić."
                : held.seat === mySeatIndex
                  ? null
                  : `Teraz rzuca ${seatName(held.seat)}.`
            }
            opponents={opponents}
            busy={busy}
            onCast={onCastSpell}
            onInspect={onInspect}
          />
        </aside>
      </div>
    </DrawSheet>
  );
}

/**
 * Asking for the moment before the dice, and the half-minute it buys.
 *
 * The race is the button, not the casting. Everybody at the table sees the same
 * one and it is live for anybody holding something they could speak (17.3,
 * 17.7, and the thirteen cards that say "w dowolnej chwili") — so pressing it
 * is the tell, the way reaching for a card is at a table, and nobody is named
 * in advance the way a poll would name them (9.3).
 *
 * The clock is a house rule; the rulebook has none, only "before the roll". It
 * is there so a fight cannot hang on somebody who has left the room, and it is
 * generous enough not to be a test of reflexes: the hard part was getting the
 * floor, and reading a hand afterwards is not a race.
 */
function SpellFloorControl({
  floor,
  left,
  mySeatIndex,
  seatName,
  canClaim,
  busy,
  onClaim,
  onRelease,
}: {
  /** Live only: a lapsed claim is nobody's, and reaches here as null. */
  floor: SpellFloor | null;
  /** Seconds still on it, counted by the one clock the fight keeps. */
  left: number;
  mySeatIndex: number | null;
  seatName: (index: number) => string;
  /** Whether this device is holding anything it could speak right now. */
  canClaim: boolean;
  busy: boolean;
  onClaim: () => void;
  onRelease: () => void;
}) {
  const mine = floor !== null && floor.seat === mySeatIndex;
  const held = floor !== null;

  return (
    <div className="rounded border border-magia/40 bg-magia/5 p-2">
      {held ? (
        <>
          <p className="text-[11px] text-ink">
            {mine ? "Rzucasz Zaklęcie" : `${seatName(floor.seat)} rzuca Zaklęcie`}{" "}
            — <span className="tnum text-magia">{left}s</span>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">
            {mine ? "Kostki czekają na ciebie." : "Kostki i pozostali czekają."}
          </p>
          {mine && (
            <button
              disabled={busy}
              onClick={onRelease}
              className="mt-1.5 rounded border border-edge px-2 py-0.5 text-[11px] text-muted transition hover:border-ochre hover:text-ink disabled:opacity-50"
            >
              Jednak nie rzucam
            </button>
          )}
        </>
      ) : (
        <>
          <button
            disabled={busy || !canClaim}
            onClick={onClaim}
            title={
              canClaim
                ? "Zgłoś się przed rzutem kostką (17.3) — dostaniesz 30 sekund"
                : "Nie masz Zaklęcia, które można teraz rzucić"
            }
            className="rounded border border-magia/60 bg-magia/10 px-2 py-1 text-[11px] text-ink transition hover:bg-magia/20 disabled:opacity-40"
          >
            Chcę rzucić Zaklęcie
          </button>
          <p className="mt-1 text-[10px] text-muted">
            Kto pierwszy się zgłosi, ten rzuca — 30 sekund, potem kostki idą
            dalej.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * A fight somebody else is having.
 *
 * The same two numbers, with nothing to press. It exists because a fight is the
 * moment the game is most worth looking at, and it used to happen entirely
 * inside one person's browser — everybody else read about it in the journal
 * afterwards, which is not the same as watching the second die land.
 */
function WatchFight({ fight }: { fight: Fight }) {
  const label = fight.kind === "magical" ? "Magia" : "Miecz";
  const side = (title: string, total: number, roll: number | null) => (
    <div className="rounded border border-edge bg-night p-3">
      <p className="mb-2 truncate text-xs uppercase tracking-wide text-muted">
        {title}
      </p>
      <p className="flex items-baseline gap-2">
        <span className="tnum text-2xl text-ink">{total}</span>
        <span className="text-xs text-muted">{label}</span>
      </p>
      <p className="tnum mt-3 text-sm text-muted">
        {roll === null ? (
          "czeka na rzut…"
        ) : (
          <>
            rzut <span className="text-ink">{roll}</span> — razem{" "}
            <span className="text-ochre">{total + roll}</span>
          </>
        )}
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* The name is in the sheet's header; this says what kind of fight it
          is, which is the part the header cannot carry. */}
      <p className="text-sm text-muted">
        {fight.kind === "magical" ? "Walka magiczna" : "Walka zwykła"}
      </p>
      <div className="grid grid-cols-2 gap-4">
        {side("Postać", fight.playerTotal, fight.playerRoll)}
        {side(fight.cardName, fight.enemyTotal, fight.enemyRoll)}
      </div>
      {fight.result && (
        <p className="rounded border border-edge bg-night p-3 text-sm text-ink">
          {fight.result.outcome === "wygrana"
            ? "Wygrana."
            : fight.result.outcome === "remis"
              ? "Remis — nikt nic nie traci (17.10)."
              : "Przegrana."}
        </p>
      )}
    </div>
  );
}
