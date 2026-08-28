"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Notice } from "./toast";
import { useSettled } from "./settle";
import { useRouter } from "next/navigation";
import type { Requests, Route } from "@/lib/game/requests";
import {
  forgetSeatToken,
  noteRemoved,
  readSeatToken,
  writeSeatToken,
} from "@/lib/game/seatToken";
import { deviceId, forgetDevice } from "@/lib/game/deviceId";
import { watchRevision } from "@/lib/game/liveRevision";
import type { CardId } from "@/data/ids";
import type { FieldId } from "@/lib/engine/board";
import { RANDOM_CHARACTER_ID, isRandomPick, type SeatCharacter } from "@/lib/engine/characters";
import type { TurnPhase } from "@/lib/engine/turn";
import { fitsIn, isWearable, type Slot } from "@/lib/engine/slots";
import { carriedCount, carryLimit } from "@/lib/engine/derive";
import { announce, watch, type Announcement, type Watched } from "@/lib/engine/announcements";
import { describeResult } from "@/lib/engine/noticeText";
import { CARD_NAMES, asHoldings, asNature, type Seat } from "./table";
import { forbiddenSaid, forbiddenTo } from "@/lib/engine/holdings";
import { isStale, standingMoves, standingPicks, standingRules } from "./reconcile";

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
  /** Whether the Wyposażenie pile can run out (21.2). One way only. */
  endless_stock: boolean;
  join_code: string;
  mode: string;
  status: string;
  active_seat: number | null;
  /**
   * Karty Postaci that are out of the game — 4.4's "odłożyć do pozostałych nie
   * biorących udziału w grze", plus anything withdrawn for good.
   *
   * Public, and it has to be: the picker uses it to stop offering a Postać the
   * server would refuse, and being told no after choosing is worse than not
   * being offered.
   */
  characters_out: string[];
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

/** Somebody at the table, as the wire carries them. See `EnvelopeUser`. */
export interface Person {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  seatIndex: number | null;
  away: boolean;
}

export interface Table {
  game: Game | null;
  seats: Seat[];
  fieldCards: FieldCard[];
  stock: Record<string, number>;
  /**
   * Everybody in the room, seated or watching, in join order.
   *
   * Not the same list as `seats` and no longer derivable from it: six chairs,
   * any number of people, and the interesting states are the ones where the
   * two do not line up.
   */
  users: Person[];
  /** Who this device is, and null when the table has never heard of it. */
  me: Person | null;
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
  /** The same messages, as a queue the rail draws — see `Toasts`. */
  notices: Notice[];
  dismissNotice: (id: number) => void;
  /** Moves one of the table's house rules — the host's, and instant. */
  setHouseRule: (patch: Partial<Pick<Game, "eq_mode" | "endless_stock">>) => void;
  busy: boolean;
  refresh: () => Promise<void>;
  /** One request, with its body checked against what that route reads. */
  post: <R extends Route>(path: R, body?: Partial<Requests[R]>) => Promise<void>;
  runConsole: (line: string) => Promise<string>;
  leave: () => Promise<void>;
  join: (name: string) => Promise<void>;
  claimSeat: (seatId: string, name?: string | null) => Promise<void>;
  /** Who this browser was at this table, offered rather than assumed. */
  wasHere: { name: string; seatIndex: number | null } | null;
  /** This browser is somebody here already, in another window. */
  elsewhere: boolean;
  resumeHere: () => Promise<void>;
  joinAsSomebodyElse: () => void;
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
   * A house rule the host has just moved and the server has not confirmed.
   *
   * The same bargain as `moved`: nobody is racing you for it. Only the host may
   * touch these and there is nothing for the server to work out — a switch is
   * the whole decision — so waiting a round trip to see your own click land
   * makes a control that is instant everywhere else feel broken here.
   *
   * Cleared when the server reports the same thing, so a request that never
   * arrived reverts on the next poll rather than lingering as a lie.
   */
  const [houseRules, setHouseRules] = useState<Partial<Pick<Game, "eq_mode" | "endless_stock">>>(
    {},
  );
  /**
   * Characters taken client-first, by seat id.
   *
   * Only ever the surprise — see `chooseCharacter`. Cleared the moment the
   * server reports the same thing, so a pick that never landed reverts on the
   * next poll rather than lingering as a lie.
   */
  const [taking, setTaking] = useState<Record<string, SeatCharacter>>({});
  /**
   * The last thing that went wrong, kept for the one place that is not a
   * remark: a table that would not load at all has no board to put a notice
   * over, so that one is still a page. Everything else goes to the rail.
   */
  const [error, said] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  /** Ids, not indexes: a notice that leaves must not renumber the ones above. */
  const noticeSeq = useRef(0);
  const setError = useCallback((message: string | null) => {
    said(message);
    if (message !== null) {
      noticeSeq.current += 1;
      const id = noticeSeq.current;
      setNotices((were) => {
        // The same refusal twice over is one refusal you have hit twice. A
        // second click on the same forbidden card is the most likely thing
        // anybody does after the first, and a column of identical notices says
        // nothing the first one did not — so the standing one is replaced,
        // which also restarts its clock and keeps it on screen.
        const last = were[were.length - 1];
        const rest = last?.text === message ? were.slice(0, -1) : were;
        return [...rest, { id, text: message }];
      });
    }
  }, []);
  const dismissNotice = useCallback((id: number) => {
    setNotices((were) => were.filter((one) => one.id !== id));
  }, []);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<Person[]>([]);
  /** Who this browser was at this table, if it can be them again. */
  const [wasHere, setWasHere] = useState<{ name: string; seatIndex: number | null } | null>(null);
  /** This browser is already somebody here, in another window. */
  const [elsewhere, setElsewhere] = useState(false);
  /** The token minted for a resume offer, held until the offer is accepted. */
  const pendingToken = useRef<string | null>(null);
  const [me, setMe] = useState<Person | null>(null);
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
     * We held a token and the table has never heard of us.
     *
     * Which is what being put off a table looks like from in here: the row is
     * gone, so the token opens nothing. Nothing else produces it — somebody who
     * left forgot their token on the way out and arrives with `stored` already
     * null.
     *
     * Asked of `me` and *not* of `mySeatIndex`, which is the whole of what the
     * split changed here. Driving no seat is an ordinary thing to be now — you
     * are watching, or your Postać died and you have not taken another (4.4) —
     * and testing the seat threw every one of those people off the table with a
     * notice saying somebody had removed them.
     *
     * Said and then left, rather than left to be worked out. Staying would show
     * the join gate over a table this person was just removed from, which reads
     * as the app having lost them rather than as somebody having done it.
     */
    if (stored && data.me === null) {
      forgetSeatToken(code);
      noteRemoved(code);
      router.push("/");
      return;
    }

    // The house rule this device asked for, kept only until the table has it.
    // `standingRules` is `standingMoves`' neighbour and shares its `keepIf`,
    // which hands the same object back when nothing was dropped — the reason
    // this is not written out here.
    setHouseRules((wanted) => standingRules(wanted, data.game as Game));
    setGame(data.game);
    setSeats(data.seats);
    const now = Date.now();
    setTaking((current) => standingPicks(current, data.seats as Seat[]));
    setMoved((current) => standingMoves(current, data.seats as Seat[], movedAt.current, now));
    setFieldCards(data.fieldCards ?? []);
    setStock(data.stock ?? {});
    setUsers(data.users ?? []);
    setMe(data.me ?? null);
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

  /**
   * Was this browser somebody here?
   *
   * Asked by a device that has arrived holding nothing — a tab that was closed
   * and reopened, which the claim token deliberately does not survive (see
   * `seatToken.ts`). Three answers, and the middle one is why this is offered
   * rather than done: nobody, somebody live in another window, or somebody
   * quiet, who this window can be again.
   *
   * Nothing is gated on it. A browser that refuses storage has no `deviceId`,
   * hears `resumed: false`, and joins the way everybody did before this
   * existed.
   */
  const askWhoIWas = useCallback(async () => {
    const device = deviceId();
    if (!device) return;
    const response = await fetch(`/api/games/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resume: true, deviceId: device }),
    });
    if (!response.ok) return;
    const data = await response.json();
    if (data.resumed) {
      // The token is minted for this window and is not written until the person
      // says yes: holding it here would turn the offer into a decision.
      pendingToken.current = data.token;
      setWasHere({ name: data.name, seatIndex: data.seatIndex });
      return;
    }
    setElsewhere(Boolean(data.live));
  }, [code]);

  /** Yes: be that person again. */
  async function resumeHere() {
    const token = pendingToken.current;
    if (!token) return;
    writeSeatToken(code, token);
    pendingToken.current = null;
    setWasHere(null);
    await refresh();
  }

  /**
   * No: somebody else is sitting at this browser.
   *
   * The device id goes with the answer, or the next tab is offered the same
   * person again — and this browser is now somebody new, which is exactly what
   * a second player on one laptop is.
   */
  function joinAsSomebodyElse() {
    forgetDevice();
    pendingToken.current = null;
    setWasHere(null);
    setElsewhere(false);
  }

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
  /**
   * Asked once, on arrival, and only by a window holding nothing.
   *
   * A window that already has a claim is somebody — reloading is the case this
   * whole design is built around — and asking again would offer to be a person
   * it already is. So this fires exactly for the case it is for: a tab that was
   * closed, or a link opened fresh on a browser that has been here before.
   */
  useEffect(() => {
    if (readSeatToken(code)) return;
    // The lint rule cannot see that this is async: every setState inside it
    // runs after `await fetch`, so nothing is set during the effect itself.
    // Same shape, and the same exemption, as the poll below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void askWhoIWas();
  }, [code, askWhoIWas]);

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

  /**
   * One request, with the field names checked against what the route reads.
   *
   * The route name picks the shape out of `Requests`, so a body naming a field
   * that route does not read is an error here rather than a request that
   * arrives, parses, matches nothing and falls through to whatever the route
   * does when nobody said. That is not a hypothetical failure mode: it is how
   * the host came to kick themselves.
   */
  const post = useCallback(
    async <R extends Route>(path: R, body: Partial<Requests[R]> = {}) => {
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
        // What browser this is, so that closing the tab is something to come
        // back from rather than the end of being this person. See `deviceId`.
        body: JSON.stringify({ name: name.trim() || null, deviceId: deviceId() }),
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
  /**
   * Moves a house rule, on screen first.
   *
   * Nobody is racing the host for these, so the switch answers immediately and
   * the server is told afterwards — the same bargain `equip` strikes, and for
   * the same reason. A refusal comes back as a toast and the next refresh puts
   * the switch back where the table actually has it.
   */
  const sendHouseRule = useSettled(
    async (patch: Partial<Pick<Game, "eq_mode" | "endless_stock">>) => {
      /**
       * Deliberately not `post`, which raises `busy` for the whole page.
       *
       * These controls have already answered — nothing here is waiting on a
       * reply — and a switch that greys out after it has visibly moved reads as
       * the app taking the answer back. `equip` fetches directly for the same
       * reason, and this is the one other place with the same bargain.
       */
      const response = await fetch(`/api/games/${code}/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: readSeatToken(code),
          ...(patch.eq_mode !== undefined ? { eqMode: patch.eq_mode } : {}),
          ...(patch.endless_stock !== undefined ? { endlessStock: patch.endless_stock } : {}),
        }),
      });
      if (!response.ok) {
        /**
         * Put it back, now, rather than waiting for an agreement that is not
         * coming.
         *
         * `standingRules` drops an overlay when the table *has* the value, and
         * a refused one never will — so a switch the server said no to stayed
         * moved for the rest of the session, quietly showing a rule the table
         * was not playing. Every other optimistic thing here is reverted by
         * the truth arriving; this is the one that has to revert itself.
         */
        setHouseRules((was) => {
          const back = { ...was };
          for (const field of Object.keys(patch)) delete back[field as keyof typeof back];
          return back;
        });
        setError((await response.json().catch(() => ({}))).error ?? null);
      }
      await refresh();
    },
  );

  const setHouseRule = useCallback(
    (patch: Partial<Pick<Game, "eq_mode" | "endless_stock">>) => {
      setHouseRules((was) => ({ ...was, ...patch }));
      sendHouseRule(patch);
    },
    [sendHouseRule],
  );

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
    /**
     * 5.3, before the card moves rather than after.
     *
     * This is the one refusal the browser could already have worked out and
     * was leaving to the server: the card went on, sat there for as long as
     * the round trip took, and was pulled off again. A card that visibly goes
     * where it may not go and then leaves reads as the app changing its mind,
     * and it is worse than useless on the one move it happens on — you saw it
     * work.
     */
    if (slot !== null && forbiddenTo(held.cardId, asNature(mineNow.nature))) {
      return setError(forbiddenSaid(CARD_NAMES.get(held.cardId) ?? held.cardId));
    }
    if (slot === null && held.slot != null) {
      const mineCards = asHoldings(mineNow.holdings);
      if (carriedCount(mineCards, "slots") >= carryLimit(mineCards, "slots")) {
        return setError("Plecak jest pełny — najpierw coś odrzuć (5.4, 5.6).");
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
    // What the server said, with the host's own unconfirmed switch over the top
    // — see `houseRules`. Everything downstream reads `game.eq_mode`, so laying
    // it on here means no caller has to know the difference.
    game: game && (houseRules.eq_mode !== undefined || houseRules.endless_stock !== undefined)
      ? { ...game, ...houseRules }
      : game,
    seats,
    fieldCards,
    stock,
    users,
    me,
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
    notices,
    dismissNotice,
    setHouseRule,
    busy,
    refresh,
    post,
    runConsole,
    leave,
    join,
    claimSeat,
    wasHere,
    elsewhere,
    resumeHere,
    joinAsSomebodyElse,
    addLocalPlayer,
    chooseCharacter,
    equip,
  };
}
