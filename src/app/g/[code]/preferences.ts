"use client";

/**
 * What this browser wants, as opposed to what the table is.
 *
 * Nothing here is game state and none of it goes near the server: it is one
 * person's answer to how they want to read the screen, and two people at the
 * same table may answer differently. So it lives in `localStorage` and is keyed
 * per browser, not per seat — the same reader on the same machine gets the same
 * answers back tomorrow.
 *
 * `useSyncExternalStore` rather than state plus an effect, because the value
 * has to be read on the client and cannot be read while rendering on the
 * server. Reading it in an effect and calling `setState` gives one frame of the
 * default and one cascading render, which is both a flicker and the thing the
 * React compiler will not have.
 */

import { useSyncExternalStore } from "react";

export interface Preferences {
  /**
   * Whether `(5.3)` and its like are ways into the Instrukcja or just text.
   *
   * On, because a rule number nobody can look up is decoration. Off for anybody
   * who knows the book and finds a page of dotted underlines busier than the
   * sentence underneath it is worth.
   */
  ruleLinks: boolean;
}

const DEFAULTS: Preferences = { ruleLinks: true };

const KEY = "mm:preferences";

let cache: Preferences = DEFAULTS;
let raw: string | null = null;
const listeners = new Set<() => void>();

/**
 * The same object back for the same stored string.
 *
 * `useSyncExternalStore` compares snapshots by identity and calls a fresh
 * object on every read an infinite loop, so the parse is cached against the
 * text it came from and only a real change makes a new one.
 */
function snapshot(): Preferences {
  if (typeof window === "undefined") return DEFAULTS;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(KEY);
  } catch {
    // Private windows and blocked site data. The defaults are a complete
    // answer, so there is nothing to recover from.
    return DEFAULTS;
  }
  if (stored !== raw) {
    raw = stored;
    try {
      cache = { ...DEFAULTS, ...(stored ? (JSON.parse(stored) as Partial<Preferences>) : {}) };
    } catch {
      cache = DEFAULTS;
    }
  }
  return cache;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab at the same table, which is a real case here: people open a
  // second window to drive a second seat.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULTS);
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  const next = { ...snapshot(), [key]: value };
  const text = JSON.stringify(next);
  try {
    window.localStorage.setItem(KEY, text);
  } catch {
    // Nothing to be done, and nothing to tell the reader: the setting simply
    // will not outlive the tab.
  }
  // Both, so the next snapshot recognises what it wrote and hands back this
  // very object rather than an equal one — see `snapshot`.
  raw = text;
  cache = next;
  for (const listener of listeners) listener();
}
