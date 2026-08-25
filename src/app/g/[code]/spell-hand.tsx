"use client";

import { useState } from "react";
import spells from "@/data/spells.json";
import type { Spell } from "@/data/types";
import { CardTile, type TileCard } from "./card-tile";
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
  opponents,
  busy,
  onCast,
  onInspect,
}: {
  spells: HeldSpell[];
  /** Every window the turn is open for right now — a moment can be several. */
  moment: readonly SpellTiming[];
  /** Other seats, for the spells that need a victim. */
  opponents: { seatIndex: number; name: string }[];
  busy: boolean;
  onCast: (holdingId: string, targetSeat?: number) => void;
  onInspect: (card: TileCard) => void;
}) {
  const [aiming, setAiming] = useState<string | null>(null);
  if (held.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-magia/30 bg-panel/60 p-3">
      <h3 className="mb-2 text-[11px] uppercase tracking-widest text-magia">
        Twoje Zaklęcia ({held.length})
      </h3>
      {/* Face up, because they are yours — 9.3 hides them from everyone else,
          not from you, and a hand you cannot see is a hand you cannot plan
          with. */}
      <div className="flex flex-wrap gap-3">
        {held.map((entry) => {
          const card = SPELL_BY_ID.get(entry.cardId);
          const script = spellScript(entry.cardId);
          const now = script ? castableNow(script, moment) : true;
          const needsVictim =
            script?.target === "postac" || script?.target === "siebie-lub-postac";
          const name = card?.name ?? entry.cardId;

          return (
            <div key={entry.holdingId} className="flex flex-col items-center gap-1">
              <CardTile
                card={{ cardId: entry.cardId, name, text: card?.text, kindLabel: "Zaklęcie" }}
                size="md"
                dimmed={!now}
                onClick={() => onInspect({ cardId: entry.cardId, name, text: card?.text, kindLabel: "Zaklęcie" })}
                // Two clicks on the card speak it — the same gesture that puts
                // a Przedmiot on, for the act that is a hand's equivalent. It
                // goes through the same question the button below does, so a
                // Zaklęcie is never spent by a double-click that missed.
                onDoubleClick={
                  now && !busy
                    ? () =>
                        needsVictim && opponents.length > 0
                          ? setAiming(entry.holdingId)
                          : onCast(entry.holdingId)
                    : undefined
                }
              />

              {/* When it may be spoken and at what, under the card that says
                  it. Almost every Zaklęcie opens with a clause about its
                  moment — "przed wykonaniem ruchu", "w dowolnej chwili" — and
                  that clause is most of what you need to know while deciding
                  which to hold and which to spend. It used to be a badge on
                  the corner showing the first of them and hiding the rest.
                  Lit when the window is open, so a hand can be read at a
                  glance for what is live. */}
              {script && (
                <div className="w-[132px] text-center leading-tight">
                  <p className={`text-[10px] ${now ? "text-magia" : "text-muted/60"}`}>
                    {script.timing.map((when) => TIMING_LABEL[when]).join(" / ")}
                  </p>
                  <p className="text-[10px] text-muted/60">{TARGET_LABEL[script.target]}</p>
                </div>
              )}

              {aiming === entry.holdingId && needsVictim ? (
                <div className="flex w-[132px] flex-wrap justify-center gap-1">
                  {opponents.map((seat) => (
                    <button
                      key={seat.seatIndex}
                      disabled={busy}
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
                  disabled={busy || !now}
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
                  className="w-[132px] rounded border border-magia/50 px-2 py-1 text-[11px] text-ink transition hover:bg-magia/20 disabled:opacity-40"
                >
                  {now ? "Rzuć" : "nie teraz"}
                </button>
              )}
            </div>
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
