"use client";

/**
 * Where the turn is, in a box that does not change size.
 *
 * This replaces a panel that grew and shrank with whatever the Obszar happened
 * to be — a Karczma's die table, a Gród's price list, a crossing's two buttons —
 * so the one thing a player looks up to check ("is it me, where am I, what can
 * I do") moved down the screen every turn. Everything that used to expand here
 * is a window now, and this only lists them.
 *
 * Square, and beside the queue rather than under it: the queue answers "when",
 * this answers "now", and they are the same question asked twice.
 */

import { seatColour } from "@/lib/view/boardMap";
import { roundShown } from "@/lib/engine/polish";
import type { TurnStep, TurnWindow, WindowId } from "@/lib/engine/turnWindows";
import { Lookable } from "./lookable";

export function NowBox({
  playerName,
  round,
  onPlayer,
  characterId,
  characterName,
  seatIndex,
  isMine,
  fieldName,
  fieldId,
  windows,
  steps,
  canRoll,
  owed,
  away,
  since,
  busy,
  onOpen,
  onRoll,
  onDraw,
}: {
  playerName: string;
  /**
   * Which circuit of the table this is (`games.round`).
   *
   * Not „tura": CONTEXT.md settles the two words apart — a tura is one
   * character's go, a runda is the cycle in which each of them takes one — and
   * this is the second. The queue beside this box already writes „Runda N"
   * where the forecast crosses into the next one; what was missing was the one
   * we are *in*, which is the number a player actually asks for. It goes here
   * rather than only on the bar because the bar scrolls sideways and this box
   * does not.
   *
   * Passed as the column holds it and shown through `roundShown`, like every
   * other place that prints one.
   */
  round: number;
  /** Opens the players drawer on this player, since the name is the question. */
  onPlayer?: () => void;
  /**
   * The character being played, named the way the journal names it.
   *
   * A player's name says who is at the table; a character's says what is on the
   * board. The feed has carried both from the start — "Michał (BŁĘDNY RYCERZ)"
   * — and this box, which is the other place a turn is read off, carried only
   * the first. Which of six figures is his was a thing you looked up elsewhere.
   */
  characterId: string | null;
  characterName: string | null;
  /** Whose colour to wear: the same one their figure has on the board. */
  seatIndex: number;
  /** Whether the viewer is the one who has to do something about it. */
  isMine: boolean;
  fieldName: string;
  /** The id behind it, so the Obszar you are standing on can be looked at. */
  fieldId: string | null;
  /** What this turn is offering — see `windowsFor`. */
  windows: readonly TurnWindow[];
  /** How far through the turn it is — see `turnSteps`. */
  steps: readonly TurnStep[];
  /** Said on the disabled control, so a refusal explains itself (see `duties.ts`). */
  /** The turn has not been rolled yet — 10.2 makes this the first thing it does. */
  canRoll: boolean;
  /** The Obszar still owes cards (13.4 counts what is already lying there). */
  /**
   * How many Karty this Obszar still owes (13.4).
   *
   * A number rather than the boolean it was, because the button deals all of
   * them at once now and has to say how many. What is already lying here is
   * subtracted on arrival — see `afterMove` — so this is the remainder and not
   * what the square prints.
   */
  owed: number;
  /** The player whose turn it is has stopped checking in (AWAY_AFTER_MS). */
  away?: boolean;
  /**
   * The table's revision, used only to restart the wait.
   *
   * Anything that happens bumps it, so keying the indicator on it is the same
   * as saying "nothing has happened since". No timer and no re-render a second:
   * the animation is given a delay, and a new key starts the delay again.
   */
  since?: number;
  busy: boolean;
  onOpen: (id: WindowId) => void;
  onRoll: () => void;
  onDraw: () => void;
}) {
  /** The whole of it, for the hover, since the line may not have room. */
  const who = isMine
    ? "Twoja tura"
    : `${playerName}${characterName ? ` (${characterName})` : ""}`;

  return (
    <section
      // Named by the heading inside it rather than by a label nobody can see:
      // the box needed a title anyway, and a landmark named twice is a landmark
      // whose two names drift.
      aria-labelledby="teraz"
      // A fixed width and a floor, stretching to whatever the queue beside it
      // is tall. Half again as wide as it was: three steps and a row of window
      // buttons were wrapping onto second lines in a box that had the height
      // for them and not the width. Nothing below moves when a window appears or the Obszar turns
      // out to have more to say than the last one did — and a hard height
      // clipped the buttons the moment a field offered two.
      /**
       * Bordered in the colour of whoever is playing.
       *
       * The board already draws each character's figure in it, the journal dots
       * every line with it, and the queue tints the cards — so the colour is
       * the app's word for "whose", and this box is the one place that was
       * saying whose without using it. Which meant reading the name to answer a
       * question the colour answers at a glance, and from across a table you
       * cannot read the name.
       */
      className="relative flex min-h-[180px] w-[270px] shrink-0 flex-col rounded-lg border bg-panel p-3"
      style={{ borderColor: seatColour(seatIndex) }}
    >
      {/* Breathing in that colour, like the sheet — see `seat-breath`. The two
          are the same statement in two places: this is whose turn it is. Its
          own ring, because animating the box fades the numbers inside it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg border-2 motion-safe:animate-seat-breath"
        style={{ color: seatColour(seatIndex), borderColor: "currentColor" }}
      />
      <header className="mb-2 min-w-0">
        {/* What the box is, in the same hand as Dziennik and the other
            surfaces' titles. Without it the first line was a player's name in
            the display face, which reads as a heading and is not one — so the
            box announced *who* before it announced *what it was*, and a player
            who had not been told had to work it out from the buttons. */}
        <div className="mb-1 flex items-baseline justify-between gap-2">
          {/* „Tura", which is the book's own noun for it — chapter 10 is
              „TURY" and 10.1 opens „Czas gry podzielony jest na tury, podczas
              których Postacie kolejno wykonują swoje czynności". „Teraz" was
              the app's word for the same thing, and it sat beside „Runda",
              which is the app's word for the other one. Two nouns from the
              game, not one from the game and one from the interface. */}
          <h2 id="teraz" className="text-[11px] uppercase tracking-widest text-muted">
            Tura
          </h2>
          {/* Opposite the heading and in the same hand as it: this is what kind
              of moment it is, not something to act on. Round 1 is a real
              answer — `passTurn` counts from the circuit it completes, so the
              first time round the table is round 0 until it wraps — so it is
              printed from the first turn rather than hidden while it is
              small. */}
          <span
            className="shrink-0 text-[11px] uppercase tracking-widest text-muted/70 tabular-nums"
            title="Kolejny obieg stołu — każdy gracz ma w nim jedną turę"
          >
            Runda {roundShown(round)}
          </span>
        </div>
        <p className="flex min-w-0 items-center gap-1.5 font-[family-name:var(--font-display)] text-sm text-ochre">
          {/* The same dot the journal puts beside every line, so the colour is
              learned in the one place a player looks up most — including on
              their own turn, which is where somebody finds out what colour they
              are without being told. */}
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: seatColour(seatIndex) }}
            aria-hidden
          />
          {/* In brackets after the name, the way the journal has always
              written it: "Michał (BŁĘDNY RYCERZ)". Two names on one line in a
              270-pixel box will sometimes lose an ellipsis off the end of a
              WĘDRUJĄCY PUSTELNIK — the title carries the whole of it, and the
              pairing being the same everywhere is worth more than the tail of
              a long name. `Lookable`, like the Obszar below: the Karta Postaci
              is where half of what a character can do is written. */}
          <span className="truncate" title={who}>
            {/* The name is a way in to the player it names: what is carried,
                what is held, what the seat is doing. Only the name — the
                character beside it is its own question and answers it with the
                Karta, which is why they are two controls and not one. */}
            {onPlayer ? (
              <button
                onClick={onPlayer}
                className="underline decoration-dotted underline-offset-2 transition hover:text-ink"
              >
                {isMine ? "Twoja tura" : playerName}
              </button>
            ) : (
              (isMine ? "Twoja tura" : playerName)
            )}
            {/* Never on your own turn. You know which of the six you are —
                your Karta is the next thing down the column — so "Twoja tura
                (BŁĘDNY RYCERZ)" spends the width telling you something you are
                looking at. It is the other players' names that need it. */}
            {!isMine && characterId && characterName && (
              <>
                {" ("}
                <Lookable kind="character" id={characterId} name={characterName} />
                {")"}
              </>
            )}
          </span>
        </p>
        {/* Where the figure is standing. The board says it too, but the board
            is on the other side of the screen and this is the line you read
            without looking away from what you are about to press. */}
        {/* A seat that has stopped checking in is not thinking, and saying so
            is worth more than any amount of animation: the table needs to know
            whether to wait or to take over. It replaces the pulse rather than
            joining it — two signals for one silence.

            Never on your own screen. "Twoje urządzenie milczy" is a sentence
            disproved by anybody who can read it, and a tab that has been
            sitting still while somebody else drove the table said exactly
            that. */}
        {away && !isMine && (
          <p className="mb-0.5 truncate text-[11px] text-vermilion">{playerName} nie odpowiada.</p>
        )}
        <p className="truncate text-[11px] text-muted" title={fieldName}>
          {fieldId ? (
            <Lookable kind="field" id={fieldId} name={fieldName} />
          ) : (
            fieldName
          )}
        </p>
      </header>

      {/* How far through the turn this is.
      
          When the roll was a panel that appeared, and then a different panel
          appeared in its place, the screen changing WAS the progress report.
          Now that both are buttons in one box, a player who looks away comes
          back to a box that looks much like it did and cannot tell whether they
          have already rolled. */}
      {steps.length > 0 && (
        <p className="mb-2 flex shrink-0 flex-wrap items-center gap-x-1 text-[10px] uppercase tracking-wide">
          {steps.map((step, at) => (
            <span key={step.label} className="flex items-center gap-1">
              {at > 0 && <span className="text-edge">·</span>}
              <span
                /**
                 * The step being waited on breathes, once waiting is a thing.
                 *
                 * Not from the moment the step arrives: a turn in progress is
                 * somebody reading a card, and a screen that pulses at them
                 * from the first second is a screen that pulses all game. The
                 * delay is what makes it mean something — nothing has happened
                 * for a while, and this is the thing that has not happened.
                 *
                 * `key` is the revision, so any move at the table starts the
                 * wait over. `motion-safe` because this is decoration, and a
                 * player who has asked their machine to stop moving things has
                 * asked for a reason.
                 */
                key={since}
                className={`${
                  step.state === "zrobione"
                    ? "text-verdigris"
                    : step.state === "teraz"
                      ? "text-ochre"
                      : "text-muted/50"
                } ${
                  step.state === "teraz" && !away ? "motion-safe:animate-pulse" : ""
                }`}
                // The delay is a style rather than a class: Tailwind's
                // arbitrary values are found by scanning source text, and this
                // one lives inside a template string where it was not.
                style={step.state === "teraz" && !away ? { animationDelay: "12s" } : undefined}
              >
                {step.label}
                {step.state === "zrobione" && " \u2713"}
              </span>
            </span>
          ))}
        </p>
      )}

      {/* The windows, most pressing first — the order is 16.4's. Everyone gets
          them, not only the player whose turn it is: at a table the others read
          the Obszar aloud and argue about it, and a window only one device can
          open is a rule only one person can check. What differs is what may be
          pressed inside, which each window decides for itself. */}
      <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1 overflow-y-auto">
        {windows.map((window) => (
          <button
            key={window.id}
            onClick={() => onOpen(window.id)}
            disabled={busy}
            className={`rounded border px-2 py-1 text-[11px] leading-none transition disabled:opacity-40 ${
              window.compulsory
                ? "border-ochre bg-ochre/10 text-ochre hover:bg-ochre/20"
                : "border-edge text-muted hover:border-ochre hover:text-ink"
            }`}
          >
            {window.label}
            {window.count !== undefined && (
              <span className="ml-1 opacity-70">{window.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* The two controls pressed every single turn, so they keep their place
          at the bottom rather than being buried a window deep with the rest.
          The roll is the whole of 10.2's first half — "wykonanie rzutu kostką"
          — and there is nothing to decide about it, so it is a button and not
          a window. What the die then asks IS a decision, and that opens the
          action window like everything else. */}
      {/* Drawing is the roll's twin: the field says how many and there is
          nothing to decide, so it is a button here rather than a window. What
          comes off the deck is the decision, and that opens one.

          It says the number because it deals the number. Badanie Obszaru is one
          act (13.4) and the button now does the whole of it, so „Wyciągnij
          kartę" was about to be a lie on every square that prints two or three
          — and the count is exactly what a player wants to know before pressing
          it, since what is already lying here has been subtracted from it. */}
      {isMine && owed > 0 && (
        <button
          onClick={onDraw}
          disabled={busy}
          className="mt-2 shrink-0 rounded border border-ochre bg-ochre/10 px-2 py-2 font-[family-name:var(--font-display)] text-[13px] tracking-wide text-ochre transition hover:bg-ochre/20 disabled:opacity-40"
        >
          Wyciągnij {owed === 1 ? "kartę" : `${owed} ${owed < 5 ? "karty" : "kart"}`}
        </button>
      )}

      {isMine && canRoll && (
        <button
          onClick={onRoll}
          disabled={busy}
          className="mt-2 shrink-0 rounded border border-ochre bg-ochre/10 px-2 py-2 font-[family-name:var(--font-display)] text-[13px] tracking-wide text-ochre transition hover:bg-ochre/20 disabled:opacity-40"
        >
          Rzuć kostką
        </button>
      )}
      {/* Ending the turn is not here any more.

          It was a small button in the corner of the box that reports where the
          turn is, across the screen from the window in which the turn actually
          happens — so a turn was read in one place and finished in another. It
          is the last thing in the Obszar's window now, which is the last thing
          a turn does, and the FAB is the way back to that window.

          Which leaves this box saying only what is true — whose turn, which
          Obszar, how far through — and nothing to press. */}
    </section>
  );
}
