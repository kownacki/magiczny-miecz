"use client";

/** The spells in your hand, and which of them you may speak right now. */

import { useState } from "react";
import { CarriedCard, useCarry } from "./carry";
import spells from "@/data/spells.json";
import type { Spell } from "@/data/types";
import type { TileCard } from "./card-tile";
import { Fold } from "./fold";
import { TileRow } from "./tile-row";
import { Rules } from "./rule-ref";
import { plural } from "@/lib/engine/polish";
import { useRack } from "./rack";
import { ItemSlot, SLOT_WIDTH } from "./item-slot";
import type { SpellId } from "@/data/ids";
import {
  CAST_VERB,
  TIMING_LABEL,
  castableNow,
  spellScript,
  type SpellTiming,
} from "@/lib/engine/spells";

const SPELL_BY_ID = new Map((spells as Spell[]).map((spell) => [spell.id, spell]));

/**
 * The drag type a Zaklęcie travels under, and deliberately not the pack's.
 *
 * A spell moves only inside this row — it has no place on the body, and 9.3 and
 * 2.6 keep it out of the Plecak — so a drag from here must not light up the
 * places on the paper doll, and one from there must not aim at this row. Two
 * names is how the browser is told that, and it costs nothing.
 */
const SPELL_DRAG = "application/x-magiczny-miecz-zaklecie";

export interface HeldSpell {
  holdingId: string;
  cardId: SpellId;
  /** Conjured by the test shortcut, and marked on the card like any other. */
  granted?: boolean;
}

/**
 * The spells in your hand, and the ones you may speak right now.
 *
 * Concealed from everyone else (9.3), so this only ever renders for the seat
 * that holds them. A spell whose card names a window it is not currently in is
 * shown greyed with that window named, rather than hidden: knowing that the
 * Magiczna Wędrówka is waiting for the start of your move is most of what you
 * need to plan a turn around it.
 */
export function SpellHand({
  spells: held,
  moment,
  blocked = null,
  title,
  capacity,
  frame = "panel",
  opponents,
  boardCards = [],
  foeInFight = null,
  ring = [],
  busy,
  onCast,
  onInspect,
  onReorder,
  onDrop,
  id,
  openSignal,
}: {
  spells: HeldSpell[];
  /** Every window the turn is open for right now — a moment can be several. */
  moment: readonly SpellTiming[];
  /** Why nothing can be spoken at this instant, if something cannot. */
  blocked?: string | null;
  /** Shown above the hand. */
  title?: string;
  /**
   * How many the hand may hold (2.6), when the caller knows.
   *
   * Drawn beside the count the way the pack draws 5.4's, because it is the same
   * kind of fact and was the one of the two nobody could see: a player learns
   * their limit by being refused a Zaklęcie they had already decided to take.
   */
  /**
   * 2.6's cap. `undefined` where there is none to report — the fight sheet —
   * and `null` where the console has taken it off, which is a different thing
   * and prints „∞".
   */
  capacity?: number | null;
  /**
   * Where this is standing.
   *
   * `section` is the seat card, under the pack and reading as part of it —
   * a rule about your hand belongs beside the rule about your pack. `panel` is
   * the fight sheet, where it is a box of its own beside the dice.
   */
  frame?: "panel" | "section";
  /** Other seats, for the spells that need a victim. */
  opponents: { seatIndex: number; name: string }[];
  busy: boolean;
  /** Boards cards this spell could be aimed at, when its own says so. */
  boardCards?: {
    id: string;
    name: string;
    where: string;
    /** Where this Karta could be put down, for the Zaklęcie that moves one. */
    moveTo?: { fieldId: string; name: string }[];
  }[];
  /**
   * The Obszary of the Krąg the caster is walking, for the one Zaklęcie thrown
   * at a square rather than at somebody.
   *
   * The caster's ring and not the active player's: the Władca Gromu says „w
   * Kręgu, po którym wędrujesz", and whoever is holding it may speak it in
   * somebody else's turn.
   */
  ring?: { fieldId: string; name: string }[];
  /**
   * The creature standing opposite in the fight on screen, when there is one.
   *
   * "Na inną Postać lub Wroga" reaches it, and it is not in `boardCards`: the
   * Wróg in a fight may be a creature a Karta conjured, or 17.5's pack fighting
   * as one, and neither is a row on the board. Null everywhere but a fight.
   */
  foeInFight?: { name: string } | null;
  /**
   * Sheds one Zaklęcie, and only while there is a surplus to shed.
   *
   * 9.4 is the narrowest rule in the chapter — „Postać nie może odrzucać
   * Zaklęć, chyba, że posiada ich więcej, niż wynika to z jej parametru Magii"
   * — so the control that does it has no business existing the rest of the
   * time. The server refuses either way (`dropCard`); this is so the offer is
   * not there to be taken up, in the one state where it is the only thing the
   * table is waiting for.
   */
  onDrop?: (holdingId: string) => void;
  /** So the turn box has something to scroll to when it says «Odrzuć Zaklęcia». */
  id?: string;
  /**
   * Bumped to open the fold from outside, whoever last shut it.
   *
   * A number rather than a boolean, because what is being sent is an *act* and
   * not a state: „open now" happens twice in a row if a player closes the hand
   * between two presses, and a boolean that is already `true` says nothing the
   * second time. The fold stays theirs to close afterwards — this only opens.
   */
  openSignal?: number;
  onCast: (
    holdingId: string,
    target: {
      seatIndex?: number;
      fieldCardId?: string;
      fieldId?: string;
      /** The creature in the fight in progress — see `foeInFight`. */
      foeInFight?: true;
      /** Where the Karta goes, for the one Zaklęcie that moves one. */
      destination?: string;
    },
  ) => void;
  onInspect: (card: TileCard) => void;
  /**
   * Absent where the hand cannot be arranged — the fight sheet, and anybody
   * else's. Given, the row works exactly as the Plecak does: pick a card up,
   * drop it where you want it, and the order is written down.
   */
  onReorder?: (holdingIds: string[]) => void;
}) {
  const [aiming, setAiming] = useState<string | null>(null);
  /**
   * The Karta already pointed at, while the card asks its second question.
   *
   * Only one Zaklęcie in the box asks two — the Władca Zdarzeń picks a Karta up
   * and then names where to put it down — and the server refuses the cast
   * outright until both are answered, so the picker has to ask both before it
   * sends anything.
   */
  const [moving, setMoving] = useState<{ holdingId: string; fieldCardId: string } | null>(null);
  /**
   * The card in the air, which for a hand of Zaklęcia never leaves the hand.
   *
   * Its own carry and not the seat card's: a Zaklęcie has no place on the body
   * and cannot go in the Plecak (9.3 keeps it concealed and 2.6 counts it
   * separately), so the only journey it can make is within this row, and
   * sharing the seat card's would offer places it can never land in.
   *
   * The same `useCarry` all the same, which is the point. This row had written
   * out its own two thirds of it — a `lifted` id, a click away and an Escape —
   * and what it had not written was the card stuck to the pointer, so picking a
   * Zaklęcie up looked like nothing happening at all. It also conflated the
   * click with the drag, so the browser's own drag picture and this one would
   * both have been on the cursor at once had it ever drawn one.
   */
  const { carried, lifted, pickUp, putDown, announceDrag } = useCarry();
  /** Whether the hand is showing. Before the early return, like every hook. */
  const [showing, setShowing] = useState(true);
  /**
   * Opened from outside — the turn box's «Odrzuć Zaklęcia», which scrolls here
   * and would otherwise land on a closed fold.
   *
   * Adjusted during render rather than in an effect. React's own name for this
   * pattern, and the rule against `setState` in an effect body is right about
   * why: an effect would paint the fold shut and then re-open it, which is a
   * flicker on the one frame a player is looking straight at it. Comparing the
   * signal to the last one seen is what makes it happen once.
   */
  const [lastSignal, setLastSignal] = useState(openSignal);
  if (openSignal !== lastSignal) {
    setLastSignal(openSignal);
    if (openSignal) setShowing(true);
  }

  /**
   * The hand in the order its owner put it in.
   *
   * It used to sort itself, live cards first, on the argument that card order
   * was "the order they happened to arrive in, which answers nothing". That was
   * true while there was no way to arrange it. There is now — the same row the
   * Plecak is, through the same `useRack` — so the order answers the thing a
   * player decided, and an app that reshuffled it under them would be undoing
   * that decision every time a window opened or closed. Which is live is still
   * said, in the greying: 9.1 puts the window on the card, and knowing that the
   * Magiczna Wędrówka is waiting for the start of a move is most of what you
   * plan a turn around.
   */
  const rack = useRack({
    cards: held.map((entry) => ({ ...entry, id: entry.holdingId })),
    liftedHoldingId: lifted,
    onReorder,
  });
  const hand = rack.arranged;

  // An empty hand under the pack is still worth a line, for the same reason an
  // empty pack is drawn: the cap is the thing being said, and "0 / 2" says it.
  // In the fight sheet there is no cap to report and nothing to do, so nothing
  // is drawn.
  if (held.length === 0 && (frame === "panel" || capacity === undefined)) return null;

  const section = frame === "section";
  /**
   * Whether 9.4 is open right now.
   *
   * The one state in which a Zaklęcie may be let go of at all, and therefore
   * the only state in which the control for it is drawn. It comes and goes on
   * purpose, unlike the Różdżka's „dobierz Zaklęcie" beside it, which is greyed
   * instead — that offer belongs to a card a player is holding and is worth
   * learning the shape of, and this one belongs to a rule that has stopped the
   * whole table until it is answered.
   */
  const surplus = capacity !== undefined && capacity !== null && held.length > capacity;

  // The count against what will fit, exactly as the pack says it — and the same
  // red when there is no room, which is the moment 9.4 starts to bite.
  const tally =
    capacity === undefined ? (
      `(${held.length})`
    ) : (
      // „∞" exactly as the Plecak writes it for a Zaprzęg, and for the same
      // reason: a cap that has been taken off is still a cap worth naming, and
      // „29" on its own would read as a hand nobody had counted.
      <span
        className={capacity !== null && held.length >= capacity ? "text-vermilion" : "text-muted/70"}
      >
        {held.length} / {capacity ?? "∞"}
      </span>
    );

  return (
    // Folded away like the pack above it and the Zdolności below. Open to begin
    // with, because a hand you cannot see is a hand you cannot plan with — but
    // six Zaklęcia is six squares, and a seat card is read for other things too.
    //
    // Controlled outright rather than left to the browser, which is the pack's
    // arrangement kept for the sake of one behaviour rather than two.
    <div id={id} className={section ? "" : "mt-4 rounded-lg border border-magia/30 bg-panel/60 p-3"}>
    <Fold
      // A section in the seat card, or a panel of its own on a table screen:
      // the same fold either way, and only the box round it differs.
      first={!section}
      title={title ?? (section ? "Zaklęcia" : "Twoje Zaklęcia")}
      tally={tally}
      /* Which Zaklęcia, kept on the bar while the hand is shut — the same
         thing the Plecak and Przyjaciele keep, for the same reason: „1 / 1"
         says how full the hand is and nothing about what is in it. Only ever
         your own hand: 9.3 keeps everybody else's concealed, and this
         component is never given anybody else's cards. */
      /* „29 / 3" is the fact and not the instruction: a player reading it knows
         the hand is over and not what the table is waiting for — and while a
         surplus is on the stack every other verb is being refused, so this is
         the only thing anybody can usefully do. The number is the one
         `refuseWhileOverflow` says out loud, in the same words: not how many
         you hold, but how many have to go.

         In the `aside` and not beside the tally, which is where it started and
         where it wrapped the heading onto a second line. This slot is the one
         thing on that row built to run out of room — `min-w-0 flex-1 truncate`
         is what gives the Plecak „MIECZ · MIEC…" — so the sentence ends in an
         ellipsis instead of pushing the fold taller.

         It takes the slot from the card names whether the fold is open or shut,
         because a hand over the limit has one thing worth saying about it and
         it is not what is in it. Only past the cap, never at it: a full hand is
         legal, and the tally already reds itself at the ceiling. */
      aside={
        surplus ? (
          <span className="min-w-0 flex-1 truncate normal-case tracking-normal text-vermilion">
            musisz odrzucić {held.length - capacity!}{" "}
            {plural(held.length - capacity!, "Zaklęcie", "Zaklęcia", "Zaklęć")}, żeby gra ruszyła
            dalej
          </span>
        ) : showing || hand.length === 0 ? undefined : (
          <span className="min-w-0 flex-1 truncate normal-case tracking-normal text-magia/80">
            {hand.map((entry) => SPELL_BY_ID.get(entry.cardId)?.name ?? entry.cardId).join(" · ")}
          </span>
        )
      }
      tone={section ? "text-muted" : "text-magia"}
      open={showing}
      onToggle={() => setShowing(!showing)}
    >
      {blocked && <p className="mb-2 text-[11px] text-muted">{blocked}</p>}
      {/* No room at all, said rather than drawn.
       *
       * 2.6's table starts [0, 0, 1, …], so a character of Magia 1 holds no
       * Zaklęcia — not a corner case but the ordinary state of half the box,
       * and the section for it was a heading, a red „0 / 0" and an empty
       * outline. Three things that each look like something has gone wrong and
       * together say nothing about the rule that made them.
       *
       * The threshold is the part worth printing. „You have no room" invites
       * the question this answers in the same breath: room arrives at Magia 2,
       * which is a thing a player can go and do something about.
       *
       * In 2.6's and 9.4's own verbs. „Zmieścić się" was mine and sounded like
       * luggage; the rulebook says a Postać *posiada* Zaklęcia, that a Magia
       * *pozwala* on a number of them, and that anything over it is a
       * *nadwyżka* to be dropped *natychmiast*. Copy that vocabulary and a
       * player who goes to the Instrukcja from here reads the same words twice.
       */}
      {capacity === 0 && (
        <p
          className={`p-1 text-[11px] leading-snug ${
            held.length > 0 ? "text-vermilion/90" : "text-muted"
          }`}
        >
          <Rules>
            {held.length > 0
              ? "Posiadasz więcej Zaklęć, niż wynika z twojej Magii — nadwyżkę trzeba natychmiast odrzucić (9.4)."
              : "Twoja Magia nie pozwala posiadać żadnych Zaklęć — pierwsze wolno przy Magii 2 (2.6)."}
          </Rules>
        </p>
      )}
      {/* Face up, because they are yours — 9.3 hides them from everyone else,
          not from you, and a hand you cannot see is a hand you cannot plan
          with. */}
      {/* The row, and the thing a card lands in.
          
          The same shape the Plecak has: the whole row answers while a card is
          in the air, and the gap that opens under the pointer says where in it.
          A Zaklęcie never leaves this row — it has no place on the body and
          does not go in the pack — so this is the only target there is. */}
      {/* The row itself goes away when it would hold nothing and could take
          nothing: with no room and no Zaklęcia there is no rack, no drop target
          and no gap to open, and an empty outline under the sentence above only
          contradicts it. Kept the moment either is true — one square of room is
          a place to aim at, and a Zaklęcie held over the cap has to be visible
          to be discarded. */}
      {(capacity !== 0 || held.length > 0) && (
      <TileRow
        onDragOver={(event) => {
          if (!onReorder || !event.dataTransfer.types.includes(SPELL_DRAG)) return;
          event.preventDefault();
          rack.setDragOver(true);
          // Only ever the row itself: every card in it stops the drag from
          // reaching here, so arriving means the pointer is on the margin or on
          // one of the free squares, and both of those are the end of the row.
          rack.setInsertAt(null);
        }}
        // Move rather than enter: a card is picked up by clicking one that is
        // already inside the row, so the pointer never crosses the boundary and
        // `pointerenter` never fires. The guard keeps this from setting state
        // on every pixel.
        onPointerMove={() => {
          if (carried && !rack.dragOver) rack.setDragOver(true);
        }}
        onPointerLeave={() => {
          rack.setDragOver(false);
          rack.setInsertAt(null);
        }}
        onDragLeave={(event) => {
          // Only when the pointer leaves the row itself, not on its way across
          // a card inside it.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          rack.setDragOver(false);
          rack.setInsertAt(null);
        }}
        onDrop={(event) => {
          const before = rack.insertAt === null ? null : rack.lands(rack.insertAt);
          rack.setDragOver(false);
          rack.setInsertAt(null);
          putDown();
          const holdingId = event.dataTransfer.getData(SPELL_DRAG);
          if (!holdingId) return;
          event.preventDefault();
          rack.moveWithin(holdingId, before);
        }}
        // A click with a card on the cursor puts it down, wherever the gap is —
        // and on the end when there is none, which is what the free squares
        // past the last card mean.
        onClick={() => {
          if (!lifted) return;
          const before = rack.insertAt === null ? null : rack.lands(rack.insertAt);
          rack.setInsertAt(null);
          rack.moveWithin(lifted, before);
          putDown();
        }}
        /* Green, the same green a place on the body gives, because it is the
           same answer to the same question: you are over me, and I would take
           this. It was Magia purple on the grounds that the row is the spell
           rack's — which is a fact about the panel, not about the card in the
           air, and it made one of the two rows on a seat card answer in a
           colour the other never uses. Nothing here can refuse, so there is no
           red: a Zaklęcie moved inside the hand is inside 2.6 already. */
        answer={lifted === null ? null : { colour: "verdigris", over: rack.dragOver }}
      >
        {hand.map((entry, index) => {
          const card = SPELL_BY_ID.get(entry.cardId);
          const script = spellScript(entry.cardId);
          const now = script ? castableNow(script, moment) : true;
          /**
           * What this Zaklęcie is aimed at, and therefore what it asks for.
           *
           * Read off the card's own target rather than off what the app does
           * with it. The list used to be „a seat, unless the spell takes a
           * Karta off the board", which left three whole targets with no picker
           * at all: the Władca Gromu names an Obszar, the Władca Zdarzeń names
           * a Karta lying on one, and „na inną Postać lub Wroga" is both a seat
           * and a Karta — and each of those cast with no aim and was refused by
           * the server for not naming one.
           */
          const wants = script?.target ?? "brak";
          const atSeats =
            wants === "postac" || wants === "siebie-lub-postac" || wants === "postac-lub-wrog";
          const atCards =
            wants === "karta-na-planszy" || wants === "postac-lub-wrog" || wants === "wrog";
          const atFields = wants === "obszar";
          const aims: {
            key: string;
            label: string;
            target: {
              seatIndex?: number;
              fieldCardId?: string;
              fieldId?: string;
              foeInFight?: true;
            };
          }[] = [
            // „Na siebie lub inną Postać" is a choice, and the caster is one of
            // the answers — offered first, because it is the one the picker
            // used to make unreachable.
            ...(wants === "siebie-lub-postac"
              ? [{ key: "siebie", label: "na siebie", target: {} }]
              : []),
            ...(atSeats
              ? opponents.map((seat) => ({
                  key: `seat-${seat.seatIndex}`,
                  label: seat.name,
                  target: { seatIndex: seat.seatIndex },
                }))
              : []),
            /**
             * The one you are actually fighting, offered first.
             *
             * A Zaklęcie spoken into a fight is almost always meant for the
             * creature in it, and before this the only Wrogowie on offer were
             * the ones lying on Obszary — so the Krąg Płomieni could be thrown
             * at every monster on the board except the one swinging at you.
             */
            ...(atCards && foeInFight
              ? [{
                  key: "foe-in-fight",
                  label: `${foeInFight.name} — w tej walce`,
                  target: { foeInFight: true as const },
                }]
              : []),
            ...(atCards
              ? boardCards.map((lying) => ({
                  key: `card-${lying.id}`,
                  label: `${lying.name} — ${lying.where}`,
                  target: { fieldCardId: lying.id },
                }))
              : []),
            // „Na Obszar w Kręgu, po którym wędrujesz" — the caster's own ring,
            // which is the card's range and not 9.6's.
            ...(atFields
              ? ring.map((place) => ({
                  key: `field-${place.fieldId}`,
                  label: place.name,
                  target: { fieldId: place.fieldId },
                }))
              : []),
          ];
          /**
           * The one card that asks where, as well as what.
           *
           * „Zdjąć z planszy jedną odkrytą Kartę Zdarzeń i położyć ją na innym
           * Obszarze w tym samym Kręgu" — so the Obszary offered are the ones
           * around the Karta, which the caller works out because it is the one
           * that knows where every Karta and every Postać is standing.
           */
          const moves = script?.stosuje?.op === "przenies-karte";
          const needsAim = atSeats || atCards || atFields;
          const mustAim = needsAim && aims.length > 0;
          /** Aimed at something, with nothing of that kind on the board. */
          const nowhere = needsAim && aims.length === 0;
          const name = card?.name ?? entry.cardId;
          /**
           * Why „rzuć" is greyed, said on the hover rather than in the button.
           *
           * All three reasons are things about the board and the moment, not
           * about the card — which is why they read badly as a label on the
           * control itself, and why the label is now one word whatever is true.
           * The window comes first because it is the commonest and the one the
           * player can do something about by waiting.
           */
          const whyNot = busy
            ? null
            : blocked !== null
              ? blocked
              : !now
                ? `tylko ${script?.timing.map((when) => TIMING_LABEL[when]).join(" / ")}`
                : nowhere
                  ? atFields
                    ? "brak Obszarów"
                    : atCards && !atSeats
                      ? "brak Kart"
                      : "brak celów"
                  : null;

          return (
            // The same square the pack is built from, at the same size. A
            // Zaklęcie and a Przedmiot are both a card you hold, and drawing
            // them at two different sizes in two different frames made the
            // hand read as something from another screen. The picture is the
            // illustration; the whole Karta is a hover away, as everywhere.
            <ItemSlot
              key={entry.holdingId}
              item={{
                holdingId: entry.holdingId,
                cardId: entry.cardId,
                card: {
                  cardId: entry.cardId,
                  name,
                  text: card?.text,
                  kindLabel: "Zaklęcie",
                  granted: entry.granted,
                },
                granted: entry.granted,
              }}
              label={name}
              tone="filled"
              /* Greyed when the card cannot be spoken, whichever of the two
                 reasons it is: this card's own window is shut (9.1), or the
                 whole rack is — a Kamień, a Wojna Żywiołów, an Obszar that
                 forbids Zaklęcia, the Kryształ Magów. The second used to leave
                 every Zaklęcie at full weight with a dead „rzuć" underneath,
                 which reads as a hand you can spend and is not. Why it is
                 greyed is on the hover, where the rest of what the app knows
                 about the card is. */
              dimmed={!now || blocked !== null}
              disabled={busy}
              // A card would land in front of this one, so this and everything
              // after it steps aside to show the space it is going into — the
              // pack's gesture, drawn the pack's way.
              step={rack.stepAt(index)}
              quiet={lifted !== null}
              lifted={entry.holdingId === lifted}
              draggable={Boolean(onReorder) && !busy}
              onDragStart={(event) => {
                event.dataTransfer.setData(SPELL_DRAG, entry.holdingId);
                event.dataTransfer.effectAllowed = "move";
                // Through `announceDrag`, which says it a tick late: the
                // browser takes its picture of the card at the end of this
                // handler, and fading the square inside it would put the faded
                // one on the cursor. The pack has always done it this way.
                announceDrag({ cardId: entry.cardId, holdingId: entry.holdingId });
              }}
              onDragEnd={() => {
                announceDrag(null);
                rack.setInsertAt(null);
              }}
              // Taken here rather than left to the row behind it, so the card
              // lands where the pointer is instead of at the end — and the row
              // can then say plainly that anything reaching it is the end,
              // which is what the Plecak has always said.
              onDragOver={(event) => {
                if (!onReorder || !event.dataTransfer.types.includes(SPELL_DRAG)) return;
                event.stopPropagation();
                event.preventDefault();
                if (!rack.itsOwnSquare(entry.holdingId)) rack.setInsertAt(entry.holdingId);
              }}
              // No onDragLeave: unlike pointerleave, it fires on the way into a
              // child as well as on the way out, so a drag crossing the picture
              // inside this box would keep closing the gap it had just opened.
              // Leaving the row clears it, and the next card claims it.
              onDrop={(event) => {
                rack.setInsertAt(null);
                rack.setDragOver(false);
                putDown();
                const holdingId = event.dataTransfer.getData(SPELL_DRAG);
                if (!holdingId || holdingId === entry.holdingId) return;
                event.stopPropagation();
                event.preventDefault();
                rack.moveWithin(holdingId, rack.lands(entry.holdingId));
              }}
              /**
               * A carried card has no drag events behind it, so hovering is
               * watched directly for the same answer to show — both halves of
               * it, exactly as in the Plecak. Its own square is not a place to
               * put it, so nothing is open while the pointer is there.
               */
              onPointerEnter={() => {
                if (!carried) return;
                rack.setInsertAt(rack.itsOwnSquare(entry.holdingId) ? null : entry.holdingId);
              }}
              // Only this card's own gap: moving straight to the next card sets
              // the new one in the same breath, and React keeps the last word.
              onPointerLeave={() =>
                rack.setInsertAt((at) => (at === entry.holdingId ? null : at))
              }
              /**
               * One click picks it up; the next puts down what is on the
               * cursor, in front of the card it lands on. The same rule the
               * pack has, for the same reason: clicking moves things and
               * hovering reads them, and a gesture that meant "pick up" on one
               * card and "let me look" on the next was the thing the pack got
               * rid of. The Karta is still a hover away, as everywhere.
               */
              onClick={(event) => {
                if (!onReorder) {
                  return onInspect({
                    cardId: entry.cardId,
                    name,
                    text: card?.text,
                    kindLabel: "Zaklęcie",
                    granted: entry.granted,
                  });
                }
                event.stopPropagation();
                if (lifted === null) {
                  return pickUp({
                    holdingId: entry.holdingId,
                    cardId: entry.cardId,
                    name,
                    // The row it never leaves, so „put it back" is a real
                    // answer here rather than a journey to nowhere.
                    from: "zaklecia",
                  });
                }
                if (lifted !== entry.holdingId) rack.moveWithin(lifted, rack.lands(entry.holdingId));
                rack.setInsertAt(null);
                putDown();
              }}
              // Two clicks on the card speak it — the same gesture that puts
              // a Przedmiot on, for the act that is a hand's equivalent. It
              // goes through the same question the button below does, so a
              // Zaklęcie is never spent by a double-click that missed.
              onDoubleClick={
                now && !busy && !blocked
                  ? () => (mustAim ? setAiming(entry.holdingId) : onCast(entry.holdingId, {}))
                  : undefined
              }
            >
              {moving?.holdingId === entry.holdingId ? (
                /* The second question, in the same square as the first: the
                   Karta is chosen, and this is where it goes. */
                <div
                  className="flex flex-wrap justify-center gap-1"
                  style={{ width: SLOT_WIDTH }}
                >
                  <p className="w-full text-center text-[9px] text-muted">dokąd?</p>
                  {(boardCards.find((lying) => lying.id === moving.fieldCardId)?.moveTo ?? []).map(
                    (place) => (
                      <button
                        key={place.fieldId}
                        disabled={busy || blocked !== null}
                        onClick={() => {
                          onCast(entry.holdingId, {
                            fieldCardId: moving.fieldCardId,
                            destination: place.fieldId,
                          });
                          setMoving(null);
                        }}
                        className="rounded border border-magia/50 px-1.5 py-0.5 text-[10px] text-ink transition hover:bg-magia/20 disabled:opacity-50"
                      >
                        {place.name}
                      </button>
                    ),
                  )}
                  {(boardCards.find((lying) => lying.id === moving.fieldCardId)?.moveTo ?? [])
                    .length === 0 && (
                    <p className="w-full text-center text-[9px] text-vermilion/90">
                      nie ma dokąd — każdy inny Obszar w tym Kręgu jest zajęty
                    </p>
                  )}
                  <button
                    onClick={() => setMoving(null)}
                    className="text-[9px] text-muted underline hover:text-ink"
                  >
                    anuluj
                  </button>
                </div>
              ) : aiming === entry.holdingId && mustAim ? (
                <div
                  className="flex flex-wrap justify-center gap-1"
                  style={{ width: SLOT_WIDTH }}
                >
                  {aims.map((aim) => (
                    <button
                      key={aim.key}
                      disabled={busy || blocked !== null}
                      onClick={() => {
                        setAiming(null);
                        // A card that has somewhere to put its target down asks
                        // where before it sends anything.
                        if (moves && aim.target.fieldCardId !== undefined) {
                          setMoving({
                            holdingId: entry.holdingId,
                            fieldCardId: aim.target.fieldCardId,
                          });
                          return;
                        }
                        onCast(entry.holdingId, aim.target);
                      }}
                      className="rounded border border-magia/50 px-1.5 py-0.5 text-[10px] text-ink transition hover:bg-magia/20 disabled:opacity-50"
                    >
                      {aim.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setAiming(null)}
                    className="text-[9px] text-muted underline hover:text-ink"
                  >
                    anuluj
                  </button>
                </div>
              ) : (
                /* The Przedmiot's „użyj", for the act that is a hand's
                   equivalent: one word, underlined, in the colour of the thing
                   it spends. A Zaklęcie and a Przedmiot are the same object to
                   a player — a card you hold and may spend — and this was the
                   last place the two were drawn differently, as a bordered box
                   the width of the card with a label that changed under you.

                   One word, always the same word. It used to say „nie teraz"
                   or „brak celów" in the button's own face, which put a
                   sentence about the state of the board inside the control for
                   acting on it — and the tile is already dimmed when the window
                   is shut. Why it is greyed is on the hover, where the rest of
                   what the app knows about the card is. */
                <span className="flex items-center gap-2">
                  {/* Gone rather than greyed while the hand is over 2.6.
                  
                      Everything else this app cannot do right now is drawn and
                      dimmed, with the reason on the hover — a shut window, a
                      Kamień, a Wojna Żywiołów — because those are states the
                      turn moves through and the shape of the offer is worth
                      keeping still. This is not one of those. The table is
                      stopped until the surplus goes, `castSpell` refuses (2.6's
                      *natychmiast*, and 9.6 putting a Zaklęcie on somebody
                      else's Postać), and the only thing that ends it is the
                      „odrzuć" beside this. Two offers where one of them cannot
                      be taken is how a player spends the wait pressing the
                      wrong one. */}
                  {!surplus && (
                    <button
                      disabled={busy || !now || blocked !== null || nowhere}
                      onClick={() =>
                        mustAim ? setAiming(entry.holdingId) : onCast(entry.holdingId, {})
                      }
                      title={whyNot ?? script?.effect}
                      className="text-[9px] text-magia underline transition hover:text-ink disabled:text-muted/50 disabled:no-underline"
                    >
                      {CAST_VERB}
                    </button>
                  )}
                  {/* „odrzuć" and not „upuść", which is what the Plecak and the
                      Przyjaciele say. The two words are two destinations: a
                      Przedmiot is *put down* on the Obszar you are standing on
                      and 12.1 lets the next visitor take it, while a Zaklęcie
                      goes on the stos Kart już zużytych — 9.6's own place for a
                      spell leaving a hand, and the pile 9.5 reshuffles when the
                      deck runs out. 12.1 lists złoto, Przedmioty and Przyjaciół
                      and no Zaklęcia, so one left lying on a field would be a
                      card nobody could ever pick up — and 9.3 would have
                      published it on the way. */}
                  {surplus && onDrop && (
                    <button
                      disabled={busy}
                      onClick={() => onDrop(entry.holdingId)}
                      title="Nadwyżka ponad limit Magii — Karta idzie na stos Kart już zużytych (9.4, 9.6)"
                      className="text-[9px] text-muted underline transition hover:text-vermilion disabled:text-muted/50 disabled:no-underline"
                    >
                      odrzuć
                    </button>
                  )}
                </span>
              )}
            </ItemSlot>
          );
        })}
        {/* How much room 2.6 has left, drawn — the same squares the Plecak
            draws for 5.4, from the same component and in the same size. Not
            places to aim at: past the last card is the end of the row, which is
            what a free square means — so they take no events and the row
            behind them answers instead, exactly as in the Plecak. */}
        {/* No free squares to draw where there is no cap: „wolne" past the last
            card means „this many more will fit", and with 2.6 switched off the
            honest answer is a row that simply ends. */}
        {capacity !== undefined &&
          capacity !== null &&
          Array.from({ length: Math.max(0, capacity - held.length) }, (_, i) => (
            <ItemSlot
              key={`wolne-${i}`}
              item={null}
              label="wolne"
              glyph="+"
              tone="empty"
              disabled
              passive
            />
          ))}
      </TileRow>
      )}
    </Fold>
    {/* The card itself, stuck to the pointer — the same component the Plecak
        puts there, fixed to the window and above everything, so it does not
        matter which panel it was picked up in. */}
    <CarriedCard carried={carried} />
    </div>
  );
}
