"use client";

import Image from "next/image";
import { ART_BORDER, PICKABLE } from "./pickable";
import { WithRules } from "./rule-ref";
import {
  ART_RATIO,
  CHARACTER_ART_RATIO,
  TILE_ART_HEIGHT,
  TILE_WIDTH,
  artFor,
  faceFor,
} from "@/lib/view/cardImages";
import { useCardPreview } from "./card-preview";
import { CardMark, StruckOut, WornMark } from "./card-mark";
import { LAYER } from "./layers";
import { Overlay } from "./overlay";
import { CloseButton } from "./chrome";
import type { EqMode, Slot } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";
import { manualNote, coverageOf, NOT_HANDLED } from "@/lib/engine/coverage";

/**
 * One card, as a card.
 *
 * This is a board game and the app had turned everyone's possessions into a
 * list of words. A player who owns four Przedmioty and two Zaklęcia is holding
 * six *pictures* at the table, recognises them at a glance, and reaches for the
 * one with the sword on it — none of which a line of text supports.
 *
 * The image is the primary thing and the name is the fallback, not the other
 * way round: every card in the box has been exported, but a fresh checkout has
 * none of them until the asset pipeline is run, so a card must still be usable
 * as a labelled tile.
 */
export interface TileCard {
  cardId: string;
  name: string;
  /** The exact printed copy, where it is known (simulation mode). */
  ref?: string;
  text?: string;
  kindLabel?: string;
  /**
   * This is a Postać, not a card off one of the decks.
   *
   * The id cannot be trusted to say so: `demon` and `czarodziej` name a
   * character AND an event card each, so looking a character up in the card
   * registry hands back the wrong picture rather than none.
   */
  character?: boolean;
  /** Could a hand contain this? Only Przedmioty, Przyjaciele and Zaklęcia can. */
  holdable?: boolean;
  /**
   * Conjured by the test shortcut rather than won.
   *
   * Carried on the card itself so the mark follows it everywhere it is drawn —
   * the pack, the paper doll, the hand, and the whole Karta when it is opened.
   * A tile a player recognises at a glance and a Karta they open to read are
   * the same card, and the one place they were most likely to check was the
   * one that did not say.
   */
  granted?: boolean;
  /**
   * Where this copy is being worn, in the slotted variant.
   *
   * A fact about the holding rather than about the card, and carried on the
   * card for the same reason `granted` is: it has to follow the picture to
   * wherever the picture is drawn. Absent everywhere it would mean nothing —
   * the Księga's catalogue, the klasyczny variant, a card in the pack.
   */
  slot?: Slot | null;
}

/**
 * What identifies a card, which is not its id alone.
 *
 * `demon` and `czarodziej` each name a Karta Postaci *and* a Karta Zdarzeń —
 * the Wróg and the Nieznajomy — and the two are different cards with different
 * pictures and different rules. Anything holding a set of cards from more than
 * one shelf has to key it on this, or the first of the pair swallows the
 * second: the Księga's search dropped the Nieznajomy CZARODZIEJ entirely,
 * because the Postacie shelf is above the Nieznajomi one and had already
 * claimed the name.
 */
export function cardKey(card: TileCard): string {
  return `${card.character ? "postac" : "karta"}:${card.cardId}`;
}

export function CardTile({
  card,
  size = "sm",
  dimmed = false,
  chosen = false,
  struck = false,
  badge,
  onClick,
  onDoubleClick,
  draggable,
  onDragStart,
  onDragEnd,
  children,
  eqMode = "classic",
  nature = null,
  inControl = false,
}: {
  card: TileCard;
  size?: "sm" | "md";
  dimmed?: boolean;
  /**
   * Picked out of a row by something the player is deciding, not by the pointer.
   *
   * The same answer `ItemSlot` gives, in the same paint, because the trofea and
   * this are the same question asked of two rows: the *paper* is washed gold and
   * the frame is left alone. Borders were tried and are the wrong instrument —
   * a chosen card and a hovered card end up competing for one edge, so either
   * the pointer has nowhere louder to go or the choice is a weight of border you
   * have to look twice at.
   *
   * Down here rather than in the callers because it kept being invented up
   * there: the kolejka wrapped a ring round the whole `<li>`, which drew a
   * second frame outside the tile's own and put the caption inside it.
   */
  chosen?: boolean;
  /**
   * Done with and gone — the same two strokes `ItemSlot` puts on a spent trophy.
   *
   * Across the picture rather than over the whole tile, so the name below stays
   * readable: this says the Karta is gone, not that the tile is unreadable. Two
   * lines rather than one, because a bar across a picture reads as a redaction
   * and an X is the mark somebody puts on a thing that is finished.
   */
  struck?: boolean;
  /** A short flag drawn over the corner — a price, a count, "zakryte". */
  badge?: string;
  onClick?: (event: React.MouseEvent) => void;
  /** Two clicks put it straight on, in the slotted variant. */
  onDoubleClick?: () => void;
  /** Draggable into an equipment place, in the slotted variant. */
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  onDragEnd?: () => void;
  /** Controls drawn under the card, such as a cast or drop button. */
  children?: React.ReactNode;
  /** Which variant the table plays, so the hover can say where a card must be. */
  eqMode?: EqMode;
  nature?: Nature | null;
  /**
   * This tile sits inside something else that is the control.
   *
   * A tile is normally its own button — that is how it is clicked and, more to
   * the point, how it is *focused*, which is how the picture gets a hover at
   * all. An offer's row is a button too, and a button inside a button is not
   * something a browser will render: it closes the outer one where the inner
   * begins, so the row falls apart and the half after the picture stops being
   * clickable.
   *
   * Set here, the tile draws as a `<span>`. It keeps the hover — those are
   * pointer handlers and they work on anything — and gives up being a control,
   * which it was not: the whole row is.
   *
   * It also gives up its caption, for the same reason and not as a separate
   * decision: a control that contains a tile has named the thing itself, and
   * the offer row read „TARGOWISKO" twice, once under the picture and once
   * beside it.
   */
  inControl?: boolean;
}) {
  // The illustration, not the whole card. A card shrunk to tile size is a grey
  // smear with a four-pixel title; the picture is the thing a player actually
  // recognises when reaching across a table. The whole card is one hover away.
  const src = artFor(card);
  const width = size === "md" ? 132 : TILE_WIDTH;
  // The tile takes the shape of whichever family it is drawing, rather than
  // cropping the picture back into a box built for the other one. A Karta
  // Postaci's frame is a different rectangle from a Karta Zdarzeń's, and this
  // component draws both.
  const height = Math.round(width / (card.character ? CHARACTER_ART_RATIO : ART_RATIO));
  const { handlers, preview } = useCardPreview(card, false, eqMode, nature);
  const Root = inControl ? "span" : "button";

  return (
    <figure className="flex flex-col items-center gap-1">
      {/* A `<span>` where something around it is the control — see `inControl`.
          `Root` rather than two copies of the tile, so a mark, a badge or a
          strike-through cannot be added to one and forgotten on the other. */}
      <Root
        {...(inControl ? {} : { type: "button" as const })}
        onClick={inControl ? undefined : onClick}
        onDoubleClick={inControl ? undefined : onDoubleClick}
        /**
         * `aria-disabled`, not `disabled`.
         *
         * A disabled button fires no mouse events at all, so a tile with
         * nothing to click had no hover either — and the hover is most of what
         * a tile is for. That cost nothing while every tile in the app was
         * clickable; the first read-only ones are a Postać's starting
         * Przedmioty, drawn inside a preview, and they came out inert.
         *
         * Screen readers are told the same thing either way. What changes is
         * that the pointer is now allowed to ask what the picture is.
         */
        aria-disabled={inControl || onClick ? undefined : true}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        {...handlers}
        // The native tooltip only where there is no Karta to open instead —
        // `effect-mark.tsx` reached this first: two things appearing at once
        // over the same picture is one too many, and the OS one is a grey slab
        // that lands over the preview it is redundant with. The preview says
        // the name, the printed text and the app's reading of it; a tooltip
        // repeating the first of those cannot be worth covering the other two.
        style={{ width, height }}
        className={`relative overflow-hidden rounded border ${ART_BORDER} bg-raised transition ${
          draggable ? "cursor-grab active:cursor-grabbing" : onClick ? "cursor-pointer" : "cursor-default"
        } ${PICKABLE} ${dimmed ? "opacity-45" : ""}`}
      >
        {src ? (
          // Explicit dimensions rather than `fill`: the portraits elsewhere on
          // this page already work this way, and a filled image needs its
          // parent to establish a containing block, which a button styled by
          // utility classes does not reliably do.
          <Image
            src={src}
            alt={card.name}
            width={width}
            height={height}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] leading-tight text-ink">
            {card.name}
          </span>
        )}
        {/* Multiplied, not laid over, so the ink stays black and only the paper
            takes the colour — which is the only thing that works on these
            scans, pen and ink with almost nothing in between. `mix-blend-color`
            keeps the backdrop's luminosity and does nothing at all here.

            Above the picture and below the marks, which have their own ground
            and are meant to be read off it. */}
        {chosen && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-ochre/75 mix-blend-multiply"
          />
        )}
        {struck && <StruckOut />}
        {/* Conjured rather than dealt, marked on the tile and not only on the
            Karta it opens into: a tile is what a player actually scans, and a
            mark you have to hover to find is a mark that is not there.
            Bottom right, in `ItemSlot`'s corner and at its size, because the
            row of Karty on an Obszar and the row in the Plecak are the same
            kind of thing and had no business marking themselves differently. */}
        {card.granted && (
          <span className="absolute bottom-0 right-0 rounded-tl bg-night/85 px-1 py-0.5">
            <CardMark mark="granted" />
          </span>
        )}
        {/* Which place on the body this one is in (5.6), where the pack's own
            arrow to put it there would be. Small, in the corner, and over the
            picture rather than under the name: the name is what the card is,
            and this is where it happens to be. */}
        {card.slot && (
          <span className="absolute right-0 top-0 rounded-bl bg-night/85 px-1 py-0.5">
            <WornMark slot={card.slot} />
          </span>
        )}
        {/* Bottom edge, not the top: the top of every card in this game is its
            printed title, and covering that is covering the one thing a player
            scans for. */}
        {badge && (
          <span className="absolute inset-x-0 bottom-0 bg-night/85 px-1 py-0.5 text-center text-[9px] leading-tight text-ochre">
            {badge}
          </span>
        )}
      </Root>
      {preview}
      {!inControl && (
        <figcaption
          style={{ width }}
          className="truncate text-center text-[9px] leading-tight text-muted"
        >
          {card.name}
        </figcaption>
      )}
      {children}
    </figure>
  );
}

/**
 * The width a Zaklęcie's back takes at a tile's art height.
 *
 * `TILE_WIDTH` and `TILE_ART_HEIGHT` come from `cardImages.ts` now — they were
 * written down here as 92 and 80 while `ItemSlot` had its own 86, which is how
 * the Karty on an Obszar came to be a different size from the Karty in the
 * Plecak. The back keeps its own proportions at that height — 460 x 701 as it
 * was cut. Matching the height rather than the width is what makes a mixed row
 * read as one row.
 */
export const SPELL_BACK_WIDTH = Math.round(TILE_ART_HEIGHT * (460 / 701));
/** The widest a back may show of the one beneath it. */
const SPELL_BACK_STEP = 20;
/**
 * The least of a back that is still a back: its own edge, and a gap after it.
 *
 * One pixel of border in Magia's colour and two of the black it frames. A
 * single pixel of gap was tried and is too little — at that width the borders
 * touch and the stack reads as one hatched block rather than as cards — so the
 * gap is the two pixels it takes for the edges to stay separate. Below that
 * there is nothing left to thin, and a stack that adds an invisible card per
 * Zaklęcie is a picture that has stopped answering the question it is there
 * for.
 */
const SPELL_BACK_MIN_STEP = 3;

/**
 * Zaklęcia somebody is holding that nobody else may look at (9.3).
 *
 * Drawn rather than omitted, because how many a rival holds is public — the
 * cards are visibly in their hand — and that count is exactly the thing you
 * weigh before attacking them. What is not public is which, so this is the
 * printed back, as many times as there are cards.
 *
 * It used to be a number in a tinted rectangle: a count where every neighbour
 * in the row was a picture, and 131px tall in a row of 80px tiles. The stack
 * says the same number in the row's own language, and the caption still says it
 * in figures for anybody counting past three.
 *
 * „×3 Zaklęcie" and not „3 zakryte Zaklęcia". The picture is of card backs, so
 * saying they are face down is captioning what the reader can see; and „×3" is
 * a count of a thing, which is why the noun after it stays singular however
 * many there are — the same shape a Karta Postaci's starting kit is written in,
 * which is where this came from.
 *
 * One tile wide, whatever the count. Each back shows twenty pixels of the one
 * under it, which is chosen from the top of the range: at three cards the stack
 * is 52 + 2 x 20 = 92, exactly a Przedmiot's tile, so the hand 2.6 allows on
 * Magia alone occupies one place in the row. Two come to 72 and one to 52 —
 * narrower, and narrower by the same step, which is what makes a column of
 * these look measured rather than fitted.
 *
 * Past three the step closes up instead of the stack growing. A fourth Zaklęcie
 * is reachable — the Różdżka Zaklęć is the one card in the box that says so —
 * and at twenty it stood 112 across, so it wrapped onto a row of its own,
 * dragging its caption with it and leaving a gap where it had been. So the step
 * is whatever divides the tile: 13.3 at four, and smaller again beyond that.
 *
 * Which runs out at fourteen, and that end is drawn rather than left to happen.
 * Forty pixels of room over three apiece is thirteen cards behind the top one;
 * a fifteenth would have to be thinner than its own edge and a gap, which is a
 * card nobody can pick out. So the stack stops there and the caption carries
 * the rest — it says the true number in figures, which is what it is for, and
 * the picture says „more than you can count", which is true.
 *
 * None of this is reachable in a game: 2.6 caps the hand at three and the
 * Różdżka lifts it to four. It is here because a picture whose only rule is
 * „never wider than a tile" has to say what it does when it cannot keep it.
 */
export function CardBack({ count }: { count: number }) {
  const room = TILE_WIDTH - SPELL_BACK_WIDTH;
  const most = 1 + Math.floor(room / SPELL_BACK_MIN_STEP);
  const drawn = Math.max(0, Math.min(count, most));
  /**
   * Whole pixels, and the stack's own width declared from them.
   *
   * A fractional step is not a length a browser draws. It rounded 13.333 *up*,
   * to a stack of 92.03 where a tile takes 92 — so in a row with exactly one
   * tile of room left it wrapped onto a line of its own, which is the thing all
   * this arithmetic exists to prevent. Rounding to a thirty-second of a pixel
   * fixed the wrap and left the other half: at 3.0625 apiece every card lands
   * on a different sub-pixel phase, so its 1px border is drawn 1px wide or 2px
   * wide depending where it fell, and a stack of evenly spaced cards came out
   * visibly uneven.
   *
   * So the step is a whole number of pixels — the same gap between every pair,
   * drawn the same way — and the stack is as wide as that makes it rather than
   * exactly a tile: 91 at fourteen, 87 at eight, centred in the tile's width
   * either way. The declared width is what keeps the tile from being pushed
   * out by a hair of overflow inside it.
   */
  const step =
    drawn > 1
      ? Math.min(SPELL_BACK_STEP, Math.max(SPELL_BACK_MIN_STEP, Math.floor(room / (drawn - 1))))
      : SPELL_BACK_STEP;
  const wide = SPELL_BACK_WIDTH + (drawn - 1) * step;
  return (
    <figure className="flex flex-col items-center gap-1">
      <span className="flex items-center" style={{ width: wide, height: TILE_ART_HEIGHT }}>
        {Array.from({ length: drawn }, (_, at) => (
          <Image
            key={at}
            src="/cards/back-zaklecie.jpg"
            alt=""
            width={SPELL_BACK_WIDTH}
            height={TILE_ART_HEIGHT}
            // The card is 52 wide and shows `step` of it: the overlap is the
            // difference, and a fraction of a pixel is a thing browsers lay out
            // exactly and blades do not.
            style={{
              ...(at > 0 ? { marginLeft: step - SPELL_BACK_WIDTH } : {}),
              /**
               * Opaque, and the reason it has to be.
               *
               * The border was `border-magia/40`, and a border is painted
               * *around* an image rather than under it — so the top and bottom
               * rows of the stack are one card's ring over the next one's, and
               * a fourteenth of a hand put fourteen coats of 40% blue on the
               * same pixel. It came out a saturated band along both edges while
               * every vertical, being a single ring over an opaque card, stayed
               * a hairline. Mixed to the same colour it was, against the ground
               * it is drawn on, it can be laid over itself all day.
               */
              borderColor: "color-mix(in srgb, var(--color-magia) 40%, var(--color-night))",
            }}
            /**
             * Every card rounded, the shape they actually are.
             *
             * The middle ones were squared while the top and bottom edges were
             * a saturated band, on the theory that a 4px radius in a 3px sliver
             * is all curve and a row of curves serrates. The band turned out to
             * be the see-through border stacking on itself, and with that fixed
             * the curves are what they are: a scallop a pixel deep, which is
             * what a fan of rounded cards looks like from the side.
             */
            className="rounded border"
          />
        ))}
      </span>
      {/* A tile's width, and truncated in it, exactly as a card's name is. The
          caption is part of what has to fit in one place in the row: „4 zakryte
          Zaklęcia" was wider than the picture above it and took the whole tile
          onto a line of its own. */}
      <figcaption
        style={{ width: TILE_WIDTH }}
        title={`${count} Zaklęcie`}
        className="truncate text-center text-[9px] leading-tight text-magia/80"
      >
        ×{count} Zaklęcie
      </figcaption>
    </figure>
  );
}

/**
 * The card, big, with everything printed on it and everything the app knows.
 *
 * Opened by tapping a tile. This is where the text lives now — off the seat
 * cards, which were carrying three lines of small print per possession and
 * became unreadable the moment anybody owned more than two things.
 */
export function CardDetail({ card, onClose }: { card: TileCard; onClose: () => void }) {
  // A Postać is looked up in its own manifest, and the flag is the only thing
  // that knows to: `demon` and `czarodziej` each name a character *and* an
  // event card, so the id alone would hand back the wrong picture rather than
  // none — the failure that is hardest to notice.
  const src = faceFor(card);
  // Coverage is about Karty Zdarzeń — whether the app can carry out what a card
  // does when it is drawn. A Karta Postaci is not drawn and not resolved; it is
  // who you are for the whole game. Asking the registry about one got "brak"
  // by default, so every character opened with "rozpatrzcie sami — aplikacja
  // jej nie prowadzi" printed under it, which is not true of anything.
  const coverage = card.character ? "pelne" : coverageOf(card.cardId);
  const note = card.character ? null : manualNote(card.cardId);

  return (
    <Overlay label={card.name} onDismiss={onClose} layer={LAYER.card}>
      <div className="flex max-h-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg border border-edge bg-panel p-4 sm:flex-row">
        {src && (
          // `relative`, so the mark can sit on the card rather than beside it:
          // that is where it is true, and a reader looking at a picture of a
          // card should not have to look away from it to learn the picture is
          // of one that was conjured.
          <div className="relative shrink-0 self-center">
          <Image
            src={src}
            alt={card.name}
            // A Karta Postaci is a different shape from a Karta Zdarzeń and
            // carries four numbered clauses of Charakterystyka in print small
            // enough that the whole point of opening it is to read them. So it
            // is drawn larger, and at its own proportions.
            width={card.character ? 340 : 260}
            height={card.character ? 422 : 369}
            className="rounded"
            unoptimized={card.character}
          />
            {card.granted && (
              <span className="absolute bottom-1 right-1 rounded bg-night/85 px-1 py-0.5">
                <CardMark mark="granted" size={26} />
              </span>
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="font-[family-name:var(--font-display)] text-lg text-ochre">
              {card.name}
            </h3>
            <CloseButton onClose={onClose} />
          </div>
          {card.kindLabel && (
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">
              {card.kindLabel}
            </p>
          )}
          {/* Printed text, and printed text cites nothing: no card in the box
              carries a rule number. The note below is the app's own writing and
              is the one thing here that could. */}
          {card.text && (
            <p className="whitespace-pre-line text-xs leading-relaxed text-muted">{card.text}</p>
          )}
          {coverage !== "pelne" && (
            <p
              className={`mt-3 rounded border-l-2 px-2 py-1 text-[11px] leading-snug ${
                coverage === "brak"
                  ? "border-vermilion/50 bg-vermilion/5 text-vermilion/90"
                  : "border-ochre/50 bg-ochre/5 text-ochre/90"
              }`}
            >
              <WithRules text={note ?? NOT_HANDLED} />
            </p>
          )}
        </div>
      </div>
    </Overlay>
  );
}
