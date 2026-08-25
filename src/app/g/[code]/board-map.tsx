"use client";

import type { FieldId } from "@/lib/engine/board";

import { useState } from "react";
import {
  BRIDGE_LINKS,
  CELLS,
  CELL_BY_ID,
  SEAT_COLOURS,
  VIEW,
  dotPositions,
  type Cell,
} from "@/lib/engine/boardMap";

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
  cardsOnFields?: Partial<Record<FieldId, number>>;
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
        />
      ))}

      {/* A card waiting on a field changes what a move is worth, so it has to be
          visible from the map rather than only once you land there. */}
      {CELLS.map((cell) =>
        cardsOnFields[cell.id] ? (
          <g key={`cards-${cell.id}`} style={{ pointerEvents: "none" }}>
            <rect
              x={cell.x + cell.w - 26}
              y={cell.y + 6}
              width={20}
              height={16}
              rx={3}
              fill="#d9a441"
              stroke="#10131f"
              strokeWidth={1.5}
            />
            <text
              x={cell.x + cell.w - 16}
              y={cell.y + 18}
              textAnchor="middle"
              fontSize={12}
              fill="#10131f"
            >
              {cardsOnFields[cell.id]}
            </text>
          </g>
        ) : null,
      )}

      {[...occupants.entries()].map(([fieldId, here]) => {
        const cell = CELL_BY_ID.get(fieldId);
        if (!cell) return null;
        const spots = dotPositions(cell, here.length);
        return here.map((seat, i) => (
          <g key={seat.id}>
            <circle
              cx={spots[i].x}
              cy={spots[i].y}
              r={11}
              fill={SEAT_COLOURS[seat.seatIndex % SEAT_COLOURS.length]}
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
}: {
  cell: Cell;
  active: boolean;
  highlighted: boolean;
  hovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onPick?: (fieldId: FieldId) => void;
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
      <Label cell={cell} />
      <title>{cell.name}</title>
    </g>
  );
}

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
function Label({ cell }: { cell: Cell }) {
  const inner = cell.w - 12;
  const longest = Math.max(...cell.name.split(" ").map((word) => word.length));
  // Rough advance width of this typeface at size 1. Measured against the
  // rendered map rather than taken from the font's metrics, because the label
  // only has to stay inside a box, not typeset well.
  const PER_CHAR = 0.54;
  const size = Math.max(9, Math.min(19, inner / (longest * PER_CHAR)));
  const perLine = Math.max(longest, Math.floor(inner / (size * PER_CHAR)));
  const lines = wrap(cell.name, perLine);
  const lineHeight = size * 1.12;
  // Anchored to the top of the cell rather than centred, because the bottom of
  // every cell belongs to the player dots — a name and a figure standing on it
  // are both wanted at once, and centring both puts them on top of each other.
  const top = cell.y + 8 + size;
  return (
    <text
      textAnchor="middle"
      fontSize={size}
      fill="#c9d0e4"
      style={{ pointerEvents: "none" }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={cell.cx} y={top + i * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
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
