"use client";

import { type SheetChrome } from "./draw-sheet";
import { MoveChoice, BridgeChoice } from "./move-choice";
import { FightSheet, type SpellFloor } from "./fight-sheet";
import { FieldOffer } from "./field-offer";
import { DrawnCard, type DrawnEntry } from "./drawn-card";
import { BridgeControls } from "./crossing-controls";
import { SpellHand, type HeldSpell } from "./spell-hand";
import type { TileCard } from "./card-tile";
import type { OnAction, Simulated } from "./turn-controls";
import type { Effect } from "@/lib/engine/cardScript";
import type { FieldId } from "@/lib/engine/board";
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
  onInspect,
  cards,
  resolved,
  fought,
  fight,
  move,
  bridge,
  fieldOffer,
  simulated,
  myEscape,
  ring,
  mySword,
  busy,
  onAction,
  onResolve,
  onResolveField,
  onFight,
  onEscape,
  onTake,
  onLeave,
}: {
  /** Whose turn this is, for everybody who is only watching it. */
  who: string;
  /**
   * Whether this device may press anything.
   *
   * False for everyone but the player whose turn it is — including a player
   * whose own character has died and is watching the rest of the game. They see
   * the card, the dice as they land and the verdict; what they do not get is a
   * say in somebody else's turn.
   */
  canAct: boolean;
  /** Whether whoever is looking at this has folded it away — anybody may. */
  minimized: boolean;
  onMinimize: () => void;
  /** A refusal from the last thing pressed, said inside the sheet that hides it. */
  error: string | null;
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
    target: { seatIndex?: number; fieldCardId?: string },
  ) => void;
  onInspect: (card: TileCard) => void;
  /** In 15.2 order, which is the order they are dealt with. */
  cards: DrawnEntry[];
  resolved: string[];
  fought: string[];
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
  /** Fields the character could be sent to, for the cards that let it choose. */
  ring: FieldId[];
  /** What the character fights with (1.5) — the Sobowtór's own strength. */
  mySword: number;
  busy: boolean;
  onAction: OnAction;
  onResolve: (
    cardId: string,
    decisions: { choices?: number[]; destination?: FieldId },
  ) => void;
  /** Throws the field's own table and applies the row. */
  onResolveField: (choices: number[]) => void;
  /** One creature, or several at once when 17.5 lets them attack together. */
  onFight: (cardIds: string[]) => void;
  onEscape: () => void;
  onTake: (cardId: string) => void;
  /** Nothing to do with this one — it stays on the field (16.8). */
  onLeave: (cardId: string) => void;
}) {
  const chrome: SheetChrome = { canAct, minimized, onMinimize, error };

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
        onInspect={onInspect}
      />
    );
  }

  // First card that is neither resolved, fought, nor waved past. 15.2 already
  // put them in order, so "first" is "next".
  const card = cards.find(
    (entry) => !resolved.includes(entry.cardId) && !fought.includes(entry.cardId),
  );

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
      ring={ring}
      mySword={mySword}
      busy={busy}
      onResolve={onResolve}
      onFight={onFight}
      onEscape={onEscape}
      onTake={onTake}
      onLeave={onLeave}
    />
  );
}
