"use client";

import { use, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readTestMode, watchTestMode, writeTestMode, TESTING_POSSIBLE } from "@/lib/game/testMode";
import { isSpellId, type CardId, type SpellId } from "@/data/ids";
import { FIELDS, ringFields, type FieldId } from "@/lib/engine/board";
import { abilitiesOfCharacter, asCharacterId } from "@/lib/engine/characters";
import { SeatActions } from "./seat-actions";
import { SpellHand } from "./spell-hand";
import { CardDetail, type TileCard } from "./card-tile";
import { plural } from "@/lib/engine/polish";
import { SeatCard } from "./seat-card";
import {
  CARD_NAMES,
  CARD_TEXTS,
  CHARACTERS,
  KIND_LABEL,
  asNature,
  type Seat,
} from "./table";
import { CardLibrary } from "./card-library";
import { useTable, type Person } from "./use-table";
import { TestConsole, wakeConsole } from "./console";
import { stageOf } from "@/lib/engine/console";
import { TurnFab, owedLabel } from "./turn-fab";
import { Lobby } from "./lobby";
import { JoinGate, LeaveButton, ReturnGate, SecondTabNotice, TakeOverGate } from "./door";
import { type LobbySeat } from "./lobby-view";
import { TableLayout, type PublicSeat } from "./table-layout";
import { TurnQueue } from "./turn-queue";
import { NowBox } from "./now-box";
import { factsIn, turnSteps, windowsFor } from "@/lib/engine/turnWindows";
import { dutiesBeforeEnding, mayEndTurn, whyCannotEnd } from "@/lib/engine/duties";
import { Journal } from "./journal";
import { TableSettings } from "./table-settings";
import { momentsIn, spellScript } from "@/lib/engine/spells";
import { BoardMap } from "./board-map";
import events from "@/data/events.json";
import spells from "@/data/spells.json";
import type { EventCard, Spell } from "@/data/types";
import { FieldModal } from "./field-modal";
import { RaidOffer } from "./raid-offer";
import { FriendOffer } from "./friend-offer";
import { DrawModal } from "./draw-modal";
import { RebornModal } from "./reborn-modal";
import { AnnouncementModal } from "./announcement";
import { ConfirmDialog, type Confirmation } from "./confirm";
import { askAbout, usageOf } from "@/lib/engine/uses";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
import { MAX_SEATS } from "@/lib/game/modes";
import { Toasts } from "./toast";
import { OpenRule, Rules } from "./rule-ref";
import type { RulesShelf } from "./rules-shelf";
import { Settings } from "./settings";
import { BarButton } from "./bar-button";
import { usePreferences } from "./preferences";
import { PlayersDrawer } from "./players";
import { PilesDrawer } from "./piles";


/**
 * How many of each the box prints — 165 and 30, said on the manual's first page
 * and counted again by the slicer, which cut exactly that many out of the scans.
 *
 * Read off the data rather than typed in, so the day a card turns out to be
 * missing from a scan this number moves with it instead of quietly disagreeing.
 */
const PRINTED_EVENTS = (events as EventCard[]).length;

/**
 * The card a slice ref came off, for a used pile showing the copy it spent.
 *
 * By ref and not by id: the box prints four Magiczne Miecze and two Upiory, and
 * a pile that showed "some Upiór" would be showing a card rather than the card.
 */
const BY_REF = new Map<string, TileCard>(
  [
    ...(events as EventCard[]).map((card) => [card, "Karta Zdarzeń"] as const),
    ...(spells as Spell[]).map((card) => [card, "Zaklęcie"] as const),
  ].map(([card, kindLabel]) => [
    `${card.source.sheet}#${card.source.index}`,
    { cardId: card.id, name: card.name, text: card.text, ref: `${card.source.sheet}#${card.source.index}`, kindLabel },
  ]),
);
const cardOfRef = (ref: string) => BY_REF.get(ref) ?? null;
const PRINTED_SPELLS = (spells as Spell[]).length;

const FIELD_NAMES = new Map(
  [...FIELDS.values()].map((field) => [field.id, field.name]),
);

/** The shared table screen: the whole game state everyone is allowed to see. */
/**
 * Whether companion's own status line is drawn at all.
 *
 * `false` while COMPANION_PARKED keeps every new table in simulation, where
 * `game.mode` can never be "companion" — so the line was unreachable anyway and
 * only cost a reader the time to work that out. Kept rather than deleted, like
 * the rest of that mode: one boolean brings it back.
 */
const COMPANION_LINE = false;

/**
 * How close two presses of the console key have to be to count as one.
 *
 * See `lastTick`. Deliberately short: it is meant to swallow a stutter, not to
 * make the key sluggish.
 */
const DOUBLE_TICK_MS = 350;

export default function Table({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  /**
   * Everything the server has said, and everything this device may say back.
   *
   * The screen's own state stays below — which drawer is out, which card
   * somebody tapped, whether a watcher has folded the turn away. See
   * `use-table.ts` for where the line is and why it is there.
   */
  const {
    game,
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
    notices,
    dismissNotice,
    setHouseRule,
    busy,
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
  } = useTable(code);
  /** A field the player tapped on the map, to read what it says. */
  const [inspecting, setInspecting] = useState<FieldId | null>(null);
  /** A card somebody tapped, shown large with its full text. */
  const [inspectingCard, setInspectingCard] = useState<TileCard | null>(null);
  /** The reference drawer of every card in the box. */
  /**
   * Which drawer is out on each side, at most one apiece.
   *
   * A side rather than a flag per drawer, because that is the rule: the two
   * sit on opposite edges so both can be out at once, and a side has room for
   * exactly one. Naming the side rather than the drawer means the third one to
   * be written swaps with whatever is already there instead of being drawn on
   * top of it, and nobody has to remember to close the other first.
   */
  const [leftDrawer, setLeftDrawer] = useState<"ksiega" | "stosy" | null>(null);
  /**
   * The rule somebody last followed a reference to.
   *
   * Kept here rather than inside the Księga because the click happens outside
   * it — in a refusal in the corner, under a Karta, in a tooltip — and the
   * drawer is usually shut when it does. Bumped rather than only set: clicking
   * the same `(5.3)` twice should take you back to it, and a value that did not
   * change is a value nothing downstream notices.
   */
  const [rule, setRule] = useState<{ shelf: RulesShelf; id: string | null; nth: number } | null>(
    null,
  );
  const openAt = useCallback((shelf: RulesShelf, id: string | null) => {
    setLeftDrawer("ksiega");
    setRule((was) => ({ shelf, id, nth: (was?.nth ?? 0) + 1 }));
  }, []);
  const openRule = useCallback((id: string) => openAt("instrukcja", id), [openAt]);
  /**
   * Cards with a request out, drawn where they are and greyed until it lands.
   *
   * Taking and dropping are the two writes that move a card from one place to
   * another, and neither may be done optimistically. 12.1 gives what is lying
   * on an Obszar to whoever's move ends there, and two characters can be
   * standing on it — so the browser does not know it has the card until the
   * server says so. 5.5's drop is the same fact from the other end: where the
   * card lands is the Obszar the server thinks you are on.
   *
   * So the card does not move on the press. It greys, which says the ask is
   * out, and it moves when the answer arrives — the whole journey in one step
   * rather than a card that leaves and comes back. `equip` is the opposite
   * bargain on purpose: nobody can race you to your own Hełm, so that one moves
   * under the hand and is corrected by the next refresh.
   */
  const [asked, setAsked] = useState<readonly string[]>([]);
  /**
   * The same list, readable during an event rather than after the next render.
   *
   * One card, one ask: a second press on a card already out is dropped here and
   * not left to the server to refuse. State cannot answer that — two clicks
   * landing in one batch both read the same `asked` — so the ref is the
   * authority and the state is how it is drawn.
   */
  const outstanding = useRef<Set<string>>(new Set());
  /**
   * Asks about one card, while any number of other cards are being asked about.
   *
   * Deliberately per card and not a single flag. Two Przedmioty lying on one
   * Obszar are two independent questions — 5.4 may allow one and refuse the
   * other, and the answers are decided one at a time against the table as it
   * stands when each is decided — so pressing „weź" on the first must not close
   * the second. `busy` would have: it is the whole table's flag.
   *
   * Which is safe to do because the writes are ordered underneath: `change`
   * puts every change to one game through one chain in arrival order, and the
   * compare-and-swap on `games.revision` is what makes it correct when two
   * servers have two chains. So a second take is decided against a table that
   * already has the first card in the pack, and „nie uniesiesz" and „tej Karty
   * już tam nie ma" are answers the rules give rather than accidents of timing.
   */
  const askFor = useCallback(async (id: string, run: () => Promise<void>) => {
    if (outstanding.current.has(id)) return;
    outstanding.current.add(id);
    setAsked((was) => [...was, id]);
    try {
      await run();
    } finally {
      outstanding.current.delete(id);
      setAsked((was) => was.filter((one) => one !== id));
    }
  }, []);
  /**
   * A drawer opened for its own sake, rather than at a reference.
   *
   * `rule` is forgotten on the way in and on the way out, because it is the
   * destination of one click and stops being anybody's destination the moment
   * the drawer shuts. Left standing, the next plain Księga — the button, the K
   * — opened back at a rule somebody followed twenty minutes ago, remounted at
   * it and scrolled to it, with nothing on screen saying why it had not opened
   * where they left it.
   */
  const toggleDrawer = useCallback((which: "ksiega" | "stosy") => {
    setRule(null);
    setLeftDrawer((out) => (out === which ? null : which));
  }, []);
  const closeDrawer = useCallback(() => {
    setRule(null);
    setLeftDrawer(null);
  }, []);
  const prefs = usePreferences();
  /** The stacks, drawn as stacks (`piles.tsx`). */
  /**
   * Testing rather than playing — see `testMode.ts`.
   *
   * Subscribed to rather than copied into state, so the server renders "off"
   * and the browser renders what the switch actually says, without a second
   * pass to correct the first.
   */
  const testMode = useSyncExternalStore(watchTestMode, readTestMode, () => false);
  /**
   * The console, opened with a backtick or from the switch that gates it.
   *
   * The key is the one every game with a console uses, and it is unshifted, so
   * it never lands in a Polish word being typed anywhere else.
   */
  const [consoleOpen, setConsoleOpen] = useState(false);

  /**
   * Two keys, on the same physical one.
   *
   * Backtick opens and closes the console — the key every game with a console
   * uses — and shifted, as a tilde, it turns testing itself on and off. They
   * belong together: the console is the whole of what testing offers now, and
   * the switch that gates it was otherwise reachable only by finding a small
   * word in the top bar.
   *
   * Unshifted backtick cannot land in a Polish word, and neither can a tilde —
   * except in a field somebody is typing into, which is why that is checked:
   * the console's own input is a field, and so is the card search.
   */
  /**
   * When the console key was last obeyed, so a doubled press is not two answers.
   *
   * The key toggles, which means the second of a quick pair undoes the first
   * and leaves the console exactly where it started — the one outcome nobody
   * pressing it twice was asking for. Two ways to arrive there and both are
   * ordinary: holding the key down, and the double tap that a layout using `
   * as a dead key trains into your fingers.
   *
   * A window rather than a lock, because pressing it twice *slowly* is a real
   * thing to do — open the console, read a line, put it away. A third of a
   * second is longer than a stutter and far shorter than a decision.
   */
  const lastTick = useRef(0);
  useEffect(() => {
    if (!TESTING_POSSIBLE) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Holding a key is one press held, not a press per frame.
      if (event.repeat) return;
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA");
      if (typing) return;
      if (event.key === "~") {
        event.preventDefault();
        // Turning it off takes the console with it: what is behind the switch
        // cannot outlive the switch.
        writeTestMode(!readTestMode());
        if (readTestMode() === false) setConsoleOpen(false);
        return;
      }
      if (event.key === "`") {
        event.preventDefault();
        /**
         * The key means "give me the console", so a minimised one grows rather
         * than closing.
         *
         * Shrunk to its bar it is technically open, and a toggle read that as
         * "already here, take it away" — which threw away the transcript for a
         * key somebody pressed to *see* it. Growing first costs nothing: with
         * nothing minimised `wakeConsole` does nothing and says so, and the
         * toggle behaves exactly as it did.
         */
        const now = Date.now();
        const doubled = now - lastTick.current < DOUBLE_TICK_MS;
        lastTick.current = now;
        if (doubled) return;
        const grew = wakeConsole();
        setConsoleOpen((was) => !was || grew);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const setTestMode = writeTestMode;
  const testing = TESTING_POSSIBLE && testMode;
  /** A seatless visitor who chose to watch rather than take a character over. */
  const [watching, setWatching] = useState(false);
  /**
   * Cards the player has waved past for now.
   *
   * 16.8 lets a card simply stay where it fell, and 12.1 gives until the end of
   * the turn to come back to it — so "not now" has to be a real answer, and it
   * is this device's business rather than the table's. Cleared when the turn
   * moves on, since the next character meets the same cards fresh.
   */
  const [waved, setWaved] = useState<string[]>([]);
  /** Whether the "choose again" modal was *asked* for (4.4). */
  const [reborn, setReborn] = useState(false);
  /**
   * Whether the picker was waved away by somebody who has a seat but no Postać.
   *
   * Its own state, and not `watching` above — that one is a *seatless* visitor
   * who never sat down. This is the other half: "I asked for the picker" and "I
   * dismissed the picker" are different questions, and `reborn` alone could not
   * answer both. The picker opens unasked for somebody with no Postać at all,
   * so `reborn` was already false while it was on screen and "oglądaj dalej"
   * turning it off again closed nothing — the gate re-opened it on the same
   * render. The button was there the whole time and did nothing.
   *
   * Cleared on picking, so waving it away once does not silence it for a death
   * three turns later.
   */
  const [pickerWavedOff, setPickerWavedOff] = useState(false);
  /** The roster, open over the right-hand column. */
  const [rightDrawer, setRightDrawer] = useState<"gracze" | "ustawienia" | null>(null);
  /** Which seat the players drawer should open on, when it was opened about one. */
  const [askedAbout, setAskedAbout] = useState<string | null>(null);

  /**
   * A letter for each surface, being the letter it starts with.
   *
   * K for the Księga, S for the Stosy, G for the Gracze. They are the three
   * things in the bar you open and shut all game, they are two clicks away
   * across a wide screen, and the Polish names hand out three distinct initials
   * for free — so there is nothing to learn beyond the word already on the
   * button, which is where the letter is written.
   *
   * Bare letters rather than a modifier, because there is nothing here to
   * collide with: the only keyboard input on this screen is the console line
   * and the Księga search box, and both are fields. The same guard the console
   * uses covers both, which is why it is spelled out twice rather than shared —
   * that one is behind TESTING_POSSIBLE and this is not.
   *
   * Each toggles, exactly as its button does. Pressing K with the Księga open
   * shuts it, which is what "the K window" means once you have one.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      switch (event.key.toLowerCase()) {
        case "k":
          event.preventDefault();
          toggleDrawer("ksiega");
          return;
        case "s":
          event.preventDefault();
          toggleDrawer("stosy");
          return;
        case "g":
          event.preventDefault();
          setRightDrawer((out) => (out === "gracze" ? null : "gracze"));
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleDrawer]);

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
   * Whether the turn's sheet has been folded away — anybody's, including your
   * own.
   *
   * It was a watcher's only, on the reasoning that hiding what the game is
   * waiting on is how a table stops. What makes it safe on your own turn is
   * `TurnFab`: it cannot be dismissed while the turn is yours, it says what is
   * owed, and ending the turn is behind it — so the way back is on the path of
   * every turn that ends.
   *
   * Cleared when the turn changes hands rather than when it becomes yours: you
   * fold it once because you want the board, and it should stay out of the way
   * until the game moves on.
   */
  const [folded, setFolded] = useState(false);
  /** Which seat is choosing a character; "auto" lets the app decide. */
  const [picking, setPicking] = useState<string | "auto" | null>("auto");



  const turnKey = game ? `${game.turn}:${game.active_seat}` : null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWaved([]);
  }, [turnKey]);

  const myTurn = game !== null && mySeatIndex !== null && game.active_seat === mySeatIndex;
  // Unfolded whenever the turn changes hands: a new turn is a new thing to
  // look at, whoever it belongs to.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFolded(false);
  }, [turnKey]);




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
   * Asks before a card is thrown away, because it is not thrown away.
   *
   * 5.5 does not destroy what a character puts down: the card stays face up on
   * the Obszar it was dropped on, and 16.8 and 21.3 let the next person through
   * pick it up. So this costs less than using a card and more than it looks —
   * one click under every card in the pack, and a Magiczny Miecz left in the
   * Karczma is a present for whoever walks in.
   *
   * The question says where it will be lying, because that is the part a player
   * is deciding and the button cannot say it.
   */
  /**
   * Leaving, asked in the dialog everything else is asked in.
   *
   * Two answers to one act, which is why the question is here rather than in
   * the button: in the poczekalnia the seat goes with you, and mid-game the
   * Postać stays on the board without a driver for somebody else to take over.
   * The second is the one worth stopping somebody over, and it used to be a
   * sentence squeezed into the bar between a join code and a test-mode switch.
   */
  function askToLeave() {
    const playing = game?.status === "playing" && mySeatIndex !== null;
    setAsk({
      title: "Opuść stół",
      body: playing
        ? "Twoja Postać zostanie w grze, na swoim Obszarze i ze wszystkim, co ma — tyle że bez gracza, dopóki ktoś jej nie przejmie. Ty zostajesz przy stole jako widz."
        : "Twoje miejsce przy stole zniknie. Wrócić można tym samym kodem, dopóki gra się nie zaczęła.",
      confirmLabel: "Opuść stół",
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        void leave();
      },
    });
  }

  function askToDrop(holdingId: string) {
    const seat = seats.find((candidate) => candidate.seat_index === mySeatIndex);
    const held = seat?.holdings.find((candidate) => candidate.id === holdingId);
    if (!held) return;
    const name = CARD_NAMES.get(held.cardId) ?? held.cardId;
    const here = seat?.field_id ? FIELD_NAMES.get(seat.field_id) : null;
    setAsk({
      title: `Odrzuć: ${name}`,
      body: here
        ? `${name} zostanie na Obszarze ${here}, odkryta — kto się tu zatrzyma, może ją wziąć (5.5, 16.8).`
        : `${name} zostanie na Obszarze, odkryta — kto się tu zatrzyma, może ją wziąć (5.5, 16.8).`,
      confirmLabel: "Odrzuć",
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        void askFor(holdingId, () => post("holdings", { action: "drop", holdingId }));
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
  function askToCast(
    holdingId: string,
    cardId: string,
    target: { seatIndex?: number; fieldCardId?: string } = {},
  ) {
    const name = CARD_NAMES.get(cardId) ?? cardId;
    const lying = fieldCards.find((row) => row.id === target.fieldCardId);
    const at =
      target.seatIndex !== undefined
        ? ` na: ${seats.find((seat) => seat.seat_index === target.seatIndex)?.player_name ?? `Miejsce ${target.seatIndex + 1}`}`
        : lying
          ? ` na: ${CARD_NAMES.get(lying.cardId) ?? lying.cardId}`
          : "";
    // Two of them the app carries out, and both of those take cards away for
    // good — so the question says what will actually happen rather than the
    // usual "rozpatrzcie sami", which would be untrue here and is the only
    // sentence standing between a player and a hand they cannot get back.
    const applied = spellScript(cardId)?.applies;
    const what =
      applied === "gasi-zaklecia"
        ? "Ofiara traci wszystkie Zaklęcia — ich Karty idą na stos zużytych (9.6). Zrobi to aplikacja."
        : applied === "zdejmuje-karte"
          ? "Karta znika z planszy i trafia na stos zużytych. Zrobi to aplikacja."
          : "Skutek rozpatrzcie sami.";
    setAsk({
      title: `Rzuć Zaklęcie: ${name}`,
      body:
        `${name}${at}. Karta odchodzi z ręki na stos kart zużytych i cały stół dowiaduje się, ` +
        `co zostało wypowiedziane (12.5). ${what}`,
      confirmLabel: "Rzuć",
      tone: "grave",
      onConfirm: () => {
        setAsk(null);
        post("holdings", {
          action: "cast",
          seatId: seats.find((seat) => seat.seat_index === mySeatIndex)?.id,
          holdingId,
          ...(target.seatIndex !== undefined ? { targetSeat: target.seatIndex } : {}),
          ...(target.fieldCardId !== undefined ? { fieldCardId: target.fieldCardId } : {}),
        });
      },
    });
  }


  /**
   * Everything below, under one provider.
   *
   * `Table` answers with one of five screens and they all quote rule numbers,
   * so `WithRules` has to be able to find the opener from any of them. An IIFE
   * rather than five providers, because five is five chances for the next
   * screen to be the one that forgot.
   */
  // `WithRules` draws plain text when there is nobody to open a rule, so the
  // setting is enforced by withholding the opener rather than by every caller
  // remembering to ask.
  return (
    <OpenRule.Provider value={prefs.ruleRefs ? openRule : null}>{body()}</OpenRule.Provider>
  );

  function body() {
  if (error && !game) {
    return <Centered>{<span className="text-vermilion">{error}</span>}</Centered>;
  }
  if (!game) return <Centered>Wczytuję stół…</Centered>;

  /**
   * Before either door: this browser has been here before.
   *
   * In front of both gates rather than inside one of them, because it is the
   * same question whether the game has started or not — and the answer changes
   * which gate you are even looking at. Watching is unaffected: `wasHere` is
   * only ever set for a window holding no claim at all.
   */
  if (wasHere) {
    return (
      <ReturnGate
        code={game.join_code}
        name={wasHere.name}
        seatIndex={wasHere.seatIndex}
        busy={busy}
        onResume={resumeHere}
        onSomebodyElse={joinAsSomebodyElse}
      />
    );
  }

  const mySeat = seats.find((seat) => seat.seat_index === mySeatIndex);
  /**
   * Whoever is driving a given chair, or nobody.
   *
   * The one thing the browser has to do for itself now that a chair and a
   * person are two rows: the seat carries a `driver_id` and everything about
   * the person is in `users`. Running the table, being ready and having gone
   * quiet are all facts about somebody, and a chair has none of them.
   */
  const driverOf = (seat: Seat | null | undefined) =>
    users.find((one) => one.id === seat?.driver_id) ?? null;
  const amHost = me?.isHost === true;

  /**
   * A chair as the poczekalnia draws it, with this device's own pick laid over.
   *
   * The Karta taken client-first is still the seat's (`taking`), and the flag
   * that used to be reset beside it is not: changing your mind un-readies the
   * *person*, which the server writes and the next poll brings back. Laying a
   * `ready: false` over somebody else's row here would have been this device
   * guessing at a fact about another player.
   */
  const lobbySeat = (seat: Seat) =>
    asLobbySeat(
      taking[seat.id] ? { ...seat, character_id: taking[seat.id] } : seat,
      driverOf(seat),
    );

  // The shared screen in the middle of the table. Whoever's turn it is reaches
  // over and taps it, so it drives the active player rather than sitting idle
  // saying "waiting".
  const isTableScreen = amHost && game.mode === "companion";
  const tableScreenHolder = users.find((one) => one.isHost)?.name ?? null;

  // Whose character is being chosen. Left to the app until somebody says
  // otherwise: this device's own seat first, then — only where the host is
  // choosing on behalf of people with no device — a companion seat still
  // without one. It used to fall through to *any* characterless seat, which is
  // why opening a table could leave you aiming at a stranger's slot.
  const pickingFor =
    picking === "auto"
      ? mySeat && !mySeat.character_id
        ? mySeat
        : amHost && game.mode === "companion"
          ? // A chair with nobody driving it and nothing in it: somebody in the
            // room the host is setting up, which is what `no_device` used to
            // mark and is now simply the absence of a driver.
            (seats.find((seat) => seat.driver_id === null && !seat.character_id) ?? null)
          : null
      : (seats.find((seat) => seat.id === picking) ?? null);

  // Cards in play this turn. A fight keeps the stack it interrupted, so the
  // panel does not empty out mid-combat.
  const active = seats.find((seat) => seat.seat_index === game.active_seat);
  const playing = game.status === "playing";

  /**
   * The windows the turn is open for, for the spell hand (9.6, 17.3).
   *
   * Read off the whole turn state rather than the phase alone: a fight before
   * the dice and a fight after the first one are the same phase and are not
   * the same moment, and neither is a field with a card just turned over.
   */
  // The same reading the server refuses a cast against (9.1), not a second one
  // that agrees with it most of the time.
  const now = game ? momentsIn(game.turn_state) : ["dowolna-chwila" as const];

  const mine = mySeat
    ? {
        ...mySeat,
        holdings: mySeat.holdings.map((held) =>
          held.id in moved ? { ...held, slot: moved[held.id] } : held,
        ),
      }
    : mySeat;
  const others = seats.filter((seat) => seat.id !== mine?.id && seat.character_id);

  /**
   * What this turn is offering, as a short list of windows.
   *
   * The reading of the rules is `windowsFor`'s — 16.4's order, and which of
   * these are not offers at all. What is left here is turning the turn state
   * into the plain facts it asks about.
   */
  const turnState = game.turn_state;
  const turnWindows = active ? windowsFor(factsIn(turnState, active.field_id)) : [];

  /**
   * Whether the turn's own sheet has anything to show.
   *
   * A fight, a direction to choose, the Most, or an Obszar with cards on it —
   * and a field nobody may walk past, which opens it with nothing drawn because
   * the Karczma happens to you the moment you arrive.
   */
  const sheetApplies =
    active !== undefined &&
    active !== null &&
    (turnState.phase === "fight" ||
      turnState.phase === "move" ||
      turnState.phase === "bridge" ||
      (turnState.phase === "field" &&
        (turnState.drawn.length > 0 ||
          compulsoryOffer(active.field_id, turnState.resolved ?? []) !== null)));

  /**
   * Whether anything of the turn is on screen at all.
   *
   * What the FAB is the absence of: while a window is open there is no need for
   * a way back into one, and while none is, there has to be — on a quiet Obszar
   * nothing opens by itself and ending the turn is inside the Obszar's window.
   */
  const turnWindowOpen = (sheetApplies && !folded) || inspecting !== null;
  // Only the "pole" phase has a stack of drawn cards. Narrowed once here for
  // the controls further down that ask how much of the draw is left; what the
  // turn is *offering* is `factsIn`'s reading, not this one.
  const onField = turnState.phase === "field" ? turnState : null;

  const overlays = (
    <>
      {/* Drawn in test mode, and — folded to one line — whenever something has
          broken, which is the one time this surface is any use to somebody who
          is only playing. */}
      {(testing || failure !== null) && (
        <TestConsole
          /**
           * Remounted each time it opens, so it opens at its usual size.
           *
           * How big the console is is a thing you decide *while* using it —
           * shrink it to see the board, throw it wide to read a long answer —
           * and none of that is a preference about the next time. Closing it
           * minimised and finding a one-line strip when you next press the key
           * reads as the console failing to open.
           *
           * A remount rather than a reset, because the state worth keeping is
           * already kept elsewhere: the transcript is written to storage on
           * every line and read back on mount, which is what makes reloading
           * mid-test safe in the first place.
           */
          key={consoleOpen ? "open" : "shut"}
          open={consoleOpen || failure !== null}
          folded={!consoleOpen && failure !== null}
          failure={failure}
          onDismissFailure={() => setFailure(null)}
          table={code}
          busy={busy}
          players={seats
            .filter((seat) => seat.character_id)
            .map((seat) => seat.player_name ?? `Miejsce ${seat.seat_index + 1}`)}
          stage={stageOf(game.status, game.turn_state.phase)}
          onClose={() => {
            setConsoleOpen(false);
            setFailure(null);
          }}
          onRun={runConsole}
        />
      )}
      {/* Above everything: what it reports has already happened, and half of it
          happened while this player was not even looking at their own turn. */}
      <AnnouncementModal
        announcement={announcement}
        onDismiss={() => setAnnouncement(null)}
      >
        {announcement?.kind === "death" && (
          <button
            onClick={() => {
              setAnnouncement(null);
              setReborn(true);
            }}
            className="rounded border border-ochre bg-ochre/10 px-3 py-1 text-[13px] text-ochre transition hover:bg-ochre/20"
          >
            Wybierz nową Postać
          </button>
        )}
      </AnnouncementModal>

      {/* Above everything else it could be asked about, and dismissed by
          clicking away — the safest answer is the one you get by not deciding. */}
      <ConfirmDialog ask={ask} busy={busy} onCancel={() => setAsk(null)} />

      {inspectingCard && (
        <CardDetail card={inspectingCard} onClose={() => setInspectingCard(null)} />
      )}


      {/* Offered, never forced — 4.4 says *może*. Opened from the line on the
          dead character's card and closed back to it.

          A latecomer gets it unasked, because for them it is not an offer:
          they have just sat down and there is nothing else on the screen for
          them to do. Closing it still leaves the line above as the way back.

          Three ways to be sitting here with no Postać in play, and the gate
          used to know two. A death leaves `eliminated` set and the Karta on the
          seat; a latecomer arrives eliminated with no Karta at all. A *withdrawn*
          Postać is neither — `remove` clears `eliminated` on purpose, because a
          chair with nothing standing in it is waiting rather than dead — so its
          player sat there reading "bez postaci" with nothing on screen to press.

          `status` is asked outright because `eliminated` had been answering it
          by accident: it is never set in the poczekalnia, so testing it also
          meant "the game is running" without saying so. Asking the real
          question instead — has this seat a Postać? — was true of every seat in
          a lobby that has not started, and this opened over the lobby's own
          picker to announce that the game was already under way. Two conditions
          because there are two: the game is running, and this chair is empty. */}
      {game.status === "playing" &&
        mySeat &&
        (mySeat.eliminated || !mySeat.character_id) &&
        // Asked for, or opened unasked and not yet waved away. Watching the
        // rest of the game is a real answer for a latecomer too — they came to
        // a table already running and may want to see it before choosing — and
        // the panel on the right is the way back in whenever they do.
        (reborn || (!mySeat.character_id && !pickerWavedOff)) && (
        <RebornModal
          characters={CHARACTERS}
          /**
           * Everything nobody may take: what is being played, and what 4.4 put
           * aside.
           *
           * The second half used to be missing, so the picker offered a Postać
           * that had died or been withdrawn for good and the server refused it
           * on the way in. Being told no *after* choosing is worse than not
           * being offered — and the list is on the games row already, so the
           * client had it all along and was not looking.
           */
          taken={
            new Set([
              ...(seats.map((seat) => seat.character_id).filter(Boolean) as string[]),
              ...(game.characters_out ?? []),
            ])
          }
          arriving={!mySeat.character_id}
          busy={busy}
          onConfirm={(characterId) => {
            setReborn(false);
            setPickerWavedOff(false);
            post("character", { again: true, seatId: mySeat.id, characterId });
          }}
          onClose={() => {
            setReborn(false);
            setPickerWavedOff(true);
          }}
        />
      )}

      {/* The turn, put aside — and the way back into it. Everybody's, all
          turn long.

          It was the actor's only, and a watcher got the sheet's own folded
          line instead. Two controls for one idea, and both of them conditional
          on a sheet being open: on a quiet Obszar — somebody deciding whether
          to end their turn — the rest of the table had nothing at the foot of
          the screen and no way in to look. Whose turn it is changes the words
          here; what may be pressed is decided inside the window, where the
          rules for it already live. */}
      {active && !turnWindowOpen && (
        <TurnFab
          mine={myTurn}
          playerName={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
          seatIndex={active.seat_index}
          owed={owedLabel(
            turnWindows,
            game.turn_state.phase === "fight" ? game.turn_state.fight.cardName : null,
          )}
          onOpen={() => {
            // Back to whatever the turn is on: the sheet if it is a fight or a
            // card, and the Obszar otherwise — which for the player being asked
            // is where the turn is ended, and for everybody else is where they
            // can see what it is being ended on.
            setFolded(false);
            if (!turnWindows.some((window) => window.compulsory)) setInspecting(active.field_id);
          }}
        />
      )}

      {/* The card you just turned over, at a size you can read, with exactly
          the things this card lets you do under it. */}
      {active && sheetApplies && (
          <DrawModal
            // Everybody at the table watches. A fight is the moment the game
            // is most worth looking at, and it used to happen entirely inside
            // one person's browser while the rest read about it afterwards in
            // the journal. Only the player whose turn it is can press anything.
            who={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
            canAct={mySeatIndex === active.seat_index || isTableScreen}
            minimized={folded}
            onMinimize={() => setFolded(true)}
            cards={game.turn_state.phase === "field" ? game.turn_state.drawn : []}
            resolved={
              game.turn_state.phase === "field"
                ? [...(game.turn_state.resolved ?? []), ...waved]
                : []
            }
            fought={game.turn_state.phase === "field" ? (game.turn_state.fought ?? []) : []}
            fight={game.turn_state.phase === "fight" ? game.turn_state.fight : null}
            // The direction choice, which used to be a panel of its own below
            // the queue. It is the same shape as everything else in here: one
            // thing you are asked to do, with the table watching.
            move={
              game.turn_state.phase === "move"
                ? { roll: game.turn_state.roll, options: game.turn_state.options }
                : null
            }
            bridge={game.turn_state.phase === "bridge" ? game.turn_state.bridge : null}
            fieldOffer={
              game.turn_state.phase === "field" ? compulsoryOffer(active.field_id, game.turn_state.resolved ?? []) : null
            }
            simulated={game.mode === "simulation"}
            /**
             * Your own hand, beside whatever is happening — which in a fight is
             * somebody else's turn as often as your own.
             *
             * 9.3 keeps these from every other device and the server never
             * sends them there; this is the one seat they belong to.
             */
            spells={
              mine
                ? mine.holdings
                    .filter((held) => held.kind === "spell" && isSpellId(held.cardId))
                    .map((held) => ({
                      holdingId: held.id,
                      cardId: held.cardId as SpellId,
                      granted: held.granted,
                    }))
                : []
            }
            moment={now}
            opponents={others.map((seat) => ({
              seatIndex: seat.seat_index,
              name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
            }))}
            floor={
              game.turn_state.phase === "fight"
                ? (game.turn_state.fight.caster ?? null)
                : null
            }
            mySeatIndex={mySeatIndex}
            seatName={(index) =>
              seats.find((seat) => seat.seat_index === index)?.player_name ??
              `Miejsce ${index + 1}`
            }
            onClaimFloor={() => post("turn", { action: "spell-claim" })}
            onReleaseFloor={() => post("turn", { action: "spell-release" })}
            /**
             * Spoken on the press, with no second question.
             *
             * Everywhere else a Zaklęcie is confirmed before it leaves the
             * hand, because 9.6 spends the card whatever comes of it. Here the
             * confirming already happened: asking for the floor is the
             * declaration, and it cost the half-minute. Asking again ran
             * the clock out inside the dialog — you claimed, read the question,
             * pressed yes, and were told to claim first.
             */
            onCastSpell={(holdingId, target) =>
              post("holdings", {
                action: "cast",
                seatId: mine?.id,
                holdingId,
                ...(target.seatIndex === undefined ? {} : { targetSeat: target.seatIndex }),
                ...(target.fieldCardId === undefined ? {} : { fieldCardId: target.fieldCardId }),
              })
            }
            onInspect={setInspectingCard}
            /* 17.6: in a duel the escape is the attacked character's, so the
               button goes to their device rather than the attacker's. The
               shared screen keeps it too, since in companion mode it is the
               device the whole table is pressing. */
            myEscape={
              game.turn_state.phase === "fight" &&
              game.turn_state.fight.opponentSeat !== undefined &&
              (isTableScreen || game.turn_state.fight.opponentSeat === mySeatIndex)
            }
            ring={ringFields(active.field_id)}
            /* 1.5's fight total, for the Sobowtór, whose Miecz is whoever is
               opposite him and is therefore not on his Karta. */
            mySword={active.sword_in_fight}
            busy={busy}
            error={error}
            onAction={(body) => post("turn", body)}
            onResolve={(cardId, decisions) =>
              post("turn", { action: "karta-efekt", cardId, ...decisions })
            }
            onResolveField={(choices) => {
              const offer = compulsoryOffer(
                active.field_id,
                game.turn_state.phase === "field" ? (game.turn_state.resolved ?? []) : [],
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
          eqMode={game.eq_mode === "slots" ? "slots" : "classic"}
          nature={asNature(mySeat?.nature)}
          fieldId={inspecting}
          cards={fieldCards
            .filter((card) => card.fieldId === inspecting)
            .map((card) => ({ id: card.id, cardId: card.cardId }))}
          standingHere={mySeat?.field_id === inspecting}
          canAct={mySeat?.seat_index === game?.active_seat}
          // Ending the turn lives in this window now, not in the box in the
          // corner: a turn is read in one place and should be finished there.
          canEnd={
            !!active &&
            game.turn_state.phase !== "fight" &&
            mayEndTurn({ fieldId: active.field_id, done: [], phase: game.turn_state.phase })
          }
          whyNotEnd={
            active
              ? whyCannotEnd(
                  dutiesBeforeEnding({
                    fieldId: active.field_id,
                    done: [],
                    phase: game.turn_state.phase,
                  }),
                )
              : null
          }
          onEnd={() => {
            setInspecting(null);
            void post("turn", { action: "end" });
          }}
          busy={busy}
          asked={asked}
          onTake={(fieldCardId) =>
            void askFor(fieldCardId, () => post("holdings", { action: "take-field", fieldCardId }))
          }
          onInspect={(cardId) =>
            setInspectingCard({
              cardId,
              name: CARD_NAMES.get(cardId) ?? cardId,
              text: CARD_TEXTS.get(cardId),
            })
          }
          // Everything the Obszar can be *done* about, which used to live in a
          // panel down the page. Only passed for the field the active character
          // is standing on: reading about somewhere else is the other half of
          // what this window is for, and none of these belong there.
          {...(active && inspecting === active.field_id
            ? {
                phase: turnState.phase,
                simulated: game.mode === "simulation",
                typedRolls: game.mode !== "simulation",
                onAction: (body: Record<string, unknown>) => post("turn", body),
                // The wyprawa, built out here where the other seats and
                // everything lying on the board are. One of `targetSeatId` and
                // `raidFieldCardId` and never both — the route reads whichever
                // is set, and a body carrying two would silently be a raid on
                // the Postać.
                // The Księżniczka and the Władca, where each is worth
                // something. Built here because it reads the seat's own hand.
                friend: (
                  <FriendOffer
                    seat={active}
                    fieldId={inspecting}
                    busy={busy}
                    onHeal={(points) => post("turn", { action: "friend-heal", points })}
                    onPart={(holdingId) => post("turn", { action: "friend-part", holdingId })}
                  />
                ),
                raid: (
                  <RaidOffer
                    seat={active}
                    seats={seats}
                    fieldCards={fieldCards}
                    busy={busy}
                    onRaid={(target) =>
                      post("turn", {
                        action: "raid",
                        ...(target.kind === "seat"
                          ? { targetSeatId: target.id }
                          : { raidFieldCardId: target.id }),
                      })
                    }
                  />
                ),
                onSuggestion: (stat: string, delta: number, reason: string) =>
                  post("adjust", { seatId: active.id, stat, delta, reason }),
                onService: (body: Record<string, unknown>) =>
                  post("holdings", { ...body, seatId: active.id }),
                purse: { gold: active.gold, life: active.life },
                stock,
                sellable: active.holdings
                  .filter((holding) => holding.kind === "item")
                  .map((holding) => ({ id: holding.id, cardId: holding.cardId })),
              }
            : {})}
          notice={error ? null : notice}
          onClose={() => {
            setInspecting(null);
            setNotice(null);
          }}
        />
      )}
    </>
  );

  /**
   * Księga Tolimana, built once and opened from either surface.
   *
   * It used to be constructed inside the playing branch, which is why the
   * lobby's own "Księga Tolimana" did nothing at all: the button set
   * `leftDrawer` and nothing in the poczekalnia read it. Every card in the box
   * is exactly as worth reading while you are choosing a Postać as it is
   * mid-game — more so, since choosing is the one moment you are comparing
   * twenty-seven of them — so it is the same drawer rather than a second one.
   */
  const library =
    leftDrawer === "ksiega" ? (
      <CardLibrary
        key={rule ? `rule-${rule.nth}` : "cards"}
        openRule={rule?.id ?? null}
        openShelf={rule?.shelf ?? null}
        endlessStock={game.endless_stock}
        eqMode={game.eq_mode === "slots" ? "slots" : "classic"}
        nature={asNature(mySeat?.nature)}
        onInspect={setInspectingCard}
        // "walcz" and the Obszary chips became `fight` and `go` in the console;
        // taking a card stayed, because this shelf is where somebody already is
        // when they want one, with the picture in front of them.
        {...(testing && mySeatIndex !== null
          ? { onGrant: (cardId: string) => post("debug", { action: "grant", cardId }) }
          : {})}
        onClose={closeDrawer}
      />
    ) : null;

  if (!playing) {
    // No name, no seat, no lobby. Everyone joins on their own device, so a
    // visitor standing in the lobby without a seat was never a state worth
    // having — it just deferred the one question the table needs answered.
    if (mySeatIndex === null) {
      return (
        <>
          <Toasts notices={notices} onDismiss={dismissNotice} />
          <JoinGate
            code={game.join_code}
            seats={seats.map((seat) => lobbySeat(seat))}
            busy={busy}
            onJoin={join}
            notice={
              elsewhere ? (
                <SecondTabNotice busy={busy} onSomebodyElse={joinAsSomebodyElse} />
              ) : null
            }
          />
        </>
      );
    }

    return (
      <>
        {overlays}
        <Toasts notices={notices} onDismiss={dismissNotice} />
        <Lobby
          code={game.join_code}
          mode={game.mode}
          seats={seats.map((seat) => lobbySeat(seat))}
          users={users}
          mySeatIndex={mySeatIndex}
          /* The same feed the table gets, in the room where the lines about
             arriving and sitting down are actually written. */
          journal={<Journal code={code} revision={game.revision} covers="kolumnę" />}
          /* The house rules, where the table can talk about them. Each switch
             posts only the setting it moved — see the route. */
          settings={
            // The host's, and only the host's: one of these cannot be taken
            // back, and a one-way switch six people can reach is one that gets
            // pressed by whoever misreads it first. Everybody else sees what
            // the table has settled on, which is the part that matters to them.
            <TableSettings
              eqMode={game.eq_mode === "classic" ? "classic" : "slots"}
              endlessStock={game.endless_stock}
              started={game.status === "playing"}
              canChange={amHost}
              onExplain={() => openAt("wariant", null)}
              onEqMode={(eqMode) => setHouseRule({ eq_mode: eqMode })}
              onEndlessStock={(on) => setHouseRule({ endless_stock: on })}
              /* Absent until the engine half lands, which is what keeps the
                 group off the panel rather than on it and refused. */
              trophyMode={game.trophy_mode}
              onTrophyMode={(mode) => setHouseRule({ trophy_mode: mode })}
            />
          }
          characters={CHARACTERS}
          pickingFor={pickingFor ? lobbySeat(pickingFor) : null}
          busy={busy}
          onAddLocal={addLocalPlayer}
          onPickFor={(seat) => setPicking(seat ? seat.id : null)}
          pendingCharacterId={pendingCharacter}
          onChooseCharacter={async (seat, characterId) => {
            await chooseCharacter(seat.id, characterId);
            setPicking("auto");
          }}
          // Both of these act on a person. They sent `seatId`, which neither
          // route reads — and neither failed, because both fall back to the
          // caller when nobody is named. The same bug as the roster's pair, in
          // a second place, found by the contract rather than by looking.
          onRemove={(seat) => seat.driverId && post("leave", { userId: seat.driverId })}
          onMakeHost={(seat) => seat.driverId && post("host", { userId: seat.driverId })}
          onReady={(ready) => post("seat", { ready })}
          onRename={(name) => post("seat", { name })}
          onLeave={askToLeave}
          onDeal={() => post("character", { deal: true })}
          isHost={amHost}
          // The host is somebody, so "gone" is something they are rather than
          // something their chair is: no host at all, or one who has gone quiet.
          hostAway={!users.some((one) => one.isHost && !one.away)}
          onStart={() => post("start", {})}
          onLibrary={() => toggleDrawer("ksiega")}
          library={library}
        />
      </>
    );
  }

  // Somebody who opened a game already in progress. They cannot join — the
  // characters were dealt at setup — but they can pick up one nobody is behind,
  // which is exactly what the app does with a player who leaves or closes their
  // tab. Offered up front rather than buried in a card somebody has to expand.
  if (mySeatIndex === null && !watching) {
    // A Postać standing there with nobody behind it, or with somebody who has
    // gone quiet. Both are pickable — the people in the room settle which —
    // and the difference between them is worth saying out loud, because one is
    // a decision somebody made and the other is a phone that went to sleep.
    const free = seats
      .filter((seat) => seat.character_id && !seat.eliminated)
      .filter((seat) => seat.driver_id === null || seat.away)
      .map((seat) => ({
        seatId: seat.id,
        playerName: seat.player_name,
        characterName:
          CHARACTERS.find((character) => character.id === seat.character_id)?.name ?? "?",
        why: seat.driver_id === null ? "nikt nią nie gra" : "gracz się rozłączył",
      }));
    return (
      <>
        <Toasts notices={notices} onDismiss={dismissNotice} />
        <TakeOverGate
          code={game.join_code}
          free={free}
          taken={seats.filter((seat) => seat.character_id && !seat.eliminated).length}
          // 2-6 players, and every seat that exists is somebody's — so room is
          // simply whether a seventh would fit.
          room={seats.length < MAX_SEATS}
          busy={busy}
          onTakeOver={claimSeat}
          onJoin={(name) => join(name ?? "")}
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

  return (
    <>
      {overlays}
      <TableLayout
        drawer={
          <>
            {library}
            {leftDrawer === "stosy" && game.deckCounts && game.used ? (
              <PilesDrawer
                counts={game.deckCounts}
                used={game.used}
                printed={{ events: PRINTED_EVENTS, spells: PRINTED_SPELLS }}
                backs={{
                  events: "/cards/back-zdarzenie.jpg",
                  spells: "/cards/back-zaklecie.jpg",
                }}
                nameOf={cardOfRef}
                stock={stock}
                onInspect={setInspectingCard}
                onClose={closeDrawer}
              />
            ) : null}
            {rightDrawer === "ustawienia" ? (
              <Settings
                onClose={() => setRightDrawer(null)}
                eqMode={game.eq_mode === "slots" ? "slots" : "classic"}
                endlessStock={game.endless_stock}
                /**
                 * Asked before it is done, because it cannot be undone. The
                 * question says what changes and what does not: the two relics
                 * the endgame stands on stay scarce either way, which is the
                 * part somebody agreeing to this most needs to hear.
                 */
                onEndlessStock={() =>
                  setAsk({
                    title: "Zwykłego Wyposażenia nie brakuje",
                    body: "Zwykłego Wyposażenia — Miecza, Hełmu, Sztyletu, Zbroi i Tarczy — przestanie brakować do końca tej gry. Jeden wyjątek zostaje: Magicznych Mieczy i Tarcz Tolimana dalej są po cztery na cały stół, bo bez nich nie ma wejścia na Most ani do Zamku. Tego się już nie cofa — do skończonego stosu wraca się tylko przy nowym stole.",
                    confirmLabel: "Włącz na stałe",
                    tone: "grave",
                    onConfirm: () => {
                      setAsk(null);
                      post("holdings", { action: "endless-stock", on: true });
                    },
                  })
                }
              />
            ) : null}
            {rightDrawer === "gracze" ? (
            <PlayersDrawer
              // Every seat, in seat order, this one included — see the note on the
              // component about why the roster it replaces left you out.
              seats={[...seats]
                .sort((a, b) => a.seat_index - b.seat_index)
                .map((seat) => asPublicSeat(seat, driverOf(seat)))}
              openSeatId={askedAbout}
              // Remounted per seat, so a drawer opened about somebody opens on
              // them even if it was already open about somebody else.
              key={askedAbout ?? "gracze"}
              characters={CHARACTERS}
              activeSeatIndex={game.active_seat}
              mySeatId={mySeat?.id ?? null}
              amHost={amHost}
              room={seats.length < MAX_SEATS}
              busy={busy}
              onClose={() => setRightDrawer(null)}
              onInspect={setInspectingCard}
              onClaim={mySeatIndex === null ? claimSeat : undefined}
              /**
               * Both of these name a *person*, not a chair.
               *
               * They used to send `seatId`, which the routes stopped reading
               * when the split landed — and neither failed. `leave` and `host`
               * both fall back to the caller when nobody is named, so pressing
               * "usuń gracza" on somebody else kicked *you*, and passing the
               * host role handed it to yourself. Nothing in the type system
               * covers the shape of a JSON body, so both compiled and both ran.
               *
               * A chair with nobody in it has no `driver_id`, and there is
               * nobody to do either of these to — see `PlayerControls`, which
               * hides them rather than sending null.
               */
              onKick={
                amHost
                  ? (seat) =>
                      seat.driverId && post("leave", { userId: seat.driverId })
                  : undefined
              }
              onPassHost={
                amHost
                  ? (seat) =>
                      seat.driverId && post("host", { userId: seat.driverId })
                  : undefined
              }
              onWithdraw={
                amHost ? (seat, hard) => post("withdraw", { seatId: seat.id, hard }) : undefined
              }
              onJoin={
                mySeatIndex === null
                  ? () => {
                      setRightDrawer(null);
                      join("");
                    }
                  : undefined
              }
            />
            ) : null}
          </>
        }
        header={
          <>
            {/* Centred, not on the baseline. Baseline is right for a row of
                words and wrong the moment a glyph joins it: an SVG has no
                baseline of its own, so the browser sits it on the bottom edge
                of its box and the Księga rode 2.5px high of the title while the
                deck counts sat 1.25px low. The other half of this bar has been
                `items-center` all along, which is why only this end looked
                unsettled. */}
            <div className="flex items-center gap-3">
              <h1 className="font-[family-name:var(--font-display)] text-lg text-ochre">
                Magiczny Miecz
              </h1>
              {/* Both openers for this side, together: the Księga and the
                  piles are the two things you consult rather than play, and
                  they take turns over the board because only one drawer opens
                  down a side at a time. */}
              <BarButton
                glyph="book"
                label="Księga Tolimana"
                active={leftDrawer === "ksiega"}
                onClick={() => toggleDrawer("ksiega")}
                title="Księga Tolimana — każda Karta, każdy Obszar i cała Instrukcja (K)"
              />
              {/* Both piles, beside the turn they are being drawn into. At a
                  physical table the stacks sit on the table and everybody
                  watches them thin; in simulation they were invisible, so a
                  deck about to turn over (9.5) did it with no warning and no
                  trace. The number after the slash is the stos zużytych — what
                  a reshuffle will bring back. */}
              {game.deckCounts && (
                <button
                  onClick={() => toggleDrawer("stosy")}
                  title="Stosy — co zostało w taliach (S)"
                  className="flex items-baseline gap-3 text-[11px] text-muted/70 transition hover:text-ink"
                >
                  <span title="Karty Zdarzeń: w talii / na stosie zużytych">
                    Zdarzenia{" "}
                    <span className="tnum text-ink/70">
                      {game.deckCounts.events.draw}
                      <span className="text-muted/50">/{game.deckCounts.events.discard}</span>
                    </span>
                  </span>
                  <span title="Karty Zaklęć: w stosie / na stosie zużytych (9.5)">
                    Zaklęcia{" "}
                    <span className="tnum text-magia/80">
                      {game.deckCounts.spells.draw}
                      <span className="text-muted/50">/{game.deckCounts.spells.discard}</span>
                    </span>
                  </span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              {/* Whose turn it is, beside who is here and where "here" is. It
                  used to sit under the title on the far side of the bar, a
                  screen-width away from the roster that answers the next
                  question you have after reading it. */}
              <span className="text-muted">
                Tura <span className="tnum text-ink/70">{game.turn}</span> ·{" "}
                {active ? (active.player_name ?? "—") : "—"}
              </span>
              <span className="tnum tracking-[0.2em] text-muted">{game.join_code}</span>
              {/* Loud on purpose while it is on. Everything it unlocks writes a
                  manual override into the journal, and a switch you can forget
                  you flipped is how a tested game gets mistaken for a played
                  one. */}
              {TESTING_POSSIBLE && (
                <button
                  onClick={() => setTestMode(!testMode)}
                  aria-pressed={testMode}
                  title={
                    testMode
                      ? "Tryb testowy jest włączony — konsola pod ` (~ wyłącza)"
                      : "Włącz tryb testowy — konsola pod ` (~ włącza)"
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
              {testing && (
                <BarButton
                  glyph="prompt"
                  active={consoleOpen}
                  tone={{ rest: "text-vermilion/80", hover: "hover:text-vermilion" }}
                  onClick={() => setConsoleOpen((was) => !was)}
                  title="Konsola testowa (`)"
                />
              )}
              {/* The three doors together at the end of the row, in the order
                  you are least likely to want them: who is here, how it is set,
                  and the way out. They were scattered among the counters, so
                  "Opuść stół" sat beside the console with the code between it
                  and everything else it belongs with. */}
              <BarButton
                glyph="people"
                active={rightDrawer === "gracze"}
                tally={`${seats.length}/${MAX_SEATS}`}
                onClick={() => setRightDrawer((out) => (out === "gracze" ? null : "gracze"))}
                title="Gracze — kto siedzi przy stole (G)"
              />
              <BarButton
                glyph="gear"
                active={rightDrawer === "ustawienia"}
                onClick={() =>
                  setRightDrawer((out) => (out === "ustawienia" ? null : "ustawienia"))
                }
                title="Ustawienia — numery zasad, tryb ekwipunku"
              />
              {mySeatIndex !== null && (
                <LeaveButton onLeave={askToLeave} />
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
              game.turn_state.phase === "move"
                ? game.turn_state.options.map((option) => option.fieldId)
                : []
            }
            onPick={(fieldId) => setInspecting(fieldId)}
          />
            </div>
            <Journal
              code={code}
              revision={game.revision}
              eqMode={game.eq_mode === "slots" ? "slots" : "classic"}
            />
          </div>
        }
        right={
          <div className="flex flex-col gap-3">
            {/* First thing in the column, above everything a player acts on.
                Two questions side by side: "now" on the left, in a box that
                never changes size, and "when" to the right of it — the queue
                gives up the width, since it already scrolls. */}
            <div className="flex items-stretch gap-3">
              {active && (
                <NowBox
                  playerName={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
                  seatIndex={active.seat_index}
                  onPlayer={() => {
                    setAskedAbout(active.id);
                    setRightDrawer("gracze");
                  }}
                  characterId={active.character_id}
                  characterName={
                    CHARACTERS.find((one) => one.id === active.character_id)?.name ?? null
                  }
                  isMine={
                    (mySeatIndex !== null && active.seat_index === mySeatIndex) || isTableScreen
                  }
                  fieldName={
                    active.field_id ? (FIELD_NAMES.get(active.field_id) ?? active.field_id) : "—"
                  }
                  fieldId={active.field_id}
                  windows={turnWindows}
                  steps={turnSteps(turnState.phase)}
                  // Who we are waiting for, and since when. The revision is
                  // "since when" already: everything that happens bumps it.
                  away={active.away}
                  since={game.revision}
                  canRoll={game.turn_state.phase === "roll"}
                  onRoll={() => post("turn", { action: "roll" })}
                  // 13.4: what is already lying here counts against the number
                  // the field asks for, which is why a silted-up Obszar draws
                  // nothing and the button is not there.
                  canDraw={onField !== null && onField.draw - onField.drawn.length > 0}
                  onDraw={() => post("turn", { action: "draw" })}
                  busy={busy}
                  onOpen={(id) => {
                    // The two the draw modal already owns open themselves; the
                    // rest are the Obszar, which is one window with the field's
                    // own actions in it.
                    if (id === "walka" || id === "karty") return setFolded(false);
                    setInspecting(active.field_id);
                  }}
                />
              )}
              {/**
               * Nobody is playing, and the way out of that.
               *
               * `active_seat` is null when the last pass found no seat that
               * could take a turn — every remaining character owing one under
               * 16.1 does it, and the Burza Siedmiu Słońc causes it outright by
               * costing the whole Krąg a turn at once. Nothing on screen said
               * so: the box that names whose turn it is simply was not drawn,
               * and every control is gated on being the active seat, so the
               * table looked finished.
               *
               * `permission.ts` has allowed anybody to send `end` in this state
               * since it was written — this is the control that sends it. One
               * pass spends a turn from everybody it skips, so pressing it
               * enough times always reaches somebody; Kamień comes back on its
               * own as the counter moves (20.1), which is why the line names
               * both.
               *
               * Offered to a player and not to a watcher, because the route
               * refuses a seatless actor a line above `mayAct` — a button that
               * always answers „Nie prowadzisz żadnej Postaci" is worse than no
               * button.
               */}
              {!active && mySeatIndex !== null && (
                // The NowBox's own box, at its own size: this stands exactly
                // where whose-turn-it-is would, and a narrower one would move
                // the queue beside it every time the table stopped.
                <section className="flex min-h-[180px] w-[270px] shrink-0 flex-col justify-center gap-2 rounded-lg border border-edge bg-panel p-3">
                  <p className="text-[11px] uppercase tracking-widest text-muted">Teraz</p>
                  <p className="text-sm text-ink">
                    {/* „Zwykle", because the box cannot see which of the two it
                        is — and because the honest reading of a table with
                        nobody in it is that something has gone quiet, not that
                        a particular rule fired. */}
                    <Rules>
                      Nikt nie ma teraz tury — zwykle dlatego, że wszyscy tracą turę albo
                      są w Kamieniu (16.1, 20.1).
                    </Rules>
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => void post("turn", { action: "end" })}
                    className="self-start rounded border border-ochre px-3 py-1 text-[13px] text-ochre transition hover:bg-ochre/10 disabled:opacity-40"
                  >
                    Przekaż turę dalej
                  </button>
                </section>
              )}
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
                /**
                 * The roster, opened on that seat — the same place the name in
                 * the NowBox goes.
                 *
                 * It used to open the Karta Postaci, on the reasoning that
                 * every other picture of a Postać does. But a chip in this bar
                 * is not a picture of a card: it carries a player's name, their
                 * seat colour, and the reason they are being passed over, and
                 * the question it raises is "who is that and what have they
                 * got" — which is the roster's question, not the Karta's. The
                 * Karta is one more click from there, on the seat's own tile.
                 */
                onPick={(seatIndex) => {
                  const row = seats.find((one) => one.seat_index === seatIndex);
                  if (!row) return;
                  setAskedAbout(row.id);
                  setRightDrawer("gracze");
                }}
              />
            </div>
            {/* The refusal used to sit here, in the column, and shove the
                Karta Postaci down the page on every mis-click. It is a remark
                about what you just tried, so it goes to the rail in the corner
                with the others. */}
            <Toasts notices={notices} onDismiss={dismissNotice} />
            {/* The notice is gone from here.

                It said what the app had just decided — "ELIKSIR SIŁY: +2
                Miecza" — in the gap between the turn queue and the Karta,
                whenever no window was open to say it in. Which was the
                admission: it belonged where the thing was done, and it only
                appeared here because nothing else was.

                It was also the same fact twice. The call that answered with it
                wrote the journal row on the way, so "Michał używa: ELIKSIR
                SIŁY" is in the feed either way, and the feed is what a table
                argues over two turns later. What is lost is proximity, and the
                place to give that back is the window the button was in — not a
                line of text behind everything. */}

            {/* Companion's own line — who is driving the table, and the offer
                to take it over — which cannot appear while COMPANION_PARKED
                keeps every new table in simulation. Kept rather than deleted,
                like the rest of that mode: one boolean brings it back. */}
            {COMPANION_LINE && game.mode === "companion" && mySeatIndex !== null && (
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
            {/* The turn panel is gone. Everything it drew has a home: the roll
                and the draw are buttons in the box, the direction and the Most
                are decisions and open the action window, the Obszar's own
                business is in its window, and a fight was always in the
                window. What was left was a bordered rectangle with nothing in
                it. */}


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
                // settled the other way — nothing is entered by hand — and a
                // tester who needs a number moved says `gold +5` rather than
                // finding a ± under every parameter for the rest of time.
                canCorrect={game.mode !== "simulation"}
                isMine
                slotted={game.eq_mode === "slots"}
                onAdjust={(stat, delta) => post("adjust", { seatId: mine.id, stat, delta })}
                onDrop={askToDrop}
                asked={asked}
                onEquip={equip}
                /* A list, not a count.
                   
                   It was a count, and the engine resolved it to the cheapest
                   Karty — right while the buttons were the only way to choose.
                   A player can pick the set by hand now, and a hand-made set is
                   often not the one `offersFor` would have found, so sending
                   the count would quietly trade something else. The list is
                   what was on screen. */
                onTrade={(cardIds, deal) =>
                  setAsk({
                    title: "Wymiana trofeów",
                    /* The waste is why this asks at all. Everything else here
                       is reversible or free; points over a multiple of seven
                       are gone, and 1.4 says so in a subordinate clause that is
                       easy to read past. */
                    body:
                      `Oddasz ${cardIds.length} ${plural(cardIds.length, "trofeum", "trofea", "trofeów")} ` +
                      `warte ${deal.points} pkt i zyskasz ${deal.swords} ` +
                      `${plural(deal.swords, "punkt", "punkty", "punktów")} Miecza.` +
                      (deal.wasted > 0
                        ? ` ${deal.wasted} ${plural(deal.wasted, "punkt", "punkty", "punktów")} ` +
                          `${plural(deal.wasted, "przepadnie", "przepadną", "przepadnie")} — tego nie da się odzyskać.`
                        : " Nic nie przepadnie."),
                    confirmLabel: "Wymień",
                    tone: deal.wasted > 0 ? "grave" : "normal",
                    onConfirm: () => {
                      setAsk(null);
                      void post("holdings", {
                        action: "trade",
                        seatId: mine.id,
                        cardIds: [...cardIds],
                      });
                    },
                  })
                }
                trophyMode={game.trophy_mode === "cards" ? "cards" : "points"}
                onUse={askToUse}
                onWand={() => post("holdings", { action: "wand-spell", seatId: mine.id })}
                onReorder={(holdingIds) =>
                  post("holdings", { action: "order", seatId: mine.id, holdingIds })
                }
                onInspect={setInspectingCard}
                /* Under the pack, in the same card and the same idiom: the
                   pack says what 5.4 allows and this says what 2.6 does, and
                   they are the two limits on what one player is holding. */
                spells={
                  <SpellHand
                    frame="section"
                    capacity={mine.spell_capacity}
                    spells={mine.holdings
                      // Both halves matter: the server says which holdings are
                      // Zaklęcia, and `isSpellId` is what turns that claim into
                      // a card the spell hand can actually look up.
                      .filter((held) => held.kind === "spell" && isSpellId(held.cardId))
                      .map((held) => ({
                      holdingId: held.id,
                      cardId: held.cardId as SpellId,
                      granted: held.granted,
                    }))}
                    moment={now}
                    opponents={others.map((seat) => ({
                      seatIndex: seat.seat_index,
                      name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
                    }))}
                    busy={busy}
                    onInspect={setInspectingCard}
                    boardCards={fieldCards.map((row) => ({
                      id: row.id,
                      name: CARD_NAMES.get(row.cardId) ?? row.cardId,
                      where: FIELD_NAMES.get(row.fieldId) ?? row.fieldId,
                    }))}
                    onCast={(holdingId, target) => {
                      const held = mine.holdings.find((card) => card.id === holdingId);
                      if (held) askToCast(holdingId, held.cardId, target);
                    }}
                    /* The same write the pack's arranging goes through:
                       `reorderPack` numbers whatever holdings it is given and
                       never asked whether they were Przedmioty. */
                    onReorder={(holdingIds) =>
                      post("holdings", { action: "order", seatId: mine.id, holdingIds })
                    }
                  />
                }
              />
            )}

            {/* 4.4: death ends a character, not a player's evening — but the
                rule says *może*, so choosing again is offered rather than
                demanded. Dismissing the modal leaves this line, which is the
                way back into it whenever they want. */}
            {/* The same three ways of sitting with no Postać the picker gate
                knows about, and for the same reason: `remove` clears
                `eliminated` on purpose — a chair with nothing standing in it is
                waiting rather than dead — so a withdrawn player was offered
                nothing here at all. This is the way back into the picker for
                every one of them, and now that it can be waved away it is the
                only way back. */}
            {mine && (mine.eliminated || !mine.character_id) && (
              <section className="mt-3 rounded-lg border border-vermilion/50 bg-vermilion/5 p-3">
                <h3 className="mb-1 font-[family-name:var(--font-display)] text-sm text-vermilion">
                  {mine.character_id ? "Twoja Postać zginęła" : "Dosiadasz się do stołu"}
                </h3>
                {/* The same box for the two ways of sitting here without a
                    Postać in play — see `takeNewCharacter`. A latecomer is out
                    of the round until they pick one, which is the same state a
                    death leaves behind and the same way out of it. */}
                <p className="mb-2 text-[11px] leading-relaxed text-muted">
                  <Rules>
                  {mine.character_id
                    ? "Jesteś poza kolejnością tur i oglądasz grę. Możesz wrócić nową Postacią, kiedy zechcesz (4.4)."
                    : "Wybierz Postać, a wejdziesz do gry od jej Miejsca Gracza. Do tego czasu tury cię omijają."}
                  </Rules>
                </p>
                <button
                  disabled={busy}
                  onClick={() => setReborn(true)}
                  className="rounded border border-ochre/60 px-3 py-1 text-xs text-ochre transition hover:bg-ochre/10 disabled:opacity-40"
                >
                  {mine.character_id ? "Wybierz nową Postać" : "Wybierz Postać"}
                </button>
              </section>
            )}

            {/* The roster is in the drawer, and the bar is the way to it —
                "Gracze 4" up there opens the same panel, counts the same seats
                and stays reachable while a fight is open. A second door at the
                bottom of the column said the same thing twice and was the one
                the "Twoja tura" button kept landing on. */}
          </div>
        }
      />
    </>
  );
  }
}

/**
 * A chair and whoever is in it, folded into the one thing the poczekalnia draws.
 *
 * The driver is passed in rather than looked up, because this is a pure
 * function of two rows and the lookup is the caller's — which is also the whole
 * of what changed: four of these fields used to be columns on the seat, and
 * every one of them is a fact about a person.
 */
function asLobbySeat(seat: Seat, driver: Person | null): LobbySeat {
  return {
    id: seat.id,
    seatIndex: seat.seat_index,
    playerName: driver?.name ?? seat.player_name,
    characterId: seat.character_id,
    isHost: driver?.isHost ?? false,
    driven: driver !== null,
    driverId: driver?.id ?? null,
    away: seat.away,
    ready: driver?.ready ?? false,
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
function asPublicSeat(seat: Seat, driver: Person | null): PublicSeat {
  return {
    id: seat.id,
    seatIndex: seat.seat_index,
    playerName: driver?.name ?? seat.player_name,
    driverId: driver?.id ?? null,
    characterId: seat.character_id,
    fieldName: seat.field_id ? (FIELD_NAMES.get(seat.field_id) ?? seat.field_id) : "—",
    fieldId: seat.field_id,
    miecz: seat.sword_total,
    swordOwn: seat.sword_own,
    magia: seat.magic_total,
    magicOwn: seat.magic_own,
    mieczWWalce: seat.sword_in_fight,
    magiaWWalce: seat.magic_in_fight,
    life: seat.life,
    gold: seat.gold,
    nature: seat.nature,
    eliminated: seat.eliminated,
    driven: driver !== null,
    away: seat.away,
    isHost: driver?.isHost ?? false,
    turnsLost: seat.turns_lost,
    cards: seat.holdings
      .filter((held) => held.kind !== "spell")
      .map((held) => ({
        cardId: held.cardId,
        name: CARD_NAMES.get(held.cardId) ?? held.cardId,
        text: CARD_TEXTS.get(held.cardId),
        kindLabel: KIND_LABEL[held.kind],
        // The roster is the one place a rival's Przedmioty are drawn with no
        // body under them, so what is worn and what is merely carried is a
        // mark on the tile — see `WornMark`.
        slot: held.slot ?? null,
      })),
    hiddenSpells:
      seat.hidden_count + seat.holdings.filter((held) => held.kind === "spell").length,
  };
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-muted">
      {children}
    </main>
  );
}
