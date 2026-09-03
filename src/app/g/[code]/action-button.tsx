"use client";

import { useId, useSyncExternalStore } from "react";
import type { Intent } from "@/lib/engine/intentText";
import {
  beginChannelling,
  cancelChannelling,
  channelled,
  CHANNEL_MS,
  noChannelling,
  watchChannelling,
} from "./channelling";

/**
 * The button that decides something in the game.
 *
 * There was never one. `BarButton` is the chrome bar's glyph opener — a tally,
 * `aria-pressed`, tone as a text colour — and has nothing to do with pressing
 * „Walcz". So every decision in the game was a raw `<button>` with its Tailwind
 * written out by hand: ten of them in `drawn-actions.tsx` alone, and around eighty
 * across the route. They were copies of each other, and like all copies they
 * had drifted — `disabled:opacity-50` beside `disabled:opacity-40`, `px-3 py-1.5`
 * beside `px-3 py-2`, and the same „one of several" outline appearing as
 * `hover:bg-edge` in one panel and `hover:bg-ochre/20` in the next.
 *
 * What the copies agreed on, underneath the drift, is a grammar in three parts,
 * and each part says something a reader can act on.
 *
 * **Role — what kind of act it is.** The palette already carries this and has
 * since the board was sampled: vermilion for every dangerous thing, verdigris
 * for the calm affirmative, ochre for the table's own voice, magia blue for
 * Zaklęcia. A button that takes Życie off you should not be the same colour as
 * one that gives it back, and it never was.
 *
 * **Weight — whether this is *the* one.** This is the part that looked like
 * drift and is not. „Walcz" is filled and „Walcz ze wszystkimi naraz" is
 * outlined, because one of them is what you came here to do. The options of a
 * `wybor` are all outlined and none filled, because the rules offer them as
 * equals and the app has no business recommending one. And „Zostaw" is quieter
 * still, because a way out is not a fifth option, it is the door.
 *
 * **Size — where it sits**, from the decisions under a Karta down to the chips
 * in an effect row.
 *
 * `className` is a deliberate keyhole for *layout the parent owns* — `self-start`,
 * `w-full`, `flex-1` — and not for appearance. Anything that changes how the
 * button looks belongs in the grammar above, or the grammar is wrong.
 *
 * **Every one of these channels.** Pressing it schedules the decision instead
 * of making it, fills left to right for three seconds, and says „Anuluj" for as
 * long as it fills; every other button on the page is disabled meanwhile. The
 * call sites did not have to ask for this and cannot switch it off, which is
 * the point — a way out that some irreversible buttons have and others do not
 * is worse than none, because it teaches a player to expect it. `channelling.ts`
 * has the reasoning and the one place the three seconds is written down.
 *
 * A button that passes `says` also spends those three seconds telling the rest
 * of the table what is coming. That part *is* opt-in, because only the call site
 * knows what it is about to do — and because two kinds of button must not
 * announce anything: one whose options are face down (9.3), and one that is not
 * a move in the game at all.
 */

/** What kind of act it is. The colour follows from this, never from the caller. */
export type ActionRole = "act" | "gain" | "harm" | "spell";

/**
 * How much of a claim it makes on the player.
 *
 * `lead` — filled: this is the thing to press.
 * `outline` — one of several the rules offer as equals.
 * `quiet` — another thing you may do, named in its role's colour only on hover.
 * `decline` — the way out. Muted until you reach for it.
 */
export type ActionWeight = "lead" | "outline" | "quiet" | "decline";

/** Where it sits: under a Karta, in a list, in a row of chips. */
export type ActionSize = "lg" | "md" | "sm" | "xs";

const LOOK: Record<ActionRole, Record<ActionWeight, string>> = {
  act: {
    lead: "border-ochre/60 bg-ochre/10 text-ochre hover:bg-ochre/20",
    outline: "border-ochre/60 text-ochre hover:bg-edge",
    quiet: "border-edge text-ink hover:border-ochre",
    decline: "border-edge text-muted hover:border-ochre hover:text-ink",
  },
  gain: {
    lead: "border-verdigris/60 bg-verdigris/10 text-ink hover:bg-verdigris/20",
    outline: "border-verdigris/50 text-ink hover:bg-verdigris/20",
    quiet: "border-edge text-ink hover:border-verdigris",
    decline: "border-edge text-muted hover:border-verdigris hover:text-ink",
  },
  harm: {
    lead: "border-vermilion/60 bg-vermilion/10 text-ink hover:bg-vermilion/20",
    outline: "border-vermilion/60 text-ink hover:bg-vermilion/20",
    quiet: "border-edge text-ink hover:border-vermilion",
    decline: "border-edge text-muted hover:border-vermilion hover:text-ink",
  },
  spell: {
    lead: "border-magia/60 bg-magia/10 text-ink hover:bg-magia/20",
    outline: "border-magia/50 text-ink hover:bg-magia/20",
    quiet: "border-edge text-ink hover:border-magia",
    decline: "border-edge text-muted hover:border-magia hover:text-ink",
  },
};

/**
 * The sweep, in the button's own colour.
 *
 * Its own, rather than one channelling colour for all of them: the bar is not
 * an event happening *to* the button, it is the button doing what it says, and
 * an ochre wash across „Walcz" would read as a different control arriving.
 */
const FILL: Record<ActionRole, string> = {
  act: "bg-ochre/25",
  gain: "bg-verdigris/25",
  harm: "bg-vermilion/25",
  spell: "bg-magia/25",
};

const SIZE: Record<ActionSize, string> = {
  /** The decisions under a Karta, and the rows of a stacked list. */
  lg: "px-4 py-2 text-sm",
  /** Inline beside a `<select>`, whose own padding this matches. */
  md: "px-3 py-1.5 text-sm",
  /** A row of controls in a panel. */
  sm: "px-3 py-1 text-xs",
  /** A chip in a line of prose. */
  xs: "px-2 py-0.5 text-[11px]",
};

export function ActionButton({
  role = "act",
  weight = "outline",
  size = "md",
  align = "center",
  note,
  before,
  after,
  title,
  disabled = false,
  immediate = false,
  sent = false,
  onClick,
  says,
  confirm,
  className,
  children,
}: {
  role?: ActionRole;
  weight?: ActionWeight;
  size?: ActionSize;
  /** Left, for a button that is a row in a list rather than a word in a bar. */
  align?: "center" | "left";
  /**
   * The second line: what the label leaves out.
   *
   * A choice between two rules is not a choice until you know the numbers, so
   * „Miecz 6 → 2 · Magia 2 → 6" goes under „wedle własnego wyboru" — and the
   * Zaklęcie's own text goes under its name. Both were already being written
   * by hand, in two different sizes.
   */
  note?: React.ReactNode;
  /**
   * A glyph beside the label, on one side or the other.
   *
   * For the thing the button *is* rather than for decoration: a die on „Rzuć
   * kostką" says the app is about to throw one, which is the difference between
   * this button and every other button under a Karta. The label still says it
   * in words — an icon that is the only telling is a rebus.
   */
  before?: React.ReactNode;
  after?: React.ReactNode;
  /** Only where a glyph or an abbreviation cannot say it. Never a rule number. */
  title?: string;
  disabled?: boolean;
  /**
   * Press it and it happens: no three seconds, no „Anuluj".
   *
   * The window exists to take back a *decision* — „Weź Przedmiot" cannot be
   * un-taken, a `wybor` answered is answered — and a die is not one. Nothing is
   * being chosen: the Karta is compulsory, the app throws for you, and there is
   * no other answer to have preferred. A countdown in front of that is a delay
   * with a cancel on it, and what the player is waiting to see is the face.
   *
   * Such a button tells the table nothing while it is pressed, because there is
   * no window to tell them in. What the table gets is the result, which lands
   * in the Dziennik the moment the roll does.
   */
  immediate?: boolean;
  /**
   * This button's decision has gone to the server and has not come back.
   *
   * The other side of the three seconds. While a button fills, the decision is
   * still the player's and the button is the way out of it; once it is sent
   * there is no way out — so it goes out with the rest of the panel, and the
   * only thing that separates it from them is the ring turning where its label
   * was. Dimmed like every other control, because it is exactly as unpressable;
   * spinning, because it is the one the table is waiting on.
   *
   * The label keeps its place in the layout and only its ink, so the button
   * does not resize and its accessible name stays the answer that was given.
   */
  sent?: boolean;
  onClick: () => void;
  /**
   * What the watching players are told while this fills.
   *
   * Omitted where there is nothing they may know — an `ask` frame's Zaklęcia are
   * face down (9.3) and announcing which one was picked would be the one place
   * in the app that leaks a hand — and where the button is not a move in the
   * game. `intentText.ts` holds the vocabulary and the words.
   */
  says?: Intent;
  /**
   * Asked before the three seconds start, for an action that also needs a yes.
   *
   * The two go in this order and not the other: a dialog raised *after* the
   * channelling has run is a question asked about something already decided,
   * and a channel that fills while a dialog is up is a countdown behind a modal
   * nobody can see. So the button asks, and the answer starts the fill — which
   * is still cancellable, so „są pewni?" and „ostatnia szansa" stay two
   * different offers rather than the same one twice.
   *
   * Handed the starter rather than expected to find it: the three seconds
   * belong to *this* button, and only the button knows which one it is — `id`
   * is its own `useId`. The caller knows when the question was answered and
   * nothing else.
   */
  confirm?: (proceed: () => void) => void;
  /** Layout the parent owns — `self-start`, `w-full`. Never appearance. */
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const pending = useSyncExternalStore(watchChannelling, channelled, noChannelling);
  /** This button is the one holding a decision, so it is the way out of it. */
  const filling = pending?.id === id;
  /** Somebody else's decision is in flight. One at a time — `channelling.ts`. */
  const waiting = pending !== null && !filling;

  return (
    <button
      type="button"
      disabled={disabled || waiting || sent}
      aria-busy={sent || undefined}
      onClick={
        filling
          ? cancelChannelling
          : immediate
            ? // Nothing to take back — see `immediate`. The confirm still
              // stands where a call site asked for one: „are you sure" and
              // „you have three seconds" are different offers.
              confirm
              ? () => confirm(onClick)
              : onClick
            : confirm
              ? () => confirm(() => beginChannelling(id, onClick, says ?? null))
              : () => beginChannelling(id, onClick, says ?? null)
      }
      // The label's own title would be answering a question the button has
      // stopped asking.
      title={filling ? undefined : title}
      aria-label={filling ? "Anuluj" : undefined}
      className={[
        "relative overflow-hidden rounded border transition disabled:opacity-50",
        SIZE[size],
        LOOK[role][weight],
        align === "left" ? "text-left" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Kept in the layout and only hidden, so the button does not resize
          under the cursor that is about to press it again. `invisible` while it
          fills, because the name is „Anuluj" then and there must not be two;
          only faded once it is sent, so a screen reader still reads back the
          answer the ring is turning for. */}
      <span className={filling ? "invisible block" : sent ? "block opacity-0" : "block"}>
        {before || after ? (
          /* A row only where there is something to put beside the label, so no
             button that never asked for one changes shape. */
          <span
            className={`flex items-center gap-2 ${align === "left" ? "" : "justify-center"}`}
          >
            {before}
            <span className={align === "left" ? "min-w-0 flex-1" : "min-w-0"}>
              {children}
              {note ? (
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{note}</span>
              ) : null}
            </span>
            {after}
          </span>
        ) : (
          <>
            {children}
            {note ? (
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">{note}</span>
            ) : null}
          </>
        )}
      </span>
      {sent ? (
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          {/* Its own text colour and its own size: the ring belongs to this
              button rather than arriving on top of it, and a chip in a line of
              prose cannot carry the same one a decision under a Karta does. */}
          <span className="block h-[1em] w-[1em] rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />
        </span>
      ) : null}
      {filling ? (
        <>
          <span
            aria-hidden
            className={`absolute inset-0 origin-left motion-safe:animate-channel-fill ${FILL[role]}`}
            style={{ animationDuration: `${CHANNEL_MS}ms` }}
          />
          <span className="absolute inset-0 grid place-items-center text-ink">Anuluj</span>
        </>
      ) : null}
    </button>
  );
}
