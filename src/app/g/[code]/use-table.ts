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
import type { TurnState } from "@/lib/engine/stack";
import { fitsIn, isWearable, type Slot } from "@/lib/engine/slots";
import { carriedCount, carryLimit } from "@/lib/engine/derive";
import { announce, watch, type Announcement, type Watched } from "@/lib/engine/announcements";
import type { AnnouncedIntent, Intent } from "@/lib/engine/intentText";
import { announcingWith, CHANNEL_MS } from "./channelling";
import { watchIntent } from "@/lib/game/liveRevision";
import { CARD_NAMES, asHoldings, asNature, type Seat } from "./table";
import { forbiddenIn, forbiddenSaid } from "@/lib/engine/holdings";
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
  /** Conjured by the test console, and marked with the wrench wherever it is drawn. */
  granted?: boolean;
  /**
   * What is left beside a Miejsce that lays points out (16.7).
   *
   * Three Karty have one — Drzewo Życia, Jezioro Magiczne, Zaklęte Źródło — and
   * it is the only count in the box belonging to a Karta rather than to a
   * Postać. Absent on everything else.
   */
  pool?: number;
}

export interface Game {
  id: string;
  /** Which equipment variant this table plays (`EqMode`). */
  eq_mode: string;
  /** Whether the Wyposażenie pile can run out (21.2). One way only. */
  endless_stock: boolean;
  /**
   * Which trofea rule the table plays (1.4) — see `docs/TROFEA.md`.
   *
   * "points" is the variant and the default — a beaten Wróg's Karta goes to the
   * stos zużytych the moment he dies, and what the seat keeps is a copy of him.
   * "cards" is 1.4 as printed: you hold the Karta until you trade it.
   *
   * Both keep the trophy as a holding and both count the sevens off it; the
   * cardboard is the whole difference. Not `seat.trophy_points`, which this
   * used to say and which nothing has written since „Punkty" stopped being a
   * pool — see the column's own note in db/schema.sql.
   *
   * Still optional in the type, though the column is `not null`: a page held
   * open across the deploy that added it would otherwise read `undefined` as a
   * mode and draw the wrong section until the next refresh.
   */
  trophy_mode?: "cards" | "points";
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
  round: number;
  revision: number;
  die_source: string;
  turn_state: TurnState;
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

/**
 * A Zaklęcie spoken and hanging in the air, waiting to be answered (9.6).
 *
 * The window is a clock, so `until` is what the browser counts down against —
 * and it belongs to the table rather than to a seat, because answering one is
 * anybody's to do.
 */
export interface Spoken {
  spell: string;
  name: string;
  by: number | null;
  at: number | null;
  until: number;
}

export interface Table {
  game: Game | null;
  /** The Zaklęcie in the air, if one is. */
  spoken: Spoken | null;
  seats: Seat[];
  fieldCards: FieldCard[];
  /** Loose Sztuki Złota lying on an Obszar (12.1). */
  fieldGold: { fieldId: string; gold: number }[];
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
  /** The last thing that broke, as opposed to the last thing that was refused. */
  failure: string | null;
  setFailure: (failure: string | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
  /** The same messages, as a queue the rail draws — see `Toasts`. */
  notices: Notice[];
  dismissNotice: (id: number) => void;
  /** Moves one of the table's house rules — the host's, and instant. */
  setHouseRule: (patch: Partial<Pick<Game, "eq_mode" | "endless_stock" | "trophy_mode">>) => void;
  busy: boolean;
  /**
   * What the acting player's button is about to do, while it is still filling.
   *
   * The one thing on this object that is not a fact about the game: it may be
   * cancelled, and then it never happened. Ephemeral by construction — it
   * arrives over Realtime, is stored nowhere, and is gone by the time the
   * revision that settles it is drawn.
   */
  intent: AnnouncedIntent | null;
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
  const [fieldGold, setFieldGold] = useState<{ fieldId: string; gold: number }[]>([]);
  /** What the Wyposażenie pile still holds (21.2), so a shop offers only what it has. */
  const [stock, setStock] = useState<Record<string, number>>({});
  const [spoken, setSpoken] = useState<Spoken | null>(null);
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
  const [houseRules, setHouseRules] = useState<Partial<Pick<Game, "eq_mode" | "endless_stock" | "trophy_mode">>>(
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
  /**
   * What somebody else's button is about to do, for as long as it is filling.
   *
   * Held on this device and nowhere else. It arrives over Realtime, it is
   * replaced by the truth the moment the revision carrying it lands, and it is
   * dropped by the clock below if that never happens — a tab that closes
   * mid-window would otherwise leave the rest of the table looking at a
   * decision that is never coming.
   */
  const [intent, setIntent] = useState<AnnouncedIntent | null>(null);
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

/**
 * What went wrong, out of a response that may not be JSON at all.
 *
 * Every refusal this app writes is `{ error }`, so reading the body as JSON was
 * right for every case anybody had seen. It is wrong for the case that matters
 * most: a route that *crashed* answers with a 500 and an empty body, and
 * `response.json()` on nothing throws `Unexpected end of JSON input` — so a
 * server fault surfaced as a SyntaxError in the client, pointing at the line
 * that was trying to report it rather than at anything broken.
 *
 * That is worse than an unhelpful message. It hid a missing database column
 * behind a stack trace in `use-table.ts`, which is the one file that had
 * nothing to do with it.
 *
 * Text first, then JSON if it parses. An empty body, Next's HTML error page and
 * a real refusal all arrive here, and only the last of them has an `error` to
 * read; the status is what is left to say about the other two, and saying it
 * beats saying "Błąd".
 */
async function saidWrong(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  try {
    const said = JSON.parse(body) as { error?: unknown };
    if (typeof said.error === "string" && said.error) return said.error;
  } catch {
    // Not JSON. Which is the point of reading it as text first.
  }
  return `Błąd serwera (${response.status}).`;
}

  const refresh = useCallback(async () => {
    const stored = readSeatToken(code);
    const query = stored ? `?token=${encodeURIComponent(stored)}` : "";
    const response = await fetch(`/api/games/${code}${query}`);
    if (!response.ok) return setError(await saidWrong(response));
    const data = await response.json();

    // What this device believes, against what the server has just said. All
    // three rules are `reconcile.ts`'s, and every one of them is there because
    // something was seen in the wrong place for a tick.
    if (isStale(data.game.revision, seenRevision.current)) return;
    // A decision that has landed is not a decision any more. Whatever anybody
    // was about to do, this is what they did — so the warning gives way to the
    // thing it was warning about, rather than the two being on screen together.
    if (data.game.revision !== seenRevision.current) setIntent(null);
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
    setFieldGold(data.fieldGold ?? []);
    setStock(data.stock ?? {});
    setSpoken((data.spoken as Spoken | null) ?? null);
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
        stoneUntilRound: mineNow.stone_until_round,
        eliminated: mineNow.eliminated,
      });
      const said = announce(watched.current, reading);
      watched.current = reading;
      if (said) setAnnouncement(said);
    }
  }, [code, router, setError]);

  /**
   * One typed request, with the caller keeping the response.
   *
   * `post` is the fire-and-forget door: it reads the reply only to raise a
   * notice, then refreshes. Ten call sites could not use it because they need
   * the body — a minted token to write, a console line to print, whether the
   * table remembered this device — so each wrote out its own `fetch`, and with
   * it its own URL, method, headers and token read. That is where the checking
   * `Requests` exists to do stopped happening: `addLocalPlayer` was sending
   * `local: true`, a field `Requests["join"]` does not have and
   * `join/route.ts` never read, which is exactly the bug that docblock
   * recounts.
   *
   * So the plumbing is shared and the response is not. Everything below still
   * decides for itself what a reply means; what it no longer decides is how to
   * address the table.
   */
  const send = useCallback(
    <R extends Route>(path: R, body: Partial<Requests[R]> = {}): Promise<Response> =>
      fetch(`/api/games/${code}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, token: readSeatToken(code) }),
      }),
    [code],
  );

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
    const response = await send("join", { resume: true, deviceId: device });
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
  }, [send]);

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
   * What somebody is about to do, and the two ways it stops being true.
   *
   * The message says which — a decision, or `null` for a cancel — so a mind
   * changed at 2.9 seconds is off the other screens at 2.9 seconds rather than
   * when a clock here runs out. The clock is only for the case the sender
   * cannot report: a tab closed mid-window, which would otherwise leave the
   * table looking at a decision that is never coming. It is given a little more
   * than the window itself, because the request that follows has to arrive and
   * be believed before the line has anything truer to be replaced by.
   *
   * `refresh` clears it too — see below. Whichever comes first.
   */
  useEffect(() => watchIntent(code, setIntent), [code]);

  useEffect(() => {
    if (!intent) return;
    const timer = setTimeout(() => setIntent(null), CHANNEL_MS + 2000);
    return () => clearTimeout(timer);
  }, [intent]);

  /**
   * This device's own way of saying it, handed to `channelling.ts`.
   *
   * Deliberately not `post`, which raises `busy` for the whole page and then
   * refreshes: this changes nothing, so there is nothing to refresh, and
   * greying out the table for three seconds is the opposite of what the window
   * is for. `sendHouseRule` fetches directly for the same reason.
   *
   * Nothing is awaited and no failure is reported. The warning the other
   * players get is a courtesy, and a courtesy must never be the reason a
   * decision fails to be sent — nor a red banner on a table where nothing is
   * wrong.
   */
  useEffect(
    () =>
      announcingWith((says: Intent | null) => {
        void fetch(`/api/games/${code}/intent`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: readSeatToken(code),
            kind: says?.kind ?? "",
            ...(says?.option !== undefined ? { option: says.option } : {}),
          }),
        }).catch(() => {});
      }),
    [code],
  );

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
      const response = await send("debug", { action: "console", line });
      const body = await response.json().catch(() => ({}));
      await refresh();
      return response.ok ? String(body.said ?? "ok") : String(body.error ?? "?");
    },
    [refresh, send],
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
        }
        /**
         * Nothing is read off the answer any more.
         *
         * It used to be turned into a sentence for the person who pressed the
         * button — „DOBRE BÓSTWO: nic się nie dzieje" — on the argument that
         * what the app decides on a player's behalf has to be visible, or the
         * table is taking the referee's word for it. The argument is right and
         * the place was wrong: what a die did lands on the thing it did it to,
         * and the record of it is the Dziennik, which is built for a running
         * account and reads in the order things happened. See the note where
         * the Obszar drawer used to draw this.
         */
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [code, refresh, setError],
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
      const response = await send("leave");
      if (!response.ok) {
        setError(await saidWrong(response));
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
      // What browser this is, so that closing the tab is something to come
      // back from rather than the end of being this person. See `deviceId`.
      const response = await send("join", { name: name.trim() || null, deviceId: deviceId() });
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
    const response = await send("join", { seatId, name });
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
      void send("character", { characterId, seatId })
        .then(refresh)
        .catch(() => {
          // A dropped request leaves the seat as it was; the next poll will
          // put the optimistic pick right.
        });
      return;
    }

    setPendingCharacter(characterId);
    try {
      await send("character", { characterId, seatId });
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
    async (patch: Partial<Pick<Game, "eq_mode" | "endless_stock" | "trophy_mode">>) => {
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
          ...(patch.trophy_mode !== undefined ? { trophyMode: patch.trophy_mode } : {}),
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
    (patch: Partial<Pick<Game, "eq_mode" | "endless_stock" | "trophy_mode">>) => {
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
    // The host's unconfirmed switch counts, the same way it does everywhere
    // else on this screen — see the note on `game` in the return below.
    const eqMode = (houseRules.eq_mode ?? game?.eq_mode) === "slots" ? "slots" : "classic";
    if (slot !== null && forbiddenIn(held.cardId, slot, asNature(mineNow.nature), eqMode)) {
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
    // A seat the host is filling for somebody at the table with no device.
    // It used to send `local: true` as well — a field `Requests["join"]` never
    // had and `join/route.ts` never read, which only survived because this
    // call went round the checked door.
    const response = await send("join", { name: name.trim() || null });
    if (!response.ok) return setError(await saidWrong(response));
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
    fieldGold,
    stock,
    spoken,
    users,
    me,
    mySeatIndex,
    moved,
    taking,
    pendingCharacter,
    announcement,
    setAnnouncement,
    failure,
    setFailure,
    error,
    setError,
    notices,
    dismissNotice,
    setHouseRule,
    busy,
    /** Somebody else's decision, in the three seconds before it lands. */
    intent,
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
