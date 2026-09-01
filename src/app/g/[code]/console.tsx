"use client";

import { useEffect, useRef, useState } from "react";
import { WithRules } from "./rule-ref";
import { readConsole, writeConsole, type ConsoleLine } from "@/lib/game/consoleLog";
import {
  COMMANDS,
  complete,
  confirmationFor,
  parseCommand,
  type Stage,
} from "@/lib/engine/console";
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
/**
 * The one shrunk console on screen, if there is one, and how to grow it.
 *
 * A module slot rather than a prop or a context: only one console is ever
 * mounted, the thing that needs it is a `keydown` on the window, and the state
 * it reaches is deliberately private to the panel. See the effect that fills
 * it in.
 */
let grow: (() => boolean) | null = null;

/**
 * Grows a minimised console back to its usual height.
 *
 * True when it did, false when there was nothing minimised — so a caller can
 * treat the key as "give me the console" and fall back to its own meaning.
 */
export function wakeConsole(): boolean {
  return grow?.() ?? false;
}

/** The words that only ever mean "no", so answering with one is not a command. */
const NO = new Set(["no", "n", "nie", "cancel", "anuluj", "stop", "abort"]);

export function TestConsole({
  open,
  folded,
  failure,
  onDismissFailure,
  table,
  busy,
  players,
  stage,
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
  /**
   * Where the game has got to, so Tab offers what would run.
   *
   * The same reading `mm` makes, from the same function — a completer that
   * offered `roll` in a poczekalnia on one surface and not the other would be
   * two consoles wearing one vocabulary.
   */
  stage?: Stage;
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
   * Lets the backtick grow a shrunk console instead of shutting it.
   *
   * How big it is belongs to this component — the size is decided while using
   * it and deliberately does not outlive a close (see the remount in
   * `page.tsx`) — but the key that summons it lives on the window, two
   * components up, and had no way to ask. So it asks through here: a module
   * slot, the same shape the card preview's pin uses, rather than lifting a
   * piece of state whose whole point is that it is local and short-lived.
   *
   * Returns whether there was anything to grow, which is what lets the caller
   * tell "I opened it" from "there was nothing minimised and you meant close".
   */
  useEffect(() => {
    grow = () => {
      if (size !== "mini") return false;
      setSize("normal");
      return true;
    };
    return () => {
      grow = null;
    };
  }, [size]);

  /**
   * The bottom edge of the same system the drawers are in.
   *
   * It is not shaped like them — docked across the foot, its own chrome, above
   * the modals rather than under them — but it is dismissed like them: Escape
   * and a click on the game both take the newest surface and only that one.
   * `shown` is what a shut console passes, because this component stays mounted
   * and draws nothing while closed, and a shut console must not be holding
   * anybody's Escape.
   *
   * What dismissal *does* here is shrink it, not close it. The transcript is a
   * record of what a test did, Escape is the key people hit on the way past
   * anything, and losing a session's log to a reflex is a bad trade for the
   * room it frees — which minimising frees anyway. Closing is left to the two
   * gestures that mean it: `zamknij`, and turning test mode off.
   *
   * Null for a pinned one, which is a deliberate "leave this where it is", and
   * for one already shrunk to its bar, which has nowhere smaller to go. Either
   * way it stays counted as somewhere a click lands inside.
   */
  const panel = useDismissable<HTMLElement>({
    shown: open,
    onDismiss: pinned || size === "mini" ? null : () => setSize("mini"),
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
  /**
   * How many lines have ever been printed, which is not `log.length`.
   *
   * The transcript is capped at a hundred, so its length stops answering "has
   * anything been said since?" the moment it fills up. A counter that only ever
   * goes up does answer it.
   */
  const printed = useRef(0);
  /** The listing Tab last put on screen, and the line it was the answer to. */
  const listed = useRef<{ line: string; printed: number } | null>(null);
  /**
   * Asks the scroll to run again when nothing has changed for it to react to.
   *
   * Pressing Tab twice on the same line is a request to *see* the answer, not
   * for a second copy of it, and the effect below only fires when the
   * transcript does.
   */
  const [nudge, setNudge] = useState(0);

  /**
   * The prompt takes focus whenever the console arrives in front of you.
   *
   * Opening it is a request to type something, and so is growing it back from
   * its bar — nobody restores a console to look at it. It used to watch `open`
   * alone, which covered opening (the panel is remounted for that) and missed
   * every way back from `mini`: the key, the restore glyph, and a click on the
   * bar all left the cursor wherever it had been, so the first thing you typed
   * went somewhere else.
   *
   * Not on the way *down*. Minimising is how you put the console aside — with
   * Escape, most often — and a shrunk console that keeps hold of the keyboard
   * has not been put aside at all.
   */
  useEffect(() => {
    if (open && size !== "mini") input.current?.focus();
  }, [open, size]);

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
   *
   * A Tab listing needs an anchor of its own, because nobody typed it and so
   * there is no echo above it. Without one the box lined up the *previous*
   * command instead and left ninety card names below the fold — and pressing
   * Tab again anchored on the same old echo, so the console looked stuck.
   */
  useEffect(() => {
    const box = tail.current;
    if (!box) return;
    /**
     * Except when nothing has been said, where there is no answer to read.
     *
     * The transcript is the one restored from the last visit, so the last
     * anchor in it belongs to a command answered long ago; pinning that to the
     * top would show the *start* of an old answer. The effect below puts a
     * console that has just appeared at the bottom, which is where somebody
     * who has not asked anything wants to be.
     *
     * `printed` answers it exactly, and is the reason it is a counter rather
     * than `log.length`: it counts what *this* console has said, so zero means
     * the whole box is history.
     *
     * A pure function of state, deliberately, rather than a ref remembering
     * whether it has run. Two attempts at that both failed the same way: in
     * development StrictMode invokes every effect twice against a ref that
     * survives between the two passes, so the second pass took the other branch
     * and undid the first. Both passes agree on this.
     */
    if (printed.current === 0) return;
    const anchors = box.querySelectorAll<HTMLElement>("[data-echo],[data-anchor]");
    const last = anchors[anchors.length - 1];
    const top = last
      ? box.scrollTop + last.getBoundingClientRect().top - box.getBoundingClientRect().top
      : box.scrollHeight;
    box.scrollTo({ top });
  }, [log, big, nudge]);

  /**
   * A console that has just appeared shows the end of the transcript.
   *
   * Appearing is not asking a question, and the two were one effect: whatever
   * the last answer was got pinned to the top again every time the console came
   * back into view. After a reload that was right by accident — nothing had
   * been said yet, so it fell to the bottom — and the moment you had typed
   * anything, bringing the console back from its bar showed you the *start* of
   * the answer you had already read, with everything since below the fold. It
   * read as the console having scrolled itself to the top.
   *
   * `shown` and not `open`, because the commonest way back is not an open at
   * all: Escape puts the console down to one line of chrome and the key or a
   * click grows it again, with the same mount, the same log and the same
   * `printed`. That is the path this was wrong on.
   *
   * Normal against big is deliberately not in it. Throwing the console wide is
   * "let me see more of this answer", so the anchor above keeps its place.
   */
  const shown = open && size !== "mini";
  useEffect(() => {
    const box = tail.current;
    if (!shown || !box) return;
    box.scrollTo({ top: box.scrollHeight });
  }, [shown]);

  if (!open) return null;

  const say = (said: string, mine = false) => {
    printed.current += 1;
    setLog((before) => [...before, { said, mine }].slice(-100));
  };

  /**
   * Several lines at once, read from the first of them.
   *
   * One `setLog` rather than one per line, so the scroll runs against the whole
   * block instead of against each line as it arrives — and the anchor is the
   * first, which is where a list of candidates begins to be useful.
   */
  const sayBlock = (lines: readonly string[]) => {
    printed.current += lines.length;
    setLog((before) =>
      [...before, ...lines.map((said, at) => ({ said, mine: false, anchor: at === 0 }))].slice(-100),
    );
  };

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
      /**
       * A plain refusal is the whole answer; anything else falls through and is
       * read as a fresh line, which is what makes "type the thing you meant
       * instead" work.
       *
       * Without the first half, saying `no` printed "Dropped." and then "No
       * command `no`" underneath it — answering the question exactly as invited
       * and being told off for it.
       */
      if (NO.has(typed.toLowerCase())) return;
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
    /* Escape shrinks this one, so the hint rides on the chevron rather than on
       `zamknij` — see `ChromeButton`. Pinned, or already a bar, and it stays on
       that same chevron struck through: the key has not moved anywhere else,
       it is simply not answering. */
    <AnswersEscape.Provider value={{ on: "minimise", live: !pinned && size !== "mini" }}>
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
            /* Pressing it is how it goes. `onClose` cleared the failure too and
               was the only thing that did — so the one way to be rid of the
               banner was to shut the console, which is no answer for somebody
               who had it open on purpose. The handler was passed in from the
               first version and never called by anything. */
            <button
              type="button"
              onClick={onDismissFailure}
              className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-vermilion transition hover:text-ink"
              title={`${failure}

(kliknij, aby ukryć)`}
            >
              {failure}
            </button>
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
              answers="minimise"
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
          /**
           * Clicking the transcript puts the cursor back in the prompt.
           *
           * The log is the biggest thing in the console and the only part of it
           * you look at, so it is where a click lands when somebody comes back
           * to typing — and it took the focus out of the input, which is the
           * one place in this panel a keystroke means anything. Selecting text
           * still works: a drag is not a click, and this only fires when the
           * pointer went down and up without one.
           */
          onClick={() => {
            if (window.getSelection()?.toString()) return;
            input.current?.focus();
          }}
          className={`tnum cursor-text overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed ${
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
                data-anchor={entry.anchor ? "" : undefined}
                className={entry.mine ? "text-ochre" : "text-ink"}
              >
                {/* This transcript is React, not a terminal, so the numbers in
                    it can be what they are everywhere else on this screen. The
                    console prints more of them than anything: every refusal it
                    hands back cites the rule it is enforcing, and `rule 5.3`
                    now prints whole ones. In `mm` the same text arrives as
                    text, which is what the verb is for. */}
                <WithRules text={entry.said} />
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
              // Everything here is unlocked: this console only opens in test mode.
              const done = complete(line, players, { stage, testmode: true });
              setLine(done.line);
              /**
               * The same question twice is a request to see the answer again,
               * not for a second copy of it.
               *
               * Ninety card names printed twice is a transcript you have to
               * scroll past to reach the thing you asked for, and the listing
               * is tall enough that the first copy is usually still on screen —
               * just above where you are looking. So Tab on an unchanged line
               * with nothing said since scrolls back to what it already
               * printed. Compared against the line as it stood *after* the
               * first press, because that is what the second one starts from.
               */
              const already = listed.current;
              if (already && already.line === line && already.printed === printed.current) {
                setNudge((count) => count + 1);
                return;
              }
              /**
               * Under headings where the pool has them.
               *
               * A terminal cannot do this — readline draws its own grid from a
               * flat list and no heading survives it — but this console draws
               * its own, and `place`'s hundred and sixty-five names are six
               * kinds a player is choosing between before they are a hundred
               * and sixty-five names. The board is four Kręgi the same way.
               * Everything else has no shape of its own and stays one run.
               */
              if (done.sections) {
                sayBlock(done.sections.map((g) => `${g.title}\n  ${g.options.join("   ")}`));
              } else if (done.options.length > 0) {
                sayBlock([done.options.join("   ")]);
              } else {
                // Nothing on screen to go back to, so nothing to remember.
                listed.current = null;
                return;
              }
              listed.current = { line: done.line, printed: printed.current };
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
