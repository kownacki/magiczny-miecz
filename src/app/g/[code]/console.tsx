"use client";

import { useEffect, useRef, useState } from "react";
import { readConsole, writeConsole, type ConsoleLine } from "@/lib/game/consoleLog";
import { COMMANDS, complete } from "@/lib/engine/console";
import { LAYER } from "./layers";
import { useDismissable } from "./overlay";

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
  table,
  busy,
  players,
  onClose,
  onRun,
}: {
  open: boolean;
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
  const [size, setSize] = useState<"mini" | "normal" | "big">("normal");

  /**
   * The bottom edge of the same system the drawers are in.
   *
   * It is not shaped like them — docked across the foot, its own chrome, above
   * the modals rather than under them — but it is dismissed like them: Escape
   * and a click on the game both take the newest surface and only that one.
   * `shown` is what a shut console passes, because this component stays mounted
   * and draws nothing while closed, and a shut console must not be holding
   * anybody's Escape; `onClose: null` is what a pinned one passes, which keeps
   * it counted as somewhere a click lands inside while it answers nothing.
   */
  const panel = useDismissable<HTMLElement>({
    shown: open,
    onClose: pinned ? null : onClose,
  });

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
    say(await onRun(typed));
  };

  return (
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
      className={`fixed inset-x-0 bottom-0 ${LAYER.console} border-t border-vermilion/40 bg-night/95 shadow-[0_-8px_30px_rgba(0,0,0,0.6)]`}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-1 p-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-widest text-vermilion">
            tryb testowy — konsola
          </p>
          <div className="flex items-baseline gap-3">
            {/* Pinning first, because it is the one that changes what the
                other two mean: pinned, Escape is no longer a way out and the
                label stops claiming it is. */}
            <button
              onClick={() => setPinned((was) => !was)}
              aria-pressed={pinned}
              title={
                pinned
                  ? "Przypięta — nie zamknie jej ani Esc, ani kliknięcie w grę"
                  : "Przypnij, żeby została otwarta mimo klikania w grę"
              }
              className={`text-[11px] transition ${
                pinned ? "text-vermilion" : "text-muted/70 hover:text-ink"
              }`}
            >
              {pinned ? "odepnij" : "przypnij"}
            </button>
            <button
              onClick={() => setSize(mini ? "normal" : "mini")}
              aria-expanded={!mini}
              title={mini ? "Pokaż konsolę" : "Zwiń do paska — log zostaje"}
              className="text-[11px] text-ochre/80 transition hover:text-ochre"
            >
              {mini ? "pokaż" : "schowaj"}
            </button>
            {!mini && (
              <button
                onClick={() => setSize(big ? "normal" : "big")}
                aria-expanded={big}
                className="text-[11px] text-ochre/80 transition hover:text-ochre"
              >
                {big ? "zwiń" : "rozwiń"}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[11px] text-muted underline transition hover:text-ink"
            >
              {pinned ? "zamknij" : "zamknij (Esc)"}
            </button>
          </div>
        </div>

        {!mini && (
        <>
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
        </>
        )}
      </div>
    </section>
  );
}
