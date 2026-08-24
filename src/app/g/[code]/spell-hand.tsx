"use client";

import { useState } from "react";
import spells from "@/data/spells.json";
import type { Spell } from "@/data/types";
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
  cardId: string;
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
}: {
  spells: HeldSpell[];
  moment: SpellTiming;
  /** Other seats, for the spells that need a victim. */
  opponents: { seatIndex: number; name: string }[];
  busy: boolean;
  onCast: (holdingId: string, targetSeat?: number) => void;
}) {
  const [aiming, setAiming] = useState<string | null>(null);
  if (held.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-magia/30 bg-panel/60 p-3">
      <h3 className="mb-2 text-[11px] uppercase tracking-widest text-magia">
        Twoje Zaklęcia ({held.length})
      </h3>
      <ul className="flex flex-col gap-2">
        {held.map((entry) => {
          const card = SPELL_BY_ID.get(entry.cardId);
          const script = spellScript(entry.cardId);
          const now = script ? castableNow(script, moment) : true;
          const needsVictim =
            script?.target === "postac" || script?.target === "siebie-lub-postac";

          return (
            <li key={entry.holdingId} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className={now ? "text-ink" : "text-muted"}>
                  {card?.name ?? entry.cardId}
                </span>
                <span className="shrink-0 text-[10px] text-muted">
                  {script
                    ? `${script.timing.map((t) => TIMING_LABEL[t]).join(" / ")} · ${TARGET_LABEL[script.target]}`
                    : ""}
                </span>
              </div>
              {script && (
                <p className="mt-0.5 text-[10px] leading-snug text-muted/80">{script.effect}</p>
              )}

              {aiming === entry.holdingId && needsVictim ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {opponents.map((seat) => (
                    <button
                      key={seat.seatIndex}
                      disabled={busy}
                      onClick={() => {
                        onCast(entry.holdingId, seat.seatIndex);
                        setAiming(null);
                      }}
                      className="rounded border border-magia/50 px-2 py-0.5 text-[11px] text-ink transition hover:bg-magia/20 disabled:opacity-50"
                    >
                      na: {seat.name}
                    </button>
                  ))}
                  <button
                    onClick={() => setAiming(null)}
                    className="text-[10px] text-muted underline hover:text-ink"
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
                  className="mt-1 rounded border border-magia/50 px-2 py-0.5 text-[11px] text-ink transition hover:bg-magia/20 disabled:opacity-40"
                >
                  {now ? "Rzuć" : `tylko ${script?.timing.map((t) => TIMING_LABEL[t]).join(" / ")}`}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {/* The app takes the card and tells the table; it does not apply the
          spell. Saying so where the button is means nobody waits for an effect
          that is not coming. */}
      <p className="mt-2 border-t border-edge/60 pt-1 text-[10px] leading-snug text-ochre/70">
        Rzucone Zaklęcie znika z ręki i trafia do dziennika — skutek rozpatrzcie sami.
      </p>
    </div>
  );
}
