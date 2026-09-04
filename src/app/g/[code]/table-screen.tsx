"use client";

/**
 * The table itself, once a game is on: the board with the journal under it,
 * the bar across the top, the column about you on the right, and the drawers
 * that open over either side. Composed here from what `TheTable` provides.
 */

import type React from "react";
import { TheReader } from "./card-facts";
import { Overlays } from "./overlays";
import { FieldDrawer } from "./field-drawer";
import { TableLayout } from "./table-layout";
import { PilesDrawer } from "./piles";
import { Settings } from "./settings";
import { PlayersDrawer } from "./players";
import { asPublicSeat, driverOf as driverOfSeat } from "./table-view";
import { CHARACTERS, asNature, type Seat } from "./table";
import { BarButton } from "./bar-button";
import { LeaveButton } from "./door";
import { BoardMap } from "./board-map";
import { Journal } from "./journal";
import { SpokenSpell } from "./spoken-spell";
import { NowBox } from "./now-box";
import { Rules } from "./rule-ref";
import { TurnQueue } from "./turn-queue";
import { Toasts } from "./toast";
import { SeatActions } from "./seat-actions";
import { SeatCard } from "./seat-card";
import { SpellHand } from "./spell-hand";
import type { TileCard } from "./card-tile";
import { useTheTable } from "./the-table";
import { MAX_SEATS } from "@/lib/game/modes";
import { TESTING_POSSIBLE } from "@/lib/game/testMode";
import { plural, roundShown, fieldName } from "@/lib/engine/polish";
import { isSpent } from "@/lib/engine/kolejka";
import { asFieldId, ringFields, type FieldId } from "@/lib/engine/board";
import { isSpellId, type CardId, type SpellId } from "@/data/ids";
import { spellScript } from "@/lib/engine/spells";
import { turnSteps } from "@/lib/engine/turnWindows";
import { abilitiesOfCharacter, asCharacterId } from "@/lib/engine/characters";
import events from "@/data/events.json";
import spells from "@/data/spells.json";
import type { EventCard, Spell } from "@/data/types";

/**
 * How many of each the box prints — 165 and 30, said on the manual's first page
 * and counted again by the slicer, which cut exactly that many out of the scans.
 *
 * Read off the data rather than typed in, so the day a card turns out to be
 * missing from a scan this number moves with it instead of quietly disagreeing.
 */
/**
 * Where the turn box sends a player who is over a limit.
 *
 * Written down rather than passed around, because the two ends of this are a
 * button in one component and a `<div>` in another and nothing between them
 * has any business knowing about either. `getElementById` and not a ref for
 * the same reason: the hand is built here and rendered three components deep.
 */
const SPELLS_ANCHOR = "zaklecia-w-rece";

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

/**
 * Whether companion's own status line is drawn at all.
 *
 * `false` while COMPANION_PARKED keeps every new table in simulation, where
 * `game.mode` can never be "companion" — so the line was unreachable anyway and
 * only cost a reader the time to work that out. Kept rather than deleted, like
 * the rest of that mode: one boolean brings it back.
 */
const COMPANION_LINE = false;

export function TableScreen({ library }: { library: React.ReactNode }) {
  const {
    code,
    viewer,
    leftDrawer,
    game,
    stock,
    eqMode,
    mySeat,
    setInspectingCard,
    closeDrawer,
    rightDrawer,
    setRightDrawer,
    setAsk,
    post,
    seats,
    users,
    askedAbout,
    amHost,
    busy,
    mySeatIndex,
    claimSeat,
    join,
    toggleDrawer,
    active,
    setTestMode,
    testMode,
    testing,
    consoleOpen,
    setConsoleOpen,
    askToLeave,
    fieldCards,
    onField,
    turnState,
    openField,
    spoken,
    mine,
    showSeat,
    isTableScreen,
    turnWindows,
    surplus,
    notices,
    dismissNotice,
    tableScreenHolder,
    askToDrop,
    asked,
    equip,
    askToUse,
    openSpells,
    setOpenSpells,
    now,
    others,
    boardCards,
    askToCast,
    setReborn,
    setFolded,
    sheetApplies,
  } = useTheTable();
  const driverOf = (seat: Seat | null | undefined) => driverOfSeat(users, seat);

  /**
   * Takes the player to the cards they have to shed, and opens the box.
   *
   * Not a drawer and not a dialog: the hand and the pack are already on screen,
   * in the seat card, with the words that shed a card under every Karta. What
   * a player over the limit is missing is not a place to go but the *way* to
   * it — the seat card is long, the fold may be shut, and the refusal that
   * brought them here was written across the screen in the turn box.
   *
   * `start`, so the heading lands at the top and the hand fills the screen
   * under it. `center` was tried and is wrong for a section this tall: it puts
   * the middle of a twenty-card hand under the pointer and the „ZAKLĘCIA 29 / 3"
   * that explains why you are there off the top of the window. Smooth, since
   * this is a jump the player asked for and arriving without the movement
   * leaves them wondering what changed.
   */
  function showSpells() {
    setOpenSpells((n) => n + 1);
    document
      .getElementById(SPELLS_ANCHOR)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    /* Whom a card looked up anywhere on the table is read for: the viewer.
       The sheet overrides it with the Postać the Karty were dealt to — see
       `TheReader`. */
    <TheReader.Provider value={viewer}>
      <Overlays />
      <TableLayout
        drawer={
          <>
            <FieldDrawer />
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
                /* The hover on the top used card says what it says everywhere
                   else — which place a Przedmiot is worn in, and whether the
                   reader's own Natura may use it. */
                eqMode={eqMode}
                nature={asNature(mySeat?.nature)}
                onInspect={setInspectingCard}
                onClose={closeDrawer}
              />
            ) : null}
            {rightDrawer === "ustawienia" ? (
              <Settings
                onClose={() => setRightDrawer(null)}
                eqMode={eqMode}
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
                Runda <span className="tnum text-ink/70">{roundShown(game.round)}</span> ·{" "}
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
            /**
             * What is lying on each Obszar — from both places a Karta can be.
             *
             * Arriving lifts every `field_cards` row on a square into the
             * turn's own frame (`liftFieldCards`) and the end of the turn
             * writes back whatever nobody took, so for the whole turn somebody
             * is standing there the square looks empty to anything that asks
             * the table. This asked the table. The map dropped the picture of
             * what was lying there and, now that it draws them, the square's
             * marks with it — a TARGOWISKO's sakwa vanishing off the Osada for
             * exactly as long as somebody is shopping at it.
             *
             * The Obszar's own window merges the same two lists and says so at
             * length; this is the fifth thing to need it. See `offerOn`.
             */
            cardsOnFields={[
              ...fieldCards.map((card) => ({
                fieldId: card.fieldId,
                id: card.id,
                cardId: card.cardId,
              })),
              ...(active && onField
                ? onField.drawn
                    .filter(
                      (card) =>
                        !isSpent(
                          card,
                          [...(onField.resolved ?? []), ...(onField.fought ?? [])],
                          onField.beaten ?? [],
                        ),
                    )
                    .map((card, at) => ({
                      fieldId: asFieldId(active.field_id),
                      // No row to name — the turn is holding it. See `viaTurn`.
                      id: `tura-${at}-${card.cardId}`,
                      cardId: card.cardId as CardId,
                    }))
                : []),
            ].reduce<Partial<Record<FieldId, { id: string; cardId: CardId }[]>>>(
              (byField, card) => {
                if (card.fieldId) (byField[card.fieldId] ??= []).push(card);
                return byField;
              },
              {},
            )}
            highlight={
              turnState.phase === "move"
                ? turnState.options.map((option) => option.fieldId)
                : []
            }
            onPick={openField}
          />
            </div>
            <Journal
              code={code}
              revision={game.revision}
              eqMode={eqMode}
            />
          </div>
        }
        right={
          <div className="flex flex-col gap-3">
            {/* Above even the NowBox, because it is the one thing at this table
                that is on a clock everybody shares: a Zaklęcie has been spoken
                and has not landed yet, and until it does nothing else at the
                table has moved. */}
            {spoken && (
              <SpokenSpell
                spoken={spoken}
                mySeatIndex={mySeatIndex}
                seatName={(index) =>
                  seats.find((seat) => seat.seat_index === index)?.player_name ??
                  `Miejsce ${index + 1}`
                }
                /* Whether this device holds one of the two Karty that answer a
                   Zaklęcie. Asked of my own hand only — 9.3 conceals everybody
                   else's, and this is the one place the answer is useful. */
                canAnswer={(mine?.holdings ?? []).some(
                  (held) => held.kind === "spell" && spellScript(held.cardId)?.reactive === true,
                )}
                canSettle={mySeatIndex !== null}
                busy={busy}
                onSettle={() => post("holdings", { action: "settle-spell" })}
              />
            )}
            {/* First thing in the column, above everything a player acts on.
                Two questions side by side: "now" on the left, in a box that
                never changes size, and "when" to the right of it — the queue
                gives up the width, since it already scrolls.

                Side by side only where there is room for both. The queue is the
                one that gives, and on a narrow table it gave everything: 154
                pixels beside a „teraz" box that does not shrink, which is one
                chip and half of the next one's name. Scrolling is not the same
                as being readable. Under `lg` they stack instead, and the queue
                gets the column's whole width. */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
              {active && (
                <NowBox
                  playerName={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
                  round={game.round}
                  seatIndex={active.seat_index}
                  onPlayer={() => showSeat(active.id)}
                  characterId={active.character_id}
                  characterName={
                    CHARACTERS.find((one) => one.id === active.character_id)?.name ?? null
                  }
                  isMine={
                    (mySeatIndex !== null && active.seat_index === mySeatIndex) || isTableScreen
                  }
                  fieldName={
                    active.field_id ? fieldName(active.field_id) : "—"
                  }
                  fieldId={active.field_id}
                  windows={turnWindows}
                  steps={turnSteps(turnState.phase)}
                  // Who we are waiting for, and since when. The revision is
                  // "since when" already: everything that happens bumps it.
                  away={active.away}
                  since={game.revision}
                  /* The one thing that stops a turn without being part of
                     one. Whoever is over gets the button; everybody else gets
                     the sentence, because the table has stopped for them too
                     and a box that says nothing about it looks broken. The
                     door is the seat card — the hand, the pack and the words
                     that shed a card all live there, and there is no second
                     place to send anybody. */
                  surplus={
                    surplus
                      ? {
                          said: surplus.said,
                          what: surplus.what,
                          /* Only for a hand, and only for the person holding
                             it. A Plecak over 5.6 gets the sentence and no
                             button: the pack is always on screen with its own
                             „4 / 12" and an „upuść" under every Karta, so
                             there is nothing to be led to. A hand can be a
                             fold shut two screens down. */
                          onFix:
                            surplus.what === "zaklecia" &&
                            surplus.seatIndex === mySeatIndex
                              ? showSpells
                              : null,
                        }
                      : null
                  }
                  canRoll={turnState.phase === "roll"}
                  onRoll={() => post("turn", { action: "roll" })}
                  // 13.4: what is already lying here counts against the number
                  // the field asks for, which is why a silted-up Obszar draws
                  // nothing and the button is not there. `draw` is what is
                  // still owed — subtracted on arrival and spent per draw — so
                  // this no longer has to work it out from `drawn`, which taking
                  // a card shrinks (see `afterMove`).
                  owed={onField?.draw ?? 0}
                  onDraw={() => post("turn", { action: "draw" })}
                  busy={busy}
                  onOpen={(id) => {
                    /**
                     * The sheet if there is one, and the Obszar otherwise.
                     *
                     * "Walka" and "Karty" belong to the draw sheet, so pressing
                     * them used to unfold it and nothing else. Which worked
                     * until the sheet learned to stay shut while the Obszar
                     * still owes Karty (13.4): "Karty 2" was then a chip that
                     * unfolded something that was not there, and pressing it
                     * did nothing at all.
                     *
                     * Nothing on this bar may be inert. Where the sheet does
                     * not apply the Obszar's window is what the turn is in —
                     * and on that very turn it is also where the deal is, which
                     * is what the player pressing "Karty" is looking for.
                     */
                    if ((id === "walka" || id === "karty") && sheetApplies) {
                      return setFolded(false);
                    }
                    openField(active.field_id);
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
                  stoneUntilRound: seat.stone_until_round,
                  eliminated: seat.eliminated,
                }))}
                activeSeat={game.active_seat}
                round={game.round}
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
                  if (row) showSeat(row.id);
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
                    id={SPELLS_ANCHOR}
                    openSignal={openSpells}
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
                    /* Why the whole rack is shut, in the server's own words —
                       a Kamień, a Wojna Żywiołów, an Obszar that forbids
                       Zaklęcia, the Kryształ Magów. The same sentence the
                       route would refuse with, so a dimmed card explains
                       itself instead of waiting to be pressed. */
                    blocked={mine.spells_blocked}
                    opponents={others.map((seat) => ({
                      seatIndex: seat.seat_index,
                      name: seat.player_name ?? `Miejsce ${seat.seat_index + 1}`,
                    }))}
                    busy={busy}
                    onInspect={setInspectingCard}
                    boardCards={boardCards}
                    /* „Na Obszar w Kręgu, po którym wędrujesz" — the caster's
                       own ring, which is this seat's and not the active one's. */
                    ring={
                      mine.field_id
                        ? ringFields(mine.field_id).map((fieldId) => ({
                            fieldId,
                            name: fieldName(fieldId),
                          }))
                        : []
                    }
                    onCast={(holdingId, target) => {
                      const held = mine.holdings.find((card) => card.id === holdingId);
                      if (held) askToCast(holdingId, held.cardId, target);
                    }}
                    /* The same write a Przedmiot goes down with, and the same
                       question first — `askToDrop` reads the kind and says the
                       right thing about where the card lands. Offered only
                       while 9.4 is open, which the hand decides for itself. */
                    onDrop={askToDrop}
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
    </TheReader.Provider>
  );
}
