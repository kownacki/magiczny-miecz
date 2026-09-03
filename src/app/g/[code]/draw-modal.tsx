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
import { nextFrame } from "@/lib/engine/kolejka";
import type { CardClass } from "@/data/types";
import type { Nature } from "@/data/types";
import type { Confirmation } from "./confirm";
import type { FieldId } from "@/lib/engine/board";
import type { SpellTiming } from "@/lib/engine/spells";
import type { EqMode } from "@/lib/engine/slots";
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
  /** In 15.2 order, which is the order they are dealt with. */
  cards: DrawnEntry[];
  resolved: string[];
  fought: string[];
  /** Wrogowie who died here (16.2). */
  beaten?: string[];
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
  /** Where the other Postacie stand, for the Karta that may not land on one. */
  occupied?: FieldId[];
  /** What the character fights with (1.5) — the Sobowtór's own strength. */
  mySword: number;
  /** Whose turn is being played, for the sheet's edge. */
  seatIndex: number;
  /** Who is acting, for the column down the left — see `SheetChrome`. */
  actor?: SheetChrome["actor"];
  /** The active character's Natura — see `DrawnCard`. */
  nature: Nature | null;
  /** Which equipment variant this table plays, for what a Przedmiot's bonus is conditional on. */
  eqMode: EqMode;
  /** The active character's last aggressive act — see `DrawnCard`. */
  aggression?: string | null;
  busy: boolean;
  /** What the acting player is about to do, passed straight through to `DrawnCard`. */
  intent?: { kind: string; option?: number } | null;
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
  /** Raises the table's one confirmation — see `ConfirmDialog`. */
  onAsk: (question: Omit<Confirmation, "tone">) => void;
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
