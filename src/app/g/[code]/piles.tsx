"use client";

/**
 * The four stacks the box actually has, drawn as stacks.
 *
 * The bar carries the numbers, which is what you want mid-turn. This is for the
 * other question — how much is really left — and a number answers it badly. A
 * thinning pile is a thing you see at a table without counting, and 9.5's
 * reshuffle is a thing you see coming.
 *
 * Two decks across, and for each of them the two piles the manual names: the
 * `stos Kart Zdarzeń` it is drawn from, and the `stos zużytych Kart Zdarzeń` it
 * ends up on. Which is also why the two look different here. Setup deals the
 * first one "koszulkami do góry (w formie zakrytej)" — face down, said outright
 * — and the manual never once says that of the used pile, in a rulebook that
 * spells concealment out where it means it (16.8 face up on an Obszar, 9.3 a
 * hand nobody may see). So one shows backs and the other shows faces, and the
 * spent cards can be read through.
 */

import Image from "next/image";
import { cardImageUrl } from "@/lib/view/cardImages";
import { Drawer } from "./drawer";
import type { TileCard } from "./card-tile";

/**
 * How tall a stack can look.
 *
 * Below this the leaves are the cards: one card is one leaf, so two left and
 * three left are told apart at a glance, which is the whole point at the end of
 * a deck. Above it they stop counting and the pile simply reads as full —
 * a hundred and forty leaves is a smear, and nobody at a table can see the
 * difference between 140 and 130 either.
 */
const LEAVES = 10;
/** The isometric offset per leaf: right and up, as a stack seen from a corner. */
const STEP = { x: 2, y: 2 };

const CARD = { w: 92, h: 131 };

/**
 * The edge of one card in a stack.
 *
 * Pale, and it has to be: what you see of the cards underneath is a sliver of
 * their left and bottom sides, and the Zaklęcie back is black to its own edge —
 * so a dark border drew black on black and the whole pile fused into one
 * shape, with only the top card legible. The Zdarzenie back is teal and hid
 * this by being lighter than its own outline.
 *
 * A light hairline separates every card from the one under it whatever colour
 * the card is, and the shadow underneath keeps the stack reading as depth
 * rather than as a stripe.
 */
const EDGE = "border border-white/25 shadow-[-1px_1px_2px_rgba(0,0,0,0.6)]";

/**
 * The box every stack is drawn in, whatever is in it.
 *
 * Tall enough for a full one and always that tall, so the four sit on a common
 * table rather than each floating at its own height — a three-card pile in a
 * box its own size hangs above a full one beside it and reads as being
 * somewhere else, not as being smaller.
 */
const BOX = {
  w: CARD.w + (LEAVES - 1) * STEP.x,
  h: CARD.h + (LEAVES - 1) * STEP.y,
};

export interface PileCounts {
  events: { draw: number; discard: number };
  spells: { draw: number; discard: number };
}

/**
 * The card on top of each used pile, by slice ref — or null for an empty one.
 *
 * The top card only. Picking the pile up and reading back through it is a thing
 * a table can do (nothing in the manual says otherwise) and this does not offer
 * yet; the count beside it says how deep the pile goes, which is the question
 * being asked most of the time.
 */
export interface UsedPiles {
  events: string | null;
  spells: string | null;
}

export function PilesDrawer({
  counts,
  used,
  printed,
  backs,
  nameOf,
  onInspect,
  onClose,
}: {
  counts: PileCounts;
  used: UsedPiles;
  /** What the box holds, from the manual — the denominator for each deck. */
  printed: { events: number; spells: number };
  backs: { events: string; spells: string };
  /** The card a slice ref belongs to, for the faces on a used pile. */
  nameOf: (ref: string) => TileCard | null;
  onInspect: (card: TileCard) => void;
  onClose: () => void;
}) {
  return (
    <Drawer side="right" width="max-w-md" title="Stosy" onClose={onClose}>
      <div className="flex flex-col gap-5 p-3">
        <Deck
          name="Karty Zdarzeń"
          printed={printed.events}
          back={backs.events}
          draw={counts.events.draw}
          used={used.events}
          spent={counts.events.discard}
          nameOf={nameOf}
          onInspect={onInspect}
          note="Ciągnięte z wierzchu na Obszarze, który tego wymaga (13.4)."
        />
        <Deck
          name="Karty Zaklęć"
          printed={printed.spells}
          back={backs.spells}
          draw={counts.spells.draw}
          used={used.spells}
          spent={counts.spells.discard}
          nameOf={nameOf}
          onInspect={onInspect}
          note="Gdy stos się wyczerpie, zużyte tasuje się i bierze ponownie (9.5)."
        />

      </div>
    </Drawer>
  );
}

function Deck({
  name,
  printed,
  back,
  draw,
  used,
  spent,
  nameOf,
  onInspect,
  note,
}: {
  name: string;
  printed: number;
  back: string;
  draw: number;
  /** The card on top of the used pile, or null. */
  used: string | null;
  /** How many are under it. */
  spent: number;
  nameOf: (ref: string) => TileCard | null;
  onInspect: (card: TileCard) => void;
  note: string;
}) {
  const inPlay = printed - draw - spent;
  return (
    <section>
      {/* The tally wraps under the name rather than beside it: "165 Kart w
          pudełku · 0 w grze" and a deck name do not both fit across a drawer
          this wide, and what happened instead was the stack below riding up
          into whichever of them lost. */}
      {/* `relative` so the heading paints over the stack rather than under it.
          The leaves are absolutely placed and grow upward from the baseline,
          which puts the top of a full pile level with the line above it. */}
      <h3 className="relative z-10 mb-3 border-b border-edge/60 pb-1 text-[11px] uppercase tracking-wide text-ochre/80">
        {name}
        <span
          title="Karty, których nie ma w żadnym stosie: w rękach graczy i leżące na Obszarach (16.8)"
          className="ml-2 tnum text-[10px] normal-case tracking-normal text-muted"
        >
{inPlay} poza stosami
        </span>
      </h3>

      <div className="flex items-start gap-6 pt-1">
        <Pile label="stos" count={draw} of={printed} back={back} />
        <Used top={used} count={spent} nameOf={nameOf} onInspect={onInspect} />
      </div>

      <p className="mt-2 text-[10px] leading-snug text-muted/80">{note}</p>
    </section>
  );
}

/** The face-down one, drawn as a stack of backs. */
function Pile({
  label,
  count,
  of,
  back,
}: {
  label: string;
  count: number;
  /** What the box prints, so the count reads against something. */
  of: number;
  back: string;
}) {
  const leaves = Math.min(count, LEAVES);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: BOX.w, height: BOX.h }}>
        {leaves === 0 ? (
          <div
            style={{ width: CARD.w, height: CARD.h }}
            className="absolute bottom-0 left-0 rounded border border-dashed border-edge"
          />
        ) : (
          Array.from({ length: leaves }, (_, index) => (
            <Image
              key={index}
              src={back}
              alt=""
              width={CARD.w}
              height={CARD.h}
              // Bottom-left leaf first, each one up and to the right, so the
              // stack is drawn from underneath and the top card is a whole card
              // rather than an edge.
              style={{ bottom: index * STEP.y, left: index * STEP.x }}
              className={`absolute rounded ${EDGE}`}
            />
          ))
        )}
      </div>
      {/* Against the whole deck, because "163" alone says nothing: the thing
          worth knowing is how far through it the table has got, and a stack
          only shows that once it is nearly gone. */}
      <p className="tnum text-sm text-ink">
        {count}
        <span className="text-muted">/{of}</span>
      </p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}

/**
 * The used one, face up, with the last card spent on top.
 *
 * Face up because the manual never says otherwise. It names this pile six times
 * — "stos zużytych Kart Zdarzeń", "stos Kart już zużytych" — and not once calls
 * it concealed, in a rulebook that says "w formie odkrytej" of a card left on
 * an Obszar (16.8) and hides a spell hand outright (9.3). Silence there reads
 * as "not hidden".
 *
 * The top card only, for now. Reading back through the pile is a thing a table
 * can do and this does not offer; the count says how deep it goes.
 */
function Used({
  top,
  count,
  nameOf,
  onInspect,
}: {
  top: string | null;
  count: number;
  nameOf: (ref: string) => TileCard | null;
  onInspect: (card: TileCard) => void;
}) {
  const card = top ? nameOf(top) : null;
  const leaves = Math.min(count, LEAVES);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: BOX.w, height: BOX.h }}>
        {leaves === 0 ? (
          <div
            style={{ width: CARD.w, height: CARD.h }}
            className="absolute bottom-0 left-0 rounded border border-dashed border-edge"
          />
        ) : (
          Array.from({ length: leaves }, (_, index) => {
            // Only the topmost shows its face. What is under it is an edge,
            // which is all you would see of it on a table anyway.
            const last = index === leaves - 1;
            const face = last && card ? cardImageUrl(card.cardId, card.ref) : null;
            const place = { bottom: index * STEP.y, left: index * STEP.x };
            return face ? (
              <button
                key={index}
                onClick={() => card && onInspect(card)}
                title={card?.name}
                style={place}
                className={`absolute rounded transition hover:border-ochre ${EDGE}`}
              >
                <Image
                  src={face}
                  alt={card?.name ?? ""}
                  width={CARD.w}
                  height={CARD.h}
                  className="rounded"
                />
              </button>
            ) : (
              <div
                key={index}
                style={{ ...place, width: CARD.w, height: CARD.h }}
                className={`absolute rounded bg-panel ${EDGE}`}
              />
            );
          })
        )}
      </div>

      <p className="tnum text-sm text-ochre/80">{count}</p>
      <p className="text-[10px] text-muted">stos zużytych</p>
    </div>
  );
}
