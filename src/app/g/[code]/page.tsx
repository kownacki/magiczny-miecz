"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { forgetSeatToken, readSeatToken, writeSeatToken } from "@/lib/game/seatToken";
import { readTestMode, writeTestMode, TESTING_POSSIBLE } from "@/lib/game/testMode";
import { watchRevision } from "@/lib/game/liveRevision";
import characters from "@/data/characters.json";
import type { Character, Nature } from "@/data/types";
import { isSpellId, type CardId, type SpellId } from "@/data/ids";
import { FIELDS, type FieldId, isFieldId } from "@/lib/engine/board";
import { fieldWithText } from "@/lib/engine/fieldText";
import { abilitiesOf, skipsRollAt, type Ability } from "@/lib/engine/abilities";
import { describeAbility } from "@/lib/engine/abilityText";
import {
  RANDOM_CHARACTER_ID,
  abilitiesOfCharacter,
  asCharacterId,
  isRandomPick,
  notesForCharacter,
  type SeatCharacter,
} from "@/lib/engine/characters";
import { characterImageUrl, characterStandeeUrl } from "@/lib/engine/cardImages";
import Image from "next/image";
import type { TurnPhase } from "@/lib/engine/turn";
import { TurnPanel } from "./turn-panel";
import { SeatActions } from "./seat-actions";
import { SpellHand } from "./spell-hand";
import { CardBack, CardDetail, type TileCard } from "./card-tile";
import { CardLibrary } from "./card-library";
import { tokensFor } from "@/lib/engine/tokens";
import { DRAG_TYPE, SlotPanel, startHoldingDrag, type SlotItem } from "./slot-panel";
import { ItemSlot } from "./item-slot";
import { CarriedCard, type Carried } from "./carry";
import { SLOTS, fitsIn, isWearable, type Slot } from "@/lib/engine/slots";
import { carryLimit } from "@/lib/engine/derive";
import { JoinGate, LeaveButton, Lobby, TakeOverGate, type LobbySeat } from "./lobby";
import { OtherPlayers, TableLayout, type PublicSeat } from "./table-layout";
import { TurnQueue } from "./turn-queue";
import { Journal } from "./journal";
import { momentsOf } from "@/lib/engine/spells";
import { BoardMap } from "./board-map";
import events from "@/data/events.json";
import spells from "@/data/spells.json";
import items from "@/data/items.json";
import type { EventCard, Item, Spell } from "@/data/types";
import { FieldModal } from "./field-modal";
import { DrawModal, ringFields } from "./draw-modal";
import { RebornModal } from "./reborn-modal";
import { ConfirmDialog, type Confirmation } from "./confirm";
import { USE_VERB, askAbout, isUsable, usageOf } from "@/lib/engine/uses";
import { fieldScriptFor, offerKey } from "@/lib/engine/fieldScript";
import type { Effect } from "@/lib/engine/cardScript";

const CHARACTERS = characters as Character[];
const EVENTS = events as EventCard[];

/**
 * Every card a seat can hold, by id, across all four decks.
 *
 * A hand mixes them: an item from the event deck, a Zaklęcie from the spell
 * pile, a trophy that was a Wróg. Looking only in the event deck left spells
 * showing their raw id.
 */
const CARD_NAMES = new Map<string, string>([
  ...EVENTS.map((c) => [c.id, c.name] as const),
  ...(spells as Spell[]).map((c) => [c.id, c.name] as const),
  ...(items as Item[]).map((c) => [c.id, c.name] as const),
]);
const CARD_TEXTS = new Map<string, string>([
  ...EVENTS.map((c) => [c.id, c.text] as const),
  ...(spells as Spell[]).map((c) => [c.id, c.text] as const),
  ...(items as Item[]).map((c) => [c.id, c.text ?? ""] as const),
]);
const FIELD_NAMES = new Map(
  [...FIELDS.values()].map((field) => [field.id, field.name]),
);

interface Held {
  /** Where it is worn in the slotted variant; null when it is in the pack. */
  slot?: Slot | null;
  id: string;
  /** Any card in the box — 16.6 makes the event and equipment id spaces overlap. */
  cardId: CardId;
  kind: "spell" | "item" | "friend" | "trophy";
  face: "open" | "hidden";
}

interface Seat {
  id: string;
  seat_index: number;
  player_name: string | null;
  character_id: SeatCharacter | null;
  /**
   * Narrow here as well as on the server, because the server is what guarantees
   * it: `seatsFor` turns the stored column into a `FieldId` or null before it
   * ever reaches a response, so the browser is not trusting a wire value — it is
   * naming the type the API already promises.
   */
  field_id: FieldId | null;
  miecz_own: number;
  magia_own: number;
  /** Own points plus everything carried (1.5, 2.5), computed server-side. */
  miecz_total: number;
  magia_total: number;
  zycie: number;
  zloto: number;
  nature: string | null;
  turns_lost: number;
  /** Turn the Kamień wears off on (20.1). Null when not petrified. */
  stone_until_turn: number | null;
  eliminated: boolean;
  /** Set when the player behind this seat walked away; the character stays. */
  abandoned_at: string | null;
  /** Device has not checked in recently — a closed tab, not a decision. */
  away: boolean;
  ready: boolean;
  no_device: boolean;
  is_host: boolean;
  holdings: Held[];
  /** Cards this viewer is not allowed to see the faces of (9.3). */
  hidden_count: number;
}

interface FieldCard {
  /** The row, because a field can hold two of the same Przedmiot. */
  id: string;
  fieldId: FieldId;
  cardId: CardId;
}

interface Game {
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
}

/** The shared table screen: the whole game state everyone is allowed to see. */
export default function Table({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  /** Cards lying face up on the board (16.8) — public to every seat. */
  const [fieldCards, setFieldCards] = useState<FieldCard[]>([]);
  /** What the Wyposażenie pile still holds (21.2), so a shop offers only what it has. */
  const [stock, setStock] = useState<Record<string, number>>({});
  /** A field the player tapped on the map, to read what it says. */
  const [inspecting, setInspecting] = useState<FieldId | null>(null);
  /** What the app just decided by itself, shown until the next action. */
  const [notice, setNotice] = useState<string | null>(null);
  /** A card somebody tapped, shown large with its full text. */
  const [inspectingCard, setInspectingCard] = useState<TileCard | null>(null);
  /** The reference drawer of every card in the box. */
  const [libraryOpen, setLibraryOpen] = useState(false);
  /**
   * Testing rather than playing — see `testMode.ts`.
   *
   * Read in an effect and not during the render, so the server and the first
   * paint agree that it is off.
   */
  const [testMode, setTestMode] = useState(false);
  useEffect(() => setTestMode(readTestMode()), []);
  const testing = TESTING_POSSIBLE && testMode;
  /** A seatless visitor who chose to watch rather than take a character over. */
  const [watching, setWatching] = useState(false);
  /** The character asked for and not yet heard back about (see `chooseCharacter`). */
  const [pendingCharacter, setPendingCharacter] = useState<string | null>(null);
  /**
   * Cards the player has waved past for now.
   *
   * 16.8 lets a card simply stay where it fell, and 12.1 gives until the end of
   * the turn to come back to it — so "not now" has to be a real answer, and it
   * is this device's business rather than the table's. Cleared when the turn
   * moves on, since the next character meets the same cards fresh.
   */
  const [waved, setWaved] = useState<string[]>([]);
  /** Whether the "choose again" modal is open (4.4). */
  const [reborn, setReborn] = useState(false);
  /**
   * The irreversible thing waiting to be confirmed.
   *
   * Spending a card and speaking a Zaklęcie are the two acts here that cannot
   * be taken back by the person they happen to — the Karta is gone, and 9.6 has
   * the spell reaching its victim anywhere on the board. The poczekalnia
   * already asks before its three, and this is the same dialog.
   */
  const [ask, setAsk] = useState<Confirmation | null>(null);
  /**
   * Whether a watcher has folded somebody else's turn away.
   *
   * Kept until their own turn comes round, and cleared then: staying folded
   * across your own turn would hide the thing you are being asked to do, and
   * unfolding it on every card would make the control useless — you fold it
   * once because you want to look at the board, and it stays out of the way
   * until it is yours again.
   */
  const [folded, setFolded] = useState(false);
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
  /** Which seat is choosing a character; "auto" lets the app decide. */
  const [picking, setPicking] = useState<string | "auto" | null>("auto");
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

    // Never go backwards. The poll and a move's own refetch are in flight at
    // the same time, and a poll that started *before* the write can land after
    // it — putting the old state back and snapping the card the player just
    // moved into its old place, until the next tick moved it again. The
    // revision counter already numbers every change the table makes, so an
    // answer older than what is on screen is simply dropped.
    if (data.game.revision < seenRevision.current) return;
    seenRevision.current = data.game.revision;

    setGame(data.game);
    setSeats(data.seats);
    setTaking((current) => {
      const still = Object.fromEntries(
        Object.entries(current).filter(([seatId, characterId]) => {
          const seat = data.seats.find((row: Seat) => row.id === seatId);
          // Gone once the server says the same thing — and gone anyway once the
          // game is running, where a seat holds whatever it was dealt.
          return seat ? seat.character_id !== characterId : false;
        }),
      );
      return Object.keys(still).length === Object.keys(current).length ? current : still;
    });
    // An optimistic move stands until the server reports the same place. Timing
    // it to the request instead meant the card fell back the moment a stale
    // answer arrived, which is the same race in a different coat.
    setMoved((current) => {
      const still = Object.fromEntries(
        Object.entries(current).filter(([holdingId, slot]) => {
          const held = (data.seats as Seat[])
            .flatMap((seat) => seat.holdings)
            .find((candidate) => candidate.id === holdingId);
          if (!held) return false;
          // Waiting on agreement, but not forever: a request that never arrived
          // would otherwise hold the card in a place the table does not know
          // about for the rest of the game. Four seconds is two polls.
          if (Date.now() - (movedAt.current[holdingId] ?? 0) > 4000) return false;
          return (held.slot ?? null) !== slot;
        }),
      );
      return Object.keys(still).length === Object.keys(current).length ? current : still;
    });
    setFieldCards(data.fieldCards ?? []);
    setStock(data.stock ?? {});
    setMySeatIndex(data.mySeatIndex);
  }, [code]);

  const turnKey = game ? `${game.turn}:${game.active_seat}` : null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWaved([]);
  }, [turnKey]);

  // Back in front of you the moment the turn is yours again.
  const myTurn = game !== null && mySeatIndex !== null && game.active_seat === mySeatIndex;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (myTurn) setFolded(false);
  }, [myTurn]);

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
          setError((await response.json()).error);
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
      if (!playing) return router.push("/");
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
  /**
   * Asks before a card is spent, and spends it on a yes.
   *
   * Nine Przedmioty are one act rather than a possession — the Karta goes on
   * the used pile whatever comes of it — so this is the one place in the pack
   * where a misclick costs something that cannot be put back. `uses.ts` writes
   * the question, so the words are the same here as in the hover.
   */
  function askToUse(holdingId: string, cardId: string) {
    const spend = usageOf(cardId);
    if (!spend) return;
    const name = CARD_NAMES.get(cardId) ?? cardId;
    setAsk({
      title: `Użyj: ${name}`,
      body: askAbout(name, spend),
      confirmLabel: "Użyj",
      // Red, like everything that takes something away from somebody — here
      // from the person pressing it.
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        post("holdings", { action: "use", holdingId });
      },
    });
  }

  /**
   * The same question before a Zaklęcie is spoken.
   *
   * 9.6 puts the spell on its victim wherever they are standing and takes the
   * card out of the hand for good, and until now that was one click of a button
   * sitting under every card in the hand.
   */
  function askToCast(holdingId: string, cardId: string, targetSeat?: number) {
    const name = CARD_NAMES.get(cardId) ?? cardId;
    const at =
      targetSeat === undefined
        ? ""
        : ` na: ${seats.find((seat) => seat.seat_index === targetSeat)?.player_name ?? `Miejsce ${targetSeat + 1}`}`;
    setAsk({
      title: `Rzuć Zaklęcie: ${name}`,
      body:
        `${name}${at}. Karta odchodzi z ręki na stos kart zużytych i cały stół dowiaduje się, ` +
        `co zostało wypowiedziane (12.5). Skutek rozpatrzcie sami.`,
      confirmLabel: "Rzuć",
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        post("holdings", {
          action: "cast",
          seatId: seats.find((seat) => seat.seat_index === mySeatIndex)?.id,
          holdingId,
          ...(targetSeat !== undefined ? { targetSeat } : {}),
        });
      },
    });
  }

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
      const packed = mineNow.holdings.filter((h) => h.kind === "item" && h.slot == null).length;
      const limit = carryLimit(
        mineNow.holdings.map((h) => ({ cardId: h.cardId, kind: h.kind, face: h.face, slot: h.slot ?? null })),
        "slotowy",
      );
      if (packed >= limit) return setError("Plecak jest pełny — najpierw coś odrzuć (5.4, 5.6).");
    }

    setError(null);
    movedAt.current[holdingId] = Date.now();
    setMoved((current) => ({ ...current, [holdingId]: slot }));
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
        // Refused, so put it back where it was — and say why.
        setError((await response.json().catch(() => ({}))).error ?? null);
        setMoved((current) => {
          const next = { ...current };
          delete next[holdingId];
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

  if (error && !game) {
    return <Centered>{<span className="text-vermilion">{error}</span>}</Centered>;
  }
  if (!game) return <Centered>Wczytuję stół…</Centered>;

  const mySeat = seats.find((seat) => seat.seat_index === mySeatIndex);
  // The shared screen in the middle of the table. Whoever's turn it is reaches
  // over and taps it, so it drives the active player rather than sitting idle
  // saying "waiting".
  const isTableScreen = mySeat?.is_host === true && game.mode === "companion";
  const tableScreenHolder = seats.find((seat) => seat.is_host)?.player_name ?? null;

  // Whose character is being chosen. Left to the app until somebody says
  // otherwise: this device's own seat first, then — only where the host is
  // choosing on behalf of people with no device — a companion seat still
  // without one. It used to fall through to *any* characterless seat, which is
  // why opening a table could leave you aiming at a stranger's slot.
  const pickingFor =
    picking === "auto"
      ? mySeat && !mySeat.character_id
        ? mySeat
        : mySeat?.is_host && game.mode === "companion"
          ? (seats.find((seat) => seat.no_device && !seat.character_id) ?? null)
          : null
      : (seats.find((seat) => seat.id === picking) ?? null);

  // Cards in play this turn. A fight keeps the stack it interrupted, so the
  // panel does not empty out mid-combat.
  const active = seats.find((seat) => seat.seat_index === game.active_seat);
  const playing = game.status === "playing";

  const overlays = (
    <>
      {/* Above everything else it could be asked about, and dismissed by
          clicking away — the safest answer is the one you get by not deciding. */}
      <ConfirmDialog ask={ask} busy={busy} onCancel={() => setAsk(null)} />

      {inspectingCard && (
        <CardDetail card={inspectingCard} onClose={() => setInspectingCard(null)} />
      )}
      {/* Offered, never forced — 4.4 says *może*. Opened from the line on the
          dead character's card and closed back to it. */}
      {mySeat?.eliminated && reborn && (
        <RebornModal
          characters={CHARACTERS}
          taken={
            new Set(seats.map((seat) => seat.character_id).filter(Boolean) as string[])
          }
          busy={busy}
          onConfirm={(characterId) => {
            setReborn(false);
            post("character", { again: true, seatId: mySeat.id, characterId });
          }}
          onClose={() => setReborn(false)}
        />
      )}

      {/* The card you just turned over, at a size you can read, with exactly
          the things this card lets you do under it. */}
      {active &&
        (game.turn_state.phase === "walka" ||
          (game.turn_state.phase === "pole" &&
            (game.turn_state.drawn.length > 0 ||
              // A field nobody may walk past opens it too, even with nothing
              // drawn: the Karczma happens to you the moment you arrive.
              compulsoryOffer(active.field_id, game.turn_state.resolved ?? []) !== null))) && (
          <DrawModal
            // Everybody at the table watches. A fight is the moment the game
            // is most worth looking at, and it used to happen entirely inside
            // one person's browser while the rest read about it afterwards in
            // the journal. Only the player whose turn it is can press anything.
            who={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
            canAct={mySeatIndex === active.seat_index || isTableScreen}
            minimized={folded}
            onMinimize={() => setFolded(true)}
            onRestore={() => setFolded(false)}
            cards={game.turn_state.phase === "pole" ? game.turn_state.drawn : []}
            resolved={
              game.turn_state.phase === "pole"
                ? [...(game.turn_state.resolved ?? []), ...waved]
                : []
            }
            fought={game.turn_state.phase === "pole" ? (game.turn_state.fought ?? []) : []}
            fight={game.turn_state.phase === "walka" ? game.turn_state.fight : null}
            fieldOffer={
              game.turn_state.phase === "pole" ? compulsoryOffer(active.field_id, game.turn_state.resolved ?? []) : null
            }
            simulated={game.mode === "simulation"}
            waitingOn={
              game.turn_state.phase === "walka"
                ? (game.turn_state.fight.spellsOwedBy ?? []).map(
                    (index) =>
                      seats.find((seat) => seat.seat_index === index)?.player_name ??
                      `Miejsce ${index + 1}`,
                  )
                : []
            }
            myTurnToPass={
              game.turn_state.phase === "walka" &&
              mySeatIndex !== null &&
              (game.turn_state.fight.spellsOwedBy ?? []).includes(mySeatIndex)
            }
            ring={ringFields(active.field_id)}
            busy={busy}
            onAction={(body) => post("turn", body)}
            onResolve={(cardId, decisions) =>
              post("turn", { action: "karta-efekt", cardId, ...decisions })
            }
            onResolveField={(choices) => {
              const offer = compulsoryOffer(
                active.field_id,
                game.turn_state.phase === "pole" ? (game.turn_state.resolved ?? []) : [],
              );
              if (offer) post("turn", { action: "pole-tabela", offer: offer.name, choices });
            }}
            onFight={(cardIds) => post("turn", { action: "fight", cardIds })}
            onEscape={() => post("turn", { action: "escape" })}
            onTake={(cardId) =>
              post("holdings", { action: "take", seatId: active.id, cardId })
            }
            onLeave={(cardId) => setWaved((current) => [...current, cardId])}
          />
        )}

      {/* Tapping a field opens it, rather than filling in a panel off to the
          side where nobody looked. */}
      {inspecting && (
        <FieldModal
          eqMode={game.eq_mode === "slotowy" ? "slotowy" : "klasyczny"}
          nature={asNature(mySeat?.nature)}
          fieldId={inspecting}
          cards={fieldCards
            .filter((card) => card.fieldId === inspecting)
            .map((card) => ({ id: card.id, cardId: card.cardId }))}
          standingHere={mySeat?.field_id === inspecting}
          canAct={mySeat?.seat_index === game?.active_seat}
          busy={busy}
          onTake={(fieldCardId) =>
            post("holdings", { action: "take-field", fieldCardId })
          }
          onInspect={(cardId) =>
            setInspectingCard({
              cardId,
              name: CARD_NAMES.get(cardId) ?? cardId,
              text: CARD_TEXTS.get(cardId),
            })
          }
          onClose={() => setInspecting(null)}
        />
      )}
      {libraryOpen && (
        <CardLibrary
          eqMode={game.eq_mode === "slotowy" ? "slotowy" : "klasyczny"}
          nature={asNature(mySeat?.nature)}
          // Testing shortcuts, and only while developing. The route refuses
          // them in production too — this just stops the buttons being drawn
          // somewhere they could never work.
          {...(!testing || mySeatIndex === null
            ? {}
            : {
                onGrant: (cardId: string) => post("debug", { action: "grant", cardId }),
                onTeleport: (fieldId: FieldId) => post("debug", { action: "teleport", fieldId }),
              })}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </>
  );

  if (!playing) {
    // No name, no seat, no lobby. Everyone joins on their own device, so a
    // visitor standing in the lobby without a seat was never a state worth
    // having — it just deferred the one question the table needs answered.
    if (mySeatIndex === null) {
      return (
        <>
          {error && (
            <p className="fixed inset-x-0 top-0 z-30 bg-vermilion/20 px-4 py-2 text-center text-sm text-vermilion">
              {error}
            </p>
          )}
          <JoinGate
            code={game.join_code}
            seats={seats.map((seat) =>
            asLobbySeat(
              taking[seat.id] ? { ...seat, character_id: taking[seat.id], ready: false } : seat,
            ),
          )}
            busy={busy}
            onJoin={join}
          />
        </>
      );
    }

    return (
      <>
        {overlays}
        {error && (
          <p className="fixed inset-x-0 top-0 z-30 bg-vermilion/20 px-4 py-2 text-center text-sm text-vermilion">
            {error}
          </p>
        )}
        <Lobby
          code={game.join_code}
          mode={game.mode}
          seats={seats.map((seat) =>
            asLobbySeat(
              taking[seat.id] ? { ...seat, character_id: taking[seat.id], ready: false } : seat,
            ),
          )}
          mySeatIndex={mySeatIndex}
          characters={CHARACTERS}
          pickingFor={pickingFor ? asLobbySeat(pickingFor) : null}
          busy={busy}
          onAddLocal={addLocalPlayer}
          onPickFor={(seat) => setPicking(seat ? seat.id : null)}
          pendingCharacterId={pendingCharacter}
          onChooseCharacter={async (seat, characterId) => {
            await chooseCharacter(seat.id, characterId);
            setPicking("auto");
          }}
          onRemove={(seat) => post("leave", { seatId: seat.id })}
          onMakeHost={(seat) => post("host", { seatId: seat.id })}
          onReady={(ready) => post("seat", { ready })}
          onRename={(name) => post("seat", { name })}
          onLeave={leave}
          onDeal={() => post("character", { deal: true })}
          isHost={mySeat?.is_host === true}
          hostAway={seats.find((seat) => seat.is_host)?.abandoned_at !== null}
          onStart={() => post("start", {})}
          onLibrary={() => setLibraryOpen(true)}
        />
      </>
    );
  }

  // Somebody who opened a game already in progress. They cannot join — the
  // characters were dealt at setup — but they can pick up one nobody is behind,
  // which is exactly what the app does with a player who leaves or closes their
  // tab. Offered up front rather than buried in a card somebody has to expand.
  if (mySeatIndex === null && !watching) {
    const free = seats
      .filter((seat) => seat.character_id && !seat.eliminated && !seat.no_device)
      .filter((seat) => seat.abandoned_at !== null || seat.away)
      .map((seat) => ({
        seatId: seat.id,
        playerName: seat.player_name,
        characterName:
          CHARACTERS.find((character) => character.id === seat.character_id)?.name ?? "?",
        why: seat.abandoned_at !== null ? "gracz odszedł od stołu" : "gracz się rozłączył",
      }));
    return (
      <>
        {error && (
          <p className="fixed inset-x-0 top-0 z-30 bg-vermilion/20 px-4 py-2 text-center text-sm text-vermilion">
            {error}
          </p>
        )}
        <TakeOverGate
          code={game.join_code}
          free={free}
          taken={seats.filter((seat) => seat.character_id && !seat.eliminated).length}
          busy={busy}
          onTakeOver={claimSeat}
          onWatch={() => setWatching(true)}
        />
      </>
    );
  }

  /**
   * This seat, with any move this device has just made already applied.
   *
   * Laid over the server's answer rather than written into it, so the two-second
   * poll landing mid-flight cannot undo what the player just did.
   */
  /**
   * The windows the turn is open for, for the spell hand (9.6, 17.3).
   *
   * Read off the whole turn state rather than the phase alone: a fight before
   * the dice and a fight after the first one are the same phase and are not
   * the same moment, and neither is a field with a card just turned over.
   */
  const now = game
    ? momentsOf({
        phase: game.turn_state.phase,
        diceRolled:
          game.turn_state.phase === "walka" &&
          (game.turn_state.fight.playerRoll !== null ||
            game.turn_state.fight.enemyRoll !== null),
        cardJustDrawn:
          game.turn_state.phase === "pole" && game.turn_state.drawn.length > 0,
        meeting:
          game.turn_state.phase === "pole" &&
          game.turn_state.drawn.some((entry) => entry.cardClass === "wrog"),
      })
    : ["dowolna-chwila" as const];

  const mine = mySeat
    ? {
        ...mySeat,
        holdings: mySeat.holdings.map((held) =>
          held.id in moved ? { ...held, slot: moved[held.id] } : held,
        ),
      }
    : mySeat;
  const others = seats.filter((seat) => seat.id !== mine?.id && seat.character_id);

  return (
    <>
      {overlays}
      <TableLayout
        header={
          <>
            <div className="flex items-baseline gap-3">
              <h1 className="font-[family-name:var(--font-display)] text-lg text-ochre">
                Magiczny Miecz
              </h1>
              <span className="text-xs text-muted">
                Tura {game.turn} · {active ? (active.player_name ?? "—") : "—"}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="tnum tracking-[0.2em] text-muted">{game.join_code}</span>
              <button onClick={() => setLibraryOpen(true)} className="text-ochre/80 hover:text-ochre">
                Karty
              </button>
              {/* Loud on purpose while it is on. Everything it unlocks writes a
                  manual override into the journal, and a switch you can forget
                  you flipped is how a tested game gets mistaken for a played
                  one. */}
              {TESTING_POSSIBLE && (
                <button
                  onClick={() => {
                    const next = !testMode;
                    setTestMode(next);
                    writeTestMode(next);
                  }}
                  aria-pressed={testMode}
                  title={
                    testMode
                      ? "Skróty testowe są włączone: karty, teleport i ręczne poprawki."
                      : "Włącz skróty testowe: karty, teleport i ręczne poprawki."
                  }
                  className={
                    testMode
                      ? "rounded border border-vermilion/60 bg-vermilion/15 px-1.5 py-0.5 text-vermilion"
                      : "text-muted/60 transition hover:text-muted"
                  }
                >
                  tryb testowy{testMode ? " ✓" : ""}
                </button>
              )}
              {mySeatIndex !== null && (
                <LeaveButton
                  playing
                  busy={busy}
                  onLeave={leave}
                />
              )}
            </div>
          </>
        }
        map={
          // The board with the journal under it. `relative` is what lets the
          // journal expand over the board instead of pushing it out of the way.
          <div className="relative flex h-full w-full flex-col gap-2">
            <div className="flex min-h-0 flex-1 items-center justify-center">
          <BoardMap
            seats={seats.map((seat) => ({
              id: seat.id,
              seatIndex: seat.seat_index,
              name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
              fieldId: seat.field_id,
              eliminated: seat.eliminated,
            }))}
            activeSeatIndex={game.active_seat}
            cardsOnFields={fieldCards.reduce<
              Partial<Record<FieldId, { id: string; cardId: CardId }[]>>
            >((byField, card) => {
              (byField[card.fieldId] ??= []).push({ id: card.id, cardId: card.cardId });
              return byField;
            }, {})}
            highlight={
              game.turn_state.phase === "ruch"
                ? game.turn_state.options.map((option) => option.fieldId)
                : []
            }
            onPick={(fieldId) => setInspecting(fieldId)}
          />
            </div>
            <Journal
              code={code}
              revision={game.revision}
              eqMode={game.eq_mode === "slotowy" ? "slotowy" : "klasyczny"}
            />
          </div>
        }
        right={
          <div className="flex flex-col gap-3">
            {/* First thing in the column, above everything a player acts on:
                whose turn it is, and who is being passed over on the way. */}
            <TurnQueue
              seats={seats.map((seat) => ({
                seatIndex: seat.seat_index,
                playerName: seat.player_name,
                characterId: seat.character_id,
                turnsLost: seat.turns_lost,
                stoneUntilTurn: seat.stone_until_turn,
                eliminated: seat.eliminated,
              }))}
              activeSeat={game.active_seat}
              turn={game.turn}
              mySeatIndex={mySeatIndex}
            />
            {error && <p className="text-sm text-vermilion">{error}</p>}
            {notice && !error && (
              <p className="rounded border border-ochre/30 bg-panel/60 px-3 py-2 text-sm text-ochre">
                {notice}
              </p>
            )}

            {game.mode === "companion" && mySeatIndex !== null && (
              <p className="rounded border border-edge/60 bg-panel/50 px-2 py-1 text-[11px] text-muted">
                {isTableScreen ? (
                  <span className="text-ochre">To urządzenie prowadzi wszystkich graczy.</span>
                ) : (
                  <>
                    Prowadzi: <span className="text-ink">{tableScreenHolder ?? "—"}</span>.{" "}
                    <button onClick={() => post("host", {})} className="underline hover:text-ink">
                      graj tu za wszystkich
                    </button>
                  </>
                )}
              </p>
            )}


            {active && (
              <TurnPanel
                phase={game.turn_state}
                isMine={
                  (mySeatIndex !== null && active.seat_index === mySeatIndex) || isTableScreen
                }
                actingForOther={isTableScreen && active.seat_index !== mySeatIndex}
                playerName={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
                fieldName={
                  active.field_id ? (FIELD_NAMES.get(active.field_id) ?? active.field_id) : "—"
                }
                fieldText={
                  active.field_id ? (fieldWithText(active.field_id)?.text ?? null) : null
                }
                fieldId={active.field_id}
                rollSkippedBy={rollSkippedBy(active)}
                dieSource={game.die_source}
                mode={game.mode}
                busy={busy}
                onAction={(body) => post("turn", body)}
                onSuggestion={(stat, delta, reason) =>
                  post("adjust", { seatId: active.id, stat, delta, reason })
                }
                onTake={(cardId) =>
                  post("holdings", { action: "take", seatId: active.id, cardId })
                }
                purse={{ zloto: active.zloto, zycie: active.zycie }}
                stock={stock}
                sellable={active.holdings
                  .filter((holding) => holding.kind === "item")
                  .map((holding) => ({ id: holding.id, cardId: holding.cardId }))}
                onService={(body) =>
                  post("holdings", { ...body, seatId: active.id })
                }
                fieldCardIds={fieldCards
                  .filter((card) => card.fieldId === active.field_id)
                  .map((card) => card.cardId)}
              />
            )}


            {active && (mySeatIndex === active.seat_index || isTableScreen) && (
              <SeatActions
                busy={busy}
                nature={active.nature}
                canFightBeast={active.field_id === "zamek-bestii"}
                // Companion mode is the app being told what a physical table
                // did, so it has to ask. Simulation rolls and applies these
                // itself, and a button for them would be editing the record
                // rather than playing (see CLAUDE.md).
                byHand={game.mode === "companion"}
                mayChooseNature={abilitiesOfCharacter(
                  asCharacterId(active.character_id),
                ).some((ability) => ability.kind === "natura-dowolna")}
                onSpell={() => post("holdings", { action: "spell", seatId: active.id })}
                onNature={(nature) =>
                  post("holdings", { action: "nature", seatId: active.id, nature })
                }
                onStone={() => post("holdings", { action: "stone", seatId: active.id })}
                onHeal={() => post("holdings", { action: "heal", seatId: active.id })}
                onBeast={() => post("turn", { action: "beast" })}
              />
            )}

            {/* Your own seat, in full. 9.3 hides a hand from the others, not
                from its owner, so this is the one place spells are face up. */}
            {mine && (
              <SeatCard
                seat={mine}
                active={mine.seat_index === game.active_seat}
                canAdjust
                // Companion play is corrected by hand because the board is the
                // source of truth there and the app will desync. Simulation is
                // settled the other way — nothing is entered by hand — so the
                // only way to reach these here is to say you are testing.
                canCorrect={game.mode !== "simulation" || testing}
                isMine
                slotted={game.eq_mode === "slotowy"}
                onAdjust={(stat, delta) => post("adjust", { seatId: mine.id, stat, delta })}
                onDrop={(holdingId) => post("holdings", { action: "drop", holdingId })}
                onEquip={equip}
                onTrade={() => post("holdings", { action: "trade", seatId: mine.id })}
                onUse={askToUse}
                onReorder={(holdingIds) =>
                  post("holdings", { action: "order", seatId: mine.id, holdingIds })
                }
                onInspect={setInspectingCard}
              />
            )}

            {/* 4.4: death ends a character, not a player's evening — but the
                rule says *może*, so choosing again is offered rather than
                demanded. Dismissing the modal leaves this line, which is the
                way back into it whenever they want. */}
            {mine?.eliminated && (
              <section className="mt-3 rounded-lg border border-vermilion/50 bg-vermilion/5 p-3">
                <h3 className="mb-1 font-[family-name:var(--font-display)] text-sm text-vermilion">
                  Twoja Postać zginęła
                </h3>
                <p className="mb-2 text-[11px] leading-relaxed text-muted">
                  Jesteś poza kolejnością tur i oglądasz grę. Możesz wrócić nową
                  Postacią, kiedy zechcesz (4.4).
                </p>
                <button
                  disabled={busy}
                  onClick={() => setReborn(true)}
                  className="rounded border border-ochre/60 px-3 py-1 text-xs text-ochre transition hover:bg-ochre/10 disabled:opacity-40"
                >
                  Wybierz nową Postać
                </button>
              </section>
            )}

            {mine && (
              <SpellHand
                spells={mine.holdings
                  // Both halves matter: the server says which holdings are
                  // Zaklęcia, and `isSpellId` is what turns that claim into a
                  // card the spell hand can actually look up.
                  .filter((held) => held.kind === "spell" && isSpellId(held.cardId))
                  .map((held) => ({ holdingId: held.id, cardId: held.cardId as SpellId }))}
                moment={now}
                opponents={others.map((seat) => ({
                  seatIndex: seat.seat_index,
                  name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
                }))}
                busy={busy}
                onInspect={setInspectingCard}
                onCast={(holdingId, targetSeat) => {
                  const held = mine.holdings.find((card) => card.id === holdingId);
                  if (held) askToCast(holdingId, held.cardId, targetSeat);
                }}
              />
            )}

            <OtherPlayers
              seats={others.map(asPublicSeat)}
              activeSeatIndex={game.active_seat}
              characters={CHARACTERS}
              onInspect={setInspectingCard}
              // Only offered to a device with no seat of its own; sitting at two
              // at once is the bug that stranded a player early on.
              onClaim={mySeatIndex === null ? claimSeat : undefined}
              onKick={
                mySeat?.is_host
                  ? (seat) => post("leave", { seatId: seat.id })
                  : undefined
              }
            />
          </div>
        }
      />
    </>
  );
}

function asLobbySeat(seat: Seat): LobbySeat {
  return {
    id: seat.id,
    seatIndex: seat.seat_index,
    playerName: seat.player_name,
    characterId: seat.character_id,
    isHost: seat.is_host,
    abandoned: seat.abandoned_at !== null,
    away: seat.away,
    ready: seat.ready,
    noDevice: seat.no_device,
  };
}

/**
 * A seat as the rest of the table is allowed to see it.
 *
 * Everything the rulebook lays out face up (5.2, 6.2, and the tokens beside a
 * character card) is copied across in full. Concealed spells never reach the
 * browser at all — the server already replaced them with a count (9.3) — so
 * there is nothing here that could leak by being careless.
 */
function asPublicSeat(seat: Seat): PublicSeat {
  return {
    id: seat.id,
    seatIndex: seat.seat_index,
    playerName: seat.player_name,
    characterId: seat.character_id,
    fieldName: seat.field_id ? (FIELD_NAMES.get(seat.field_id) ?? seat.field_id) : "—",
    miecz: seat.miecz_total,
    mieczOwn: seat.miecz_own,
    magia: seat.magia_total,
    magiaOwn: seat.magia_own,
    zycie: seat.zycie,
    zloto: seat.zloto,
    nature: seat.nature,
    eliminated: seat.eliminated,
    abandoned: seat.abandoned_at !== null,
    away: seat.away,
    isHost: seat.is_host,
    turnsLost: seat.turns_lost,
    cards: seat.holdings
      .filter((held) => held.kind !== "spell")
      .map((held) => ({
        cardId: held.cardId,
        name: CARD_NAMES.get(held.cardId) ?? held.cardId,
        text: CARD_TEXTS.get(held.cardId),
        kindLabel: KIND_LABEL[held.kind],
      })),
    hiddenSpells:
      seat.hidden_count + seat.holdings.filter((held) => held.kind === "spell").length,
  };
}

const KIND_LABEL: Record<Held["kind"], string> = {
  item: "Przedmiot",
  friend: "Przyjaciel",
  trophy: "Trofeum",
  spell: "Zaklęcie",
};

/**
 * What a seat is carrying.
 *
 * Another player's concealed spells never reach this component — the server
 * strips them and sends a count instead (9.3) — so there is nothing here that
 * could leak by rendering carelessly.
 */
function Hand({
  seat,
  isMine,
  canAct,
  trophies,
  slotted,
  carried,
  moving,
  liftedHoldingId,
  onCarry,
  onDragging,
  onPlaceInPack,
  onDrop,
  onTrade,
  onEquip,
  onUse,
  onReorder,
  onInspect,
}: {
  seat: Seat;
  isMine: boolean;
  canAct: boolean;
  slotted: boolean;
  trophies: number;
  /** The card on the cursor, if any. */
  carried: Carried | null;
  /** A card is in the air, however it was picked up — so nothing offers to be read. */
  moving: boolean;
  /** What is in the air, however it was picked up, so its place looks emptied. */
  liftedHoldingId: string | null;
  onCarry: (carried: Carried | null) => void;
  /** The card id being dragged out of the pack, or null when the drag ends. */
  onDragging: (moving: { cardId: string; holdingId: string } | null) => void;
  onPlaceInPack: () => void;
  onDrop: (holdingId: string) => void;
  onTrade: () => void;
  onEquip: (holdingId: string, slot: Slot | null) => void;
  /** Spend a card by using it. Absent on somebody else's pack. */
  onUse?: (holdingId: string, cardId: string) => void;
  /** The pack, in the order its owner wants it. Absent on somebody else's. */
  onReorder?: (holdingIds: string[]) => void;
  onInspect: (card: TileCard) => void;
}) {
  /** Something is being carried over the pack. */
  const [dragOver, setDragOver] = useState(false);
  /** The card a reordering drag is currently over, so it can show where it lands. */
  const [insertAt, setInsertAt] = useState<string | null>(null);
  /**
   * The order this device has just asked for and the server has not confirmed.
   *
   * Without it a card dragged across the pack snaps back for as long as the
   * round trip takes, which for a gesture that is *about* where the card ends
   * up reads as the drag having failed. Never cleared: once the server agrees,
   * sorting by it is a no-op, and the moment a card is gained or lost it stops
   * matching the pack and is ignored.
   */
  const [wanted, setWanted] = useState<string[] | null>(null);

  const shown = seat.holdings.filter((held) => held.kind !== "spell");
  const packed = seat.holdings.filter(
    (held) => held.kind === "item" && (!slotted || held.slot == null),
  ).length;
  const limit = carryLimit(
    seat.holdings.map((h) => ({ cardId: h.cardId, kind: h.kind, face: h.face, slot: h.slot ?? null })),
    slotted ? "slotowy" : "klasyczny",
  );

  /**
   * The pack, in the order it should be drawn.
   *
   * The server's order is the truth; `wanted` overrides it only while it still
   * describes exactly this set of cards. A stale one — from before a card was
   * taken or lost — is simply ignored rather than cleared, which keeps this a
   * derivation and not a thing that has to be kept in step.
   */
  const inPack = shown.filter((held) => !slotted || held.slot == null);
  const packOrder = inPack.map((held) => held.id);
  const arranged =
    wanted !== null &&
    wanted.length === packOrder.length &&
    packOrder.every((id) => wanted.includes(id))
      ? [...inPack].sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id))
      : inPack;

  /**
   * Moves a card in the pack to sit before another, or to the end.
   *
   * Only cards already in the pack: something coming off the body is being
   * taken off, which is a different act with its own answer (it lands at the
   * end, because that is where a card the pack has never seen goes).
   */
  const moveWithin = (holdingId: string, beforeId: string | null) => {
    if (!onReorder) return;
    const ids = arranged.map((held) => held.id);
    if (!ids.includes(holdingId)) return;
    const without = ids.filter((id) => id !== holdingId);
    const at = beforeId === null ? -1 : without.indexOf(beforeId);
    without.splice(at < 0 ? without.length : at, 0, holdingId);
    setWanted(without);
    onReorder(without);
  };

  // After the hooks, which have to run every render whatever is on show.
  //
  // Your own pack is always drawn, empty or not. It used to disappear until the
  // first card landed in it, which meant the places you drop things into did
  // not exist until you already had something to drop — and taking a card off
  // the body aims at nothing. Somebody else's empty pack is still hidden: that
  // one is information, and "nothing" is a whole row to say it in.
  if (!isMine && shown.length === 0 && seat.hidden_count === 0) return null;

  return (
    <div className="mt-3 border-t border-edge pt-3">
      {/* What is in the pack, against what will fit. In the variant a place on
          the body is not the pack, so the number here is the one 5.4 is about —
          and seeing it beats finding out by being refused. */}
      <p className="mb-2 text-[11px] uppercase tracking-widest text-muted">
        Plecak{" "}
        <span className={packed >= limit ? "text-vermilion" : "text-muted/70"}>
          {packed} / {Number.isFinite(limit) ? limit : "∞"}
        </span>
      </p>
      {/* Cards, as cards. A player at a table recognises their Miecz by its
          picture long before they read the word, and the ability text that used
          to sit under every line now lives one tap away in the detail view. */}
      {/* The pack lights up while something is being carried over it, the same
          way a place on the body does. Without it the only drop target that
          gave no sign of being one was the one you use most: everything comes
          off into the pack. */}
      <div
        onDragOver={(event) => {
          if (!canAct || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          // Only when the pointer leaves the pack itself, not on its way across
          // a card inside it.
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={(event) => {
          setDragOver(false);
          setInsertAt(null);
          if (!canAct) return;
          const holdingId = event.dataTransfer.getData(DRAG_TYPE);
          if (!holdingId) return;
          event.preventDefault();
          // Dropped on the pack itself rather than on one of its cards: the end
          // of the queue, which is where a card the pack has not seen before
          // goes anyway.
          if (packOrder.includes(holdingId)) moveWithin(holdingId, null);
          else onEquip(holdingId, null);
        }}
        // Clicking the pack with something on the cursor puts it there, which
        // is how a worn card comes off without aiming at a particular card —
        // and how a card already in the pack is sent to the back of it.
        onClick={(event) => {
          if (!carried) return;
          event.stopPropagation();
          if (carried.from === "plecak") {
            moveWithin(carried.holdingId, null);
            return onCarry(null);
          }
          onPlaceInPack();
        }}
        className={`flex flex-wrap gap-2 rounded border border-dashed p-1 transition ${
          dragOver ? "border-ochre bg-ochre/5" : "border-transparent"
        }`}
      >
        {/* Your own Zaklęcia are not repeated here: they have their own panel
            above, face up and with the cast controls on them. What belongs on a
            seat card is what the *table* can see. */}
        {arranged.map((held) => (
          <ItemSlot
            key={held.id}
            // The same component the body is built from: a card in the pack and
            // a card being worn are the same object to a player, so picking one
            // up feels the same either way and both are the same size.
            item={{ holdingId: held.id, cardId: held.cardId, card: tileFor(held) }}
            label={tileFor(held).name}
            eqMode={slotted ? "slotowy" : "klasyczny"}
            nature={asNature(seat.nature)}
            tone="filled"
            // A card would land in front of this one, so this and everything
            // after it steps aside to show the space it is going into. Said
            // with a gap rather than by tinting the card under the pointer,
            // which reads as "this one is about to be replaced".
            gapBefore={insertAt === held.id}
            // Reading and moving are different modes: no Karta opens over the
            // place you are aiming at while a card is in the air.
            quiet={moving}
            badge={held.kind === "trophy" ? "trofeum" : undefined}
            // The one on the cursor is not also in the pack.
            lifted={held.id === liftedHoldingId}
            dimmed={held.kind === "trophy"}
            disabled={!canAct}
            // One click picks it up; the next puts down whatever is on the
            // cursor, in front of the card it lands on. Clicking moves things;
            // hovering reads them.
            //
            // Everything in the pack can be picked up, not only what could be
            // worn. It used to be the wearables alone, which made the pack an
            // inventory in a game where three quarters of what you carry has no
            // place on the body — a Graal, an Eliksir and a trophy could not be
            // moved at all, so a pack could not be arranged.
            //
            // It used to open the card as a fallback, so the same gesture meant
            // "pick this up" on one card and "let me look at that" on the next —
            // and a modal landed on top of the pack you were in the middle of
            // rearranging. Reading is what the hover is for, and it is always
            // available without disturbing anything.
            onClick={(event) => {
              if (!canAct) return;
              event.stopPropagation();
              if (carried) {
                // From the pack: it goes in front of this card. From the body:
                // it is being taken off, which lands it at the end.
                if (carried.from === "plecak") {
                  moveWithin(carried.holdingId, held.id);
                  return onCarry(null);
                }
                return onPlaceInPack();
              }
              onCarry({
                holdingId: held.id,
                cardId: held.cardId,
                name: tileFor(held).name,
                from: "plecak",
              });
            }}
            // Two clicks put a card on — and where there is nothing to put it
            // on, two clicks spend it instead. Never both for the same card:
            // the Różdżka Przeznaczenia is worn *and* spent, and it keeps the
            // gesture the other nine wearables have, with its "użyj" on the
            // button below. A gesture that meant one thing on this card and
            // another on the next would be worse than no gesture.
            onDoubleClick={() => {
              if (!canAct || held.kind !== "item") return;
              const place = slotted
                ? SLOTS.find((slot) => fitsIn(held.cardId, slot))
                : undefined;
              if (place) {
                onCarry(null);
                return onEquip(held.id, place);
              }
              if (onUse && isUsable(held.cardId)) onUse(held.id, held.cardId);
            }}
            // Dragged onto a place to put it on — the same journey the
            // "załóż" button makes, for people who reach for the card — or onto
            // another card in the pack, which is how the pack is arranged.
            draggable={canAct}
            onDragStart={(event) => {
              startHoldingDrag(event, held.id);
              onDragging({ cardId: held.cardId, holdingId: held.id });
            }}
            onDragEnd={() => {
              setInsertAt(null);
              onDragging(null);
            }}
            onDragOver={(event) => {
              if (!canAct || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
              // Taken here rather than left to the pack behind it, so the card
              // lands where the pointer is instead of at the end.
              event.stopPropagation();
              event.preventDefault();
              setInsertAt(held.id);
            }}
            onDragLeave={() => setInsertAt((at) => (at === held.id ? null : at))}
            onDrop={(event) => {
              setInsertAt(null);
              setDragOver(false);
              if (!canAct) return;
              const holdingId = event.dataTransfer.getData(DRAG_TYPE);
              if (!holdingId || holdingId === held.id) return;
              event.stopPropagation();
              event.preventDefault();
              // A card off the body is being taken off; one already in the pack
              // is being moved within it.
              if (packOrder.includes(holdingId)) moveWithin(holdingId, held.id);
              else onEquip(holdingId, null);
            }}
            // A carried card has no drag events behind it, so hovering is
            // watched directly for the same answer to show.
            onPointerEnter={() =>
              carried?.from === "plecak" && carried.holdingId !== held.id
                ? setInsertAt(held.id)
                : undefined
            }
            onPointerLeave={() => setInsertAt((at) => (at === held.id ? null : at))}
          >
            {canAct && (
              <span className="flex items-center gap-2">
                {slotted && held.kind === "item" && isWearable(held.cardId) && (
                  <EquipButton
                    cardId={held.cardId}
                    worn={wornBySlot(seat)}
                    onEquip={(slot) => onEquip(held.id, slot)}
                  />
                )}
                {/* Always drawn where a card has a use, whether or not the
                    double-click reaches it — a gesture nobody can see is not
                    an offer. In ochre because it costs you the card, unlike
                    "odrzuć", which leaves it lying on the Obszar (5.5). */}
                {onUse && isUsable(held.cardId) && (
                  <button
                    onClick={() => onUse(held.id, held.cardId)}
                    title={usageOf(held.cardId)?.co}
                    className="text-[9px] text-ochre underline hover:text-ink"
                  >
                    {USE_VERB}
                  </button>
                )}
                <button
                  onClick={() => onDrop(held.id)}
                  className="text-[9px] text-muted underline hover:text-vermilion"
                >
                  odrzuć
                </button>
              </span>
            )}
          </ItemSlot>
          ))}
        {/* Free places, built from the same component and wearing the same
            colours as the body's: green while a card that would fit is in the
            air, red when nothing more will. An empty place is a place, so it
            has no business being a differently-sized span with a highlight of
            its own. */}
        {(() => {
          // A card is in the air if it is on the cursor or being dragged over.
          const moving = carried !== null || dragOver;
          // No limit still shows one place, so there is somewhere to aim.
          const free = Number.isFinite(limit) ? Math.max(0, limit - packed) : 1;

          // Nothing will fit. Said while the card is still in the air rather
          // than as a refusal after it lands (5.4, 5.6).
          if (free === 0) {
            return moving ? (
              <ItemSlot item={null} label="pełny" glyph="✕" tone="rejects" disabled />
            ) : null;
          }

          return Array.from({ length: free }, (_, i) => (
            <ItemSlot
              key={`wolne-${i}`}
              item={null}
              label="wolne"
              glyph="+"
              tone={moving ? "accepts" : "empty"}
              // Clicking an empty place puts down what is carried — the same
              // gesture that works on the body. A card already in the pack goes
              // to the end of it rather than nowhere.
              disabled={!canAct || carried === null}
              onClick={(event) => {
                event.stopPropagation();
                if (!carried) return;
                if (carried.from === "plecak") {
                  moveWithin(carried.holdingId, null);
                  return onCarry(null);
                }
                onPlaceInPack();
              }}
            />
          ));
        })()}
        {seat.hidden_count > 0 && <CardBack count={seat.hidden_count} />}
      </div>

      {isMine && trophies > 0 && (
        <button
          onClick={onTrade}
          className="mt-2 rounded border border-edge px-2 py-1 text-[11px] text-ink transition hover:border-ochre"
        >
          Wymień trofea na punkty Miecza (1.4)
        </button>
      )}
    </div>
  );
}

/** What this seat is wearing, keyed by place. */
function wornBySlot(seat: Seat): Partial<Record<Slot, SlotItem>> {
  const worn: Partial<Record<Slot, SlotItem>> = {};
  for (const held of seat.holdings) {
    if (!held.slot) continue;
    worn[held.slot] = { holdingId: held.id, cardId: held.cardId, card: tileFor(held) };
  }
  return worn;
}

/**
 * Putting a Przedmiot on.
 *
 * One button when there is one place it can go, and a choice of two when it is
 * a weapon and both hands are places it could go — which is the only real
 * decision the variant offers, so it is the only one worth a second button.
 */
function EquipButton({
  cardId,
  worn,
  onEquip,
}: {
  cardId: string;
  worn: Partial<Record<Slot, SlotItem>>;
  onEquip: (slot: Slot) => void;
}) {
  const places = SLOTS.filter((slot) => fitsIn(cardId, slot));
  if (places.length === 0) return null;

  if (places.length === 1) {
    return (
      <button
        onClick={() => onEquip(places[0])}
        className="text-[9px] text-ochre/80 underline hover:text-ochre"
      >
        {worn[places[0]] ? "zamień" : "załóż"}
      </button>
    );
  }
  // Both hands. Named rather than numbered, because "gł." and "pom." is what
  // somebody staring at the two boxes either side of the body will read them as.
  return (
    <span className="flex items-center gap-1 text-[9px]">
      <span className="text-muted">załóż:</span>
      {places.map((slot) => (
        <button
          key={slot}
          onClick={() => onEquip(slot)}
          title={slot === "reka-glowna" ? "Ręka główna" : "Ręka pomocnicza"}
          className="text-ochre/80 underline hover:text-ochre"
        >
          {slot === "reka-glowna" ? "gł." : "pom."}
        </button>
      ))}
    </span>
  );
}


function tileFor(held: Held): TileCard {
  return {
    cardId: held.cardId,
    name: CARD_NAMES.get(held.cardId) ?? held.cardId,
    text: CARD_TEXTS.get(held.cardId),
    kindLabel: KIND_LABEL[held.kind],
  };
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-muted">
      {children}
    </main>
  );
}

function SeatCard({
  seat,
  active,
  canAdjust,
  canCorrect,
  isMine,
  slotted,
  onAdjust,
  onDrop,
  onTrade,
  onEquip,
  onUse,
  onReorder,
  onInspect,
}: {
  seat: Seat;
  active: boolean;
  canAdjust: boolean;
  /**
   * Whether the tracked values may be corrected by hand.
   *
   * Separate from `canAdjust`, which is really "this is your card and you may
   * act on it" — dropping a Przedmiot and equipping one are moves, not
   * corrections. Nudging Miecz with a ± is a correction, and a simulation has
   * nothing to correct: the app moved the figure, threw the die and applied the
   * result, so a player editing the outcome is not playing the game, they are
   * editing its record of itself.
   */
  canCorrect: boolean;
  isMine: boolean;
  /** The table plays the slotted variant. */
  slotted: boolean;
  onAdjust: (stat: string, delta: number) => void;
  onDrop: (holdingId: string) => void;
  onTrade: () => void;
  onEquip: (holdingId: string, slot: Slot | null) => void;
  /** Spend a card by using it — asked about first, because it cannot be undone. */
  onUse?: (holdingId: string, cardId: string) => void;
  /** The pack, in the order its owner wants it. */
  onReorder?: (holdingIds: string[]) => void;
  onInspect: (card: TileCard) => void;
}) {
  const character = CHARACTERS.find((c) => c.id === seat.character_id);
  const trophies = seat.holdings.filter((h) => h.kind === "trophy");

  /**
   * The card on the cursor.
   *
   * Held here rather than in either half, because the whole point of picking
   * something up is to put it down somewhere else — and "somewhere else" is
   * usually the other half.
   */
  const [carried, setCarried] = useState<Carried | null>(null);
  /**
   * The card being dragged, by id.
   *
   * Kept in state because a `dragover` handler is not allowed to read what the
   * drag is carrying — only the drop is — so without this the place under the
   * pointer could not say whether it would accept before it was let go.
   */
  const [dragging, setDragging] = useState<{ cardId: string; holdingId: string } | null>(null);
  /**
   * Says what a drag has picked up — a tick after it picks it up.
   *
   * The browser takes its picture of the card being dragged at the end of the
   * `dragstart` handler, and the place the card came from is faded the moment
   * this lands. Fade it inside the handler and the picture on the cursor is the
   * faded one, which is the opposite of what a card in the air should look
   * like. Letting go cancels a pending fade rather than queueing behind it, so
   * a drag abandoned in the same breath cannot leave a hollow behind.
   */
  const dragTimer = useRef<number | null>(null);
  const announceDrag = useCallback((moving: { cardId: string; holdingId: string } | null) => {
    if (dragTimer.current !== null) window.clearTimeout(dragTimer.current);
    dragTimer.current = null;
    if (!moving) return setDragging(null);
    dragTimer.current = window.setTimeout(() => setDragging(moving), 0);
  }, []);
  const movingCardId = carried?.cardId ?? dragging?.cardId ?? null;
  /**
   * The card that is in the air, whichever way it was picked up.
   *
   * Clicking a card and dragging it are the same journey — one with the button
   * held — so the place it came from looks the same either way: emptied, not
   * still occupied by something that has gone slightly grey.
   */
  const liftedHoldingId = carried?.holdingId ?? dragging?.holdingId ?? null;

  /**
   * Puts down what is being carried.
   *
   * Onto the place it came from, it is simply put back: nothing moved, so
   * nothing is sent. That is also what happens when it is dropped anywhere that
   * is not a place at all — a click on the board, or Escape — because a card
   * picked up and not put anywhere has not gone anywhere.
   */
  const place = (slot: Slot | null) => {
    if (!carried) return;
    if (carried.from === (slot ?? "plecak")) return setCarried(null);
    onEquip(carried.holdingId, slot);
    setCarried(null);
  };

  // A click anywhere that is not a place, or Escape, puts it back. The places
  // stop their own clicks from reaching the window, so this only hears the
  // ones that missed. Registered a tick late so the click that picked the card
  // up does not immediately put it down again.
  useEffect(() => {
    if (!carried) return;
    let cancel: (() => void) | undefined;
    const timer = setTimeout(() => {
      const putBack = () => setCarried(null);
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") setCarried(null);
      };
      window.addEventListener("click", putBack);
      window.addEventListener("keydown", onKey);
      cancel = () => {
        window.removeEventListener("click", putBack);
        window.removeEventListener("keydown", onKey);
      };
    }, 0);
    return () => {
      clearTimeout(timer);
      cancel?.();
    };
  }, [carried]);

  return (
    <article
      className={`rounded-lg border bg-panel p-4 transition ${
        active ? "border-ochre shadow-[0_0_0_1px_var(--color-ochre)]" : "border-edge"
      }`}
    >
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-[family-name:var(--font-display)] text-ink">
          {/* A seat with a character but no name is somebody who joined without
              typing one, not an empty chair — calling it "wolne" made a player
              look absent at their own table. */}
          {seat.player_name ?? (
            <span className="text-muted">
              {seat.character_id ? `Miejsce ${seat.seat_index + 1}` : "wolne miejsce"}
            </span>
          )}
        </h3>
        {seat.turns_lost > 0 && (
          <span className="text-[10px] uppercase text-vermilion">
            traci {seat.turns_lost}
          </span>
        )}
      </header>

      {character ? (
        <>
          <div className="mb-3 flex items-center gap-3">
            {/* The character card itself, small. It carries the abilities,
                which no amount of stat display replaces — half of what a
                character can do is prose on this card. */}
            {characterImageUrl(character.id) && (
              <Image
                src={characterImageUrl(character.id)!}
                alt={character.name}
                width={192}
                height={238}
                // Big enough to read the Charakterystyka off, now that the
                // slots take the other half of the row: half a card of white
                // space either side of a thumbnail was the worse use of it.
                className="h-auto w-48 shrink-0 rounded border border-edge"
                unoptimized
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ochre">{character.name}</p>
              <p className="text-[10px] text-muted">
                {seat.nature ?? "natura nieustalona"}
              </p>
            </div>
            {/* The body, beside the character card, in the slotted variant
                only — klasyczny play has nowhere to put anything. */}
            {slotted && (
              <SlotPanel
                worn={wornBySlot(seat)}
                canAct={canAdjust}
                busy={false}
                carrying={carried !== null}
                movingCardId={movingCardId}
                liftedHoldingId={liftedHoldingId}
                onDragging={announceDrag}
                onPickUp={(item, from) =>
                  setCarried({ ...item, name: item.card.name, from })
                }
                onTakeOff={(holdingId) => {
                  setCarried(null);
                  onEquip(holdingId, null);
                }}
                onUse={onUse}
                // A drag carries an id; a click carries nothing and means
                // "put down what I am holding".
                onDropInto={(holdingId, slot) =>
                  holdingId ? onEquip(holdingId, slot) : place(slot)
                }
              />
            )}
          </div>
          <dl className="tnum grid grid-cols-4 gap-2 text-center text-sm">
            <Stat
              label="Miecz"
              value={seat.miecz_own}
              total={seat.miecz_total}
              tone="text-miecz"
              stat="miecz"
              canAdjust={canCorrect}
              onAdjust={onAdjust}
            />
            <Stat
              label="Magia"
              value={seat.magia_own}
              total={seat.magia_total}
              tone="text-magia"
              stat="magia"
              canAdjust={canCorrect}
              onAdjust={onAdjust}
            />
            <Stat label="Życie" value={seat.zycie} tone="text-zycie" stat="zycie" canAdjust={canCorrect} onAdjust={onAdjust} />
            <Stat label="Złoto" value={seat.zloto} tone="text-zloto" stat="zloto" canAdjust={canCorrect} onAdjust={onAdjust} />
          </dl>

          <Hand
            seat={seat}
            isMine={isMine}
            canAct={canAdjust}
            slotted={slotted}
            trophies={trophies.length}
            carried={carried}
            moving={movingCardId !== null}
            liftedHoldingId={liftedHoldingId}
            onCarry={setCarried}
            onDragging={announceDrag}
            onPlaceInPack={() => place(null)}
            onDrop={onDrop}
            onTrade={onTrade}
            onEquip={onEquip}
            onUse={onUse}
            onReorder={onReorder}
            onInspect={onInspect}
          />
          <CarriedCard carried={carried} />
          <p className="mt-3 text-xs text-muted">
            {seat.field_id ? (FIELD_NAMES.get(seat.field_id) ?? seat.field_id) : "—"}
          </p>
          {character.abilities.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted">
                Zdolności ({character.abilities.length})
                {abilitiesOfCharacter(asCharacterId(seat.character_id)).length > 0 && (
                  <span className="ml-2 normal-case tracking-normal text-verdigris/80">
                    {abilitiesOfCharacter(asCharacterId(seat.character_id)).map(describeAbility).join(" · ")}
                  </span>
                )}
              </summary>
              {/* Which of them the app is watching for, and which the player has
                  to remember. A Charakterystyka overrides the general rules
                  (8.2), so a power nobody applies is a rule quietly dropped. */}
              {notesForCharacter(asCharacterId(seat.character_id)).length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5 border-l-2 border-ochre/40 pl-2 text-[10px] leading-snug text-ochre/80">
                  {notesForCharacter(asCharacterId(seat.character_id)).map((note) => (
                    <li key={note}>↳ {note}</li>
                  ))}
                </ul>
              )}
              <ol className="mt-1 flex list-decimal flex-col gap-1 pl-4 text-[11px] leading-relaxed text-muted">
                {character.abilities.map((ability, index) => (
                  <li key={index}>{ability}</li>
                ))}
              </ol>
            </details>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">bez postaci</p>
      )}
    </article>
  );
}

/**
 * One tracked value with its correction buttons.
 *
 * The +/- are always available to any seated player, not just the value's
 * owner. At a table people spot each other's miscounts, and an override that
 * only the owner can use is useless in the moment someone else notices.
 */
/**
 * A number of points, as the tokens it is made of.
 *
 * This is what the table looks like: a character's own Miecz is a little pile
 * of red squares beside its card, and the rulebook never asks anybody to write
 * the number down. It asks for "żetony o odpowiednim nominale" (1.4, 2.4, 4.5)
 * — change, made out of the four denominations the box prints.
 *
 * Złoto is the exception and gets one coin and a count. There is only the one
 * gold denomination, so a hoard would be that many coins in a row, and by the
 * middle of a game that is a picture of a pile rather than a reading of it.
 * Everything else in the app already counts gold in numerals — "za 2 Sztuki
 * Złota" — so this reads the same way.
 */
function Tokens({ stat, points, label }: { stat: string; points: number; label: string }) {
  const SIZE = 20;
  if (stat === "zloto") {
    return (
      <span className="flex items-center gap-1" title={`${label}: ${points}`}>
        <Image
          src="/tokens/zloto.png"
          alt=""
          width={SIZE}
          height={SIZE}
          className="rounded-[2px]"
          unoptimized
        />
        <span className="tnum text-lg font-medium">{points}</span>
      </span>
    );
  }

  const tokens = tokensFor(points);
  // Nothing is the honest picture of nothing: a character at zero Życie has had
  // its last token taken off the table (4.4). A bare 0 says so; an empty gap
  // would read as a stat the app had failed to work out.
  if (tokens.length === 0) return <span className="text-lg font-medium text-muted">0</span>;

  return (
    <span
      className="flex flex-wrap items-center justify-center gap-0.5"
      title={`${label}: ${points}`}
    >
      {tokens.map((token, index) => (
        <Image
          key={index}
          src={`/tokens/${stat}-${token}.png`}
          // Read once, by the first token. Four images each announcing a
          // number would have a screen reader count the pile aloud.
          alt={index === 0 ? `${label} ${points}` : ""}
          width={SIZE}
          height={SIZE}
          className="rounded-[2px]"
          unoptimized
        />
      ))}
    </span>
  );
}

function Stat({
  label,
  value,
  total,
  tone,
  stat,
  canAdjust,
  onAdjust,
}: {
  label: string;
  value: number;
  /** Own points plus what is carried. Shown only when the two differ. */
  total?: number;
  tone: string;
  stat: string;
  canAdjust: boolean;
  onAdjust: (stat: string, delta: number) => void;
}) {
  return (
    <div className="group">
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`flex flex-wrap items-center justify-center gap-1 ${tone}`}>
        <Tokens stat={stat} points={value} label={label} />
        {/* The +/- move OWN points, which are what the rules floor at the
            starting value (1.3, 2.3). The total is derived from the cards on
            the table and is not editable — correcting it means changing what is
            held, not typing a different number.

            Which is also why the tokens stand for `value` and never `total`:
            1.3 and 2.5 are explicit that what a Przedmiot or a Przyjaciel lends
            you is not marked with a żeton, so a row of them adding up to a
            number the table never had tokens for would be the interface
            inventing a rule. The figure beside them is the one the cards make. */}
        {total !== undefined && total !== value && (
          <span className="tnum text-lg font-medium">
            {total}
            <span className="ml-1 text-[11px] text-muted">({value})</span>
          </span>
        )}
      </dd>
      {canAdjust && (
        // Always visible rather than revealed on hover. Phones are the primary
        // device at a table and have no hover, so a hover-gated override is an
        // override that does not exist for most of the people using it.
        <div className="mt-1 flex justify-center gap-1">
          <button
            onClick={() => onAdjust(stat, -1)}
            className="h-5 w-5 rounded border border-edge text-[11px] leading-none text-muted hover:border-vermilion hover:text-ink"
          >
            −
          </button>
          <button
            onClick={() => onAdjust(stat, 1)}
            className="h-5 w-5 rounded border border-edge text-[11px] leading-none text-muted hover:border-verdigris hover:text-ink"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}


/**
 * A one-line account of something the app worked out on its own.
 *
 * Only the results that were not visible as they happened need this. A card the
 * player drew is already on screen; two dice thrown inside a route handler are
 * not, and a referee that says only "you failed" is exactly the referee this
 * app exists to not be.
 */
/**
 * The reader's own Natura, narrowed once.
 *
 * The column is a plain string, and 5.3 is answered against a Nature — so this
 * is the boundary the guard belongs at, exactly like `asFieldId` elsewhere.
 */
function asNature(value: string | null | undefined): Nature | null {
  return value === "dobra" || value === "zla" || value === "chaotyczna" ? value : null;
}

function describeResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const data = result as {
    dice?: number[];
    magia?: number;
    outcome?: string;
    spell?: string;
    effect?: string;
    /** The Kamienny Most's own fields (14.5-14.6). */
    kind?: string;
    /** 19.1, which is answered rather than rolled. */
    succeeded?: boolean;
    onBridge?: boolean;
    to?: string;
    lost?: string[];
    kept?: string[];
    lifeLost?: number;
    enemyTotal?: number;
    healed?: number;
    paid?: number;
    /** A field's die table or a card's script, thrown and applied by the server. */
    offer?: string;
    card?: string;
    face?: number;
    did?: string[];
    /** A used card the app could not finish working out — see `uses.ts`. */
    stol?: boolean;
  };
  // 19.1 is answered, not rolled — an escape works because an ability says so.
  // "No" is therefore a real result, and it changes nothing on the board, so
  // saying it is the only way to tell it apart from the button doing nothing.
  if (typeof data.succeeded === "boolean" && typeof data.onBridge === "boolean") {
    return data.succeeded
      ? "Wymknąłeś się (19.1) — nie możesz już nic zrobić temu, przed czym uciekłeś."
      : "Nie udało się wymknąć: twoja Postać nie potrafi tego na tym Obszarze (19.1).";
  }

  // A spell has to be announced loudly: 9.6 reaches its victim anywhere on the
  // board, so the person it lands on may not be looking at this turn at all.
  if (data.spell) return `Rzucono Zaklęcie: ${data.spell}. ${data.effect ?? ""}`.trim();

  // The bridge. These are the most expensive things that happen in the game —
  // a fall from the Pułapka takes two thirds of everything a character owns —
  // and they used to happen in silence, the figure simply appearing somewhere
  // else with a lighter pack. The dice are quoted because at a table somebody
  // always asks to see them.
  const roll = (dice?: number[]) => (dice ?? []).join(" + ");
  switch (data.kind) {
    case "pulapka": {
      const sum = (data.dice ?? []).reduce((total, die) => total + die, 0);
      if (data.outcome === "uniknieta") {
        return `Pułapka: ${roll(data.dice)} = ${sum} — mniej niż twoje punkty, zostajesz na miejscu.`;
      }
      // Straight off the wire, so it is looked up rather than trusted.
      const where = (isFieldId(data.to) ? FIELD_NAMES.get(data.to) : null) ?? data.to ?? "?";
      const lost = data.lost?.length ? `Tracisz: ${data.lost.join(", ")}.` : "Nic nie tracisz.";
      const kept = data.kept?.length ? ` Zostaje przy tobie: ${data.kept.join(", ")}.` : "";
      return `Pułapka: ${roll(data.dice)} = ${sum} — spadasz na ${where}. ${lost}${kept}`;
    }
    case "gra-ze-smiercia": {
      const mine = (data.dice ?? []).slice(0, 2);
      const deaths = (data.dice ?? []).slice(2);
      const verdict =
        data.outcome === "dalej"
          ? "wygrywasz — idziesz dalej"
          : data.outcome === "znowu"
            ? "remis — grasz jeszcze raz w następnej turze"
            : "przegrywasz — tracisz 1 Życia i grasz dalej";
      return `Gra ze Śmiercią: ty ${roll(mine)} przeciw ${roll(deaths)} — ${verdict}.`;
    }
    case "cerber":
      return `Cerber: ${roll(data.dice)} — tracisz ${data.lifeLost} Życia.`;
    case "straznik":
      return `${data.outcome}: ${roll(data.dice)} — jego siła to ${data.enemyTotal}. Nie przejdziesz, póki nie zginie.`;
  }

  // A die table the app rolled and acted on. The player pressed one button and
  // did not see either half, so both are said: the face, and what it did.
  const source = data.offer ?? data.card;
  if (source && (typeof data.face === "number" || data.did)) {
    const did = data.did?.length ? data.did.join(", ") : "nic się nie dzieje";
    const rolled = typeof data.face === "number" ? `wypadło ${data.face} — ` : "";
    // A spent card whose effect the app cannot carry out says so, rather than
    // reading like something that has already been applied. The Karta is gone
    // either way; what is left is the table's to do.
    const owed = data.stol ? " — rozpatrzcie sami." : ".";
    return `${source}: ${rolled}${did}${owed}`;
  }

  // Paying a healer: what the money and 4.7 between them actually bought.
  if (typeof data.healed === "number") {
    return `Wyleczone: ${data.healed} ${data.healed === 1 ? "punkt" : "punkty"} Życia za ${data.paid} Sz. Z.`;
  }

  if (!Array.isArray(data.dice) || typeof data.magia !== "number") return null;
  const total = data.dice.reduce((sum, die) => sum + die, 0);
  const verdict =
    data.outcome === "udana" ? "przeprawa udana" : "porażka — tracisz 1 Życie";
  return `Trzęsawiska: ${data.dice.join(" + ")} = ${total} przeciw Magii ${data.magia} — ${verdict}.`;
}

function fieldName(fieldId: FieldId): string {
  return FIELDS.get(fieldId)?.name ?? fieldId;
}

/**
 * Field names for a list.
 *
 * Eight places on the board are printed twice, and a card that names one almost
 * always names both — which used to render as "Urwisko, Urwisko", since both
 * carried the printed name. They are numbered now, so the pair reads as
 * "Urwisko I, Urwisko II" and the dedup is left only for genuine repeats.
 */
function fieldNames(fieldIds: readonly FieldId[]): string {
  // Board order, so a pair of numbered fields reads the way you walk them.
  // The ability data lists ids in whatever order the card's prose does, which
  // put the Hobgoblin's escape at "Step II, Step I".
  const order = [...FIELDS.keys()];
  const sorted = [...new Set(fieldIds)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...new Set(sorted.map(fieldName))].join(", ");
}

/**
 * Which held card, if any, lets this character walk past the field's die roll.
 *
 * Returns the card's name rather than a boolean, because "you may skip this"
 * is much less useful to a player than "your Przewodnik lets you skip this" —
 * the second can be checked against the card lying on the table.
 */
function rollSkippedBy(seat: Seat): string | null {
  if (!seat.field_id) return null;
  for (const held of seat.holdings) {
    if (skipsRollAt(abilitiesOf(held.cardId), seat.field_id)) {
      return CARD_NAMES.get(held.cardId) ?? held.cardId;
    }
  }
  return null;
}

/**
 * A field's table that the character has no choice about, if it is still owed.
 *
 * `obowiazkowe` is the whole test: the Karczma's "MUSISZ RZUCIĆ KOSTKĄ" and the
 * Strażnik's toll happen to you, which puts them in the same class as a drawn
 * card and therefore in the modal, where the table can watch. Everything else a
 * field offers is a visit — "MOŻESZ TU ODWIEDZIĆ" — and a visit stays in the
 * panel, because choosing not to go is a real answer.
 */
function compulsoryOffer(
  fieldId: FieldId | null,
  resolved: readonly string[],
): { name: string; effect: Effect } | null {
  if (!fieldId) return null;
  const script = fieldScriptFor(fieldId);
  if (!script?.obowiazkowe) return null;
  const owed = script.offers.find((offer) => !resolved.includes(offerKey(offer.name)));
  return owed ? { name: owed.name, effect: owed.effect } : null;
}
