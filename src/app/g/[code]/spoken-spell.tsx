"use client";

import { useEffect, useState } from "react";
import type { Spoken } from "./use-table";
import { Rules } from "./rule-ref";

/**
 * A Zaklęcie hanging in the air, and the half-minute anybody has to answer it.
 *
 * 9.6 spends the card as it is spoken, but two cards in the deck answer one —
 * WŁADCA ZAKLĘĆ „neguje działanie każdego innego (bez wyjątku) Zaklęcia,
 * rzuconego bezpośrednio przed nim", ZWIERCIADŁO „odbije każde inne Zaklęcie
 * rzucone na Postać na tego, kto je rzucił" — so a cast that anybody could
 * answer waits before it lands. This is that wait, said out loud: the whole
 * table sees the same box, because 12.5 makes the cast public and answering it
 * is nobody's turn in particular.
 *
 * The window is a clock and somebody has to be watching it. The server settles
 * a lapsed spell whenever it is asked to and writes nothing when there is
 * nothing to settle, so every device asks once its own countdown runs out —
 * staggered by seat, so the six of them do not all arrive in the same
 * millisecond, and harmless when two do.
 */
export function SpokenSpell({
  spoken,
  seatName,
  mySeatIndex,
  /** True if this device holds something that could answer — see `couldAnswer`. */
  canAnswer,
  /**
   * Whether this device may close the window at all.
   *
   * Anybody seated may — the window belongs to the table rather than to the
   * caster — but a spectator drives no Postać and every write is refused for
   * them, so a watching screen would sit there collecting one refusal per
   * spell. It still sees the box: watching a table means watching this.
   */
  canSettle,
  busy,
  onSettle,
}: {
  spoken: Spoken;
  seatName: (index: number) => string;
  mySeatIndex: number | null;
  canAnswer: boolean;
  canSettle: boolean;
  busy: boolean;
  onSettle: () => void;
}) {
  const until = spoken.until;
  const [left, setLeft] = useState(0);
  useEffect(() => {
    // The same clock the fight floor keeps, kept the same way: the first read a
    // beat late rather than in the effect's body, and the rest on an interval.
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [until]);

  /**
   * Asked for once the window has run out, by whoever is here to ask.
   *
   * Not a poll: one timer per device per spell, fired at the deadline plus a
   * stagger. The first answer bumps the revision, every other device hears
   * about it and unmounts this box, and a request that arrives anyway is a
   * no-op — `settleSpell` finds nothing waiting and writes nothing.
   */
  useEffect(() => {
    if (!canSettle) return;
    const stagger = 300 * ((mySeatIndex ?? 6) + 1);
    const wait = Math.max(0, until - Date.now()) + stagger;
    const timer = setTimeout(onSettle, wait);
    return () => clearTimeout(timer);
    // `onSettle` is a fresh closure on every render and would restart the
    // timer each time; the spell is what this is waiting on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until, spoken.spell, mySeatIndex, canSettle]);

  const mine = spoken.by !== null && spoken.by === mySeatIndex;
  const at = spoken.at === null ? null : seatName(spoken.at);

  return (
    <section className="mb-3 rounded-lg border border-magia/50 bg-magia/10 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-[family-name:var(--font-display)] text-sm text-magia">
          {spoken.name} — w powietrzu
        </h3>
        <span className="shrink-0 tabular-nums text-[11px] text-muted">{left} s</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-ink/80">
        {spoken.by === null ? "Ktoś" : mine ? "Ty" : seatName(spoken.by)}
        {mine ? " rzuciłeś" : " rzuca"}
        {at ? ` na: ${at}` : ""}. <Rules>Zanim zadziała, można odpowiedzieć (9.6).</Rules>
      </p>
      {canAnswer && !mine && (
        // Said only to the one person it is true of: the two answering Karty
        // are concealed (9.3), so naming who holds one would give the hand
        // away — and the one holding it is the only one who can act on it.
        <p className="mt-1 text-[11px] text-magia">
          Masz czym odpowiedzieć — rzuć swoje Zaklęcie z ręki.
        </p>
      )}
      {canSettle && (
      <button
        disabled={busy}
        onClick={onSettle}
        className="mt-2 rounded border border-magia/50 px-2 py-1 text-[11px] text-ink transition hover:bg-magia/20 disabled:opacity-40"
      >
        Nikt nie odpowiada — niech zadziała
      </button>
      )}
    </section>
  );
}
