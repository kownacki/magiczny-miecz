"use client";

import type { FieldId } from "@/lib/engine/board";
import type { CardId } from "@/data/ids";
import { cardArtUrl } from "@/lib/view/cardImages";

import { useState } from "react";
import { BRIDGE_LINKS, CELLS, CELL_BY_ID, VIEW, dotPositions, type Cell, seatColour } from "@/lib/view/boardMap";
import { FIELDS } from "@/lib/engine/board";
import { SLOT_ICON } from "@/lib/view/slotIcons";
import { offersHere } from "./field-offers";
import { CARD_RATIO } from "@/lib/view/cardImages";

export interface MapSeat {
  id: string;
  seatIndex: number;
  name: string;
  fieldId: FieldId | null;
  eliminated: boolean;
}

/**
 * The board, as a map of who is where.
 *
 * This exists because the app kept the position of every figure in a database
 * and showed it as a word. Four players and a word each is not a board — you
 * cannot see that two of you are about to collide, or that the Karczma is three
 * fields the other way. It serves both modes: in simulation it *is* the board,
 * and in companion mode it is the check that the app and the table still agree
 * about where everybody is standing.
 */
export function BoardMap({
  seats,
  activeSeatIndex,
  cardsOnFields = {},
  highlight = [],
  onPick,
}: {
  seats: MapSeat[];
  activeSeatIndex: number | null;
  /** Fields with cards lying face up on them (16.8). */
  /** What is lying on each field (16.8), topmost first. */
  cardsOnFields?: Partial<Record<FieldId, { id: string; cardId: CardId }[]>>;
  /** Fields the active character could move to, highlighted while choosing. */
  highlight?: FieldId[];
  onPick?: (fieldId: FieldId) => void;
}) {
  const [hovered, setHovered] = useState<FieldId | null>(null);

  const occupants = new Map<FieldId, MapSeat[]>();
  for (const seat of seats) {
    if (!seat.fieldId || seat.eliminated) continue;
    const list = occupants.get(seat.fieldId) ?? [];
    list.push(seat);
    occupants.set(seat.fieldId, list);
  }

  const activeField =
    seats.find((seat) => seat.seatIndex === activeSeatIndex)?.fieldId ?? null;
  const highlighted = new Set(highlight);

  return (
    <svg
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      // Sized by its container rather than by a fixed width: on the game
      // screen the board gets half the viewport and the height runs out first.
      className="h-full max-h-full w-full select-none"
      role="img"
      aria-label="Mapa planszy"
    >
      <rect x={0} y={0} width={VIEW.width} height={VIEW.height} fill="#10131f" />

      {BRIDGE_LINKS.map((link) => {
        const from = CELL_BY_ID.get(link.from);
        const to = CELL_BY_ID.get(link.to);
        if (!from || !to) return null;
        return (
          <line
            key={`${link.from}-${link.to}`}
            x1={from.cx}
            y1={from.cy}
            x2={to.cx}
            y2={to.cy}
            stroke="#38405c"
            strokeWidth={3}
            strokeDasharray="10 8"
          />
        );
      })}

      {CELLS.map((cell) => (
        <FieldShape
          key={cell.id}
          cell={cell}
          active={cell.id === activeField}
          highlighted={highlighted.has(cell.id)}
          hovered={hovered === cell.id}
          onEnter={() => setHovered(cell.id)}
          onLeave={() => setHovered((at) => (at === cell.id ? null : at))}
          onPick={onPick}
          /* What has settled here, because a shop is as often a Karta lying on
             a square as a desk the board printed (21.1). */
          lying={cardsOnFields[cell.id]}
        />
      ))}

      {/* What is lying on a field changes what a move is worth, so it belongs on
          the map and not only in the panel once you have landed there. The
          picture rather than a number, because "there is a Cyklop on Kurhan" is
          a different decision from "there is something on Kurhan" — and the
          illustration is the one part of a card legible at this size.

          Bottom-right, opposite the player dots, so a field with both reads as
          who is here on one side and what is here on the other. */}
      {CELLS.map((cell) => {
        const here = cardsOnFields[cell.id];
        if (!here?.length) return null;
        const w = Math.min(34, cell.w / 2.4);
        const h = w * (323 / 370); // the art's own proportion — see export-card-art
        const x = cell.x + cell.w - w - 5;
        const y = cell.y + cell.h - h - 5;
        const art = cardArtUrl(here[0].cardId);
        return (
          <g key={`cards-${cell.id}`} style={{ pointerEvents: "none" }}>
            {art ? (
              <image
                href={art}
                x={x}
                y={y}
                width={w}
                height={h}
                preserveAspectRatio="xMidYMid slice"
                clipPath="inset(0 round 2)"
              />
            ) : (
              <rect x={x} y={y} width={w} height={h} rx={2} fill="#2b3149" />
            )}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={2}
              fill="none"
              stroke="#d9a441"
              strokeWidth={1.5}
            />
            {/* Only the top card is drawn, so a field holding more says how
                many rather than pretending one is all of it. */}
            {here.length > 1 && (
              <>
                <circle cx={x} cy={y} r={7.5} fill="#d9a441" stroke="#10131f" strokeWidth={1.5} />
                <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9.5} fill="#10131f">
                  {here.length}
                </text>
              </>
            )}
          </g>
        );
      })}

      {[...occupants.entries()].map(([fieldId, here]) => {
        const cell = CELL_BY_ID.get(fieldId);
        if (!cell) return null;
        const spots = dotPositions(cell, here.length);
        /**
         * One dot per figure, and it says nothing about Kamień.
         *
         * Which is a gap with its eyes open rather than an oversight. 20.1's
         * subject is literally what stands on the board — „reprezentującą ją na
         * planszy Kartę należy zamienić na Kartę Zamieniony w Kamień" — and
         * this is the board. Everywhere the app draws a *figure* it makes that
         * swap (`figureUrl`: the turn bar, the roster, the Obszar's Gracze
         * shelf); here it draws a coloured circle eleven pixels across, which
         * has nowhere to put a card and no room for a mark that would still
         * read at this size beside five others on one square.
         *
         * So it is left alone deliberately, and the note is here so that
         * whoever next changes what a seat looks like on the map — a figure
         * instead of a dot, a bigger dot, a ring — decides about the statue at
         * the same time rather than discovering afterwards that the one place
         * showing the whole board was the one place not showing this.
         */
        return here.map((seat, i) => (
          <g key={seat.id}>
            <circle
              cx={spots[i].x}
              cy={spots[i].y}
              r={11}
              fill={seatColour(seat.seatIndex)}
              stroke={seat.seatIndex === activeSeatIndex ? "#f0e6d2" : "#10131f"}
              strokeWidth={seat.seatIndex === activeSeatIndex ? 4 : 2}
            />
            <title>
              {seat.name} — {cell.name}
            </title>
          </g>
        ));
      })}
    </svg>
  );
}

/** Ring colours, dimmed so the player dots and the active field stay loudest. */
const REGION_FILL: Record<Cell["region"], string> = {
  gorny: "#232a40",
  srodkowy: "#1e2437",
  dolny: "#1a1f31",
  most: "#2b2035",
};

function FieldShape({
  cell,
  active,
  highlighted,
  hovered,
  onEnter,
  onLeave,
  onPick,
  lying,
}: {
  cell: Cell;
  active: boolean;
  highlighted: boolean;
  hovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onPick?: (fieldId: FieldId) => void;
  lying?: { id: string; cardId: CardId }[];
}) {
  const stroke = active
    ? "#d9a441"
    : highlighted
      ? "#4a9782"
      : hovered
        ? "#9aa2bd"
        : "#38405c";

  return (
    <g
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onPick ? () => onPick(cell.id) : undefined}
      style={{ cursor: onPick ? "pointer" : "default" }}
    >
      <rect
        x={cell.x + 2}
        y={cell.y + 2}
        width={cell.w - 4}
        height={cell.h - 4}
        rx={8}
        fill={highlighted ? "#1d3a33" : REGION_FILL[cell.region]}
        stroke={stroke}
        strokeWidth={active || highlighted ? 4 : 1.5}
      />
      <Label cell={cell} lying={lying} />
      <title>{cell.name}</title>
    </g>
  );
}

// Rough advance width of this typeface at size 1. Measured against the rendered
// map rather than taken from the font's metrics, because a label only has to
// stay inside a box, not typeset well.
const PER_CHAR = 0.54;

/**
 * The field's name, wrapped and sized to fit inside its cell.
 *
 * Half the fields are named things like "Strażnik Magicznych Wrót" and have to
 * fit a cell narrower than the phrase is long at any comfortable size, so the
 * type shrinks until the longest single word fits the width and the rest is
 * wrapped to match. Sizing off the longest *word* rather than the whole string
 * is the part that matters: a word cannot be broken, so it is what actually
 * sets the floor.
 */
function Label({ cell, lying }: { cell: Cell; lying?: { cardId: CardId }[] }) {
  const inner = cell.w - 12;
  const longest = Math.max(...cell.name.split(" ").map((word) => word.length));
  const size = Math.max(9, Math.min(19, inner / (longest * PER_CHAR)));
  const perLine = Math.max(longest, Math.floor(inner / (size * PER_CHAR)));
  const lines = wrap(cell.name, perLine);
  const lineHeight = size * 1.12;
  // Anchored to the top of the cell rather than centred, because the bottom of
  // every cell belongs to the player dots — a name and a figure standing on it
  // are both wanted at once, and centring both puts them on top of each other.
  const top = cell.y + 8 + size;
  /**
   * 13.4's count, drawn as that many face-down Karty under the name.
   *
   * The first thing worth knowing about a square you are thinking of moving to
   * — three Karty is a different place from none, and it decides most of what
   * the turn there will be — and until now it was only legible once you had
   * opened the Obszar. The whole point of the map is deciding *before* you go.
   *
   * The same height as the picture of what is lying here, bottom-right, so the
   * two read as one scale: what is on this square, and what it will deal you.
   * Backs and not a numeral because at this size a count of things is faster
   * than a digit, and the deck's own back is the one picture that means "a
   * Karta nobody has seen yet".
   *
   * Under the name rather than beside it: the bottom of a cell belongs to the
   * player dots and the bottom-right to the loot, and this is a caption on the
   * square's name.
   */
  const draw = FIELDS.get(cell.id)?.draw ?? 0;
  /**
   * Whether anybody on this square deals in gold — see `tradesForGold`.
   *
   * Through `offersHere` rather than the field's script directly, because a
   * shop is as often a Karta that settled here (21.1) as a desk the board
   * printed, and because that is where „MUSISZ" is already filtered out: the
   * Karczma can take a coin off you and is not a place you go shopping.
   */
  const trades = offersHere(cell.id, lying ?? []).some((offer) => offer.trade);
  const back = Math.min(34, cell.w / 2.4) * (323 / 370);
  const backW = back / CARD_RATIO;
  const dealY = top + (lines.length - 1) * lineHeight + size * 0.4;
  /**
   * The count as a numeral as well as as a fan.
   *
   * Two backs and three backs are one glance apart at this size and one of
   * them is a whole extra Karta, so the picture alone asks the reader to count
   * overlapping rectangles four pixels wide. The numeral says it outright and
   * the fan says what kind of thing is being counted; neither does the other's
   * job.
   *
   * Measured with `Label`'s own `PER_CHAR`, for the same reason it exists: the
   * group has to be centred on the cell, so its width has to be known before
   * it is drawn, and this only has to stay inside a box rather than typeset.
   */
  const dealSize = back * 0.62;
  /**
   * „, 3×" where both are here, „3×" where only the deal is.
   *
   * The comma rides on the tally rather than being drawn as a third thing,
   * which is what it is: one line reading „[sakwa], 3× [karty]" — there is a
   * merchant here, and the square deals three.
   */
  const tally = draw > 0 ? `${trades ? ", " : ""}${draw}×` : "";
  const tallyW = tally.length * dealSize * PER_CHAR;
  const fanW = draw > 0 ? (backW * (draw + 1)) / 2 + backW * 0.3 : 0;
  const purseW = trades ? back : 0;
  const dealX = cell.cx - (purseW + tallyW + fanW) / 2;
  const fanX = dealX + purseW + tallyW + backW * 0.3;

  return (
    <g style={{ pointerEvents: "none" }}>
      <text textAnchor="middle" fontSize={size} fill="#c9d0e4">
        {lines.map((line, i) => (
          <tspan key={i} x={cell.cx} y={top + i * lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
      {/**
        * The sakwa, drawn as a mask so it takes a colour.
        *
        * The file is a black silhouette on nothing — `card-mark.tsx` uses it
        * the same way through CSS, and on a dark cell an `<image>` of it would
        * be a black shape on a nearly black square. `mask-type: alpha` is what
        * makes the *shape* the mask rather than its brightness, which for an
        * all-black drawing would mask everything away.
        */}
      {trades && (
        <>
          <mask
            id={`sakwa-${cell.id}`}
            maskUnits="userSpaceOnUse"
            x={dealX}
            y={dealY}
            width={back}
            height={back}
            style={{ maskType: "alpha" }}
          >
            <image href={SLOT_ICON.pouch} x={dealX} y={dealY} width={back} height={back} />
          </mask>
          <rect
            x={dealX}
            y={dealY}
            width={back}
            height={back}
            fill="#d9a441"
            mask={`url(#sakwa-${cell.id})`}
          />
        </>
      )}
      {draw > 0 && (
        <>
          <text
            x={dealX + purseW}
            y={dealY + back * 0.74}
            fontSize={dealSize}
            fill="#7f8aa8"
            textAnchor="start"
          >
            {tally}
          </text>
          {Array.from({ length: draw }, (_, at) => (
            <image
              key={at}
              href="/cards/back-zdarzenie.jpg"
              /* Overlapped by half: at four Karty the fan is two and a half
                 cards wide, which fits the narrowest cell on the board. */
              x={fanX + (at * backW) / 2}
              y={dealY}
              width={backW}
              height={back}
              preserveAspectRatio="xMidYMid slice"
              clipPath="inset(0 round 1.5)"
              opacity={0.9}
            />
          ))}
        </>
      )}
    </g>
  );
}

function wrap(text: string, perLine: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= perLine) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
