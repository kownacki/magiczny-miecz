"use client";

import { useEffect, useRef, useState } from "react";
import { COMMANDS } from "@/lib/engine/console";

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
  busy,
  onClose,
  onRun,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  /** Runs one line and answers with what to print — the reply, or the refusal. */
  onRun: (line: string) => Promise<string>;
}) {
  const [line, setLine] = useState("");
  const [log, setLog] = useState<{ said: string; mine: boolean }[]>([]);
  /** What has been typed before, newest last, for the up arrow. */
  const past = useRef<string[]>([]);
  const back = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const tail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    tail.current?.scrollTo({ top: tail.current.scrollHeight });
  }, [log, open]);

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
      // Above the board and below the modals: a fight or a card is still the
      // thing being looked at, and this is the thing being typed at.
      className="fixed inset-x-0 bottom-0 z-30 border-t border-vermilion/40 bg-night/95 shadow-[0_-8px_30px_rgba(0,0,0,0.6)]"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-1 p-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-widest text-vermilion">
            tryb testowy — konsola
          </p>
          <button
            onClick={onClose}
            className="text-[11px] text-muted underline transition hover:text-ink"
          >
            zamknij (Esc)
          </button>
        </div>

        <div
          ref={tail}
          className="tnum max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed"
        >
          {log.length === 0 ? (
            <p className="text-muted">
              {`Type \`help\` for the commands. ${COMMANDS.length} of them.`}
            </p>
          ) : (
            log.map((entry, index) => (
              <p key={index} className={entry.mine ? "text-ochre" : "text-ink"}>
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
            if (event.key === "Escape") return onClose();
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
    </section>
  );
}
