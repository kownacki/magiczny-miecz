"use client";

import { useState } from "react";
import spells from "@/data/spells.json";
import type { Spell } from "@/data/types";
import type { TileCard } from "./card-tile";
import { ItemSlot, SLOT_WIDTH } from "./item-slot";
import type { SpellId } from "@/data/ids";
import {
  TARGET_LABEL,
  TIMING_LABEL,
  castableNow,
  spellScript,
  type SpellTiming,
} from "@/lib/engine/spells";

const SPELL_BY_ID = new Map((spells as Spell[]).map((spell) => [spell.id, spell]));

export interface HeldSpell {
  holdingId: string;
  cardId: SpellId;
}

/**
 * The spells in your hand, and the ones you may speak right now.
 *
 * Concealed from everyone else (9.3), so this only ever renders for the seat
 * that holds them. A spell whose card names a window it is not currently in is
 * shown greyed with that window named, rather than hidden: knowing that the
 * Magiczna Wędrówka is waiting for the start of your move is most of what you
 * need to plan a turn around it.
 */
export function SpellHand({
  spells: held,
  moment,
  blocked = null,
  title,
  capacity,
  frame = "panel",
  opponents,
  busy,
  onCast,
  onInspect,
}: {
  spells: HeldSpell[];
  /** Every window the turn is open for right now — a moment can be several. */
  moment: readonly SpellTiming[];
  /** Why nothing can be spoken at this instant, if something cannot. */
  blocked?: string | null;
  /** Shown above the hand. */
  title?: string;
  /**
   * How many the hand may hold (2.6), when the caller knows.
   *
   * Drawn beside the count the way the pack draws 5.4's, because it is the same
   * kind of fact and was the one of the two nobody could see: a player learns
   * their limit by being refused a Zaklęcie they had already decided to take.
   */
  capacity?: number;
  /**
   * Where this is standing.
   *
   * `section` is the seat card, under the pack and reading as part of it —
   * a rule about your hand belongs beside the rule about your pack. `panel` is
   * the fight sheet, where it is a box of its own beside the dice.
   */
  frame?: "panel" | "section";
  /** Other seats, for the spells that need a victim. */
  opponents: { seatIndex: number; name: string }[];
  busy: boolean;
  onCast: (holdingId: string, targetSeat?: number) => void;
  onInspect: (card: TileCard) => void;
}) {
  const [aiming, setAiming] = useState<string | null>(null);
  // An empty hand under the pack is still worth a line, for the same reason an
  // empty pack is drawn: the cap is the thing being said, and "0 / 2" says it.
  // In the fight sheet there is no cap to report and nothing to do, so nothing
  // is drawn.
  if (held.length === 0 && (frame === "panel" || capacity === undefined)) return null;

  /**
   * What can be spoken now, first.
   *
   * A hand is read in the moment it is needed, and in that moment the only
   * question is which of these is live. Card order is the order they happened
   * to arrive in, which answers nothing. The rest keep their places behind,
   * greyed, because 9.1 puts the window on the card and knowing that the
   * Magiczna Wędrówka is waiting for the start of a move is most of what you
   * plan a turn around.
   */
  const live = (entry: HeldSpell) => {
    const script = spellScript(entry.cardId);
    return script ? castableNow(script, moment) : true;
  };
  const hand = [...held].sort((a, b) => Number(live(b)) - Number(live(a)));

  const section = frame === "section";
  // The count against what will fit, exactly as the pack says it — and the same
  // red when there is no room, which is the moment 9.4 starts to bite.
  const tally =
    capacity === undefined ? (
      `(${held.length})`
    ) : (
      <span className={held.length >= capacity ? "text-vermilion" : "text-muted/70"}>
        {held.length} / {capacity}
      </span>
    );

  return (
    <div
      className={
        section
          ? "mt-3 border-t border-edge pt-3"
          : "mt-4 rounded-lg border border-magia/30 bg-panel/60 p-3"
      }
    >
      <h3
        className={`mb-2 text-[11px] uppercase tracking-widest ${
          section ? "text-muted" : "text-magia"
        }`}
      >
        {title ?? (section ? "Zaklęcia" : "Twoje Zaklęcia")} {tally}
      </h3>
      {blocked && <p className="mb-2 text-[11px] text-muted">{blocked}</p>}
      {/* Face up, because they are yours — 9.3 hides them from everyone else,
          not from you, and a hand you cannot see is a hand you cannot plan
          with. */}
      <div className="flex flex-wrap gap-3">
        {hand.map((entry) => {
          const card = SPELL_BY_ID.get(entry.cardId);
          const script = spellScript(entry.cardId);
          const now = script ? castableNow(script, moment) : true;
          const needsVictim =
            script?.target === "postac" || script?.target === "siebie-lub-postac";
          const name = card?.name ?? entry.cardId;

          return (
            // The same square the pack is built from, at the same size. A
            // Zaklęcie and a Przedmiot are both a card you hold, and drawing
            // them at two different sizes in two different frames made the
            // hand read as something from another screen. The picture is the
            // illustration; the whole Karta is a hover away, as everywhere.
            <ItemSlot
              key={entry.holdingId}
              item={{
                holdingId: entry.holdingId,
                cardId: entry.cardId,
                card: { cardId: entry.cardId, name, text: card?.text, kindLabel: "Zaklęcie" },
              }}
              label={name}
              tone="filled"
              dimmed={!now}
              disabled={busy}
              onClick={() =>
                onInspect({ cardId: entry.cardId, name, text: card?.text, kindLabel: "Zaklęcie" })
              }
              // Two clicks on the card speak it — the same gesture that puts
              // a Przedmiot on, for the act that is a hand's equivalent. It
              // goes through the same question the button below does, so a
              // Zaklęcie is never spent by a double-click that missed.
              onDoubleClick={
                now && !busy && !blocked
                  ? () =>
                      needsVictim && opponents.length > 0
                        ? setAiming(entry.holdingId)
                        : onCast(entry.holdingId)
                  : undefined
              }
            >
              {/* When it may be spoken and at what, under the card that says
                  it. Almost every Zaklęcie opens with a clause about its
                  moment — "przed wykonaniem ruchu", "w dowolnej chwili" — and
                  that clause is most of what you need to know while deciding
                  which to hold and which to spend. It used to be a badge on
                  the corner showing the first of them and hiding the rest.
                  Lit when the window is open, so a hand can be read at a
                  glance for what is live. */}
              {script && (
                <div className="text-center leading-tight" style={{ width: SLOT_WIDTH }}>
                  <p className={`text-[10px] ${now ? "text-magia" : "text-muted/60"}`}>
                    {script.timing.map((when) => TIMING_LABEL[when]).join(" / ")}
                  </p>
                  <p className="text-[10px] text-muted/60">{TARGET_LABEL[script.target]}</p>
                </div>
              )}

              {aiming === entry.holdingId && needsVictim ? (
                <div
                  className="flex flex-wrap justify-center gap-1"
                  style={{ width: SLOT_WIDTH }}
                >
                  {opponents.map((seat) => (
                    <button
                      key={seat.seatIndex}
                      disabled={busy || blocked !== null}
                      onClick={() => {
                        onCast(entry.holdingId, seat.seatIndex);
                        setAiming(null);
                      }}
                      className="rounded border border-magia/50 px-1.5 py-0.5 text-[10px] text-ink transition hover:bg-magia/20 disabled:opacity-50"
                    >
                      {seat.name}
                    </button>
                  ))}
                  <button
                    onClick={() => setAiming(null)}
                    className="text-[9px] text-muted underline hover:text-ink"
                  >
                    anuluj
                  </button>
                </div>
              ) : (
                <button
                  disabled={busy || !now || blocked !== null}
                  onClick={() =>
                    needsVictim && opponents.length > 0
                      ? setAiming(entry.holdingId)
                      : onCast(entry.holdingId)
                  }
                  title={
                    now
                      ? script?.effect
                      : `tylko ${script?.timing.map((t) => TIMING_LABEL[t]).join(" / ")}`
                  }
                  style={{ width: SLOT_WIDTH }}
                  className="rounded border border-magia/50 px-2 py-1 text-[11px] text-ink transition hover:bg-magia/20 disabled:opacity-40"
                >
                  {now ? "Rzuć" : "nie teraz"}
                </button>
              )}
            </ItemSlot>
          );
        })}
      </div>
      {/* The app takes the card and tells the table; it does not apply the
          spell. Saying so where the button is means nobody waits for an effect
          that is not coming. */}
      <p className="mt-2 border-t border-edge/60 pt-1 text-[10px] leading-snug text-ochre/70">
        Rzucone Zaklęcie znika z ręki i trafia do dziennika — skutek rozpatrzcie sami.
        Podwójne kliknięcie Karty rzuca ją tak samo jak przycisk.
      </p>
    </div>
  );
}
