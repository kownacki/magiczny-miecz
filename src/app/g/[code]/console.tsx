"use client";

import { useEffect, useRef, useState } from "react";
import { readConsole, writeConsole, type ConsoleLine } from "@/lib/game/consoleLog";
import { COMMANDS, complete, confirmationFor, parseCommand } from "@/lib/engine/console";
import { LAYER } from "./layers";
import { AnswersEscape, useDismissable } from "./overlay";
import { ChromeButton, CloseButton, SurfaceHead } from "./chrome";

/**
 * A line to type at, instead of a button for every test.
 *
 * The interface had grown a test control wherever a test needed one — a "weź"
 * under every card in the drawer, a "walcz" under every Wróg, a chip for each
 * of the fifty-seven Obszary, a ± under every parameter — and together they
 * were a second interface laid over the first, in the way of the game they
 * existed to test. A line of text costs nothing to add and nothing to look at.
 *
 * Docked at the foot of the screen rather than floating, so it never covers the
 * thing being tested, and only ever drawn behind the `tryb testowy` switch in a
 * build that is not deployed. What it does is done by the server, through the
 * same routes as everything else, and journalled as a manual override — a
 * tested game must not be mistakable for a played one.
 */
export function TestConsole({
  open,
  folded,
  failure,
  onDismissFailure,
  table,
  busy,
  players,
  onClose,
  onRun,
}: {
  open: boolean;
  /**
   * Opened by something breaking rather than by somebody asking.
   *
   * It comes up as the bar it already knows how to be — `mini` — because a
   * failure is not an invitation to type. The message is on the bar; opening it
   * properly is one click away for whoever wants to.
   */
  folded?: boolean;
  /** The last thing that broke: English, and not the player's fault. */
  failure?: string | null;
  onDismissFailure?: () => void;
  /** Which table this is, so two of them are two conversations. */
  table: string;
  busy: boolean;
  /** Who is at the table, so a player's name can be finished like a card's. */
  players: string[];
  onClose: () => void;
  /** Runs one line and answers with what to print — the reply, or the refusal. */
  onRun: (line: string) => Promise<string>;
}) {
  /**
   * Pinned: on screen, and not going anywhere by accident.
   *
   * The console is the one surface you work *from* rather than look at, and a
   * session of testing is a long run of clicking at the game with the console
   * meant to stay put. Everything else here is a thing you opened to read and
   * are finished with the moment you look elsewhere; this is not, so it is the
   * one that can opt out. Pinned it answers neither Escape nor a click away —
   * only `odepnij` or `zamknij`, both of which are deliberate.
   */
  const [pinned, setPinned] = useState(false);

  /**
   * How much of it there is: shut, a strip, the usual, or most of the window.
   *
   * `mini` is the state this grew for. The transcript is worth keeping — it is
   * a record of what a test did — and there was no way to keep it without also
   * keeping it in front of the board. Minimised, the console is one line of
   * chrome at the foot of the screen and nothing else, and one click has it
   * back exactly as it was, log and all.
   */
  const [size, setSize] = useState<"mini" | "normal" | "big">(folded ? "mini" : "normal");

  /**
   * The bottom edge of the same system the drawers are in.
   *
   * It is not shaped like them — docked across the foot, its own chrome, above
   * the modals rather than under them — but it is dismissed like them: Escape
   * and a click on the game both take the newest surface and only that one.
   * `shown` is what a shut console passes, because this component stays mounted
   * and draws nothing while closed, and a shut console must not be holding
   * anybody's Escape. `onClose: null` is what a pinned *or* a minimised one
   * passes: both are deliberate ways of keeping it, and Escape landing on a
   * console you shrank to a strip would throw away the session in it. Either
   * way it stays counted as somewhere a click lands inside.
   */
  const panel = useDismissable<HTMLElement>({
    shown: open,
    onClose: pinned || size === "mini" ? null : onClose,
  });

  /**
   * How much of the foot of the column it is covering, in pixels, on the root.
   *
   * The column it is docked to scrolls, and the console is `fixed` — so it
   * pushes nothing, and whatever is last in that column sits under it at the
   * bottom of the scroll where nobody can reach it. Reserving a fixed strip was
   * the first attempt and it only worked shut: opened to its usual height, or
   * to most of the window, it buried the same things again.
   *
   * Measured rather than guessed, because the height is three states plus a log
   * that grows, and a number written here would be wrong for two of them. A
   * custom property because the thing that has to reserve the room is a section
   * two components away, and threading a pixel count through the layout to say
   * "leave this much" is a worse cable than one line of CSS.
   */
  useEffect(() => {
    const root = document.documentElement;
    const element = panel.current;
    const clear = () => root.style.setProperty("--console-h", "0px");
    if (!open || !element) {
      clear();
      return;
    }
    const measure = () => root.style.setProperty("--console-h", `${element.offsetHeight}px`);
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(element);
    return () => {
      watching.disconnect();
      clear();
    };
    // `panel` is a ref and never changes identity; `size` is here because a
    // fold or a stretch changes the height without resizing anything the
    // observer is watching until after the fact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, size]);

  const [line, setLine] = useState("");
  /**
   * Whether the log is given most of the window, the way the Dziennik's
   * `rozwiń` gives it the board.
   *
   * A dozen commands is already more than a sliver holds, and one long answer —
   * `help`, an ambiguous Tab listing twenty cards — is enough to push the top of
   * itself out of sight on a short window. Nothing here needs the game visible
   * while it is being read: `zwiń` is one click and the game has not moved.
   */
  const big = size === "big";
  const mini = size === "mini";
  /**
   * Read once, lazily, rather than in an effect.
   *
   * Safe on the server because the console draws nothing until it is opened —
   * both sides render null, so there is no markup to disagree about — and it
   * avoids setting state from an effect on every mount.
   */
  const [log, setLog] = useState<ConsoleLine[]>(() =>
    typeof window === "undefined" ? [] : readConsole(table).log,
  );
  /** What has been typed before, newest last, for the up arrow. */
  const past = useRef<string[]>(
    typeof window === "undefined" ? [] : readConsole(table).past,
  );
  const back = useRef<number | null>(null);
  /** A destructive line, typed and not yet agreed to. */
  const held = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const tail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  /**
   * Written back whenever the transcript grows.
   *
   * Reloading is a normal part of using this — it is how you see whether the
   * change you just made worked — and losing the record of how the table got
   * into its current state at exactly that moment is the wrong trade. `past`
   * rides along because every command that adds to it also adds to the log.
   */
  useEffect(() => {
    writeConsole(table, { log, past: past.current });
  }, [table, log]);

  /**
   * Puts the newest command at the top of the box, not the bottom.
   *
   * Scrolling to the end is right for a chat, where the last line is the point.
   * Here the last line is the end of an answer whose beginning is what you
   * asked for: `help` is eleven lines into a box that holds a dozen, so
   * scrolling to the bottom hid the first commands it printed and made the list
   * look short. Line the echo of what was typed up with the top edge instead,
   * and every answer is read from its first line. `scrollTo` clamps for us, so
   * a short answer still ends up wherever it fits.
   */
  useEffect(() => {
    const box = tail.current;
    if (!box) return;
    const echoes = box.querySelectorAll<HTMLElement>("[data-echo]");
    const last = echoes[echoes.length - 1];
    const top = last
      ? box.scrollTop + last.getBoundingClientRect().top - box.getBoundingClientRect().top
      : box.scrollHeight;
    box.scrollTo({ top });
  }, [log, open, big]);

  if (!open) return null;

  const say = (said: string, mine = false) =>
    setLog((before) => [...before, { said, mine }].slice(-100));

  const run = async () => {
    const typed = line.trim();
    if (typed === "" || busy) return;
    past.current = [...past.current, typed];
    back.current = null;
    setLine("");
    say(`> ${typed}`, true);

    /**
     * The line that is waiting to be agreed to, and the one word that agrees.
     *
     * Anything else drops it and is read as a fresh line — so changing your
     * mind is typing the thing you meant instead, and there is no way for the
     * next command to confirm the last one by accident.
     */
    const pending = held.current;
    held.current = null;
    if (pending) {
      if (typed.toLowerCase() === "yes") return say(await onRun(pending));
      say("Dropped.");
      // Falls through: whatever was typed instead is a line of its own.
    }

    /**
     * Asked here rather than by the server, because the console *is* the place
     * that asks. The grammar is pure and the browser has it, so the question
     * costs nothing and the destructive line never leaves this tab until
     * somebody has said yes to it.
     */
    const parsed = parseCommand(typed);
    if ("ok" in parsed) {
      const question = confirmationFor(parsed.ok);
      if (question) {
        held.current = typed;
        return say(question);
      }
    }

    say(await onRun(typed));
  };

  return (
    <AnswersEscape.Provider value={!pinned && size !== "mini"}>
    <section
      ref={panel}
      /**
       * Above everything, including the sheets.
       *
       * It started below them, on the reasoning that a fight is what you are
       * looking at and this is only what you are typing at — which is exactly
       * backwards. The console is most wanted when a modal has the game stuck
       * behind it: `endfight` and `endturn` exist for that, and a way out that
       * the thing you are escaping paints over is not a way out. So it clears
       * the modals' backdrop as well as their z-order, and is not dimmed by it.
       */
      /**
       * As wide as the column it belongs to, and no wider.
       *
       * It used to run the full width of the window, which put it over the
       * bottom of the board and over the Dziennik — the two things you are
       * most often reading *while* typing at it. Neither is on this side. The
       * console is the table's own surface in the same sense the panels are, so
       * it takes the panels' share of the width and leaves the map alone.
       */
      className={`fixed bottom-0 right-0 w-full lg:w-[61.8%] ${LAYER.console} border-t border-l border-vermilion/40 bg-night/95 shadow-[-4px_-8px_30px_rgba(0,0,0,0.6)]`}
    >
      <SurfaceHead
        title="tryb testowy — konsola"
        tone="text-vermilion"
        onExpand={mini ? () => setSize("normal") : undefined}
        aside={
          /* On the bar rather than in the log, because the log is the record of
             what somebody typed and nobody typed this. It stays until it is
             dismissed: a failure that scrolls away unread is a failure that did
             not happen, as far as anyone is concerned. */
          failure ? (
            <p
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-vermilion"
              title={failure}
            >
              {failure}
            </p>
          ) : null
        }
        controls={
          <>
            {/* Pinning first, because it is the one that changes what the
                other two mean: pinned, Escape is no longer a way out and
                `zamknij` stops claiming it is. */}
            <ChromeButton
              glyph={pinned ? "unpin" : "pin"}
              active={pinned}
              title={
                pinned
                  ? "Przypięta — nie zamknie jej ani Esc, ani kliknięcie w grę"
                  : "Przypnij, żeby została otwarta mimo klikania w grę"
              }
              onClick={() => setPinned((was) => !was)}
            />
            <ChromeButton
              glyph={mini ? "restore" : "minimise"}
              title={mini ? "Pokaż konsolę" : "Zwiń do paska — log zostaje"}
              onClick={() => setSize(mini ? "normal" : "mini")}
            />
            {!mini && (
              <ChromeButton
                glyph={big ? "collapse" : "expand"}
                title={big ? "Zwiń do zwykłej wysokości" : "Rozwiń na większość okna"}
                onClick={() => setSize(big ? "normal" : "big")}
              />
            )}
            <CloseButton onClose={onClose} />
          </>
        }
      />

      {/* No inner cap on the body. The console used to float in the middle of
          the window and a measure was the right thing for it; docked to the
          right-hand column it *is* that column, and a centred four-em strip
          inside it left two margins of nothing either side of the transcript. */}
      {!mini && (
        <div className="flex flex-col gap-1 p-2 pt-1.5">
        <div
          ref={tail}
          className={`tnum overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed ${
            // Collapsed, about ten lines: enough to read the answer to what was
            // just typed without the console becoming the thing on screen. It
            // used to hold a whole `help` — seventeen rows — which meant one
            // curious command covered half the game and stayed there.
            //
            // A share of the window as well as a number of lines, so a short
            // laptop does not get a console taller than the board it is being
            // typed at. Whichever of the two is smaller.
            //
            // `rozwiń` is the other half of the bargain and is unchanged: the
            // long answers are still readable, on purpose, one click away.
            big ? "h-[70vh]" : "max-h-[min(12rem,35vh)]"
          }`}
        >
          {log.length === 0 ? (
            <p className="text-muted">
              {`Type \`help\` for the commands. ${COMMANDS.length} of them.`}
            </p>
          ) : (
            log.map((entry, index) => (
              <p
                key={index}
                data-echo={entry.mine ? "" : undefined}
                className={entry.mine ? "text-ochre" : "text-ink"}
              >
                {entry.said}
              </p>
            ))
          )}
        </div>

        <input
          ref={input}
          value={line}
          disabled={busy}
          onChange={(event) => setLine(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") return void run();
            // Escape is not handled here. It belongs to the stack in
            // `overlay.tsx`, which closes the newest surface and nothing else —
            // and a second handler on the input meant one press ran both.
            /**
             * Tab finishes what is being typed.
             *
             * The names are long, capitalised and full of Polish letters —
             * ZWIERCIADŁO ZNISZCZENIA, ŚWIĄTYNIA BOGINI NEMED — and a console
             * whose arguments must be typed exactly is slower than the buttons
             * it replaced. Several candidates fill in as far as they agree and
             * print the list, the way a shell answers an ambiguous Tab: the one
             * behaviour that never guesses.
             */
            if (event.key === "Tab") {
              event.preventDefault();
              const done = complete(line, players);
              setLine(done.line);
              if (done.options.length > 0) say(done.options.join("   "));
              return;
            }
            // The last thing typed, the way a shell gives it back. Testing is
            // mostly the same line with one word changed.
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const history = past.current;
              if (history.length === 0) return;
              const at = back.current ?? history.length;
              const next =
                event.key === "ArrowUp"
                  ? Math.max(0, at - 1)
                  : Math.min(history.length, at + 1);
              back.current = next;
              setLine(next === history.length ? "" : history[next]);
            }
          }}
          placeholder="help"
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded border border-edge bg-panel px-2 py-1 font-mono text-xs text-ink outline-none focus:border-vermilion disabled:opacity-50"
        />
        </div>
      )}
    </section>
    </AnswersEscape.Provider>
  );
}
