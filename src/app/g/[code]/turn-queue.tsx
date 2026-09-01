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
import { seatColour } from "@/lib/view/boardMap";
import { figureUrl } from "@/lib/view/cardImages";
import { plural, roundShown } from "@/lib/engine/polish";
import { StruckOut } from "./card-mark";
import { DEFAULT_DEPTH, projectQueue, type QueueEntry } from "@/lib/engine/turnQueue";

export interface QueueSeat {
  seatIndex: number;
  playerName: string | null;
  characterId: string | null;
  turnsLost: number;
  stoneUntilRound: number | null;
  eliminated: boolean;
}

export function TurnQueue({
  seats,
  activeSeat,
  round,
  mySeatIndex,
  onPick,
  depth = DEFAULT_DEPTH,
}: {
  seats: readonly QueueSeat[];
  activeSeat: number | null;
  round: number;
  mySeatIndex: number | null;
  /** Open the roster on that seat. Absent where there is nobody to open. */
  onPick?: (seatIndex: number) => void;
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
      stoneUntilRound: seat.stoneUntilRound,
    })),
    activeSeat,
    round,
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
          key={`${entry.round}-${entry.seatIndex}-${entry.status}-${at}`}
          entry={entry}
          seat={bySeat.get(entry.seatIndex)}
          // A new round starts here, so the bar says so rather than leaving the
          // player to count seats.
          startsTurn={at > 0 && entry.round !== queue[at - 1].round}
          mine={entry.seatIndex === mySeatIndex}
          onPick={onPick}
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
  onPick,
}: {
  entry: QueueEntry;
  seat: QueueSeat | undefined;
  startsTurn: boolean;
  mine: boolean;
  onPick?: (seatIndex: number) => void;
}) {
  const colour = seatColour(entry.seatIndex);
  const name = seat?.playerName ?? `Miejsce ${entry.seatIndex + 1}`;
  const skipped = entry.status === "skipped";
  const active = entry.status === "active";
  /**
   * 20.1's swap, on the chip.
   *
   * `projectQueue` has already worked out which of the two reasons a seat is
   * being passed over for, and it is the same test `nextSeat` makes — so the
   * figure and the caption under it cannot disagree about whether somebody is
   * stone. Only on a slot that is actually skipped: a chip further down the
   * queue is a forecast of a turn the character will be flesh for again, and
   * standing a statue there would be the forecast saying the opposite.
   */
  const stone = skipped && entry.reason === "stone";
  const figure = figureUrl(seat?.characterId ?? null, stone);

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
          Runda {roundShown(entry.round)}
        </span>
      )}
      {/* A button, and what it opens is the *player*.
          
          The figure is the recognisable part, but the chip is about a turn:
          whose it is, when it comes round, and why it is being skipped. So the
          question somebody has when they press one is "who is that, and what
          have they got" — which the roster answers, on that seat, the same way
          the name in the NowBox does. The Karta Postaci is a click further in,
          on the seat's own tile, where it is a card again. */}
      <button
        type="button"
        onClick={onPick ? () => onPick(entry.seatIndex) : undefined}
        title={
          onPick
            ? `${name}${reason ? ` — ${reason}` : ""} — otwórz w Graczach`
            : reason
              ? `${name} — ${reason}`
              : name
        }
        className={`flex shrink-0 flex-col items-center gap-1 rounded px-2 py-1.5 ${
          // Solid, for the same reason the turn button is: a tint replaces the
          // background rather than layering over it, so the active seat's tile
          // went translucent exactly when you pointed at it.
          onPick ? "cursor-pointer transition hover:bg-raised" : ""
        } ${
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
          {figure ? (
            <Image src={figure} alt="" fill sizes="96px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-panel text-xs text-muted">
              {entry.seatIndex + 1}
            </span>
          )}
          {/* Crossed out, the same mark a spent trofeum and a Karta that has
              left the Obszar carry — `StruckOut`'s own note says why an X and
              not a bar: a line across a picture reads as a redaction, and an X
              is what somebody draws on a thing that is not in play.

              This chip used to draw its own single hairline, which was that
              idea a third time in a third shape. Both reasons get it: a
              statue's picture already says it is a statue, but what the mark
              answers is not "why" — it is "is this turn happening", and that
              question is the same one whether the seat is frozen or owes a
              turn. The caption underneath is where the two part company. */}
          {skipped && <StruckOut />}
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
      </button>
    </>
  );
}

