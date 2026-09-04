"use client";

/**
 * What is drawn over the table, whoever's turn it is: the console, the
 * announcement, the confirmation, a card held up to read, the picker after a
 * death, the turn's sheet, and the frames a Karta can leave suspended over it.
 */

import { TestConsole } from "./console";
import { stageOf } from "@/lib/engine/console";
import { AnnouncementModal } from "./announcement";
import { ConfirmDialog } from "./confirm";
import { CardDetail } from "./card-tile";
import { RebornModal } from "./reborn-modal";
import { CHARACTERS, asNature } from "./table";
import { TurnFab, owedLabel } from "./turn-fab";
import { TheReader } from "./card-facts";
import { DrawModal } from "./draw-modal";
import { ScriptFramePanel } from "./script-frame";
import { AskFramePanel } from "./ask-frame";
import { useTheTable } from "./the-table";
import { compulsoryOffer, offerNamed } from "@/lib/engine/fieldScript";
import { isSpellId, type SpellId } from "@/data/ids";
import { ringFields, type FieldId } from "@/lib/engine/board";
import { characterName, fieldName } from "@/lib/engine/polish";

export function Overlays() {
  const {
    code,
    testing,
    failure,
    consoleOpen,
    setFailure,
    busy,
    seats,
    game,
    turnState,
    setConsoleOpen,
    runConsole,
    announcement,
    setAnnouncement,
    setReborn,
    ask,
    setAsk,
    inspectingCard,
    setInspectingCard,
    mySeat,
    reborn,
    pickerWavedOff,
    post,
    setPickerWavedOff,
    active,
    turnWindowOpen,
    myTurn,
    turnWindows,
    inspecting,
    leftDrawer,
    setFolded,
    sheetApplies,
    openField,
    dealt,
    mySeatIndex,
    isTableScreen,
    intent,
    folded,
    beneath,
    waved,
    shownRoll,
    mine,
    now,
    others,
    boardCards,
    showSeat,
    rightDrawer,
    askedAbout,
    eqMode,
    error,
    setRolled,
    losing,
    showDie,
    setWaved,
  } = useTheTable();
  return (
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
          stage={stageOf(game.status, turnState.phase)}
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
      {/* Hidden with the rest of the table below `--breakpoint-game`: a pill
          offering to act on a turn is no use beside a notice saying the table
          cannot be drawn. `contents` so the wrapper leaves the pill's own
          `fixed` positioning alone. */}
      {active && !turnWindowOpen && (
        <div className="hidden game:contents">
        <TurnFab
          mine={myTurn}
          playerName={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
          seatIndex={active.seat_index}
          owed={owedLabel(
            turnWindows,
            turnState.phase === "fight" ? turnState.fight.cardName : null,
          )}
          besideDrawer={inspecting !== null || leftDrawer !== null}
          onOpen={() => {
            /**
             * Back to whatever the turn is on, and never to nothing.
             *
             * The sheet if it is a fight or a Karta, and the Obszar otherwise —
             * which for the player being asked is where the turn is ended, and
             * for everybody else is where they can see what it is being ended
             * on.
             *
             * "Otherwise" used to mean "no window is compulsory", which read
             * the *list* rather than what is actually on screen. Mid-deal the
             * Karty window is compulsory and the sheet is shut (13.4), so this
             * unfolded something that was not there and left the player where
             * they started. It asks `sheetApplies` now, which is the same
             * question the sheet itself is drawn on.
             */
            setFolded(false);
            if (!sheetApplies) openField(active.field_id);
          }}
        />
        </div>
      )}

      {/* The card you just turned over, at a size you can read, with exactly
          the things this card lets you do under it. */}
      {active && sheetApplies && (
        /* The Karty on this Obszar were dealt to the active Postać, so every
           condition inside the sheet — and inside the previews it opens — is
           read for them rather than for whoever is watching. */
        <TheReader.Provider value={dealt}>
          <DrawModal
            // Everybody at the table watches. A fight is the moment the game
            // is most worth looking at, and it used to happen entirely inside
            // one person's browser while the rest read about it afterwards in
            // the journal. Only the player whose turn it is can press anything.
            who={active.player_name ?? `Miejsce ${active.seat_index + 1}`}
            canAct={mySeatIndex === active.seat_index || isTableScreen}
            // The three seconds between somebody deciding and it landing —
            // only ever drawn on the devices that cannot press anything. Sent
            // by the acting seat and by nobody else, which the route is what
            // checks, so there is nothing to compare against `active` here.
            intent={intent}
            minimized={folded}
            onMinimize={() => setFolded(true)}
            /* Off the Obszar's own frame rather than off the top of the stack:
               a Karta held on a thrown face has a `script` frame over it, and
               reading the kolejka from there emptied the row under the sheet —
               the Karty are still on the square, and the row is the account of
               them. `beneath` is that frame wherever it is. */
            cards={beneath?.drawn ?? []}
            resolved={[...(beneath?.resolved ?? []), ...waved]}
            fought={beneath?.fought ?? []}
            beaten={beneath?.beaten ?? []}
            fight={turnState.phase === "fight" ? turnState.fight : null}
            // The direction choice, which used to be a panel of its own below
            // the queue. It is the same shape as everything else in here: one
            // thing you are asked to do, with the table watching.
            move={
              turnState.phase === "move"
                ? { roll: turnState.roll, options: turnState.options }
                : null
            }
            bridge={turnState.phase === "bridge" ? turnState.bridge : null}
            /* The offer that is owed — or, while its die is still on screen,
               the one that was: `compulsoryOffer` stops naming a table the
               moment it is resolved, and the panel it was thrown in has to
               stand there long enough to say what came up. */
            fieldOffer={
              turnState.phase === "field"
                ? (offerNamed(
                    active.field_id,
                    shownRoll?.cardId.startsWith("pole:")
                      ? shownRoll.cardId.slice("pole:".length)
                      : null,
                  ) ?? compulsoryOffer(active.field_id, turnState.resolved ?? []))
                : null
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
              turnState.phase === "fight"
                ? (turnState.fight.caster ?? null)
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
                ...(target.fieldId === undefined ? {} : { fieldId: target.fieldId }),
                ...(target.destination === undefined ? {} : { destination: target.destination }),
              })
            }
            /* The same two lists the seat card's hand is given, because the
               same Zaklęcia are in it: „w dowolnej chwili" is most of the
               deck, and a fight is one of those chwile. */
            boardCards={boardCards}
            spellRing={
              mine?.field_id
                ? ringFields(mine.field_id).map((fieldId) => ({
                    fieldId,
                    name: fieldName(fieldId),
                  }))
                : []
            }
            onInspect={setInspectingCard}
            /* 17.6: in a duel the escape is the attacked character's, so the
               button goes to their device rather than the attacker's. The
               shared screen keeps it too, since in companion mode it is the
               device the whole table is pressing. */
            myEscape={
              turnState.phase === "fight" &&
              turnState.fight.opponentSeat !== undefined &&
              (isTableScreen || turnState.fight.opponentSeat === mySeatIndex)
            }
            ring={ringFields(active.field_id)}
            /* „nie zajętym przez inną Postać" — the Lewiatan may not be put
               down on a square somebody is standing on. */
            occupied={seats
              .filter((seat) => !seat.eliminated && seat.field_id)
              .map((seat) => seat.field_id as FieldId)}
            /* 1.5's fight total, for the Sobowtór, whose Miecz is whoever is
               opposite him and is therefore not on his Karta. */
            mySword={active.sword_in_fight}
            seatIndex={active.seat_index}
            actor={{
              name: active.player_name ?? `Miejsce ${active.seat_index + 1}`,
              characterName: characterName(active.character_id ?? ""),
              characterId: active.character_id ?? null,
              mine: active.id === mySeat?.id,
              /**
               * The same door the turn bar's name goes through, not a second
               * one that happens to open the same drawer.
               *
               * `setRightDrawer("gracze")` on its own did two things wrong and
               * both were invisible from here: the roster opened on whichever
               * seat it was last asked about rather than this one, because the
               * seat is `askedAbout` and nothing set it; and it could not shut,
               * because setting a state to the value it already holds is not a
               * toggle. Pressing the standee twice looked like a dead button.
               */
              onOpen: () => showSeat(active.id),
              /** So the standee can say which way its own click goes. */
              open: rightDrawer === "gracze" && askedAbout === active.id,
            }}
            /* The ACTIVE seat's, not the reader's: the card is being resolved
               for whoever is having the turn. */
            nature={asNature(active.nature)}
            /* Which variant this table plays, so the sheet says what a
               Przedmiot's bonus is conditional on *here* — see `DrawnCard`. */
            eqMode={eqMode}
            aggression={active.aggression}
            busy={busy}
            error={error}
            /* The die on the frame, which is everybody's — see `shownRoll`. */
            rolled={shownRoll}
            /* „Dalej" is what lets the face take effect: the throw suspended
               the Karta over the row it landed in, and this resumes it — see
               `heldAt`. The same door an answered question goes through,
               because it is the same act with nothing to answer. */
            onRollRead={() => {
              setRolled(null);
              void post("turn", { action: "answer" });
            }}
            /* The Karta's own question, asked in the Karta's own panel. */
            losing={losing}
            onLose={(index) => post("turn", { action: "answer", choices: [index] })}
            onAction={(body) => post("turn", body)}
            onResolve={async (cardId, decisions) => {
              showDie(cardId, await post("turn", { action: "karta-efekt", cardId, ...decisions }));
            }}
            onResolveField={async (choices) => {
              const offer = compulsoryOffer(
                active.field_id,
                turnState.phase === "field" ? (turnState.resolved ?? []) : [],
              );
              /* Awaited rather than dropped: the panel holds the button that was
                 pressed until this settles, and the die comes back on it. */
              if (!offer) return;
              showDie(
                `pole:${offer.name}`,
                await post("turn", { action: "pole-tabela", offer: offer.name, choices }),
              );
            }}
            onFight={(cardIds) => post("turn", { action: "fight", cardIds })}
            onEscape={() => post("turn", { action: "escape" })}
            onTake={(cardId) =>
              post("holdings", { action: "take", seatId: active.id, cardId })
            }
            onLeave={(cardId) => setWaved((current) => [...current, cardId])}
            /* The same door the Obszar drawer uses, and it clears itself here
               so no caller can leave an answered question on screen. */
            onAsk={(question) =>
              setAsk({
                ...question,
                onConfirm: () => {
                  setAsk(null);
                  question.onConfirm();
                },
              })
            }
          />
        </TheReader.Provider>
        )}

      {/* The card the turn is suspended on — a question left over after a
          mid-card fight, or a decision the resolve was sent without. Everybody
          sees it; the frame says whose answer it is (docs/STACK.md, law 5). */}
      {/* …except the ones the sheet takes itself. A loss is asked on the Karta,
          where the pack is (see `losing`), and a panel over it saying the same
          thing would be the question twice with the answer in one of them —
          and a *held* frame is not a question at all: it is a face waiting for
          „Dalej", which is a button on the sheet and nowhere else. */}
      {active && turnState.phase === "script" && !turnState.held && !losing && (
        <ScriptFramePanel
          frame={turnState}
          who={
            seats.find((seat) => seat.id === turnState.seatId)?.player_name ??
            "gracz"
          }
          canAct={mine?.id === turnState.seatId || isTableScreen}
          ring={ringFields(active.field_id).map((fieldId) => ({
            fieldId,
            name: fieldName(fieldId),
          }))}
          busy={busy}
          onAnswer={(decided) => post("turn", { action: "answer", ...decided })}
        />
      )}

      {/* A question owed to a Charakterystyka rather than to a Karta — the
          Chochlik's two Zaklęcia. Above the card that asked it, so this is
          what is on screen; the two names reached only one device (9.3). */}
      {turnState.phase === "ask" && (
        <AskFramePanel
          frame={turnState}
          who={
            seats.find((seat) => seat.id === turnState.seatId)?.player_name ?? "gracz"
          }
          canAct={mine?.id === turnState.seatId || isTableScreen}
          busy={busy}
          onAnswer={(choice) => post("turn", { action: "answer", choice })}
        />
      )}

    </>
  );
}
