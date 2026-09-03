"use client";

import { type SheetChrome } from "./draw-sheet";
import { MoveChoice, BridgeChoice } from "./move-choice";
import { FightSheet, type SpellFloor } from "./fight-sheet";
import { FieldOffer } from "./field-offer";
import { DrawnCard } from "./drawn-card";
import type { DrawnActionsProps } from "./drawn-actions";
import { BridgeControls } from "./crossing-controls";
import { SpellHand, type HeldSpell } from "./spell-hand";
import type { TileCard } from "./card-tile";
import type { OnAction, Simulated } from "./turn-controls";
import type { Effect } from "@/lib/engine/cardScript";
import { nextFrame } from "@/lib/engine/kolejka";
import type { CardClass } from "@/data/types";
import type { SpellTiming } from "@/lib/engine/spells";
import type { Fight, TurnMoveOption } from "@/lib/engine/turn";

/**
 * Which of the turn's questions is being asked, and of whom.
 *
 * There are five and they are mutually exclusive: a road to pick, a Most to
 * enter, a fight to fight, an Obszar that demands something, and a Karta on the
 * table. Each wears the same sheet (`draw-sheet.tsx`) and each owns whatever
 * state only it needs — the fight keeps the floor clock, the two that walk a
 * card's options keep the choices made so far — so this is the order they are
 * asked in and nothing else.
 *
 * The order is not arbitrary. A move comes first because you cannot have drawn
 * a Karta on an Obszar you have not arrived at yet; a fight comes before the
 * stack because 11 says creatures present must be beaten or fled before
 * anything else happens; and a field's own table is asked only once the stack
 * is empty, because 15.2 puts the Karty first.
 */
export function DrawModal({
  who,
  canAct,
  minimized,
  onMinimize,
  error,
  spells,
  moment,
  opponents,
  floor,
  mySeatIndex,
  seatName,
  onClaimFloor,
  onReleaseFloor,
  onCastSpell,
  boardCards = [],
  spellRing = [],
  onInspect,
  cards,
  resolved,
  fought,
  beaten,
  fight,
  move,
  bridge,
  fieldOffer,
  simulated,
  myEscape,
  ring,
  occupied,
  mySword,
  nature,
  eqMode,
  seatIndex,
  actor,
  aggression,
  busy,
  intent,
  onAction,
  onResolve,
  onResolveField,
  onFight,
  onEscape,
  onTake,
  onLeave,
  onAsk,
}: SheetChrome &
  Omit<DrawnActionsProps, "card"> & {
    /**
     * Why two of these are derived rather than written out.
     *
     * This component's job is to pick one of five sheets and hand it what it
     * needs, so most of its props are not its own — they are the sheet's,
     * passing through. They used to be declared here from scratch anyway, with
     * their own copies of the doc comments, three of which said "see
     * `DrawnCard`": a comment pointing at where the truth lives is the
     * confession that it does not live here.
     *
     * `SheetChrome` is the six fields `chrome` is built from below, and
     * `DrawnActionsProps` is everything the card sheet takes. Minus `card`,
     * which is the one thing this component works out itself — `nextFrame`
     * picks it out of the stack, and nobody upstream knows which it will be.
     *
     * What is left below is what genuinely belongs to *this* layer: the other
     * four sheets' inputs, and the hand that is shown beside all of them.
     */
    /** The seat whose turn it is. Required here, though the chrome takes it or leaves it. */
    seatIndex: number;
    /**
     * This device's own hand, and everything a fight needs to let it speak.
     *
     * Shown to whoever is looking, fighting or watching: a Zaklęcie that says
     * "w dowolnej chwili" belongs to its holder wherever they are sitting, and
     * thirteen of the twenty-seven say exactly that.
     */
    spells: HeldSpell[];
    moment: readonly SpellTiming[];
    opponents: React.ComponentProps<typeof SpellHand>["opponents"];
    /** Who has claimed the moment before the dice, and until when. */
    floor: SpellFloor | null;
    mySeatIndex: number | null;
    seatName: (index: number) => string;
    onClaimFloor: () => void;
    onReleaseFloor: () => void;
    onCastSpell: (
      holdingId: string,
      target: {
        seatIndex?: number;
        fieldCardId?: string;
        fieldId?: string;
        destination?: string;
      },
    ) => void;
    /**
     * What a Zaklęcie aimed at a Karta or an Obszar may be aimed at.
     *
     * `spellRing` and not `ring`: the Krąg a spell may be thrown into is the
     * caster's, and the caster is whoever is holding the card rather than
     * whoever is moving.
     */
    boardCards?: React.ComponentProps<typeof SpellHand>["boardCards"];
    spellRing?: React.ComponentProps<typeof SpellHand>["ring"];
    onInspect: (card: TileCard) => void;
    /** The fight in progress, which is fought here rather than behind the sheet. */
    fight: Fight | null;
    /** The die has been thrown and the character is standing between two roads. */
    move: { roll: number; options: TurnMoveOption[] } | null;
    /** The Kamienny Most's entrance (11.9-11.11). */
    bridge: React.ComponentProps<typeof BridgeControls>["bridge"] | null;
    /** A field's compulsory table (16.5), when the character is standing on one. */
    fieldOffer: { name: string; effect: Effect } | null;
    simulated: Simulated;
    /** Whether this device is the character being attacked in a duel (17.6). */
    myEscape: boolean;
    onAction: OnAction;
    /** Throws the field's own table and applies the row. */
    onResolveField: (choices: number[]) => void;
  }) {
  const chrome: SheetChrome = { canAct, minimized, onMinimize, error, seatIndex, actor };

  if (move) {
    return (
      <MoveChoice
        who={who}
        chrome={chrome}
        move={move}
        busy={busy}
        onAction={onAction}
      />
    );
  }

  if (bridge) {
    return (
      <BridgeChoice
        who={who}
        chrome={chrome}
        bridge={bridge}
        simulated={simulated}
        busy={busy}
        onAction={onAction}
      />
    );
  }

  if (fight) {
    return (
      <FightSheet
        who={who}
        chrome={chrome}
        fight={fight}
        simulated={simulated}
        busy={busy}
        myEscape={myEscape}
        onAction={onAction}
        spells={spells}
        moment={moment}
        opponents={opponents}
        floor={floor}
        mySeatIndex={mySeatIndex}
        seatName={seatName}
        onClaimFloor={onClaimFloor}
        onReleaseFloor={onReleaseFloor}
        onCastSpell={onCastSpell}
        boardCards={boardCards}
        spellRing={spellRing}
        onInspect={onInspect}
      />
    );
  }

  /**
   * The Karta the turn is actually waiting on.
   *
   * This used to take the first one neither resolved nor fought, on the
   * grounds that "15.2 already put them in order, so first is next". 15.2
   * orders by *numeral*, and within one numeral the order is arrival — so a
   * square holding an optional CUDOTWÓRCA and a compulsory DOBRE BÓSTWO, both
   * Nieznajomi IV, opened on whichever was drawn first. If that was the
   * Cudotwórca the sheet offered „Rozpatrz, co się da" for a Karta the server
   * would always refuse: 16.4 makes the Bóstwo go first, `refuseWhileQueuedFor`
   * enforces it, and the player met the rule by pressing a live button.
   *
   * So it asks the same function the refusal does. `nextFrame` is the kolejka's
   * own answer to "what is in the way", and the sheet opens on that; only when
   * nothing is in the way does it fall back to the first unsettled Karta, which
   * is 12.1's window and where order stops mattering.
   *
   * `beaten` counts as settled here exactly as it does in `refuseWhileQueued` —
   * 17.4 finishes a Wróg whether he was beaten or fled — or the sheet would
   * keep opening on a creature the turn is done with.
   */
  const done = [...resolved, ...fought, ...(beaten ?? [])];
  const inTheWay = nextFrame(
    cards.map((entry) => ({ cardId: entry.cardId, cardClass: entry.cardClass as CardClass })),
    done,
  );
  const card = inTheWay
    ? cards.find((entry) => entry.cardId === inTheWay.cards[0].cardId)
    : cards.find((entry) => !done.includes(entry.cardId));

  // Nothing drawn to deal with, but the Obszar itself demands something.
  if (!card) {
    return fieldOffer ? (
      <FieldOffer
        who={who}
        chrome={chrome}
        offer={fieldOffer}
        busy={busy}
        onResolveField={onResolveField}
      />
    ) : null;
  }

  return (
    <DrawnCard
      who={who}
      chrome={chrome}
      card={card}
      cards={cards}
      resolved={resolved}
      fought={fought}
      beaten={beaten}
      ring={ring}
      occupied={occupied}
      mySword={mySword}
      nature={nature}
      eqMode={eqMode}
      aggression={aggression}
      busy={busy}
      intent={intent}
      onResolve={onResolve}
      onFight={onFight}
      onEscape={onEscape}
      onTake={onTake}
      onLeave={onLeave}
      onAsk={onAsk}
    />
  );
}
