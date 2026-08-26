"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  forgetSeatToken,
  noteRemoved,
  readSeatToken,
  writeSeatToken,
} from "@/lib/game/seatToken";
import { watchRevision } from "@/lib/game/liveRevision";
import type { CardId } from "@/data/ids";
import type { FieldId } from "@/lib/engine/board";
import { RANDOM_CHARACTER_ID, isRandomPick, type SeatCharacter } from "@/lib/engine/characters";
import type { TurnPhase } from "@/lib/engine/turn";
import { fitsIn, isWearable, type Slot } from "@/lib/engine/slots";
import { carriedCount, carryLimit } from "@/lib/engine/derive";
import { announce, watch, type Announcement, type Watched } from "@/lib/engine/announcements";
import { describeResult } from "@/lib/engine/noticeText";
import { CARD_NAMES, asHoldings, type Seat } from "./table";
import { isStale, standingMoves, standingPicks } from "./reconcile";

/**
 * The table, and everything a device may do to it.
 *
 * The line drawn here is between the table and the screen. What is on the
 * server — the game, the seats, the cards on the board, what this device has
 * done and is waiting to hear about — lives in this file. Which drawer is out,
 * which card somebody tapped to read, whether a watcher has folded the turn
 * away: that is the screen's, and it stays in the component.
 *
 * It was all one function before, seventeen hundred lines of it, and the cost
 * was not the length. It was that a change to the polling loop and a change to
 * a modal were changes to the same thing, so neither could be made without
 * reading the other — and that none of it could be reached from a test, because
 * reaching any of it meant rendering the whole screen.
 *
 * The three decisions that had actually gone wrong over the life of this file
 * are not here either: they are pure, they are in `reconcile.ts`, and they have
 * tests.
 */

export interface FieldCard {
  /** The row, because a field can hold two of the same Przedmiot. */
  id: string;
  fieldId: FieldId;
  cardId: CardId;
}

export interface Game {
  id: string;
  /** Which equipment variant this table plays (`EqMode`). */
  eq_mode: string;
  join_code: string;
  mode: string;
  status: string;
  active_seat: number | null;
  turn: number;
  revision: number;
  die_source: string;
  turn_state: TurnPhase;
  /**
   * What is left in each pile, and what has come back to it.
   *
   * Counts only — the orders themselves never leave the server, because the
   * next Karta Zdarzeń is the one thing at this table nobody is allowed to
   * know. Absent in companion mode, where both piles are physical.
   */
  deckCounts?: {
    events: { draw: number; discard: number };
    spells: { draw: number; discard: number };
  } | null;
  /**
   * The card on top of each stos zużytych, by slice ref.
   *
   * Only the top one, and only ever this pile: what is next off the stos Kart
   * Zdarzeń is the one thing at this table nobody may know, so the draw order
   * never leaves the server. See the note in the route.
   */
  used?: { events: string | null; spells: string | null } | null;
}

export interface Table {
  game: Game | null;
  seats: Seat[];
  fieldCards: FieldCard[];
  stock: Record<string, number>;
  mySeatIndex: number | null;
  /** Slot moves this device has made and the server has not confirmed yet. */
  moved: Record<string, Slot | null>;
  /** Karty Postaci taken client-first — only ever the surprise. */
  taking: Record<string, SeatCharacter>;
  /** The Karta Postaci asked for and not yet heard back about. */
  pendingCharacter: string | null;
  announcement: Announcement | null;
  setAnnouncement: (announcement: Announcement | null) => void;
  /** What the app decided by itself and has to say out loud. */
  notice: string | null;
  setNotice: (notice: string | null) => void;
  /** The last thing that broke, as opposed to the last thing that was refused. */
  failure: string | null;
  setFailure: (failure: string | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
  busy: boolean;
  refresh: () => Promise<void>;
  post: (path: string, body: Record<string, unknown>) => Promise<void>;
  runConsole: (line: string) => Promise<string>;
  leave: () => Promise<void>;
  join: (name: string) => Promise<void>;
  claimSeat: (seatId: string, name?: string | null) => Promise<void>;
  addLocalPlayer: (name: string) => Promise<void>;
  chooseCharacter: (seatId: string, characterId: string) => Promise<void>;
  equip: (holdingId: string, slot: Slot | null) => Promise<void>;
}

export function useTable(code: string): Table {
  const [game, setGame] = useState<Game | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  /** Cards lying face up on the board (16.8) — public to every seat. */
  const [fieldCards, setFieldCards] = useState<FieldCard[]>([]);
  /** What the Wyposażenie pile still holds (21.2), so a shop offers only what it has. */
  const [stock, setStock] = useState<Record<string, number>>({});
  /** What the app just decided by itself, shown until the next action. */
  const [notice, setNotice] = useState<string | null>(null);
  /** The last thing that broke, as opposed to the last thing that was refused. */
  const [failure, setFailure] = useState<string | null>(null);
  /** The character asked for and not yet heard back about (see `chooseCharacter`). */
  const [pendingCharacter, setPendingCharacter] = useState<string | null>(null);
  /**
   * Something that happened to this character and has to be said out loud.
   *
   * Half of these arrive on somebody else's turn — Burza Siedmiu Słońc costs
   * every character in the Krąg a turn, drawn by one player — so they cannot
   * wait for the next thing this device does. See `announcements.ts` for what
   * is worth interrupting somebody for and what is not.
   */
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  /**
   * The last reading of this seat, to compare the next one against.
   *
   * A ref and not state: nothing renders from it, and re-rendering on every
   * poll to store a value nobody looks at would be a re-render per two
   * seconds, per device, for the whole game.
   */
  const watched = useRef<Watched | null>(null);
  /** Moves this device has made and the server has not confirmed (see `equip`). */
  const [moved, setMoved] = useState<Record<string, Slot | null>>({});
  /**
   * Characters taken client-first, by seat id.
   *
   * Only ever the surprise — see `chooseCharacter`. Cleared the moment the
   * server reports the same thing, so a pick that never landed reverts on the
   * next poll rather than lingering as a lie.
   */
  const [taking, setTaking] = useState<Record<string, SeatCharacter>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mySeatIndex, setMySeatIndex] = useState<number | null>(null);
  /** The newest revision this device has rendered — see `refresh`. */
  const seenRevision = useRef(-1);
  /** When each optimistic move was made, so a lost one cannot pin a card forever. */
  const movedAt = useRef<Record<string, number>>({});
  const router = useRouter();

  const refresh = useCallback(async () => {
    const stored = readSeatToken(code);
    const query = stored ? `?token=${encodeURIComponent(stored)}` : "";
    const response = await fetch(`/api/games/${code}${query}`);
    if (!response.ok) return setError((await response.json()).error ?? "Błąd");
    const data = await response.json();

    // What this device believes, against what the server has just said. All
    // three rules are `reconcile.ts`'s, and every one of them is there because
    // something was seen in the wrong place for a tick.
    if (isStale(data.game.revision, seenRevision.current)) return;
    seenRevision.current = data.game.revision;

    /**
     * We held a seat and the table says we do not.
     *
     * Which is what being put out of one looks like from in here: the token
     * still in this window no longer opens anything, because `leaveSeat` issued
     * a new one for that seat when it emptied it. Nothing else can produce this
     * — a spectator sends no token, and a player who gave the seat up forgot
     * theirs on the way out, so both arrive with `stored` already null.
     *
     * Said and then left, rather than left to be worked out. Staying would show
     * the join gate over a table this person was just removed from, which reads
     * as the app having lost them rather than as somebody having done it.
     */
    if (stored && data.mySeatIndex === null) {
      forgetSeatToken(code);
      noteRemoved(code);
      router.push("/");
      return;
    }

    setGame(data.game);
    setSeats(data.seats);
    const now = Date.now();
    setTaking((current) => standingPicks(current, data.seats as Seat[]));
    setMoved((current) => standingMoves(current, data.seats as Seat[], movedAt.current, now));
    setFieldCards(data.fieldCards ?? []);
    setStock(data.stock ?? {});
    setMySeatIndex(data.mySeatIndex);

    // Done here rather than in an effect because this is where the new reading
    // arrives, and because the comparison has to happen exactly once per
    // answer: an effect keyed on the seat would fire again on any unrelated
    // re-render and announce a death twice.
    const mineNow = (data.seats as Seat[]).find(
      (seat) => seat.seat_index === data.mySeatIndex,
    );
    if (mineNow) {
      const reading = watch({
        turnsLost: mineNow.turns_lost,
        stoneUntilTurn: mineNow.stone_until_turn,
        eliminated: mineNow.eliminated,
      });
      const said = announce(watched.current, reading);
      watched.current = reading;
      if (said) setAnnouncement(said);
    }
  }, [code, router]);

  useEffect(() => {
    // Polling stands in for the Realtime revision ping. Two seconds is
    // imperceptible at a table where a turn takes a minute, and every refetch
    // still goes through the route handler, so the secrecy model is unchanged.
    //
    // The lint rule cannot see that `refresh` is async: its every setState runs
    // after `await fetch`, so nothing is set synchronously during the effect.
    // This is exactly the "subscribe to an external system" shape the rule's
    // own message endorses — the external system here being the table's state
    // on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // Realtime says when something happened; the poll is what catches it if
    // Realtime is down, blocked, or the tab was asleep when the message went
    // out. Fifteen seconds rather than two, because it is now a backstop
    // instead of the mechanism — and because a hidden tab is throttled to about
    // a minute anyway, which the sweep thresholds already assume.
    //
    // The poll stays at two seconds until Realtime has actually delivered
    // something. It subscribes either way, but on this project the broadcasts
    // are accepted and never arrive (see `liveRevision.ts`), and slowing the
    // poll down on the strength of a subscription that might be inert would
    // make the table *less* responsive than it is today. So the first message
    // that really lands is what earns the slower poll.
    let live = false;
    let timer = setInterval(refresh, 2000);
    const stop = watchRevision(code, () => {
      if (!live) {
        live = true;
        clearInterval(timer);
        timer = setInterval(refresh, 15_000);
      }
      void refresh();
    });
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [code, refresh]);

  /**
   * Tells the table this page is going away, so the seat is freed in seconds
   * rather than in minutes.
   *
   * `pagehide` and not `beforeunload`: the latter is unreliable — mobile
   * browsers frequently never fire it — and having a handler for it disqualifies
   * the page from the back/forward cache. `pagehide` fires in both cases and is
   * bfcache-compatible; `event.persisted` says which happened, and a page going
   * into the cache has not gone anywhere.
   *
   * `sendBeacon` and not `fetch`: a request started from an unloading page is
   * dropped. The browser guarantees to queue a beacon and run it to completion
   * after the page is discarded, which is the whole point of it existing.
   *
   * A reload fires this too, and out here that is indistinguishable from a
   * closed tab — so the server treats it as a countdown, not a departure, and
   * the reload's first poll cancels it.
   */
  useEffect(() => {
    const bye = (event: PageTransitionEvent) => {
      if (event.persisted) return; // going into the bfcache, not going away
      const token = readSeatToken(code);
      if (!token) return;
      navigator.sendBeacon?.(
        `/api/games/${code}/bye`,
        new Blob([JSON.stringify({ token })], { type: "text/plain" }),
      );
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [code]);

  /** One line, run on the server, answered with what to print. */
  const runConsole = useCallback(
    async (line: string) => {
      const response = await fetch(`/api/games/${code}/debug`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "console", line, token: readSeatToken(code) }),
      });
      const body = await response.json().catch(() => ({}));
      await refresh();
      return response.ok ? String(body.said ?? "ok") : String(body.error ?? "?");
    },
    [code, refresh],
  );

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        // Read the token at call time rather than holding it in state: it
        // only exists in this tab's sessionStorage, which is unavailable while
        // this renders on the server, and mirroring it into state meant setting
        // state inside an effect for no gain.
        const response = await fetch(`/api/games/${code}/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, token: readSeatToken(code) }),
        });
        if (!response.ok) {
          /**
           * A refusal is the rules; a failure is not.
           *
           * "To nie twoja tura" is the game working, and goes where the rest of
           * what the game says goes. `commit(moves): duplicate key value…` is
           * the machine, in English, and is nobody at the table's fault — so it
           * goes to the console, which opens itself for it, folded to a line.
           * That is a developer's surface and it appears outside test mode only
           * for this: something broke, and the person who can fix it should not
           * have to be told twice.
           */
          const said = await response.json().catch(() => ({}));
          if (said.failure) setFailure(String(said.error ?? "Coś poszło nie tak."));
          else setError(said.error);
        } else {
          // Anything the app decided on the player's behalf has to be visible,
          // or the table is being asked to take the referee's word for it. The
          // Trzęsawiska roll is the first of these; the roll is journalled too,
          // but the journal is not what someone is looking at mid-turn.
          setNotice(describeResult(await response.json().catch(() => null)));
        }
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [code, refresh],
  );

  /**
   * Gives up this device's seat.
   *
   * Mid-game this does not remove anybody: the character stays on its Obszar
   * with everything it owns and is marked as having no player, so it can be
   * taken over later — by somebody else, or by this player on a new device.
   * Only in the lobby does leaving actually delete the seat.
   */
  async function leave() {
    const seated = mySeatIndex !== null;
    if (!seated) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/games/${code}/leave`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: readSeatToken(code) }),
      });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      // Forget the seat locally too, or this browser keeps showing the
      // controls for a seat it no longer holds.
      forgetSeatToken(code);
      // Leaving before the start means leaving, not standing in the doorway:
      // the seat is gone, and staying here would only show the join form again
      // as though the click had failed.
      // Leaving the poczekalnia is leaving; leaving a game in progress is
      // giving the seat up and staying to watch.
      if (game?.status !== "playing") return router.push("/");
      setMySeatIndex(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Claims a seat for THIS device, from the join gate. Only reachable when the
   * device holds none — joining twice from one browser used to overwrite its
   * identity.
   */
  async function join(name: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/games/${code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) return setError(data.error);
      writeSeatToken(code, data.token);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Adds a player who is sitting at this table but has no device of their own.
   *
   * This is the ordinary case, not an edge case: one laptop in the middle and
   * everyone playing on it. The seat's token is deliberately discarded rather
   * than stored — this device already has an identity, and taking on a second
   * one is the bug that stranded a player earlier. The table screen acts for
   * them the same way it acts for anyone whose turn it is.
   */
  /**
   * Sits down at a seat nobody is behind — including your own, after you closed
   * the tab. The character, its points and everything it carries are exactly as
   * the last player left them.
   */
  async function claimSeat(seatId: string, name: string | null = null) {
    const response = await fetch(`/api/games/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seatId, name }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    writeSeatToken(code, data.token);
    refresh();
  }

  /**
   * Asks for a character, and waits.
   *
   * Two people can want Kapłanka at the same instant and only the server knows
   * who asked first, so nothing is taken here optimistically: the card appears
   * on the seat when the server says it is yours and not before.
   *
   * Losing that race is not an error. Somebody else was quicker, the roster
   * updates to show the character as taken, and the choice you already had
   * stands — there is nothing for the player to do about it and nothing to
   * apologise for, so it happens quietly.
   *
   * This deliberately does not go through `post`: that raises the table-wide
   * busy flag, which would grey out the whole strip when the point is to grey
   * out everything *except* the card being asked for.
   */
  async function chooseCharacter(seatId: string, characterId: string) {
    if (pendingCharacter) return; // one at a time; a double-click is not two choices
    // Choosing what is already chosen is not a choice. The strip disables the
    // card too, but the rule belongs here as well: `chooseCharacter` resets the
    // seat, ready flag included, so a no-op request is not harmless.
    if (seats.find((seat) => seat.id === seatId)?.character_id === characterId) return;

    // The surprise is the one pick that cannot be refused: any number of seats
    // may hold it, so there is no race to lose and nothing the server can say
    // that this does not already know. It lands on the seat immediately and the
    // request goes out behind it — the same client-first rule the item moves
    // follow, for the same reason. Everything else still waits, because two
    // people can want Kapłanka and only the server knows who asked first.
    if (isRandomPick(characterId)) {
      setTaking((current) => ({ ...current, [seatId]: RANDOM_CHARACTER_ID }));
      void fetch(`/api/games/${code}/character`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId, seatId, token: readSeatToken(code) }),
      })
        .then(refresh)
        .catch(() => {
          // A dropped request leaves the seat as it was; the next poll will
          // put the optimistic pick right.
        });
      return;
    }

    setPendingCharacter(characterId);
    try {
      await fetch(`/api/games/${code}/character`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId, seatId, token: readSeatToken(code) }),
      });
      // Taken or refused, the next question is the same one: what is true now?
      await refresh();
    } catch {
      // A dropped request leaves the table exactly as it was, which is the
      // same outcome as being refused.
    } finally {
      setPendingCharacter(null);
    }
  }

  /**
   * Moves a card between the pack and a place on the body — on screen first.
   *
   * Unlike choosing a character, this has nobody to race. Two players can want
   * the same Kapłanka and only the server knows who asked first; nobody else is
   * moving *your* Hełm from your pack to your head. So the card moves when you
   * move it, and the server is told afterwards.
   *
   * What the server can still refuse — a card that does not fit, a pack with no
   * room — the browser can work out for itself, so it is checked here first and
   * the move never happens rather than happening and being taken back. If the
   * server refuses anyway, the next refresh has the truth in it and the
   * optimistic move is dropped on top of it, which puts the card back.
   */
  async function equip(holdingId: string, slot: Slot | null) {
    const mineNow = seats.find((seat) => seat.seat_index === mySeatIndex);
    const held = mineNow?.holdings.find((h) => h.id === holdingId);
    if (!held || !mineNow) return;

    if (slot !== null && !fitsIn(held.cardId, slot)) {
      return setError(
        isWearable(held.cardId)
          ? `${CARD_NAMES.get(held.cardId) ?? held.cardId} nie pasuje w ten slot.`
          : `${CARD_NAMES.get(held.cardId) ?? held.cardId} to nie jest rzecz do noszenia.`,
      );
    }
    if (slot === null && held.slot != null) {
      const mineCards = asHoldings(mineNow.holdings);
      if (carriedCount(mineCards, "slots") >= carryLimit(mineCards, "slots")) {
        return setError("Plecak jest pełny — najpierw coś wyrzuć (5.4, 5.6).");
      }
    }

    setError(null);
    /**
     * Both halves of a swap at once.
     *
     * Putting a card on a place that is taken moves two cards, and only the one
     * being put on was moved here — so the card it replaced sat on the body
     * until the server answered and the next poll came round, a second or so
     * later. You saw your Excalibur go on and your Miecz stay where it was,
     * which is not a swap, it is a glitch that fixes itself.
     */
    const displaced =
      slot === null
        ? undefined
        : mineNow.holdings.find((h) => h.slot === slot && h.id !== holdingId);
    movedAt.current[holdingId] = Date.now();
    if (displaced) movedAt.current[displaced.id] = Date.now();
    setMoved((current) => ({
      ...current,
      [holdingId]: slot,
      ...(displaced ? { [displaced.id]: null } : {}),
    }));
    try {
      const response = await fetch(`/api/games/${code}/holdings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "equip",
          holdingId,
          slot,
          token: readSeatToken(code),
        }),
      });
      if (!response.ok) {
        // Refused, so put both of them back where they were — and say why.
        setError((await response.json().catch(() => ({}))).error ?? null);
        setMoved((current) => {
          const next = { ...current };
          delete next[holdingId];
          if (displaced) delete next[displaced.id];
          return next;
        });
      }
      await refresh();
    } catch {
      // A dropped request leaves the card where the player put it; the next
      // poll will move it back if the server never heard.
    }
  }

  async function addLocalPlayer(name: string) {
    const response = await fetch(`/api/games/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `local` marks a seat the host is filling for somebody at the table with
      // no device — the only seat anybody may choose a character for but their
      // own.
      body: JSON.stringify({ name: name.trim() || null, local: true }),
    });
    if (!response.ok) return setError((await response.json()).error);
    refresh();
  }

  return {
    game,
    seats,
    fieldCards,
    stock,
    mySeatIndex,
    moved,
    taking,
    pendingCharacter,
    announcement,
    setAnnouncement,
    notice,
    setNotice,
    failure,
    setFailure,
    error,
    setError,
    busy,
    refresh,
    post,
    runConsole,
    leave,
    join,
    claimSeat,
    addLocalPlayer,
    chooseCharacter,
    equip,
  };
}
