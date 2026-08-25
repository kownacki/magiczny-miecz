/** Mute and volume, per device, in localStorage — an external store React can subscribe to. */

const STORAGE_KEY = "mm:music";

export interface MusicPreference {
  muted: boolean;
  volume: number;
}

/**
 * Muted by default, deliberately.
 *
 * Every device that opens the table would otherwise start playing, and four
 * phones a few hundred milliseconds apart flange rather than blend. Somebody
 * turns the sound on, on the one device with the speakers.
 */
const DEFAULT: MusicPreference = { muted: true, volume: 0.6 };

/**
 * Held rather than re-read, because `useSyncExternalStore` compares snapshots by
 * identity: parsing the JSON afresh on every render would return a new object
 * every time and re-render forever.
 */
let cached: MusicPreference | null = null;
const listeners = new Set<() => void>();

function read(): MusicPreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT;
    const parsed = JSON.parse(saved) as Partial<MusicPreference>;
    return {
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT.muted,
      volume: typeof parsed.volume === "number" ? parsed.volume : DEFAULT.volume,
    };
  } catch {
    // Private window, cleared storage, or a value someone edited by hand.
    return DEFAULT;
  }
}

export function getPreference(): MusicPreference {
  cached ??= read();
  return cached;
}

/**
 * The server has no localStorage, so it renders the default and the client
 * corrects it after hydration. Returning a constant is what keeps the two
 * renders from disagreeing.
 */
export function getServerPreference(): MusicPreference {
  return DEFAULT;
}

export function setPreference(patch: Partial<MusicPreference>): void {
  cached = { ...getPreference(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // Storage refused; the preference just does not outlive the tab.
  }
  for (const listener of listeners) listener();
}

export function subscribePreference(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab of the same table changing it counts as a change here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cached = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
