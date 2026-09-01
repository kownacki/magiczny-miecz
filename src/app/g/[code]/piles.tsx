"use client";

import items from "@/data/items.json";
import type { Item } from "@/data/types";
import { RELICS } from "@/lib/engine/stock";
import { Rules } from "./rule-ref";

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
import { useCardPreview } from "./card-preview";
import type { EqMode } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";
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

/**
 * One card, and the height is not a suggestion.
 *
 * Tailwind's preflight sets `img { height: auto }`, so an `<Image>` given a
 * width and a height keeps the width and works the height out from the file.
 * That made this constant fiction: the backs are cut 460x701 by
 * `export-card-back.mjs` and rendered 140 tall, the faces are cut 460x768 by
 * the slicer and rendered 154, and the box was sized for 131 — three numbers,
 * none of them agreeing, which is why a used pile stood taller than the stack
 * of backs beside it and hung out of its own box. Both are now given this
 * rectangle outright, in the style rather than in the attribute, and filled
 * with `object-cover`.
 *
 * 154 is the *face's* own shape at this width (527x880 → 153.6), so a face is
 * never cropped and a back loses four pixels off each side instead. Sized to
 * the back it was the other way about and the wordiest cards in the deck lost
 * their last two lines — TAJEMNICZA SZKATUŁA's sixth die face, KRYSZTAŁ LOSU's
 * fifth and sixth — which reads as a broken picture rather than as a thumbnail.
 * A back is a frame around a word: taking a sliver off its sides costs nothing
 * anybody can see, and the two crops are two cuts of one printed card anyway
 * (the cell is 496x877, and the face slicer's is the nearer of the two).
 */
const CARD = { w: 92, h: 154 };

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
 * Where the nth card from the bottom of a pile sits.
 *
 * A pile is built up from the table: leaf 0 lies flat in the bottom-left corner
 * and every card after it goes up and to the right, so a stack grows north-east
 * out of the place an empty one occupies and the *top* card is as high as the
 * pile is deep. That is what a stack of cards seen from a corner does, and it
 * is why a thinning pile is a thing you see rather than count.
 *
 * Both piles are laid out by it, which is all "stack the same as the unused
 * one" needs: the same corner, the same step, the same direction. The top
 * cards of two piles of different depths are not level with each other, and
 * should not be — that difference *is* the reading.
 */
function leafAt(fromBottom: number): { bottom: number; left: number } {
  return { bottom: fromBottom * STEP.y, left: fromBottom * STEP.x };
}

/**
 * Where an empty pile is drawn: the table under it, not a card on top of it.
 *
 * The bottom leaf's place, so the outline starts level with the lowest card of
 * the stack beside it and on the same side — and so the first card laid down
 * lands exactly where the outline was.
 */
const EMPTY = leafAt(0);

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
  eqMode,
  nature,
  onInspect,
  onClose,
  stock,
}: {
  counts: PileCounts;
  /** What the Wyposażenie pile still has, per card (21.2) — `shopStock`'s. */
  stock?: Record<string, number>;
  used: UsedPiles;
  /** What the box holds, from the manual — the denominator for each deck. */
  printed: { events: number; spells: number };
  backs: { events: string; spells: string };
  /** The card a slice ref belongs to, for the faces on a used pile. */
  nameOf: (ref: string) => TileCard | null;
  /** For the hover on the top used card, which reads the same here as anywhere. */
  eqMode: EqMode;
  nature: Nature | null;
  onInspect: (card: TileCard) => void;
  onClose: () => void;
}) {
  // The roster width, which is the drawer default. Two piles at 110 and a gap
  // of 24 come to 244, and `max-w-sm` holds 384 less the padding — so being
  // wider bought nothing but a strip of empty panel, and the two drawers
  // measure the same whichever edge they open from.
  return (
    <Drawer side="left" title="Stosy" onClose={onClose}>
      <div className="flex flex-col gap-5 p-3">
        <Deck
          name="Karty Zdarzeń"
          printed={printed.events}
          back={backs.events}
          draw={counts.events.draw}
          used={used.events}
          spent={counts.events.discard}
          nameOf={nameOf}
          eqMode={eqMode}
          nature={nature}
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
          eqMode={eqMode}
          nature={nature}
          onInspect={onInspect}
          note="Gdy stos się wyczerpie, zużyte tasuje się i bierze ponownie (9.5)."
        />

        <Relics stock={stock} />
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
  eqMode,
  nature,
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
  eqMode: EqMode;
  nature: Nature | null;
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
        <Used
          top={used}
          count={spent}
          nameOf={nameOf}
          eqMode={eqMode}
          nature={nature}
          onInspect={onInspect}
        />
      </div>

      <p className="mt-2 text-[10px] leading-snug text-muted/80">
        <Rules>{note}</Rules>
      </p>
    </section>
  );
}

/**
 * What is written under a pile, centred on the card rather than on the box.
 *
 * The box is wider than a card by the whole depth of the stack, because the
 * leaves lean out of it to the right — so a caption centred on the box sits
 * nine pixels right of the card it names, which is exactly enough to read as
 * not lined up with anything. Centred on the outline instead: the rectangle a
 * card occupies at the bottom of the pile, which is where an empty one draws
 * its dashes and where a pile of one puts its only card.
 *
 * Fixed to the card and not to the ink, so the caption does not slide sideways
 * as a pile is spent.
 */
function Caption({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center" style={{ width: CARD.w }}>
      {children}
    </div>
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
    <div className="flex flex-col items-start gap-1">
      <div className="relative" style={{ width: BOX.w, height: BOX.h }}>
        {leaves === 0 ? (
          <div
            style={{ ...EMPTY, width: CARD.w, height: CARD.h }}
            className="absolute rounded border border-dashed border-edge"
          />
        ) : (
          // Bottom leaf first, so each card paints over the one beneath it and
          // the top of the pile is the last thing drawn.
          Array.from({ length: leaves }, (_, index) => (
            <Image
              key={index}
              src={back}
              alt=""
              width={CARD.w}
              height={CARD.h}
              // Both dimensions in the style, because the `height` attribute
              // alone loses to preflight's `height: auto` — see `CARD`.
              style={{ ...leafAt(index), width: CARD.w, height: CARD.h }}
              className={`absolute rounded object-cover ${EDGE}`}
            />
          ))
        )}
      </div>
      {/* Against the whole deck, because "163" alone says nothing: the thing
          worth knowing is how far through it the table has got, and a stack
          only shows that once it is nearly gone. */}
      <Caption>
        <p className="tnum text-sm text-ink">
          {count}
          <span className="text-muted">/{of}</span>
        </p>
        <p className="text-[10px] text-muted">{label}</p>
      </Caption>
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
  eqMode,
  nature,
  onInspect,
}: {
  top: string | null;
  count: number;
  nameOf: (ref: string) => TileCard | null;
  eqMode: EqMode;
  /** Who is looking, so a 5.3 requirement can say whether THEY pass it. */
  nature: Nature | null;
  onInspect: (card: TileCard) => void;
}) {
  const card = top ? nameOf(top) : null;
  const leaves = Math.min(count, LEAVES);
  /**
   * The same hover every other card in the app has.
   *
   * This one was a `title` — the card's name, and nothing else — on the one
   * card in the game a player is most likely to be looking up: the last thing
   * spent, which is usually the thing that just happened to somebody. Clicking
   * opened the whole Karta, which is the right answer to "let me read this"
   * and the wrong one to "what was that": it covers the piles you came here to
   * look at, and you have to close it again.
   */
  const { handlers, preview } = useCardPreview(card, false, eqMode, nature);

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="relative" style={{ width: BOX.w, height: BOX.h }}>
        {leaves === 0 ? (
          <div
            style={{ ...EMPTY, width: CARD.w, height: CARD.h }}
            className="absolute rounded border border-dashed border-edge"
          />
        ) : (
          Array.from({ length: leaves }, (_, index) => {
            // Only the topmost shows its face. What is under it is an edge,
            // which is all you would see of it on a table anyway.
            const last = index === leaves - 1;
            const face = last && card ? cardImageUrl(card.cardId, card.ref) : null;
            const place = { ...leafAt(index), width: CARD.w, height: CARD.h };
            return face ? (
              <button
                key={index}
                onClick={() => card && onInspect(card)}
                {...handlers}
                title={card?.name}
                // Sized like every other leaf, so the hover outline is the card
                // and not whatever shape the picture happened to come out.
                style={place}
                className={`absolute overflow-hidden rounded transition hover:border-ochre ${EDGE}`}
              >
                {/* Given the rectangle rather than allowed to set its own
                    height — see `CARD`. At this shape a face fills it exactly,
                    so nothing of the card is lost. */}
                <Image
                  src={face}
                  alt={card?.name ?? ""}
                  width={CARD.w}
                  height={CARD.h}
                  style={{ width: CARD.w, height: CARD.h }}
                  className="rounded object-cover"
                />
              </button>
            ) : (
              <div
                key={index}
                style={place}
                className={`absolute rounded bg-panel ${EDGE}`}
              />
            );
          })
        )}
      </div>

      <Caption>
        <p className="tnum text-sm text-ochre/80">{count}</p>
        <p className="text-[10px] text-muted">stos zużytych</p>
      </Caption>
      {preview}
    </div>
  );
}

/**
 * The two the endgame stands on, counted.
 *
 * At a table these lie face up: setup says the Magiczne Miecze, the Tarcze
 * Tolimana and the Karty Wyposażenia go down "wszystkie w formie odkrytej", and
 * goes on to suggest sorting them into a stack per Przedmiot because it "ułatwi
 * i przyspieszy grę". So how many are left is not something the rules withhold
 * — it is something anybody can see by glancing at the table, and the app had
 * nowhere to glance.
 *
 * Only these two, and not the other ten on the sheet. 11.9 will not let a
 * Postać onto the Most without a Magiczny Miecz and 14.7 will not let one into
 * the Zamek without a Tarcza, and there are four of each against six podstawki
 * — so "two left" is the state of the race, while "two Hełmy left" is a fact
 * about cardboard. It is also the one supply still moving once a table has
 * turned `endless_stock` on.
 */
function Relics({ stock }: { stock?: Record<string, number> }) {
  if (!stock) return null;
  const shown = RELIC_ROWS.filter((relic) => stock[relic.id] !== undefined);
  if (shown.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 border-b border-edge/60 pb-1 text-[11px] uppercase tracking-wide text-ochre/80">
        Wyjątkowe Przedmioty
      </h3>
      <dl className="flex flex-col gap-1">
        {shown.map((relic) => {
          const left = stock[relic.id] ?? 0;
          return (
            <div key={relic.id} className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] text-muted">{relic.name}</dt>
              <dd
                className={`tnum text-[11px] ${left === 0 ? "text-vermilion" : "text-ink"}`}
                title={left === 0 ? "Nie ma już ani jednej (21.2)" : undefined}
              >
                {left}
                <span className="text-muted/60">/{relic.printed}</span>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-[10px] leading-snug text-muted/80">
        <Rules>
          Bez Magicznego Miecza nie ma wejścia na Most (11.9), bez Tarczy — do Zamku (14.7).
          Wyciągnięty ze stosu Zdarzeń wymienia się na Kartę z Wyposażenia, więc więcej ich nie
          przybywa (16.6).
        </Rules>
      </p>
    </section>
  );
}

/**
 * Read off the cards rather than written down, so the day a scan turns out to
 * be short one Tarcza this number moves with it.
 */
const RELIC_ROWS = [...RELICS]
  .map((id) => {
    const copies = (items as Item[]).filter((card) => card.id === id);
    return { id, name: copies[0]?.name ?? id, printed: copies.length };
  })
  .filter((relic) => relic.printed > 0);
