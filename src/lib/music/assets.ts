/** Whether the encoded loops are actually on disk — an external store, so React can subscribe. */

import { urlForZone } from "./tracks";

export type AssetState = "checking" | "present" | "missing";

let state: AssetState = "checking";
let started = false;
const listeners = new Set<() => void>();

/**
 * `public/music` is empty until someone runs `npm run music` against a Might
 * and Magic VI install, and a silent player with no explanation reads as a bug.
 * One HEAD request settles it for the whole session.
 */
async function probe(): Promise<void> {
  const url = urlForZone("lobby");
  if (!url) {
    state = "missing";
  } else {
    try {
      const response = await fetch(url, { method: "HEAD" });
      state = response.ok ? "present" : "missing";
    } catch {
      state = "missing";
    }
  }
  for (const listener of listeners) listener();
}

export function getAssetState(): AssetState {
  return state;
}

export function getServerAssetState(): AssetState {
  return "checking";
}

export function subscribeAssetState(listener: () => void): () => void {
  listeners.add(listener);
  // Started from `subscribe` rather than from the getter: React calls this from
  // an effect, so the request never fires during render.
  if (!started) {
    started = true;
    void probe();
  }
  return () => void listeners.delete(listener);
}
