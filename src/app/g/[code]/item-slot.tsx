"use client";

/**
 * One place a card can sit, whether that place is on the body or in the pack.
 *
 * The pack and the paper doll had grown apart: different sizes, different hover
 * behaviour, and clicking meant one thing in the pack and another on the body.
 * They are the same object to a player — a card you can pick up and put
 * somewhere else — so they are one component here, and anything that should
 * feel the same is the same code rather than two copies kept in step by hand.
 *
 * The picture is the illustration cut off the card, never the card itself: at
 * this size a whole card is a four-pixel title over a grey smear of prose. The
 * whole card is a hover away, and that hover is shared too.
 */

import Image from "next/image";
import { TILE_ART_HEIGHT, TILE_WIDTH, cardArtUrl } from "@/lib/view/cardImages";
import { useCardPreview } from "./card-preview";
import type { EqMode } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";
import type { TileCard } from "./card-tile";
import { CardMark, type SlotMark } from "./card-mark";
import { ART_BORDER, PICKABLE } from "./pickable";

/**
 * One size, everywhere.
 *
 * The illustration export cuts 240x209 off a Karta Zdarzeń, so the picture box
 * takes that shape. Anything else either letterboxes the art or crops it, and
 * every card of that family has the same proportions now, so one ratio serves
 * all of them.
 *
 * It used to say 155, which is the *Karta Postaci's* frame — a different card
 * with a different shape, 28 pictures against 236. Every item illustration in
 * the app was being cropped by a quarter of its height to fit a box built for
 * something else, and nobody could see it because nobody had seen the whole
 * picture. `export-card-art.mjs` now settles the aspect where the pictures are
 * made; this is the same number read off the other end.
 */
/** Both the shared tile size — see `cardImages.ts`. Re-exported under the names
 * the slot panel and the spell hand already lay their grids out with. */
export const SLOT_WIDTH = TILE_WIDTH;
export const SLOT_ART_HEIGHT = TILE_ART_HEIGHT;

/**
 * How far a card steps aside to show where a carried one is going.
 *
 * Not a whole square. The place is drawn behind the card in the square it is
 * vacating, so what opens is a sliver of it — enough to see that there is a
 * place there and where, with the card that made room still overlapping most
 * of it. A whole square is impossible here anyway: the pack wraps, and the card
 * at the end of a row has no square beside it to move into.
 */
const STEP_ASIDE = Math.round(SLOT_WIDTH * 0.45);

export interface SlotOccupant {
  holdingId: string;
  cardId: string;
  card: TileCard;
  /**
   * Conjured by the test shortcut rather than won.
   *
   * Carried on the card rather than passed to the place, because that is what
   * it is true of: the same card is marked in the pack, on the paper doll and
   * in the hand, and none of those has to be told.
   */
  granted?: boolean;
  /**
   * Worn, and doing nothing — 5.3, after the Natura moved under it (7.2).
   *
   * On the card for the same reason `granted` is: it is true of the card and
   * whoever is holding it, not of the place, and the place should not have to
   * be told. It is *not* taken off on their behalf — see `inEffect` — so this
   * is the whole of how a player learns that the Topór on their arm has
   * stopped counting.
   */
  inert?: boolean;
}

/** How the place should look, which is mostly about what a moving card would do. */
export type SlotTone = "empty" | "filled" | "chosen" | "accepts" | "rejects" | "candidate";

/**
 * Two questions, answered in two strengths.
 *
 * A card in the air asks every place the same thing, and each answers twice
 * over: *this is somewhere it could go* — dashed and faint, the way an empty
 * place is drawn, because nothing is happening here yet — and *this is where it
 * would go* — solid and filled in, because it is. Green for yes and red for no
 * (5.4, 17.2), and the pack rectangle says it the same way, since a player
 * dropping a Miecz is not asking a different question of the two.
 *
 * Said while the card is still in the air, rather than as a refusal after the
 * fact.
 */
/**
 * A card that is here and unavailable is drawn like a place that would refuse
 * one: red, solid, in the same two colours the panel already speaks in.
 *
 * The rule lives here rather than in each panel because it is the same rule
 * wherever a card is drawn — worn, in the pack, and in whatever holds the
 * Nieznajomi next. What *makes* a card unavailable is not this file's business:
 * 5.3 and a Natura are the seat card's to work out, and they arrive as one
 * boolean on the card.
 */
const TONE: Record<SlotTone, string> = {
  accepts: "border-solid border-verdigris bg-verdigris/25",
  rejects: "border-solid border-vermilion bg-vermilion/25",
  candidate: "border-dashed border-verdigris/60 bg-verdigris/10",
  filled: `border-solid ${ART_BORDER} bg-raised`,
  /**
   * Picked out of a row by something the player is deciding, not by the pointer.
   *
   * The frame is the resting one, deliberately: the *paper* is what changes,
   * washed gold by `WASH` below. Borders were the wrong instrument for this —
   * a chosen card and a hovered card were competing for the same edge, so
   * either the hover had nowhere louder to go or the choice was a weight of
   * border you had to look twice at. The tint leaves the edge free, and the
   * pointer goes on doing what it does everywhere else in the app.
   *
   * It exists because the alternative was dimming everything else, and the
   * trofea already spend dimming on „this one is gone": one fade cannot mean
   * both "spent" and "not in this trade" in the same row.
   */
  chosen: `border-solid ${ART_BORDER} bg-raised`,
  empty: "border-dashed border-edge/70 bg-night/40",
};

/**
 * Tones that colour the paper rather than the frame.
 *
 * Multiplied, not laid over, so the ink stays black and only the paper takes
 * the colour — which is the only thing that works on these scans, pen and ink
 * with almost nothing in between. `mix-blend-color` keeps the backdrop's
 * luminosity and does nothing at all here.
 *
 * Red for a card the square would refuse, gold for one the player has picked.
 * Two answers to two different questions, and neither is a border, which is
 * what leaves the border free to answer the pointer.
 */
/**
 * The tones that are an answer to a card in the air rather than a description
 * of what is here. While one of these is showing, the pointer says nothing.
 */
const ANSWERING = new Set<SlotTone>(["accepts", "rejects", "candidate"]);

const WASH: Partial<Record<SlotTone, string>> = {
  rejects: "bg-vermilion",
  chosen: "bg-ochre/75",
};

export function ItemSlot({
  item,
  label,
  glyph,
  icon,
  tone,
  lifted = false,
  dimmed = false,
  marks = [],
  struck = false,
  draggable = false,
  disabled = false,
  passive = false,
  onClick,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onPointerEnter,
  onPointerLeave,
  corner,
  children,
  eqMode = "classic",
  nature = null,
  quiet = false,
  step = 0,
}: {
  /** What is here, or null for an empty place. */
  item: SlotOccupant | null;
  /** Written under the picture: the card's name, or what the empty place is for. */
  label: string;
  /** Drawn in an empty place, so a gap says which gap it is. */
  glyph?: string;
  /**
   * An SVG to draw in an empty place instead of a glyph.
   *
   * Used as a CSS mask rather than an `<img>`, so the shape takes the slot's
   * own text colour and dims and lights with everything else on it. The files
   * are single black paths on nothing, which is exactly what a mask wants.
   */
  icon?: string;
  tone: SlotTone;
  /** It is on the cursor; this is the hollow it left. */
  lifted?: boolean;
  dimmed?: boolean;
  /** What is true of this card, drawn on the bottom-right of the picture. */
  marks?: readonly SlotMark[];
  /**
   * Struck through: this card is out of the game, and the tile is a record.
   *
   * A cross over the whole picture, in the colour nothing recoverable uses.
   * Dimming alone was carrying it, and dimming is a *degree* — it says "less"
   * where this has to say "not any more", and a row where some cards are faint
   * because they are spent and others because they are merely unpicked asks
   * the eye to measure opacity. A line through it is not a degree.
   */
  struck?: boolean;
  draggable?: boolean;
  disabled?: boolean;
  /**
   * Drawn, and not a target: every pointer and drag event goes through it.
   *
   * `disabled` is not the same thing and does not do this — it is worse than
   * nothing here. A disabled button is not inert: the browser dispatches no
   * mouse event on it *at all*, so the click does not reach the square, does
   * not bubble past it, and simply never happens. It says nothing can be done
   * here and then eats the gesture meant for whatever is behind it.
   *
   * The pack's free squares are behind-something squares: they are 5.4's
   * remaining room, drawn, and the rectangle they sit in is the place. A card
   * dropped in the fourth square does not go to the fourth square, it goes on
   * the end. So putting a card down on one did nothing whatever —
   * `elementFromPoint` over a free square answered with the „+" inside its
   * disabled button — and taking something off the body had to be aimed at the
   * margin between the squares, missing the widest part of the target.
   */
  passive?: boolean;
  onClick?: (event: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onDragStart?: (event: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  /** Drawn over the top-right of the picture, such as the take-off cross. */
  corner?: React.ReactNode;
  /** Controls under the name. */
  children?: React.ReactNode;
  /** Decides whether the hover may say "gdy założony" — only slotowy has places. */
  eqMode?: EqMode;
  /** Who is looking, so a 5.3 restriction can say whether THEY pass it. */
  nature?: Nature | null;
  /**
   * A card is in the air somewhere, so this one holds its tongue.
   *
   * Reading and moving are different modes and they were fighting: crossing the
   * pack with a card on the cursor opened a full-size Karta over the very place
   * you were aiming at, and it landed exactly where the pointer had to be. The
   * hover is for reading, and nobody is reading mid-drag.
   */
  quiet?: boolean;
  /** Which way this card has stepped aside to show where a carried one lands. */
  step?: -1 | 0 | 1;
}) {
  // The hover is suppressed while the card is on the cursor: what is under the
  // pointer then is a hollow, and describing it as though it still held
  // something is a lie.
  const { handlers, preview } = useCardPreview(
    item && !lifted && !quiet ? item.card : null,
    false,
    eqMode,
    nature,
  );
  const art = item ? cardArtUrl(item.cardId) : null;

  /**
   * Everything to draw on the corner: what the caller named, plus what the card
   * says about itself.
   *
   * `granted` is folded in here rather than being passed, because it belongs to
   * the card and not to the place — otherwise every view that draws a card has
   * to remember, and two of the three did not.
   *
   * A Set because both routes can name the same thing, and a card marked twice
   * is a card marked wrong.
   */
  const corners = [...new Set([...marks, ...(item?.granted ? (["granted"] as const) : [])])];

  // While its card is in the air the place is a hollow, and it should look like
  // one: the picture fading inside a full-looking frame reads as a card that
  // has gone dim, not as a place you have emptied. It still answers for itself
  // when something is held over it — that question is about where the card in
  // the air would land, not about where it came from.
  //
  // `candidate` is not downgraded with it, and that is the point: where a card
  // came from is somewhere it fits, so it is a place the card in the air could
  // go — the same dashed green every other place that would take it is wearing,
  // said for the same reason. It used to be the one square that fitted and did
  // not say so, which read as "not back here" about the commonest thing anybody
  // does with a card they have picked up and thought better of.
  const shown: SlotTone =
    lifted && tone === "filled"
      ? "empty"
      : // A card that is here and unavailable is red, wherever it is drawn: on
        // the body, in the pack, or in whatever holds the Nieznajomi next. Only
        // where the place is otherwise just showing what is in it — a place
        // answering a card in the air is answering about that card, not this
        // one.
        item?.inert && tone === "filled"
        ? "rejects"
        : tone;

  return (
    /**
     * The place, which is bigger than the picture in it.
     *
     * Every pointer question — is this the card being hovered, is this where a
     * carried one would land, is a drag over it — is asked of this box and not
     * of the framed picture inside it, and the gap that opens in front of a
     * card is padding *here* rather than a margin out there. That is the whole
     * fix for a loop the pack could otherwise not get out of: opening the gap
     * slides the picture out from under the pointer, which fires its leave,
     * which closes the gap, which slides the picture back under the pointer.
     * The card shivers and the gap strobes.
     *
     * Asking the outer box instead makes the gap part of what is being hovered,
     * so the pointer never leaves and the question never changes its own
     * answer. Anything that grows or moves a slot from now on is safe by
     * construction rather than by remembering not to listen for the leave.
     */
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      {...handlers}
      style={{ width: SLOT_WIDTH }}
      className={`relative shrink-0 ${passive ? "pointer-events-none" : ""}`}
    >
      {/* The place, drawn behind whatever is in this square — so the sliver a
          card uncovers by sliding aside is the part you see. Behind every card
          that has moved, not only the one being aimed at: they are all sliding
          along the same opening, and the one that matters is the one under the
          pointer, which needs no extra marking to be found. */}
      {step !== 0 && (
        <span
          aria-hidden
          style={{ width: SLOT_WIDTH, height: SLOT_ART_HEIGHT }}
          // Strong enough to read as a place through a sliver of itself. The
          // faint tint the whole rectangle uses works over a full square and
          // disappears over forty pixels of one.
          className="absolute left-0 top-0 rounded border border-dashed border-verdigris bg-verdigris/25"
        />
      )}
      <figure
        /**
         * The gap is drawn, not laid out.
         *
         * Everything from the insertion point rightwards steps aside, which is
         * what a hand does with a card it is about to be given — but it steps
         * aside by moving the picture only. The box above keeps the width and
         * the position it has at rest, so where the pointer is means the same
         * thing whether or not a gap happens to be open: move a card's width to
         * the right and you are over the next card, every time.
         *
         * Made of layout instead — a margin, or padding on the box above — the
         * row slid right underneath the pointer, and the card you were aiming
         * at was no longer the card you were over. You had to chase it.
         *
         * A stepped-aside picture takes no pointer events, or it would be over
         * its neighbour's resting place answering for a card that is not there.
         * Nothing is lost: a click anywhere in the pack lands where the gap is,
         * which is the same answer the card under it would have given.
         */
        style={{
          width: SLOT_WIDTH,
          transform: step === 0 ? undefined : `translateX(${step * STEP_ASIDE}px)`,
        }}
        className={`flex flex-col items-center gap-1 transition-transform duration-150 ${
          // Above the row while it is over somebody else's square, so a card
          // closing the hollow covers the faded one it is closing over rather
          // than being covered by it.
          step === 0 ? "" : "pointer-events-none relative z-10"
        }`}
      >
        <div
          style={{ width: SLOT_WIDTH, height: SLOT_ART_HEIGHT }}
          // `isolate` because of the wash below: a blend mode reaches down
          // through everything under it in its stacking context, and this one
          // has no business colouring the panel the slot is sitting on.
          //
          // No hover ring while the square is answering a card in the air.
          //
          // This comment used to say that green and red must not be overruled
          // by the pointer, directly above a class list that let exactly that
          // happen: `PICKABLE` came last, so its gold border won — and it won
          // precisely when the answer mattered, because dropping a card means
          // putting the pointer on the square you are asking about. An empty
          // place has no picture for the red wash to tint, so the border was
          // the whole of the answer and the answer was gold.
          //
          // The hover is for reading: thin gold means you can reach this,
          // thicker gold means you are. Neither is a thing to say while
          // somebody is holding a card over it.
          className={`relative isolate overflow-hidden rounded border ${TONE[shown]} ${
            disabled || lifted || ANSWERING.has(shown) ? "transition" : PICKABLE
          }`}
        >
          <button
            type="button"
            disabled={disabled}
            draggable={draggable}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            title={item ? item.card.name : label}
            className={`block h-full w-full transition ${
              draggable
                ? "cursor-grab active:cursor-grabbing"
                : disabled
                  ? "cursor-default"
                  : "cursor-pointer"
            } ${lifted ? "opacity-25" : dimmed ? "opacity-45" : ""} ${
              // Desaturated and dimmed *before* the red goes on. Tinting alone
              // lit the picture up like a torch — a bright wash over white ink
              // reads as an item that has caught fire, which is the opposite of
              // "you cannot use this". Grayscale first is what the rest of the
              // world does with an unusable icon, and it matters here for the
              // card art that is not pen and ink; the dimming is what makes the
              // wash land dark instead of hot.
              shown === "rejects" ? "grayscale brightness-[0.55]" : ""
            }`}
          >
            {item && art ? (
              <Image
                src={art}
                alt={item.card.name}
                width={SLOT_WIDTH}
                height={SLOT_ART_HEIGHT}
                className="h-full w-full object-cover"
              />
            ) : item ? (
              // No scan in this checkout: the name is what the picture stood for.
              <span className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] leading-tight text-ink">
                {item.card.name}
              </span>
            ) : icon ? (
              <span className="flex h-full w-full items-center justify-center text-muted/30">
                <span
                  aria-hidden
                  style={{
                    WebkitMaskImage: `url(${icon})`,
                    maskImage: `url(${icon})`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                    backgroundColor: "currentColor",
                    width: 34,
                    height: 34,
                  }}
                />
              </span>
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[22px] text-muted/30">
                {glyph}
              </span>
            )}
          </button>

          {/* The picture itself goes red, not only the frame round it.
              
              A border says "this square is wrong" and the card inside it goes
              on looking exactly as usable as its neighbours, which is the one
              thing it is not — and on a wall of a dozen cards the eye finds the
              odd colour long before it finds the odd outline.

              Three things, in the order everything else does them: desaturate,
              dim, then tint. The dimming is on the picture above; this is the
              tint, multiplied rather than laid over, so the ink stays black and
              only the paper takes the colour. `mix-blend-color` was the first
              thing tried and does nothing at all here — it keeps the backdrop's
              own luminosity, and these scans are pen and ink with almost
              nothing in between.

              Above the picture and below the corner marks, which have their own
              ground and are meant to be read off it. */}
          {WASH[shown] && (
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-0 ${WASH[shown]} mix-blend-multiply`}
            />
          )}

          {/* Drawn across the picture rather than over the whole square, so the
              corner marks and the name below stay readable — this says the card
              is gone, not that the tile is unreadable. Two lines rather than a
              single strike: a bar across a picture reads as a redaction, and an
              X is the mark somebody puts on a thing that is done with. */}
          {struck && (
            <span aria-hidden className="pointer-events-none absolute inset-0">
              <span className="absolute left-1/2 top-1/2 h-0.5 w-[140%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-vermilion/70" />
              <span className="absolute left-1/2 top-1/2 h-0.5 w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-vermilion/70" />
            </span>
          )}

          {/* Bottom-right, together, because they answer the same question and
              a player scanning a pack should only have to look in one place.
              Clear of the corner button opposite and of the name below. */}
          {corners.length > 0 && !lifted && (
            <span className="absolute bottom-0 right-0 flex items-center gap-0.5 rounded-tl bg-night/85 px-1 py-0.5">
              {corners.map((mark) => (
                <CardMark key={mark} mark={mark} />
              ))}
            </span>
          )}
          {corner}
        </div>

        <figcaption
          style={{ width: SLOT_WIDTH }}
          title={label}
          className={`truncate text-center text-[9px] leading-tight ${
            item && !lifted ? "text-muted" : "text-muted/50"
          }`}
        >
          {label}
        </figcaption>
        {/* The controls go quiet with the card they belong to: "załóż" under a
          card that is currently on the cursor is an offer to do the thing you
          are already in the middle of doing.

          A flex column, and not a plain block, because the controls are text
          the size of a footnote inside a panel whose line-height is 24px: an
          inline button in a block sits on a baseline in the middle of that
          line box, with ten dead pixels above it. The Plecak's controls were
          already inside a `flex` of their own and sat tight under the name;
          the hand's single „rzuć" was not, and drifted half a line down. Which
          of the two was right was not a decision anybody made — it fell out of
          whether the caller happened to wrap what it passed.

          Drawn only when there is something to put in it: the row's own gap
          would otherwise leave four pixels under every card that has no
          controls at all, which is every card on somebody else's seat. */}
        {children ? (
          <div
            className={`flex flex-col items-center ${
              lifted ? "pointer-events-none opacity-30" : ""
            }`}
          >
            {children}
          </div>
        ) : null}
      </figure>
      {preview}
    </div>
  );
}
