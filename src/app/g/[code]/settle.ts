"use client";

/**
 * Say it on screen now, tell the server once the hand has stopped moving.
 *
 * The pattern this app already lives by — a card goes into its slot when you
 * drop it, not when the server agrees — with the half that was missing. A
 * control somebody can press twice in a second posts twice, and the two
 * requests race: whichever reply lands last decides, which may be the older
 * one. Pressing Slotowy, Klasyczny, Slotowy is three requests to settle one
 * question, and the answer is a coin toss.
 *
 * So the local change is instant and the request is the *last* one, sent when
 * the pressing stops. Nothing is queued and nothing is retried: this is for
 * settings, where only the final value means anything and an intermediate one
 * is not a fact anybody wanted recorded.
 *
 * Not for moves. A card put down and picked up again is two things that
 * happened, and swallowing the first would lose it — `equip` posts every time
 * on purpose. The test is whether the intermediate values are events or noise.
 */

import { useCallback, useEffect, useRef } from "react";

/** Long enough to cover a change of mind, short enough not to feel held. */
const QUIET = 400;

export function useSettled<T>(
  send: (value: T) => void | Promise<void>,
  quiet = QUIET,
): (value: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The newest `send`, without restarting the clock.
   *
   * A caller's closure changes on every render — `send` here captures state —
   * and making the returned function depend on it would cancel the pending
   * request each time anything else on the page moved.
   */
  const latest = useRef(send);
  // After the render rather than during it: a ref written while rendering is a
  // render that did something, and the compiler is right to say so.
  useEffect(() => {
    latest.current = send;
  });

  // A pending request whose page has gone is a request about a screen nobody is
  // looking at. It is dropped rather than fired.
  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  return useCallback(
    (value: T) => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void latest.current(value);
      }, quiet);
    },
    [quiet],
  );
}
