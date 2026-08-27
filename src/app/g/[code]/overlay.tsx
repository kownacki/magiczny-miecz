"use client";

/**
 * What every sheet over the table does, in one place.
 *
 * There were six of these and five of them had written it out themselves —
 * the same `keydown` effect, the same backdrop with `onClick`, the same
 * `stopPropagation` on the panel inside it — which is how the sixth came to be
 * missing half of it. The Karta you open to read had no Escape at all, and the
 * drawers had neither.
 *
 * The two ways out are the ones people expect and never read about: Escape, and
 * a click on anything that is not the sheet. Both mean the same thing, so both
 * go through `onDismiss` and neither is optional — except where a sheet is
 * *un*dismissable, which is a real category and not an oversight.
 *
 * Undismissable is for a sheet that is the game asking, rather than something
 * you opened to look at: a fight is not over because you pressed Escape, and a
 * dead character still has to choose. Those pass `dismissable={false}` and say
 * why, so the next person to wonder does not "fix" it.
 */

import { createContext, useEffect, useLayoutEffect, useRef } from "react";
import { LAYER } from "./layers";

/**
 * Everything currently dismissable, innermost last.
 *
 * A stack rather than a listener each, because Escape means *the top one* and
 * nothing else. Six separate `keydown` handlers all fire, so a Karta opened
 * over a drawn card would close the Karta and — through the draw sheet's own
 * Escape, which puts the card back on the field (16.8) — throw the card away
 * with it. One press, two things, one of them irreversible.
 */
const stack: Array<() => void> = [];

/**
 * Whether the surface you are inside answers Escape.
 *
 * So that `zamknij (Esc)` can be a fact rather than a caption. The console
 * wrote that hint into its own label, which was right until it could be pinned
 * and the hint went on claiming an Escape that no longer worked — and the
 * drawers, the Karta and the Obszar answered Escape all along without ever
 * saying so. A promise typed by hand in one place out of four is not a promise.
 *
 * Provided by whatever puts a surface on screen, because that is what decides:
 * an `Overlay` with `onDismiss` null is the game asking and cannot be escaped,
 * a pinned console has opted out, and a drawer always can be. `CloseButton`
 * reads it and says so. False by default, so a button somewhere that is not
 * inside any of them promises nothing.
 */
export const AnswersEscape = createContext(false);

/** Whether anything on screen would answer an Escape of its own. */
export function dismissableOpen(): boolean {
  return stack.length > 0;
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    stack[stack.length - 1]?.();
  });
}

/**
 * Escape, wherever the focus happens to be.
 *
 * On `window` rather than the panel, because the thing you want to close is
 * rarely the thing you last clicked — you have just read a card and your hands
 * are nowhere.
 */
export function useEscape(onDismiss: (() => void) | null) {
  /**
   * The callback, kept current without moving the sheet in the stack.
   *
   * Registering `onDismiss` itself put the effect at the mercy of whoever
   * passes it: a parent re-rendering with a fresh closure would unregister and
   * re-register, which pushes that sheet back onto the *top* — so an Escape
   * would then close the drawer opened first rather than the one opened last,
   * depending on which component happened to re-render. The order has to be the
   * order they opened in, and only mounting and unmounting may change it.
   */
  const latest = useRef(onDismiss);
  // Written in an effect rather than during the render, which is the rule the
  // lint is enforcing: a ref assigned while rendering is a value React has not
  // agreed to yet, and a render that gets thrown away would leave it behind.
  useEffect(() => {
    latest.current = onDismiss;
  }, [onDismiss]);

  const enabled = onDismiss !== null;
  useEffect(() => {
    if (!enabled) return;
    const slot = () => latest.current?.();
    stack.push(slot);
    return () => {
      const at = stack.lastIndexOf(slot);
      if (at !== -1) stack.splice(at, 1);
    };
  }, [enabled]);
}

/**
 * Before paint, and never on the server.
 *
 * Registration has to be a layout effect: it must be done by the time the
 * click that caused it reaches the window, or the surface it just opened is
 * not there to be counted and the thing underneath closes instead. A passive
 * effect runs after the event is long over. React warns about `useLayoutEffect`
 * while rendering on the server, where there is nothing to lay out, so the
 * choice is made once here rather than argued with at each call.
 */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Every surface currently on screen, in the order they were opened.
 *
 * A click has to be tested against all of them at once: with the shelf out on
 * the left and the roster on the right, a click in one is outside the other,
 * and each would have dismissed the one it was not in.
 *
 * Ordered, and not a Set, for the other half of the same problem. Every drawer
 * listens, so a click on the board reached both and closed the pair of them —
 * one gesture undoing two decisions, the second of which you never asked about.
 * Last in is the one that leaves, the way `overlay.tsx` already does Escape.
 * Only mounting and unmounting may reorder this: it is the order they were
 * opened in, and a re-render is not an opening.
 *
 * Modals are in here too, which is what makes opening one stop dismissing
 * everything else. A click on an Obszar used to close the console on its way to
 * opening the field: the console was the newest thing on screen at the moment
 * the click was seen. Now the field's own sheet registers first — before the
 * click has finished travelling — and the console is no longer newest, so it
 * stays. Opening a surface is not clicking away from one.
 */
const open: HTMLElement[] = [];

/**
 * Shown, but not to be dismissed by a click or an Escape.
 *
 * Two quite different things ask for this. A pinned console, which is a
 * deliberate "leave this alone while I work"; and a sheet that is the game
 * asking rather than something you opened to look at — a fight, a dead
 * character choosing again. Both are on screen, so both still count as
 * somewhere a click can land *inside*; neither answers a dismissal.
 *
 * Kept beside the order rather than in it, because pinning must not reorder
 * anything: a console pinned and unpinned is not a console reopened.
 */
const pinned = new Set<HTMLElement>();

/** The newest thing that would answer a dismissal, skipping what is pinned. */
function newestDismissable(): HTMLElement | null {
  for (let at = open.length - 1; at >= 0; at--) {
    if (!pinned.has(open[at])) return open[at];
  }
  return null;
}

/**
 * The two ways out, for anything laid over the table.
 *
 * Extracted because the console is one of these and was not built as one. It
 * is docked along the bottom rather than down a side and keeps its own chrome,
 * but "Escape closes the newest thing" and "a click on the game closes the
 * newest thing" are not properties of a shape — they are the rules of the
 * surface, and a surface outside them is the one that breaks them for
 * everybody. The console had an Escape of its own on its input, so one press
 * ran that *and* the stack: the console closed and a drawer went with it.
 *
 * Pass null to switch it off. The console stays mounted and renders nothing
 * while shut, so without that it would sit in both registries invisibly and
 * swallow the first Escape meant for something else.
 */
export function useDismissable<T extends HTMLElement>({
  shown = true,
  onDismiss,
}: {
  /** On screen at all. A console that is shut is not somewhere a click lands. */
  shown?: boolean;
  /**
   * What Escape and a click on the game *do* to this surface — or null for the
   * kinds that answer neither.
   *
   * Not "how to close it". Dismissing is a gesture and closing is one thing a
   * surface may choose to do about it: a drawer closes, and the console shrinks
   * to its bar instead, because the transcript in it is a record of what a test
   * did and Escape is the key people hit on the way past. Every surface says
   * for itself, here, in one place — which is the whole point of the gesture
   * living in a hook rather than in each of them.
   *
   * Null for the three kinds that will not be dismissed at all. A sheet the
   * game is asking through — a fight, a dead character choosing again — because
   * those are answered rather than dismissed. A pinned one, because that is a
   * deliberate "leave this where it is". And one already shrunk to its bar,
   * because it has nowhere left to go: there is no smaller state to dismiss it
   * into, and closing it would throw away what it holds.
   *
   * All three still count as somewhere a click can land inside.
   */
  onDismiss: (() => void) | null;
}) {
  const onClose = onDismiss;
  useEscape(shown ? onClose : null);

  const panel = useRef<T>(null);

  /**
   * When this surface arrived, so it can ignore the click that brought it.
   *
   * A click takes time to travel. React handles it, the state changes, this
   * surface mounts and starts listening — and the very same click is still on
   * its way to the window, where this now sees it, finds it landed outside
   * itself, finds itself the newest thing on screen, and closes. It opened and
   * vanished a frame later, which is what "it shows for 0.1 sec and exits" was.
   * The Karta opened from the seat card, the roster opened from the line that
   * names it, the lobby asking whether to start: one cause wearing three faces.
   *
   * It never showed up on a card opened from inside the Księga, because there
   * the click lands *in* a drawer and every listener bails at the first test.
   * Only a surface opened from somewhere that is not itself a surface could see
   * its own arrival as a reason to leave.
   *
   * A timestamp rather than a flag, because `event.timeStamp` and
   * `performance.now()` share an origin: an event that began before this
   * existed cannot be a click away from it, however the frames happen to fall.
   */
  const since = useRef(0);

  useBeforePaint(() => {
    const element = panel.current;
    if (!shown || !element) return;
    since.current = performance.now();
    open.push(element);
    return () => {
      const at = open.lastIndexOf(element);
      if (at !== -1) open.splice(at, 1);
      pinned.delete(element);
    };
    // Only opening and closing may reorder this — see the note on `open`. The
    // callback is deliberately not a dependency: a parent re-rendering with a
    // fresh closure would otherwise move this surface back to the top and hand
    // it a dismissal meant for whatever is really newest.
  }, [shown]);

  const canClose = onClose !== null;
  useBeforePaint(() => {
    const element = panel.current;
    if (!shown || !element) return;
    if (canClose) pinned.delete(element);
    else pinned.add(element);
  }, [shown, canClose]);

  useEffect(() => {
    if (!shown || !onClose) return;
    const away = (event: MouseEvent) => {
      // Not the click that opened me — see the note on `since`.
      if (event.timeStamp <= since.current) return;
      const target = event.target as Node | null;
      if (!target) return;
      /**
       * Gone from the page, so it was somebody else, and they have dealt with
       * it.
       *
       * A sheet dismissed by its own backdrop unmounts while the click is still
       * travelling — React does that synchronously — so what arrives here is a
       * target detached from the document, belonging to nothing. Everything
       * below then reads it as "outside me": the Karta closed on its backdrop
       * and took the drawer underneath it along, one click for two surfaces.
       *
       * A detached target cannot be outside anything, because it is not in the
       * page to be outside of. `isConnected` says so exactly.
       */
      if (!target.isConnected) return;
      // Inside *any* of them, not just this one. With the shelf out on the
      // left and the roster on the right, a click in one is outside the other,
      // and each would have dismissed the one it was not in.
      for (const element of open) if (element.contains(target)) return;
      // Nor is the bar elsewhere. It is what opens these, so a click on it is
      // most often "and the other one too" — closing this one on the way would
      // make them mutually exclusive by accident.
      if (target instanceof Element && target.closest("[data-table-bar]")) return;
      // And only the newest leaves, skipping anything pinned. Whichever edge it
      // is on, one click away closes one surface and the next closes the one
      // under it.
      if (newestDismissable() !== panel.current) return;

      /**
       * Settled first, because a click that opens something is not a click
       * away from something.
       *
       * Clicking an Obszar closes the console under the old rule: at the
       * moment the click is seen the field sheet does not exist, so the
       * console is still the newest thing on screen and answers for it. The
       * sheet arrives a fraction later and the console is already gone.
       *
       * Waiting a turn of the loop is the only honest way to tell the two
       * apart. React has committed by then and anything the click opened has
       * registered, so a surface on screen that was not there when the click
       * landed means the click was an opening. Nothing about it is visible: a
       * dismissal one task late still lands in the same frame.
       */
      const wasOpen = new Set(open);
      const settled = () => {
        for (const surface of open) if (!wasOpen.has(surface)) return;
        // Re-asked, because the wait is long enough for the answer to have
        // changed — a sheet may have closed in it, leaving somebody else newest.
        if (newestDismissable() !== panel.current) return;
        onClose();
      };
      // A frame, and then a turn of the loop. Not a bare timeout: React does
      // not promise to have rendered the click by the next task, and at zero
      // delay it had not — the sheet was still on its way and the console
      // closed in front of it. What React does promise is to have committed
      // before the frame is painted, so asking after that frame is asking a
      // question that has an answer. Sixteen milliseconds, on a dismissal.
      requestAnimationFrame(() => setTimeout(settled, 0));
    };
    // `click` rather than `pointerdown`: the question is what the click did,
    // and at pointerdown it has not done it yet. The cost is that a drag which
    // starts outside and ends inside no longer counts as having left, which is
    // the rarer of the two by a wide margin.
    window.addEventListener("click", away);
    return () => window.removeEventListener("click", away);
  }, [shown, onClose]);

  return panel;
}

/**
 * A sheet in the middle of the screen, over a darkened table.
 *
 * `onDismiss` is null for the undismissable ones: no Escape, no click-away, and
 * the backdrop stops being a way out without stopping being a backdrop.
 */
export function Overlay({
  label,
  onDismiss,
  layer = LAYER.modal,
  tone = "bg-night/85",
  alert = false,
  children,
}: {
  label?: string;
  onDismiss: (() => void) | null;
  /** Where it sits — `LAYER.card` for a Karta, which opens from the drawers. */
  layer?: string;
  /** How dark the table goes behind it. */
  tone?: string;
  /** Reports something that already happened, rather than asking. */
  alert?: boolean;
  children: React.ReactNode;
}) {
  /**
   * In the queue with the drawers and the console, not beside it.
   *
   * A modal is covered by them — it owns the game and they are the table (see
   * `layers.ts`) — but being underneath is not the same as being outside. Two
   * things follow from being in. Opening one no longer dismisses whatever was
   * already up, because it registers as the newest surface before the click
   * that opened it has finished. And an undismissable sheet passes null, which
   * keeps it counted as somewhere a click lands inside while leaving Escape to
   * whatever below it can actually answer.
   */
  const panel = useDismissable<HTMLDivElement>({ onDismiss });

  return (
    <div
      ref={panel}
      role={alert ? "alertdialog" : "dialog"}
      aria-modal="true"
      aria-label={label}
      onClick={onDismiss ?? undefined}
      className={`fixed inset-0 ${layer} flex items-center justify-center p-4 ${tone}`}
    >
      {/* The sheet itself is not "elsewhere": clicking inside one must not
          close it, which is the half of this that is easy to leave out. */}
      <div className="contents" onClick={(event) => event.stopPropagation()}>
        <AnswersEscape.Provider value={onDismiss !== null}>{children}</AnswersEscape.Provider>
      </div>
    </div>
  );
}
