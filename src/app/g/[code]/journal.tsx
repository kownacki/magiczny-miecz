"use client";

/**
 * What happened, in words, for the people who were not watching.
 *
 * It lives under the board and is normally a sliver — the last line or two,
 * which answers the common question of what was missed while somebody looked
 * away. Expanding it covers the board rather than displacing it: the map is the
 * thing you stop needing while you read the history, and leaving it mounted
 * underneath means collapsing is instant and the board never re-lays-out.
 *
 * The lines arrive already written. The server renders them so a device is
 * never sent a row it would have to be trusted not to show (9.3).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { SEAT_COLOURS } from "@/lib/engine/boardMap";
import { readSeatToken } from "@/lib/game/seatToken";
import type { JournalLine } from "@/lib/engine/journalText";

export function Journal({ code, revision }: { code: string; revision: number }) {
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [expanded, setExpanded] = useState(false);
  const tail = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const token = readSeatToken(code);
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    const response = await fetch(`/api/games/${code}/journal${query}`);
    if (!response.ok) return;
    const data = await response.json();
    setLines(Array.isArray(data.lines) ? data.lines : []);
  }, [code]);

  // The revision counter moves on every change the table makes, so the feed
  // follows the game without a timer of its own.
  useEffect(() => {
    // Subscribing to an external system — the table's state on the server —
    // which is the shape the rule's own message endorses. page.tsx suppresses
    // the same rule for the same fetch, with the same reasoning.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, revision]);

  // Newest at the bottom, so the newest is what you are looking at.
  useEffect(() => {
    tail.current?.scrollTo({ top: tail.current.scrollHeight });
  }, [lines, expanded]);

  return (
    <section
      className={
        expanded
          ? // Over the board, not instead of it: the map stays mounted and
            // collapsing costs nothing.
            "absolute inset-0 z-10 flex flex-col rounded border border-edge bg-night"
          : "flex h-[15%] shrink-0 flex-col rounded border border-edge bg-panel/50"
      }
    >
      <header className="flex shrink-0 items-center justify-between border-b border-edge/60 px-3 py-1">
        <h2 className="text-[11px] uppercase tracking-wide text-muted">Dziennik</h2>
        <button
          onClick={() => setExpanded((was) => !was)}
          aria-expanded={expanded}
          className="text-[11px] text-ochre/80 transition hover:text-ochre"
        >
          {expanded ? "zwiń — pokaż planszę" : "rozwiń"}
        </button>
      </header>

      <div ref={tail} className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5">
        {lines.length === 0 ? (
          <p className="text-xs text-muted/60">Jeszcze nic się nie wydarzyło.</p>
        ) : (
          <ol className="flex flex-col gap-0.5">
            {lines.map((line, at) => (
              <Line
                key={line.seq}
                line={line}
                // Turn headings only in the expanded view, and only where the
                // turn changes: in a sliver they would cost more room than the
                // lines they label.
                heading={
                  expanded &&
                  !line.marker &&
                  (at === 0 || line.turn !== lines[at - 1].turn) &&
                  // A boundary line already says which round this is, in both
                  // views. Deriving one above it would say it twice.
                  !lines[at - 1]?.marker
                }
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function Line({ line, heading }: { line: JournalLine; heading: boolean }) {
  const colour =
    line.seatIndex === null ? null : SEAT_COLOURS[line.seatIndex % SEAT_COLOURS.length];

  // A round boundary is not somebody's move, so it is not drawn like one: no
  // dot, and set like the heading it replaces. It shows in the collapsed sliver
  // too, which is where the derived heading never appeared and where "which
  // round are we on" was hardest to answer.
  if (line.marker) {
    return (
      <li className="mt-2 border-t border-edge/60 pt-1 text-[11px] uppercase tracking-wide text-ochre/70 first:mt-0">
        {line.text}
      </li>
    );
  }

  return (
    <>
      {heading && (
        <li className="mt-3 text-[11px] uppercase tracking-wide text-muted/70 first:mt-0">
          Tura {line.turn}
        </li>
      )}
      <li className="flex items-baseline gap-2 text-xs leading-snug">
        <span
          aria-hidden
          style={colour ? { backgroundColor: colour } : undefined}
          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${colour ? "" : "bg-edge"}`}
        />
        <span className={line.manual ? "text-ochre/90" : "text-muted"}>
          {line.text}
          {/* A correction is a human overruling the referee, and LOBBY.md wants
              that visible rather than blended into what the rules did. */}
          {line.manual && <span className="ml-1 text-[10px] text-ochre/70">korekta</span>}
        </span>
      </li>
    </>
  );
}
