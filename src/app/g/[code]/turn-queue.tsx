"use client";

/**
 * The turn bar: who is playing, who is next, and who is being passed over.
 *
 * The last of those is the reason this exists. Whose turn it is was already on
 * screen; what was invisible was a seat quietly sitting out because it drew
 * Labirynt three turns ago, or is frozen in Kamień for another two. Skipped
 * seats are therefore drawn in place rather than omitted — a queue that silently
 * shortens is exactly the thing that made turn order hard to follow.
 */

import Image from "next/image";
import { SEAT_COLOURS } from "@/lib/engine/boardMap";
import { characterStandeeUrl } from "@/lib/engine/cardImages";
import { plural } from "@/lib/engine/polish";
import { DEFAULT_DEPTH, projectQueue, type QueueEntry } from "@/lib/engine/turnQueue";

export interface QueueSeat {
  seatIndex: number;
  playerName: string | null;
  characterId: string | null;
  turnsLost: number;
  stoneUntilTurn: number | null;
  eliminated: boolean;
}

export function TurnQueue({
  seats,
  activeSeat,
  turn,
  mySeatIndex,
  depth = DEFAULT_DEPTH,
}: {
  seats: readonly QueueSeat[];
  activeSeat: number | null;
  turn: number;
  mySeatIndex: number | null;
  depth?: number;
}) {
  // Same filter finishTurn applies: a seat with no character is not in the
  // order at all, so it must not appear in a forecast of the order.
  const playing = seats.filter((seat) => seat.characterId);
  const queue = projectQueue(
    playing.map((seat) => ({
      index: seat.seatIndex,
      eliminated: seat.eliminated,
      turnsLost: seat.turnsLost,
      stoneUntilTurn: seat.stoneUntilTurn,
    })),
    activeSeat,
    turn,
    depth,
  );
  if (queue.length === 0) return null;

  const bySeat = new Map(playing.map((seat) => [seat.seatIndex, seat]));

  return (
    <nav
      aria-label="Kolejność tur"
      // Sits at the top of the right-hand column, so the rule goes underneath:
      // it separates the bar from the controls it sits above.
      className="flex w-full items-stretch gap-2 overflow-x-auto border-b border-edge/60 pb-3"
    >
      {queue.map((entry, at) => (
        <QueueChip
          key={`${entry.turn}-${entry.seatIndex}-${entry.status}-${at}`}
          entry={entry}
          seat={bySeat.get(entry.seatIndex)}
          // A new round starts here, so the bar says so rather than leaving the
          // player to count seats.
          startsTurn={at > 0 && entry.turn !== queue[at - 1].turn}
          mine={entry.seatIndex === mySeatIndex}
        />
      ))}
    </nav>
  );
}

function QueueChip({
  entry,
  seat,
  startsTurn,
  mine,
}: {
  entry: QueueEntry;
  seat: QueueSeat | undefined;
  startsTurn: boolean;
  mine: boolean;
}) {
  const colour = SEAT_COLOURS[entry.seatIndex % SEAT_COLOURS.length];
  const standee = seat?.characterId ? characterStandeeUrl(seat.characterId) : null;
  const name = seat?.playerName ?? `Miejsce ${entry.seatIndex + 1}`;
  const skipped = entry.status === "skipped";
  const active = entry.status === "active";

  // Never colour alone: the reason is spelled out on the chip, so a player who
  // cannot separate the seat colours still reads the same information.
  const reason = skipped
    ? entry.reason === "stone"
      ? `Kamień — jeszcze ${entry.remaining} ${plural(entry.remaining ?? 0, "tura", "tury", "tur")}`
      : `Traci turę${(entry.remaining ?? 0) > 1 ? ` — jeszcze ${entry.remaining}` : ""}`
    : null;

  return (
    <>
      {startsTurn && (
        <span className="flex shrink-0 items-center px-1 text-[11px] tracking-wide text-muted/70">
          Tura {entry.turn}
        </span>
      )}
      <div
        title={reason ? `${name} — ${reason}` : name}
        className={`flex shrink-0 flex-col items-center gap-1 rounded px-2 py-1.5 ${
          active ? "bg-raised" : ""
        } ${
          // Everything past the active seat is a forecast, not a promise: one
          // card can rewrite it. Dimming says so without a caption — but it is
          // applied to the portrait below, never to the whole chip: the reason a
          // seat is being passed over is the one thing here worth reading, and
          // fading it was making it the hardest thing to read.
          active ? "opacity-100" : "opacity-90"
        }`}
      >
        <div
          style={{ borderColor: colour }}
          // Widths track the standee's own 249x420 proportion, so the art is
          // never squashed: 0.593 of the height, rounded.
          className={`relative overflow-hidden rounded border ${
            active ? "h-[144px] w-[85px] border-2" : "h-[108px] w-[64px]"
          } ${skipped ? "opacity-55" : ""}`}
        >
          {standee ? (
            <Image src={standee} alt="" fill sizes="96px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-panel text-xs text-muted">
              {entry.seatIndex + 1}
            </span>
          )}
          {skipped && (
            // A line through the portrait, so the state survives being glanced
            // at rather than read.
            <span className="absolute inset-0 flex items-center">
              <span className="h-px w-full bg-vermilion/90" />
            </span>
          )}
        </div>
        <span
          className={`max-w-[10ch] truncate text-xs leading-none ${
            active ? "text-ink" : "text-muted"
          }`}
        >
          {mine ? "ty" : name}
        </span>
        {reason && (
          // Light text on a tinted ground rather than coloured text on the dark
          // panel: vermilion is ~3.8:1 against --color-night, which fails AA at
          // this size. The tint keeps the colour as a signal and moves the
          // contrast onto --color-ink, which clears it comfortably. Stone gets a
          // neutral ground so the two states differ by more than hue.
          <span
            className={`max-w-[12ch] truncate rounded px-1 py-px text-[10px] leading-tight ${
              entry.reason === "stone" ? "bg-edge text-ink/90" : "bg-vermilion/35 text-ink"
            }`}
          >
            {entry.reason === "stone" ? `kamień ${entry.remaining}` : "traci turę"}
          </span>
        )}
      </div>
    </>
  );
}

