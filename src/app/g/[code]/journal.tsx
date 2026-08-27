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
import { SEAT_COLOURS } from "@/lib/view/boardMap";
import { ChromeButton, SurfaceHead } from "./chrome";
import { readSeatToken } from "@/lib/game/seatToken";
import { Lookable } from "./lookable";
import { WithRules } from "./rule-ref";
import type { JournalLine, JournalRef } from "@/lib/engine/journalText";
import type { EqMode } from "@/lib/engine/slots";

export function Journal({
  code,
  revision,
  eqMode = "classic",
}: {
  code: string;
  revision: number;
  eqMode?: EqMode;
}) {
  const [lines, setLines] = useState<JournalLine[]>([]);
  /**
   * How much of the column it takes: a strip, its share, or the whole board.
   *
   * `mini` is new and is the one the board asked for. The Dziennik sits on the
   * bottom fifth of the map column whether or not anybody is reading it, and on
   * a short window that fifth is the difference between the Górny Krąg fitting
   * and not. Minimised it is its own heading and nothing else, so the board
   * gets the room back without the feed being closed — and it is still there,
   * still following the revision counter, one click from being read.
   */
  const [size, setSize] = useState<"mini" | "normal" | "big">("normal");
  const expanded = size === "big";
  const mini = size === "mini";
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
  }, [lines, size]);

  return (
    <section
      className={
        expanded
          ? // Over the board, not instead of it: the map stays mounted and
            // collapsing costs nothing.
            "absolute inset-0 z-10 flex flex-col rounded border border-edge bg-night"
          : mini
            ? // Its heading, and nothing under it. `shrink-0` with no height of
              // its own, so what it gives up goes to the board above.
              "mt-auto flex shrink-0 flex-col rounded-t border border-b-0 border-edge bg-panel/50"
            : // A share of the column rather than a number of lines: the board
              // above it is the thing that has to fit, and it scales with the
              // window. Four lines was too few to read a turn back — a fight is
              // three of them on its own — so this is half again as tall, less a
              // tenth given back to the map.
              // `mt-auto` pins it to the bottom whatever the board above does.
              // The board wrapper is flex-1 and absorbs the slack today, but
              // that is the board business and not something this should depend
              // on to stay where it belongs.
              "mt-auto flex h-[20.25%] shrink-0 flex-col rounded-t border border-b-0 border-edge bg-panel/50"
      }
    >
      <SurfaceHead
        title="Dziennik"
        tone="text-muted"
        onExpand={mini ? () => setSize("normal") : undefined}
        /**
         * The newest line, on the bar that replaced the list it was in.
         *
         * A journal shrunk to its heading says only that a journal exists,
         * which is the one thing anybody already knows — and the reason it gets
         * shrunk is that the board needs the room, not that nothing is
         * happening in it. Half of what it is read for is the last thing that
         * happened, and that fits on a bar.
         *
         * Plain text, truncated, and no lookups: the whole bar is the way back
         * to the list (see `onExpand`), so a name that opens a card preview
         * under the cursor would be fighting the click that is about to land on
         * it. The dot stays, because whose line it is survives being cut short
         * and is most of what a glance at it asks.
         */
        aside={
          mini && lines.length > 0 ? (
            <p className="flex min-w-0 flex-1 items-center gap-2 text-[11px] normal-case tracking-normal">
              <span
                aria-hidden
                style={
                  lines[lines.length - 1].seatIndex === null
                    ? undefined
                    : {
                        backgroundColor:
                          SEAT_COLOURS[
                            lines[lines.length - 1].seatIndex! % SEAT_COLOURS.length
                          ],
                      }
                }
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  lines[lines.length - 1].seatIndex === null ? "bg-edge" : ""
                }`}
              />
              <span
                className={`truncate ${
                  lines[lines.length - 1].manual ? "text-ochre/90" : "text-muted/80"
                }`}
              >
                {lines[lines.length - 1].text}
              </span>
            </p>
          ) : undefined
        }
        controls={
          <>
            <ChromeButton
              glyph={mini ? "restore" : "minimise"}
              title={mini ? "Pokaż Dziennik" : "Zwiń do paska — Dziennik nadal spisuje"}
              onClick={() => setSize(mini ? "normal" : "mini")}
            />
            {!mini && (
              <ChromeButton
                glyph={expanded ? "collapse" : "expand"}
                title={expanded ? "Zwiń — pokaż planszę" : "Rozwiń na całą planszę"}
                onClick={() => setSize(expanded ? "normal" : "big")}
              />
            )}
          </>
        }
      />

      {!mini && (
      <div ref={tail} className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5">
        {lines.length === 0 ? (
          <p className="text-xs text-muted/60">Jeszcze nic się nie wydarzyło.</p>
        ) : (
          <ol className="flex flex-col gap-0.5">
            {lines.map((line, at) => (
              <Line
                key={line.seq}
                eqMode={eqMode}
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
      )}
    </section>
  );
}

function Line({
  line,
  heading,
  eqMode,
}: {
  line: JournalLine;
  heading: boolean;
  eqMode: EqMode;
}) {
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
          <Looked text={line.text} refs={line.refs} eqMode={eqMode} />
          {/* A hand overruling the referee, which LOBBY.md wants visible rather
              than blended into what the rules did. Named after the switch that
              is the only way to reach it — "korekta" described the mechanism
              and left you to work out who had done it and why. */}
          {line.manual && (
            <span className="ml-1 text-[10px] text-ochre/70">tryb testowy</span>
          )}
          {/* The rule this line happened under, dim and at the end, where a
              citation goes. Quiet on purpose: the journal is read for what
              happened, and this is only for the line you stop at and query.
              `WithRules` hides it outright where the reader has said they do
              not want rule numbers, punctuation and all. */}
          {line.rule && (
            <WithRules className="ml-1 text-[10px] text-muted/60" text={`(${line.rule})`} />
          )}
        </span>
      </li>
    </>
  );
}

/**
 * A sentence with the things it named turned into lookups.
 *
 * The journal is where a card or a field gets mentioned long after it left the
 * screen — "zostawia na polu Kurhan: MAGICZNY MIECZ" is exactly the line you
 * want to interrogate two turns later, and going to find the card by hand is
 * the bookkeeping this app exists to remove.
 *
 * The names are matched in the finished sentence rather than the sentence being
 * assembled from fragments, because the renderer records each name as it
 * resolves it — so the list cannot drift from the words.
 */
function Looked({
  text,
  refs,
  eqMode,
}: {
  text: string;
  refs?: JournalRef[];
  eqMode: EqMode;
}) {
  if (!refs?.length) return <WithRules text={text} />;

  // Longest first: a short name that happens to sit inside a longer one must
  // not win the split and leave the rest of the longer name as loose text.
  const byLength = [...refs].sort((a, b) => b.name.length - a.name.length);
  const pattern = new RegExp(`(${byLength.map(escapeForSplit).join("|")})`, "g");

  return (
    <>
      {text.split(pattern).map((piece, at) => {
        const ref = refs.find((candidate) => candidate.name === piece);
        return ref ? (
          <Lookup key={at} reference={ref} eqMode={eqMode} />
        ) : (
          // The pieces between the names, which is where the rule numbers are:
          // "(17.4)" never falls inside a Karta's name.
          <WithRules key={at} text={piece} />
        );
      })}
    </>
  );
}

/** One name in a sentence — see `Lookable`, which every view shares. */
function Lookup({ reference, eqMode }: { reference: JournalRef; eqMode: EqMode }) {
  return (
    <Lookable
      kind={reference.kind}
      id={reference.id}
      name={reference.name}
      eqMode={eqMode}
    />
  );
}

/** Names carry brackets and dots; a split pattern must take them literally. */
function escapeForSplit(reference: JournalRef): string {
  return reference.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
