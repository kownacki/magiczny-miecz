"use client";

/** The connection point: hand it a zone, it keeps the room sounding like that zone. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { browserMusicPort, type BrowserPort } from "./browserPort";
import { CrossfadePlayer, DEFAULT_OPTIONS, type PlayerOptions } from "./player";
import { DEFAULT_CONFIG, INITIAL, observe, pendingAt, type DirectorConfig } from "./director";
import {
  getPreference,
  getServerPreference,
  setPreference,
  subscribePreference,
} from "./preferences";
import { urlForZone, type MusicZone } from "./tracks";

export interface MusicControls {
  /** The zone actually sounding, which lags the requested one while a hold runs. */
  playing: MusicZone | null;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  volume: number;
  setVolume: (volume: number) => void;
  /** True once a gesture has unlocked audio. Until then nothing is audible. */
  unlocked: boolean;
  /** Call from a click: unlocks audio and unmutes together. */
  enable: () => void;
}

export interface MusicOptions {
  /**
   * Whether this device is the one with the speakers.
   *
   * Defaults to off. At a physical table exactly one screen should be making
   * noise, and which one is a decision for the caller — not something the music
   * system should assume.
   */
  enabled?: boolean;
  director?: DirectorConfig;
  player?: PlayerOptions;
  /**
   * A track to play instead of the zone's, crossfaded in like any other change.
   *
   * The director keeps following the game underneath, untouched — so clearing
   * this returns to whatever zone is current by then, not to the one that was
   * current when the override started. That is what makes it safe to audition a
   * track mid-game without disturbing anything.
   */
  override?: string | null;
}

/**
 * Everything effectful in the music system, held for the lifetime of a mount.
 *
 * The zone goes in on every render and the hook decides whether that means
 * anything. Both halves are idempotent on an unchanged zone — the director
 * returns its own state object, the player ignores the URL it is already on —
 * so this is safe to drive straight from rendered game state without the caller
 * detecting changes itself.
 */
export function useMusic(zone: MusicZone | null, options: MusicOptions = {}): MusicControls {
  const {
    enabled = false,
    director = DEFAULT_CONFIG,
    player = DEFAULT_OPTIONS,
    override = null,
  } = options;

  // Callers pass these as object literals — `{ hold: 30_000 }` written inline is
  // the obvious way to use this hook — so a fresh identity arrives on every
  // render. Depending on the objects tore down and rebuilt the whole audio
  // graph each time. Depend on the numbers instead; the hook has to be safe to
  // call the obvious way.
  const { hold } = director;
  const { fade } = player;
  const directorConfig = useMemo(() => ({ hold }), [hold]);
  const playerOptions = useMemo(() => ({ fade }), [fade]);

  const preference = useSyncExternalStore(
    subscribePreference,
    getPreference,
    getServerPreference,
  );

  const portRef = useRef<BrowserPort | null>(null);
  const playerRef = useRef<CrossfadePlayer | null>(null);
  const stateRef = useRef(INITIAL);
  // Only read when the graph is first built; later changes go through
  // setOptions, so this must not be an effect dependency.
  const fadeRef = useRef(fade);

  const [playing, setPlaying] = useState<MusicZone | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    // Read straight from the store: the graph is built once, and every later
    // change arrives through the volume effect below.
    const port = browserMusicPort(getPreference().volume);
    portRef.current = port;
    playerRef.current = new CrossfadePlayer(port, { fade: fadeRef.current });
    return () => {
      playerRef.current?.stop();
      port.close();
      portRef.current = null;
      playerRef.current = null;
      stateRef.current = INITIAL;
    };
  }, [enabled]);

  useEffect(() => {
    playerRef.current?.setOptions(playerOptions);
  }, [playerOptions]);

  useEffect(() => {
    portRef.current?.setVolume(preference.volume);
  }, [preference.volume]);

  useEffect(() => {
    if (!enabled) return;

    const apply = () => {
      const next = observe(stateRef.current, zone, Date.now(), directorConfig);
      stateRef.current = next;
      setPlaying(next.playing);
      const wanted = override ?? urlForZone(next.playing);
      playerRef.current?.play(preference.muted ? null : wanted);
      return next;
    };

    const next = apply();

    // A switch waiting out the hold has no event coming — the zone stopped
    // changing and only the clock moves. One timer, for exactly that instant.
    const due = pendingAt(next, directorConfig);
    if (due === null) return;
    const timer = setTimeout(apply, Math.max(0, due - Date.now()));
    return () => clearTimeout(timer);
  }, [zone, enabled, preference.muted, directorConfig, override]);

  const setMuted = useCallback((muted: boolean) => setPreference({ muted }), []);
  const setVolume = useCallback((volume: number) => setPreference({ volume }), []);

  const enable = useCallback(() => {
    const port = portRef.current;
    setPreference({ muted: false });
    if (!port) return;
    void port.unlock().then(() => setUnlocked(port.unlocked));
  }, []);

  return {
    playing,
    muted: preference.muted,
    setMuted,
    volume: preference.volume,
    setVolume,
    unlocked,
    enable,
  };
}
