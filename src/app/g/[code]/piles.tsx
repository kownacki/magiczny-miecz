"use client";

/**
 * The four stacks the box actually has, drawn as stacks.
 *
 * The bar carries the numbers, which is what you want while playing. This is
 * for the other question — "how much is left, really?" — and a number is a poor
 * answer to it. A thinning pile is a thing you see at a table without counting,
 * and 9.5's reshuffle is a thing you see coming.
 *
 * So each pile is drawn as itself: backs stacked to a depth that follows the
 * count, with the number beside it. Not one back per card — a hundred and forty
 * would be a smear — but enough that the two piles of a deck read against each
 * other at a glance, which is the comparison being made.
 */

import Image from "next/image";
import { Overlay } from "./overlay";
import { LAYER } from "./layers";

/** How many backs to draw for a pile of `n`, and how tightly to stack them. */
const LEAVES = 12;
const STEP = 3;

export interface PileCounts {
  events: { draw: number; discard: number };
  spells: { draw: number; discard: number };
}

export function PilesView({
  counts,
  printed,
  onClose,
}: {
  counts: PileCounts;
  /** What the box holds, from the manual — the denominator for each deck. */
  printed: { events: number; spells: number };
  onClose: () => void;
}) {
  return (
    <Overlay label="Talie" onDismiss={onClose} layer={LAYER.card}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-ochre/40 bg-panel shadow-[0_8px_40px_rgba(0,0,0,0.7)]">
        <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-edge px-4 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ochre">Talie</h2>
          <button onClick={onClose} className="text-[11px] text-muted hover:text-ink">
            zamknij
          </button>
        </header>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-4">
          <Deck
            name="Karty Zdarzeń"
            printed={printed.events}
            draw={counts.events.draw}
            discard={counts.events.discard}
            back="/cards/back-zdarzenie.jpg"
            note="Ciągnięte z wierzchu na każdym Obszarze, który tego wymaga (13.4)."
          />
          <Deck
            name="Karty Zaklęć"
            printed={printed.spells}
            draw={counts.spells.draw}
            discard={counts.spells.discard}
            back="/cards/back-zaklecie.jpg"
            note="9.5: gdy stos się wyczerpie, zużyte Zaklęcia tasuje się i bierze ponownie."
          />

          {/* What is neither in a pile nor on the board, said plainly rather
              than left as the difference between two numbers nobody adds up. */}
          <p className="border-t border-edge/60 pt-3 text-[11px] leading-relaxed text-muted">
            Czego tu nie ma: Karty w rękach graczy i leżące na Obszarach (16.8) —
            te nie są w żadnym stosie i dlatego suma bywa mniejsza niż to, co jest
            w pudełku. Wyposażenie (30 Kart) też nie ma stosu zużytych: 21.2 czyni
            z niego zapas, do którego Karta wraca, gdy przestaje być w grze.
          </p>
        </div>
      </div>
    </Overlay>
  );
}

function Deck({
  name,
  printed,
  draw,
  discard,
  back,
  note,
}: {
  name: string;
  printed: number;
  draw: number;
  discard: number;
  /** The scan of this deck's back, or null where the box never printed one. */
  back: string | null;
  note: string;
}) {
  const inPlay = printed - draw - discard;
  return (
    <section>
      <h3 className="mb-2 flex items-baseline gap-2 border-b border-edge/60 pb-1 text-[11px] uppercase tracking-wide text-ochre/80">
        {name}
        <span className="tnum text-[10px] normal-case tracking-normal text-muted">
          {printed} Kart w pudełku
        </span>
      </h3>

      <div className="flex flex-wrap items-start gap-8">
        <Pile label="w talii" count={draw} of={printed} back={back} tone="text-ink" />
        <Pile
          label="stos zużytych"
          count={discard}
          of={printed}
          back={back}
          tone="text-ochre/80"
        />
        {/* Not a pile, because it is not one: it is a hand, a field, a trophy. */}
        <div className="flex flex-col gap-1 pt-1">
          <p className="tnum text-sm text-magia/80">{inPlay}</p>
          <p className="text-[10px] text-muted">w grze</p>
        </div>
      </div>

      <p className="mt-2 text-[10px] leading-snug text-muted/80">{note}</p>
    </section>
  );
}

/**
 * One stack, drawn with its own back.
 *
 * Each pile has a real one — ZDARZENIE and ZAKLĘCIE are different cards and
 * they look it. `back` stays nullable for the pile that has not been found yet
 * (there is none at the moment) rather than falling back to whichever scan is
 * nearest: every card picture in this app is a scan of the card it claims to
 * be, and a pile is a picture.
 */
function Pile({
  label,
  count,
  of,
  back,
  tone,
}: {
  label: string;
  count: number;
  of: number;
  back: string | null;
  tone: string;
}) {
  // The depth follows the count without pretending to be it: full at the whole
  // deck, gone at nothing, and a single card still draws one leaf so an
  // almost-empty pile is not an empty one.
  const leaves = count === 0 ? 0 : Math.max(1, Math.round((count / of) * LEAVES));

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative"
        style={{ width: 92, height: 131 + (leaves ? (leaves - 1) * STEP : 0) }}
      >
        {leaves === 0 ? (
          <div className="absolute inset-x-0 top-0 h-[131px] rounded border border-dashed border-edge" />
        ) : (
          Array.from({ length: leaves }, (_, index) =>
            back ? (
              <Image
                key={index}
                src={back}
                alt=""
                width={92}
                height={131}
                // Bottom leaf first, so the stack is drawn from underneath and
                // the top card is the one that looks like a card rather than an
                // edge.
                style={{ bottom: index * STEP }}
                className="absolute left-0 rounded border border-night/60 shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
              />
            ) : (
              <div
                key={index}
                style={{ bottom: index * STEP, width: 92, height: 131 }}
                className="absolute left-0 rounded border border-magia/40 bg-gradient-to-br from-panel to-night shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
              />
            ),
          )
        )}
      </div>
      <p className={`tnum text-sm ${tone}`}>{count}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}
