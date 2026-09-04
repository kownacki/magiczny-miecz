"use client";

/**
 * The Obszar somebody tapped, opened as a drawer over the board: what is lying
 * on it, who is standing on it, and everything the turn can do about it.
 */

/**
 * The Obszar, as a drawer over the board rather than a window over the table.
 *
 * `field-modal.tsx` carries the argument for the move. What matters here is
 * where it is *rendered*: the layout's `drawer` slot, beside the Księga and
 * the Stosy, which are the other two claims on that column. `openField` is
 * what keeps only one of the three open at a time.
 */

import { FieldModal } from "./field-modal";
import { FriendOffer } from "./friend-offer";
import { RaidOffer } from "./raid-offer";
import { asNature } from "./table";
import { useTheTable } from "./the-table";
import { isSpent } from "@/lib/engine/kolejka";
import { mayEndTurn } from "@/lib/engine/duties";
import { stillStone } from "@/lib/engine/status";
import { carriedCount, carryLimit } from "@/lib/engine/derive";
import type { CardId } from "@/data/ids";

export function FieldDrawer() {
  const {
    inspecting,
    eqMode,
    mySeat,
    fieldCards,
    onField,
    myTurn,
    post,
    revealing,
    setDealSeen,
    dealKey,
    setInspecting,
    game,
    active,
    panel,
    turnState,
    owedHere,
    busy,
    asked,
    askFor,
    fieldGold,
    seats,
    showSeat,
    rightDrawer,
    askedAbout,
    stock,
    blockedHere,
    setAsk,
  } = useTheTable();
  if (!inspecting) return null;
  return (
    <FieldModal
      /**
       * Keyed by the Obszar, so opening a second one is a second drawer.
       *
       * Two things depended on this and both were wrong without it.
       *
       * A click on the map while this is open used to *close* it rather
       * than move it. `useDismissable` already knows that a click which
       * opened something is not a click away from something — it waits a
       * turn of the loop and looks for a surface that was not there before
       * — but with the drawer merely re-rendered under a new `fieldId`
       * there is no new surface to find, so the click read as "away" and
       * the Obszar you asked for shut the one you were looking at.
       *
       * And the window's own state is about *an* Obszar: which shelves the
       * reader folded away, which offer they walked into. Carried across a
       * change of square that is somebody else's Płatnerz, and a shelf
       * shut on a Bezdroża staying shut on the Osada.
       */
      key={inspecting}
      eqMode={eqMode}
      nature={asNature(mySeat?.nature)}
      fieldId={inspecting}
      /**
       * What is on the Obszar, from both places it can be.
       *
       * `field_cards` holds it while nobody is standing there. The moment
       * somebody stops, `liftFieldCards` deletes those rows and the Karty
       * live in that turn's own `drawn` until `leaveCardsBehind` writes
       * back what was not taken — so asking only the table showed an empty
       * Obszar on the one turn anybody is reading it.
       *
       * The turn's copy is added only for the seat whose turn it is and
       * only on the Obszar they are standing on, which is the one case the
       * two cannot both be populated.
       */
      cards={[
        ...fieldCards
          .filter((card) => card.fieldId === inspecting)
          .map((card) => ({ id: card.id, cardId: card.cardId, granted: card.granted })),
        ...(onField && myTurn && mySeat?.field_id === inspecting
          ? onField.drawn
              /**
               * A Karta spent by being read is not on the Obszar any more.
               *
               * "Po osądzeniu cię, Bóstwo znika - odłóż jego Kartę" — and
               * once it has judged you, listing it under "Na tym Obszarze"
               * is the window saying something that is not true. It stays
               * in the kolejka, struck through, because that row is the
               * turn's record of what was dealt with.
               */
              .filter(
                (card) =>
                  !isSpent(
                    card,
                    [...(onField.resolved ?? []), ...(onField.fought ?? [])],
                    onField.beaten ?? [],
                  ),
              )
              .map((card, at) => ({
              // No row to name, so the key is the turn's own position. See
              // `viaTurn` — it is also what hides the "weź" button, which
              // needs a `field_cards` id this Karta does not have.
                id: `tura-${at}-${card.cardId}`,
                cardId: card.cardId as CardId,
                granted: card.granted,
                viaTurn: true as const,
                /**
                 * Turned over just now, as against found lying here.
                 *
                 * `ref` is which physical slice came off the pile, and only
                 * a Karta the deck actually gave up this turn has one:
                 * `liftFieldCards` rebuilds a Karta off a `field_cards` row,
                 * which does not carry it. So the presence of a ref is the
                 * difference between "I drew this" and "this was already
                 * here", which is exactly what the reveal wants to show
                 * large.
                 */
                ...(card.ref ? { justDrawn: true as const, ref: card.ref } : {}),
              }))
          : []),
      ]}
      standingHere={mySeat?.field_id === inspecting}
      /* 13.4's remainder, and the deal itself — offered only where the
         character actually is, since 13.1 gives them nothing to do on an
         Obszar they are only reading about. */
      owed={mySeat?.field_id === inspecting ? (onField?.draw ?? 0) : undefined}
      onDraw={() => post("turn", { action: "draw" })}
      /* The deal, turned over and not yet worked through. The button that
         ends it is the only way on, which is what makes this a moment
         rather than a flicker. */
      revealing={revealing && mySeat?.field_id === inspecting}
      onDealSeen={() => {
        setDealSeen(dealKey);
        setInspecting(null);
      }}
      canAct={mySeat?.seat_index === game?.active_seat}
      // Ending the turn lives in this window now, not in the box in the
      // corner: a turn is read in one place and should be finished there.
      canEnd={
        !!active &&
        !panel.blocksEnding &&
        mayEndTurn({ fieldId: active.field_id, done: [], phase: turnState.phase, onField: owedHere })
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
      /* A Karta the turn is holding has no `field_cards` row, so it is
         taken by name — the same door the sheet's own "weź" goes through.
         Both end in `takeCard`, under the same 12.1. */
      onTakeDrawn={(cardId, at) =>
        void askFor(at, () => post("holdings", { action: "take", cardId }))
      }
      /* Loose Sztuki Złota, which are a row on the Obszar rather than a
         Karta on it — dropped by a character who died here (4.4), by one
         turned to stone, or by a Karta that pays out on a square. */
      gold={fieldGold.find((row) => row.fieldId === inspecting)?.gold ?? 0}
      /* No seatId, like `take-field` beside it: the route reads it off the
         caller's token, and 12.1's three conditions are checked there —
         `refuseUnlessCollectable`, shared by both. */
      onTakeGold={(gold) => post("holdings", { action: "take-gold", gold })}
      /**
       * Who is standing on it (12.1, 19.1), narrowed here rather than in
       * the window.
       *
       * Every seat carries `stone_until_round`, and whether that column is
       * still in force is the one comparison chapter 20 turns on — so it
       * goes through `stillStone` like the four other places that ask, and
       * the Obszar cannot come to its own conclusion about who is a statue.
       * A seat with no Postać is left out: it is not on the board.
       */
      standing={seats
        .filter((seat) => seat.field_id === inspecting && seat.character_id && !seat.eliminated)
        .sort((a, b) => a.seat_index - b.seat_index)
        .map((seat) => ({
          id: seat.id,
          seatIndex: seat.seat_index,
          playerName: seat.player_name,
          characterId: seat.character_id,
          stone: stillStone(seat.stone_until_round, game.round),
          active: seat.seat_index === game.active_seat,
          mine: seat.id === mySeat?.id,
        }))}
      onPickSeat={showSeat}
      pickedSeat={rightDrawer === "gracze" ? askedAbout : null}
      /* What the box has left of each Wyposażenie card (21.2), what this
         seat carries against 5.4, what it has to spend and what it could
         sell.

         Outside the standing-here spread on purpose. An Obszar you are only
         reading about still keeps its shop, and "could I afford the Osada's
         Miecz if I walked there" is the question that decides the walk — a
         shelf that cannot say what is left on it, or a purse that reads
         zero because you are standing somewhere else, is worse than no
         shelf. What 13.1 shuts is the buttons, and `blocked` says so. */
      stock={stock}
      purse={active ? { gold: active.gold, life: active.life } : undefined}
      sellable={active?.holdings
        .filter((holding) => holding.kind === "item")
        .map((holding) => ({ id: holding.id, cardId: holding.cardId }))}
      pack={
        active
          ? {
              holdings: active.holdings,
              carried: carriedCount(active.holdings, eqMode),
              limit: carryLimit(active.holdings, eqMode),
              eqMode,
            }
          : undefined
      }
      blocked={blockedHere}
      /* The dialog clears itself here rather than in every caller: a
         question that stays on screen after it has been answered is the
         one bug this component cannot have. */
      onAsk={(question) =>
        setAsk({
          ...question,
          onConfirm: () => {
            setAsk(null);
            question.onConfirm();
          },
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
          }
        : {})}
      onClose={() => {
        // Shutting the window counts as having looked: the reveal holds the
        // sheet back, so leaving it un-answered would close the one window
        // there is and open nothing in its place.
        if (revealing) setDealSeen(dealKey);
        setInspecting(null);
      }}
    />
  );
}
