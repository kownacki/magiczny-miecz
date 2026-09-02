"use client";

import { Fragment, useState } from "react";

import { fieldWithText } from "@/lib/view/fieldText";
import { dealtOn, marksFor } from "@/lib/view/fieldMarks";
import { FieldMarks } from "./field-marks";
import { CardTile } from "./card-tile";
import { TileRow } from "./tile-row";
import { tileFor } from "./table";
import { WithRules } from "./rule-ref";
import type { EqMode } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";
import { kindForCard } from "@/lib/engine/holdings";
import type { FieldId } from "@/lib/engine/board";
import { crossingFrom } from "@/lib/engine/rings";
import { BRIDGE_ORDEAL } from "@/lib/engine/bridge";
import { BridgeOrdeal, Crossing, Ferry } from "./crossing-controls";
import { FieldService, type OfferContext } from "./field-services";
import { OfferList, offersHere } from "./field-offers";
import type { Confirmation } from "./confirm";
import { isFerry } from "@/lib/engine/board";
import { RollTable } from "./roll-table";
import { parseRollTable } from "@/lib/engine/rollTable";
import type { CardId } from "@/data/ids";
import events from "@/data/events.json";
import items from "@/data/items.json";
import type { EventCard, Item } from "@/data/types";
import { Fold } from "./fold";
import { FieldGold } from "./field-gold";
import { fieldGroups, type FieldGroupKey } from "@/lib/view/fieldGroups";
import { seatColour } from "@/lib/view/boardMap";
import { TILE_WIDTH } from "@/lib/view/cardImages";
import { SeatFigure } from "./seat-figure";
import { Drawer } from "./drawer";

const EVENTS = events as EventCard[];

/**
 * Both decks a field can hold.
 *
 * Not only Karty Zdarzeń: 21.3 lets a Magiczny Miecz or a Tarcza Tolimana be
 * left on the board like anything else, and those are Wyposażenie — they have
 * ids the event deck has never heard of. Looking in one place showed the raw id
 * for exactly the cards worth leaving behind.
 */
const NAMES = new Map<string, string>([
  ...EVENTS.map((c) => [c.id, c.name] as const),
  ...(items as Item[]).map((c) => [c.id, c.name] as const),
]);
/** Only the event deck carries the class that says whether a card is takeable. */
const EVENT_BY_ID = new Map(EVENTS.map((card) => [card.id, card]));

/**
 * What to call a figure standing here.
 *
 * The player's name and not the Postać's, because this list answers "who is
 * here" and a seat is a person. Which Postać they are playing is the picture
 * itself, and the whole Karta is one hover away. „ty" the way the turn bar says
 * it — the one figure on the board a reader never has to identify.
 */
function nameOf(seat: SeatHere): string {
  if (seat.mine) return "ty";
  return seat.playerName ?? `Miejsce ${seat.seatIndex + 1}`;
}

/**
 * A Postać standing on this Obszar, as this window needs to draw one.
 *
 * Not `PublicSeat`: the roster's object carries four parameters, a hand, a
 * purse and an effect list, and none of that is what an Obszar is asked. What
 * is here is what stands here — who, as which Postać, and whether it is a
 * Postać at all this turn (20.1).
 */
export interface SeatHere {
  id: string;
  seatIndex: number;
  playerName: string | null;
  characterId: string | null;
  /** 20.1: the Kamień card is on the board in its place. */
  stone: boolean;
  /** Whose turn it is, marked here as well as in the bar. */
  active: boolean;
  /** The viewer's own figure. */
  mine: boolean;
}

export interface FieldCardHere {
  id: string;
  cardId: CardId;
  /** Conjured rather than drawn — the wrench says so, as it does everywhere else. */
  granted?: boolean;
  /**
   * On the Obszar, but held by the turn rather than by a `field_cards` row.
   *
   * The moment a character stops somewhere, `liftFieldCards` deletes every row
   * on that Obszar and the Karty move into the turn's own `drawn` — they come
   * back at the end of it through `leaveCardsBehind`. So for the whole of the
   * turn that is reading it, the Obszar looks empty to anything that asks the
   * table, and this window asked the table. It showed nothing on the one turn
   * anybody is looking.
   *
   * These are those Karty. They are on the Obszar in every sense the player
   * cares about; what they do not have is a `field_cards` row id, so
   * `take-field` cannot name them and the take goes by card id instead —
   * `onTakeDrawn` rather than `onTake`.
   *
   * The "weź" button used to be hidden on them for that reason, which made the
   * filing system visible: on the one turn anybody is standing here, every
   * Karta on the square is one of these, so the window offered the loose gold
   * and none of the loot beside it. 12.1 names both in one breath and neither
   * of the two ids is a thing a player can see.
   */
  viaTurn?: boolean;
  /** What is left beside a Miejsce that lays out points (16.7). */
  pool?: number;
  /** Turned over just now rather than found lying here — shown large in the reveal. */
  justDrawn?: boolean;
  /** Which slice came off the pile, so the picture is the copy that was dealt. */
  ref?: string;
}

/**
 * A shelf in the Obszar's inventory — the four `fieldGroups` builds, and the
 * one that holds no Karty.
 *
 * Złoto is not a group of cards and cannot be one: `fieldGroups` sorts `cards`,
 * and loose gold is not a card to sort. It is a shelf all the same, folding and
 * tallying like the rest, so the key type is the groups' plus it.
 */
type ShelfKey = FieldGroupKey | "zloto" | "gracze" | "opis";

/**
 * Where the Złoto shelf stands: at the head of what may be taken.
 *
 * 12.1 lists it first — "zabrać leżące złoto, Przedmioty lub Przyjaciół" — and
 * gold answers the same question the loot does, which is the only one this
 * window is really asked: what of this is mine to take. So the money leads the
 * things you pick up, in the box's own order, rather than sitting at the foot
 * under the Miejsca where a shelf appended to the list would have put it.
 *
 * Said as "before these" rather than as an index, because `fieldGroups` drops
 * the empty groups: a position counted into a list that changes length is right
 * until the first Obszar with no Wrogowie on it. The residents are in the set
 * as well as the loot, so an Obszar with a Labirynt and no Przedmioty still has
 * its gold above them and not tacked on at the end.
 */
const BEFORE_THE_LOOT = new Set<FieldGroupKey>(["rzeczy", "mieszkancy", "inne"]);

/**
 * A field, opened.
 *
 * The map can only ever be a summary — a name, some dots, one small picture —
 * and the questions a player actually has about a field are longer than that:
 * what does it say, what is lying on it, can I have any of it. So tapping one
 * opens it properly rather than filling in a panel somewhere off to the side,
 * which is where this lived before and where nobody looked.
 *
 * Cards lying here are drawn from their own illustrations at a size you can
 * recognise, because 16.8's whole point is that they are face up: what is
 * waiting on a field is public information and part of everybody's next
 * decision, not a surprise for whoever lands there.
 */
export function FieldModal({
  eqMode = "classic",
  nature = null,
  fieldId,
  cards,
  standingHere,
  canAct,
  /** Ending the turn: offered here, on the Obszar the turn finishes on. */
  canEnd = false,
  onEnd,
  busy,
  owed,
  onDraw,
  revealing = false,
  onDealSeen,
  onTake,
  onTakeDrawn,
  gold = 0,
  onTakeGold,
  standing = [],
  onPickSeat,
  asked = [],
  onClose,
  notice,
  phase,
  simulated = true,
  typedRolls = false,
  onAction,
  onSuggestion,
  onService,
  purse,
  stock,
  sellable,
  pack,
  blocked = null,
  onAsk,
  raid,
  friend,
}: {
  /** Which variant the table plays, so a hover can say where a card must be. */
  eqMode?: EqMode;
  nature?: Nature | null;
  fieldId: FieldId;
  cards: FieldCardHere[];
  /**
   * How many Karty this Obszar still owes (13.4), and the way to deal them.
   *
   * Absent when the window was opened off the map: reading about somewhere you
   * are not standing is the other half of what it is for, and 13.1 gives you
   * nothing to do there.
   */
  owed?: number;
  onDraw?: () => void;
  /**
   * The Karty are dealt and are being looked at, before any of them is worked.
   *
   * Badanie Obszaru is one motion at a table with two halves — deal what the
   * square owes, then everybody looks at what came up, all of it, before the
   * first Karta is picked up. This is the second half, and the window is
   * already the right place for it: it is the one the deal was made in.
   */
  revealing?: boolean;
  /** Done looking. The Karty go to the sheet and this window stands aside. */
  onDealSeen?: () => void;
  /** Whether the viewer's own character is on this field (12.1, 13.1). */
  standingHere: boolean;
  /** Whether it is their turn to be doing anything about it. */
  canAct: boolean;
  /** Whether the rules allow the turn to end yet — see `mayEndTurn`. */
  canEnd?: boolean;
  onEnd?: () => void;
  /**
   * Everything the Obszar can be *done* about, which used to live in a panel
   * that grew down the page: its die table, its shops, the crossing it offers
   * and the ordeal it is. Optional, because this same window opens from a tap
   * on the map — reading about somewhere you are not standing is the other half
   * of what it is for, and none of these belong there.
   */
  /**
   * What the app just decided by itself, said where it was decided.
   *
   * The die for an Obszar's table is thrown in here, so the answer belongs in
   * here. It used to land in a bordered line behind this window, which meant
   * closing the window to read the result of what you did in it.
   */
  notice?: string | null;
  phase?: string;
  simulated?: boolean;
  typedRolls?: boolean;
  onAction?: (body: Record<string, unknown>) => void;
  onSuggestion?: (stat: string, delta: number, reason: string) => void;
  onService?: (body: Record<string, unknown>) => void;
  purse?: { gold: number; life: number };
  stock?: Record<string, number>;
  sellable?: { id: string; cardId: string }[];
  /** What this seat holds and how much room 5.4 leaves them — see `whyPackIsFull`. */
  pack?: OfferContext["pack"];
  /**
   * 12.1's two exceptions, in the words the server refuses with.
   *
   * Computed where the turn's own lists are — see `whyNotCollectHere` — because
   * a Karta lying on this Obszar is filed under `field_cards` or under the
   * turn's `drawn` depending on nothing a player can see, and reading one list
   * is how this rule has been got wrong four times.
   */
  blocked?: string | null;
  /** Raises the app's one "are you sure?". Spending gold cannot be undone. */
  onAsk?: (ask: Confirmation) => void;
  /**
   * The Poszukiwacz Przygód's wyprawa, passed in rather than built here.
   *
   * It is the one action offered on this Obszar that is not *about* this
   * Obszar: the range is measured from here but every target is somewhere
   * else, so it needs the other seats and everything lying on the board —
   * neither of which this window has, and neither of which it should grow a
   * prop for. What it owns is the placement: after the move, under the field's
   * own business, above the button that ends the turn.
   */
  raid?: React.ReactNode;
  /**
   * What a Przyjaciel in your own hand offers on this Obszar and no other.
   *
   * Passed in for the same reason the wyprawa is: it is built from what the
   * seat is holding, which this window does not know and should not learn.
   */
  friend?: React.ReactNode;
  /**
   * Who is standing here (12.1, 19.1).
   *
   * The Obszar window listed everything on the square except the players on it,
   * which is the half a table actually looks at first: whether somebody else is
   * here decides whether the Karta lying there is still going to be there next
   * turn, and 19.1's wymknięcie się and every attack between Postacie are
   * questions about exactly this list.
   *
   * Public, like the Karty and for 16.8's reason — figures on a board are not
   * hidden — so it is drawn whether or not the viewer is standing here.
   */
  standing?: readonly SeatHere[];
  /** Open the roster on that seat, the same way the turn bar's chips do. */
  onPickSeat?: (seatId: string) => void;
  busy: boolean;
  onTake: (fieldCardId: string) => void;
  /**
   * The same act on a Karta the turn is holding, which has no row to name.
   *
   * Two doors because there are two ids, not because there are two rules: the
   * command behind each checks the same 12.1, down to `refuseOverAFoe`.
   */
  onTakeDrawn?: (cardId: CardId, at: string) => void;
  /**
   * Sztuki Złota lying loose on the Obszar, which are not Karty and never were.
   *
   * 12.1 names them in the same breath as the Karty — "zabrać leżące złoto,
   * Przedmioty lub Przyjaciół" — and they arrive here the same three ways: a
   * Karta that pays out on a square, a character who died on it (4.4), one
   * turned to stone. What they never are is a card, so they get a shelf of
   * their own rather than a fake Karta with a number on it.
   */
  gold?: number;
  onTakeGold?: (gold: number) => void;
  /** Cards whose take the server has not answered yet — see `asked` in the table. */
  asked?: readonly string[];
  onClose: () => void;
}) {
  /**
   * Which groups the reader has shut, by key.
   *
   * Shut rather than open, so a group that appears mid-turn — somebody drops a
   * Miecz on the Obszar you are reading — arrives open like the rest. Local to
   * the window on purpose: this is one reader tidying one Obszar, not a
   * preference about how the app looks, and `preferences.ts` is for the second
   * kind.
   *
   * „opis" is the one seeded shut, and is the exception that shows why the set
   * is the shut ones. The board's own paragraph is there to be checked against
   * rather than read — everything a player acts on is already downstairs in a
   * form they can act on — so it opens closed and every shelf of actual Karty
   * opens open.
   */
  const [shut, setShut] = useState<ReadonlySet<ShelfKey>>(() => new Set(["opis"]));
  /**
   * Which offer is open, by its key, or null in the Obszar's own view.
   *
   * The window is a two-level tree: what is *here*, and the one thing you have
   * walked up to. A Płatnerz with three prices, a Medyk with four wounds and a
   * Lichwiarz with your whole pack in it were all on the same scroll as the
   * Karty lying on the square and the button that ends the turn, which on the
   * Osada is four shops' worth of controls under one heading.
   *
   * The key and not the offer, so it survives the list being rebuilt on every
   * poll — and so that walking off the square, or a Karta being taken off it,
   * simply stops matching and drops the reader back to the Obszar rather than
   * leaving them in a shop that is no longer there.
   */
  const [openOffer, setOpenOffer] = useState<string | null>(null);
  // Above the `!field` guard below: a hook after an early return is called on
  // some renders and not others, which is the one thing React will not have.
  const toggle = (key: ShelfKey) =>
    setShut((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const field = fieldWithText(fieldId);

  if (!field) return null;

  // 12.1 gives the right to take what is lying here to the character whose move
  // ENDS here, and only until the end of that turn.
  const arrived = phase === "field";

  /**
   * Grouped for reading, which is not the order they resolve in.
   *
   * `cards` arrives in arrival order — `fieldCardsFor` reads `field_cards` by
   * `created_at` — and `fieldGroups` keeps it inside each group. The stack a
   * player actually walks through when their move ends here is
   * `resolutionOrder`'s, I through VI, and it is untouched by any of this: see
   * the note at the top of `fieldGroups.ts` for why there are two.
   */
  const groups = fieldGroups(cards);
  /**
   * Which shelf the Złoto goes in front of, or null when there is none lying
   * here. `findIndex` answers -1 on an Obszar holding only Spotkania and
   * Wrogowie — nothing there is takeable — and then the money is simply last,
   * which on an Obszar holding only gold is also first.
   */
  const goldAt = (() => {
    if (gold <= 0) return null;
    const takeable = groups.findIndex((group) => BEFORE_THE_LOOT.has(group.key));
    return takeable === -1 ? groups.length : takeable;
  })();
  /** What the deal just turned over, for the reveal above the rest. */
  const drawnNow = cards.filter((card) => card.justDrawn);

  /**
   * Everything this Obszar offers, and which of them is open.
   *
   * Built for anybody who opened the window, not only for whoever is standing
   * here: „co tam jest" includes who keeps a shop there, and a player deciding
   * where to move next is asking exactly that. 13.1 governs the buttons inside
   * an offer, and `shutBecause` is what they say instead.
   */
  const offers = offersHere(
    fieldId,
    cards.map((card) => ({ cardId: card.cardId, pool: card.pool, granted: card.granted })),
  );
  const open = offers.find((offer) => offer.key === openOffer) ?? null;

  /**
   * Why an offer cannot be acted on, in the order the refusals arrive.
   *
   * 13.1 first, because it is the widest — "w żadnym przypadku nie mogą nikogo
   * spotkać ani wogóle podejmować żadnych czynności na Obszarze, z którego
   * rozpoczynają ruch" — and then 12.1's two exceptions, which `blocked`
   * carries in the words `refuseOverAFoe` and `refuseWhileOwing` throw.
   *
   * Null means the offer is live. Everything below reads this rather than
   * re-deriving it, so a shop, a healer and a die table are shut by one
   * sentence and cannot come apart the way the four takers did.
   */
  const shutBecause = !standingHere
    ? "Odwiedzać można tylko Obszar, na którym się stoi (13.1)."
    : !canAct
      ? "To nie twoja tura (10.1)."
      : !arrived
        ? "Odwiedzać można dopiero po zakończeniu tu ruchu (13.1)."
        : blocked;

  /** Everything the controls under an open offer need, gathered once. */
  const offerCtx: OfferContext = {
    busy,
    typedRolls,
    onRollOffer: () =>
      open && onAction?.({ action: "pole-tabela", offer: open.key }),
    gold: purse?.gold ?? 0,
    life: purse?.life ?? 0,
    stock,
    sellable,
    pack,
    blocked: shutBecause,
    eqMode,
    nature,
    onAsk: onAsk ?? (() => {}),
    onSuggestion: onSuggestion ?? (() => {}),
    onService,
  };

  /**
   * Whether either action section has anything in it.
   *
   * Both were rendered on the gate alone — standing here, on your turn, in the
   * field phase — and both carry a `border-t`, so an Obszar that offers nothing
   * drew a rule across the window with nothing under it. Płaskowyż Mgieł draws
   * three: it has no ferry, no die table, no shop, no crossing and no ordeal,
   * and it showed three dividers stacked at the bottom, one per empty box.
   *
   * A rule is a separator, so it needs two things to separate.
   */
  const hasOffers =
    isFerry(fieldId) ||
    (field.text !== undefined && parseRollTable(field.text) !== null);
  const hasCrossing =
    crossingFrom(fieldId) !== undefined ||
    BRIDGE_ORDEAL.has(fieldId) ||
    (phase === "field" && (raid !== undefined || friend !== undefined));

  /**
   * A function rather than an element because the shelf has two homes — between
   * two groups, or alone on an Obszar that holds nothing else — and `first`
   * (the rule above it) is the one thing that differs between them.
   */
  const goldShelf = (first: boolean) => (
    <Fold
      key="zloto"
      title="Złoto"
      tally={gold}
      first={first}
      tone="text-muted/70"
      open={!shut.has("zloto")}
      onToggle={() => toggle("zloto")}
    >
      <FieldGold
        gold={gold}
        /* The same gate the Karty's own "weź" has: 12.1 gives what is lying
           here to the character whose move ENDS here, and only until that turn
           is over. */
        canTake={standingHere && canAct && arrived && !blocked && onTakeGold !== undefined}
        busy={busy}
        onTake={(amount) => onTakeGold?.(amount)}
      />
    </Fold>
  );

  /**
   * Who is standing here, above everything lying here.
   *
   * First of the shelves and not last, because it is the first question asked
   * of a square you are thinking of moving to. What is lying on an Obszar is
   * loot and it will still be loot next turn; who is standing on it is the part
   * that can attack you, be attacked, or take the loot before you get there.
   *
   * A figure and not a Karta, so it is drawn with `SeatFigure` rather than
   * `CardTile` — and that is the same object 20.1 swaps for the Kamień card, so
   * a statue on this Obszar reads as a statue here exactly as it does in the
   * turn bar and the roster.
   */
  const players = standing.length === 0 ? null : (
    <Fold
      key="gracze"
      title="Gracze"
      tally={standing.length}
      first
      tone="text-muted/70"
      open={!shut.has("gracze")}
      onToggle={() => toggle("gracze")}
      /* Shut, the names — the same thing the card shelves keep, and for the
         same reason: "Gracze 2" is a reason to look again and the two names
         are the answer. */
      aside={
        shut.has("gracze") ? (
          <span className="min-w-0 flex-1 truncate normal-case tracking-normal text-ochre/80">
            {standing.map(nameOf).join(" · ")}
          </span>
        ) : undefined
      }
    >
      <TileRow frame={false}>
        {standing.map((seat) => (
          <figure key={seat.id} className="flex flex-col items-center gap-1">
            <SeatFigure
              characterId={seat.characterId}
              stone={seat.stone}
              width={TILE_WIDTH}
              colour={seatColour(seat.seatIndex)}
              /* No lookup — see `lookup` on the component. This shelf is a
                 list of *people*, and the one question it raises is answered
                 in Gracze, which is where the click goes. A hover onto the
                 Karta Postaci here would be a second answer to a question
                 nobody asked of an Obszar. */
              lookup={false}
              onClick={onPickSeat ? () => onPickSeat(seat.id) : undefined}
              title={
                onPickSeat ? `${nameOf(seat)} — otwórz w Graczach` : nameOf(seat)
              }
            />
            <figcaption
              style={{ width: TILE_WIDTH }}
              className={`truncate text-center text-[9px] leading-tight ${
                seat.active ? "text-ochre" : "text-muted"
              }`}
              title={nameOf(seat)}
            >
              {nameOf(seat)}
            </figcaption>
          </figure>
        ))}
      </TileRow>
    </Fold>
  );

  return (
    /**
     * A drawer over the board, not a window over the table.
     *
     * An Obszar is read *against* your own column: how much gold have I, how
     * much room is left in the Plecak, is this Miecz better than the one I am
     * holding. A modal centred on the screen covered exactly the panel holding
     * the answers, so every one of those questions cost a close and a reopen —
     * and the Księga next door had already solved it, which is why a card you
     * look up mid-fight is a drawer and not a window.
     *
     * Left, over the board, for the same reason the Księga takes that side:
     * the board is what the Obszar *is*, so covering it costs nothing while
     * reading about it, and the right-hand column — your Postać — stays whole.
     * `table-layout.tsx` gives the board column a floor of the same width so a
     * narrow window cannot let this spill across it.
     */
    <Drawer
      side="left"
      width="max-w-[var(--shelf-w)]"
      title={
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate">{field.name}</span>
          {/**
           * The same row the map draws under this square, from the same
           * `marksFor`: what is here, said the same way in both places, so a
           * player who has learnt the map has learnt this.
           *
           * Sized to the bar rather than the bar to them: `SurfaceHead` is a
           * fixed 32 now, so 16 sits inside it with room either side and
           * nothing about this row can move the strip.
           */}
          <span className="shrink-0 text-muted/80">
            <FieldMarks marks={marksFor(fieldId, cards)} draw={dealtOn(fieldId)} size={16} />
          </span>
        </span>
      }
      onClose={onClose}
      /**
       * The way back, in a strip of its own under the Obszar's name.
       *
       * Two levels and a rule between them: the drawer's header says where you
       * are on the board and never changes, this says which of its offers you
       * have walked up to. `beneath` and not `head` — inside the header box the
       * two sat under one border and read as a title that had wrapped, which is
       * the opposite of what a back button is for.
       *
       * The arrow is on the left because that is where a reader looks for the
       * way out of somewhere, and the name is beside it rather than centred so
       * the two read as one sentence — ← Płatnerz.
       */
      beneath={
        open ? (
          <div className="flex items-baseline gap-2">
            <button
              onClick={() => setOpenOffer(null)}
              title={`Wróć do: ${field.name}`}
              className="rounded px-1 text-sm text-ochre transition hover:bg-edge"
            >
              ←
            </button>
            <span className="min-w-0 truncate font-[family-name:var(--font-display)] text-sm tracking-wide text-ink">
              {open.label}
            </span>
            {/**
             * What you have to spend, beside the name of whoever is asking.
             *
             * It was a `RailStat` inside the subview — the żetony from the
             * Karta Postaci — and a pile of nine coins is a tall, loud thing to
             * put above three prices. The figure is all a shop needs, and up
             * here it is out of the way of the goods while staying on screen
             * the whole time you are deciding.
             */}
            {purse && open.gold && (
              <span className="ml-auto shrink-0 text-[11px] text-muted">
                Twoje Złoto: <span className="tnum text-zloto">{purse.gold}</span>
              </span>
            )}
          </div>
        ) : undefined
      }
    >
        <div className="flex flex-col gap-4 px-4 py-3">
          {/* Above the fork, so a die thrown inside an offer is answered inside
              it — the throw happens in here and the result belongs in here. */}
          {notice && (
            <p className="rounded border-l-2 border-ochre bg-ochre/5 px-3 py-2 text-sm text-ochre">
              <WithRules text={notice} />
            </p>
          )}

          {open ? (
            <FieldService offer={open} ctx={offerCtx} />
          ) : (
          <>
          <section>
            {/**
             * The sum done out loud, and the button that acts on it.
             *
             * 13.4 is arithmetic a table does by looking — three printed, two
             * lying, deal one — and the app was making the player do it from
             * two numbers in different places, then press a button in a third.
             * Badanie Obszaru is one motion and this is where it is read, so
             * this is where it happens.
             */}
            {owed !== undefined && owed > 0 && onDraw && (
              <button
                onClick={onDraw}
                disabled={busy}
                className="mb-2 w-full rounded border border-ochre bg-ochre/10 px-2 py-2 font-[family-name:var(--font-display)] text-[13px] tracking-wide text-ochre transition hover:bg-ochre/20 disabled:opacity-40"
              >
                Wyciągnij {owed === 1 ? "kartę" : `${owed} ${owed < 5 ? "karty" : "kart"}`}
              </button>
            )}

            {/**
             * The board's own words, whole and unedited, on every Obszar.
             *
             * Folded, and folded by default. The pieces of it a player acts on
             * are already downstairs where they can be acted on — each offer's
             * line is on the button that opens it, the prices are on the shelf,
             * the count of Karty is under the name — so the paragraph up here
             * is not how the square is read. It is how the square is *checked*:
             * a referee that has misread the board is exactly what a player
             * wants to catch, and they can only catch it against the printed
             * text.
             *
             * Verbatim and complete, including the „MOŻESZ TU ODWIEDZIĆ:"
             * heading and the lines the buttons carry. A quotation with the
             * quoted parts removed is not a thing you can check anything
             * against, which is the whole reason it is here.
             */}
            <Fold
              title="Oryginalny opis"
              first
              tone="text-muted/70"
              open={!shut.has("opis")}
              onToggle={() => toggle("opis")}
            >
              <p className="whitespace-pre-line text-xs leading-relaxed text-muted">
                {field.text ?? "Brak przepisanego tekstu dla tego Obszaru."}
              </p>
            </Fold>
          </section>

          {/**
           * The deal, at the size the Karty were turned over at.
           *
           * A tile is for recognising a Karta you already know is there; this
           * is the moment it *arrives*, and at a table that moment is three
           * pieces of card face up in front of everybody, read before anything
           * is picked up. So the ones that just came off the pile are shown
           * whole and full size, above what was already lying here — which the
           * section below goes on listing, tiles and all, because that is the
           * other half of what the reveal is for.
           */}
          {revealing && drawnNow.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] uppercase tracking-widest text-verdigris">
                Wyciągnięto {drawnNow.length}{" "}
                {drawnNow.length === 1 ? "kartę" : drawnNow.length < 5 ? "karty" : "kart"}
              </h3>
              {/* The same tiles as everywhere else, and for the reason the
                  whole app draws them: a Karta is recognised by its picture,
                  and the picture carries a hover that opens the whole thing.
                  Three Karty at full size wanted a window half again as wide
                  as the one the rest of this reads in — and made the paragraph
                  above them a line nobody reads twice — for a size you can get
                  by pointing at the tile. */}
              <TileRow frame={false}>
                {drawnNow.map((card) => (
                  <CardTile
                    key={card.id}
                    card={tileFor({ cardId: card.cardId, granted: card.granted })}
                    eqMode={eqMode}
                    nature={nature}
                  />
                ))}
              </TileRow>
            </section>
          )}

          {/**
           * What there is to go and do here, one button each.
           *
           * Above what is lying on the Obszar, because it is the shorter list
           * and the one that is *about* the square rather than about what
           * happens to be on it this turn. An Osada with three Karty dealt onto
           * it pushed its own Płatnerz below three shelves of cardboard, so the
           * thing that is permanently true about the Obszar read as an
           * afterthought to the thing that is true until somebody picks it up.
           *
           * Drawn for anybody reading the window — a shop is part of what an
           * Obszar *is*, and knowing the Osada has a Płatnerz is how you decide
           * to walk there. What 13.1 shuts is inside.
           */}
          <OfferList offers={offers} eqMode={eqMode} nature={nature} onOpen={setOpenOffer} />

          <section>
            {/* "Leży tutaj" was the old heading and it said the wrong thing
                twice: a Karta gets here by being *placed* as often as by being
                left — the Upiór's die table names six Obszary, the Eremita's
                six more, and Władca Zdarzeń moves any face-up Karta to a chosen
                one — and "leży" reads as abandoned, which a Cudotwórca living
                here to the end of the game is not. What they all have in common
                is the Obszar, so the heading says that and nothing else. */}
            <h3 className="mb-2 text-[11px] uppercase tracking-widest text-muted">
              Karty i zasoby na tym Obszarze
            </h3>
            {groups.length === 0 && goldAt === null && players === null ? (
              <p className="text-xs text-muted/70">Nic — Obszar jest pusty.</p>
            ) : (
              /* One `Fold` per group, the same section every shelf in the app
                 is built from — the rule above it, the small capitals, the
                 tally beside the name, the triangle.

                 `fieldGroups` has already dropped the empty ones, so an Obszar
                 with a single Wróg on it reads "Wrogowie 1" and stops. */
              <>
                {players}
                {groups.map((group, at) => (
                  <Fragment key={group.key}>
                    {at === goldAt && goldShelf(at === 0 && players === null)}
                    <Fold
                      title={group.title}
                      tally={group.cards.length}
                      first={at === 0 && goldAt !== 0 && players === null}
                      /* A step below the section heading, which is the same size and
                         the same small capitals — two headings at one weight read
                         as two unrelated blocks rather than a heading and the
                         groups under it. `tone` is the knob `Fold` already has for
                         exactly this. */
                      tone="text-muted/70"
                      open={!shut.has(group.key)}
                      onToggle={() => toggle(group.key)}
                      /* What the heading keeps when it is shut, exactly as
                         Przyjaciele does: the tally alone says how many are hidden
                         and not which, and on an Obszar which is the whole
                         question — "Wrogowie 2" is a reason to look again, and
                         "Wilkołak · Demon" is a reason to walk away. */
                      aside={
                        shut.has(group.key) ? (
                          <span className="min-w-0 flex-1 truncate normal-case tracking-normal text-ochre/80">
                            {group.cards
                              .map((lying) => NAMES.get(lying.cardId) ?? lying.cardId)
                              .join(" · ")}
                          </span>
                        ) : undefined
                      }
                    >
                      {/* The same tiles as the Plecak and the Księga, for the same
                          reason: a card is recognised by its picture, and a player
                          who has learnt one shelf should not have to learn a second
                          shape for the identical act. Everything the app knows
                          about a card is one hover away on all three. */}
                      <TileRow frame={false}>
                        {group.cards.map((lying) => {
                          // Only Przedmioty and Przyjaciele are picked up (12.1). A
                          // Wróg lying here is fought and a Spotkanie is read — and
                          // a card off the Wyposażenie sheet is always a Przedmiot.
                          const event = EVENT_BY_ID.get(lying.cardId as EventCard["id"]);
                          const takeable = event
                            ? kindForCard(event) !== null
                            : NAMES.has(lying.cardId);
                          return (
                            <CardTile
                              key={lying.id}
                              /* Through `tileFor` like every other shelf: the name,
                                 the printed text and the conjured mark are its
                                 business, and building the object here by hand is
                                 what lost the mark on an Obszar in the first place.
                                 `holdable` stays local — 12.1 is about where the
                                 card is, which is the one thing this window knows
                                 and `tileFor` does not. */
                              card={{
                                ...tileFor({ cardId: lying.cardId, granted: lying.granted }),
                                holdable: takeable,
                              }}
                              eqMode={eqMode}
                              nature={nature}
                              /* The ask is out and the answer is not a foregone
                                 conclusion — 12.1 can be lost to somebody standing
                                 on the same Obszar — so the card greys where it
                                 lies and moves once the server says it moved. */
                              dimmed={asked.includes(lying.id)}
                            >
                              {takeable &&
                                standingHere &&
                                canAct &&
                                arrived &&
                                /* 12.1's window, which is shut while the
                                   kolejka runs and while a Wróg is standing.
                                   The server refuses either way; this is so
                                   the button is not there to be pressed, which
                                   is the whole reason `blocked` is computed
                                   from the engine's own sentence. */
                                !blocked &&
                                (!lying.viaTurn || onTakeDrawn !== undefined) && (
                                <button
                                  /* Only this card's own ask, never the table's
                                     `busy`: what is lying on one Obszar is several
                                     independent questions, and closing all of them
                                     because one is out makes a player wait a round
                                     trip per card for no reason the rules give. */
                                  disabled={asked.includes(lying.id)}
                                  onClick={() =>
                                    lying.viaTurn
                                      ? onTakeDrawn?.(lying.cardId, lying.id)
                                      : onTake(lying.id)
                                  }
                                  className="text-[9px] text-verdigris underline transition hover:text-ink disabled:text-muted/50 disabled:no-underline"
                                >
                                  weź
                                </button>
                              )}
                            </CardTile>
                          );
                        })}
                      </TileRow>
                    </Fold>
                  </Fragment>
                ))}
                {goldAt === groups.length && goldShelf(groups.length === 0 && players === null)}
              </>
            )}
            {/* 13.1 and 12.1: things happen on the field your move ended on, so
                a player reading about somewhere else is told why there is no
                button rather than left to wonder. */}
            {/* Standing on it is not enough: 12.1 gives this to the character
                whose move ENDS here, and only until the end of that turn. Said
                rather than left as a missing button, because a player looking
                at a card they left behind yesterday needs to know why they
                cannot pick it up rather than assume the app is broken. */}
            {cards.length > 0 && standingHere && !arrived && (
              <p className="mt-2 text-[11px] text-muted/70">
                Zabrać można dopiero po zakończeniu tu ruchu (12.1) — te Karty
                czekają na Postać, która skończy tutaj swój ruch.
              </p>
            )}

            {cards.length > 0 && !standingHere && (
              <p className="mt-2 text-[11px] text-muted/70">
                Zbierać można tylko z Obszaru, na którym się stoi (12.1).
              </p>
            )}

            {/* The 12.1 window itself, shut. Standing here on your own turn
                having ended your move, and still nothing to press: a Wróg is
                up, the deal is unfinished, or the kolejka has something in it.
                The sentence is the engine's, so it is word for word what the
                server would have refused with. */}
            {(cards.length > 0 || gold > 0) && standingHere && canAct && arrived && blocked && (
              <p className="mt-2 text-[11px] text-muted/70">
                <WithRules text={blocked} />
              </p>
            )}
          </section>

          {/* Last of what the reveal is: you have seen the deal and what was
              already here, and this is the way on. At the foot of the two
              because it follows them — a "go on" above the thing it goes on
              from is a button you press before you have read anything. */}
          {revealing && onDealSeen && (
            <button
              onClick={onDealSeen}
              disabled={busy}
              className="w-full rounded border border-ochre bg-ochre/10 px-2 py-2 font-[family-name:var(--font-display)] text-[13px] tracking-wide text-ochre transition hover:bg-ochre/20 disabled:opacity-40"
            >
              Rozpatrz po kolei
            </button>
          )}

          {/* What can be done here, for whoever is standing here on their own
              turn. Everyone can read the Obszar — at a table the others read it
              aloud and argue about it — but only the character on it acts.
              
              And only on the turn they arrived. 13.1 could not be plainer:
              "W żadnym przypadku nie mogą nikogo spotkać ani wogóle podejmować
              żadnych czynności na Obszarze, z którego rozpoczynają ruch." The
              field you begin a turn standing on is the one you finished the
              last turn on, and it is spent. `resolveFieldOffer` refuses it
              server-side too; this is so the button is not there to be pressed
              in the first place. */}
          {standingHere && canAct && onAction && phase === "field" && hasOffers && (
            <section className="flex flex-col gap-3 border-t border-edge/60 pt-3">
              {/* 11.2's toll, which is a thing this Obszar asks of you and so
                  belongs with the rest of what it asks. */}
              {isFerry(fieldId) && <Ferry busy={busy} onAction={onAction} />}

              {/* The die table, where the field has one. */}
              {field.text && (
                <RollTable
                  text={field.text}
                  busy={busy}
                  typedRolls={typedRolls}
                  onSuggestion={onSuggestion}
                />
              )}

            </section>
          )}

          {/* The two exceptions 13.1 makes room for, and the reason they are
              outside the gate above: 11.4 puts retrying a crossing in the next
              turn by name — "czy będzie ponownie próbowała przekroczyć granicę
              Kręgów" — and the Kamienny Most's ordeals are things you sit
              through more than once, because the Demon does not move and
              neither do you. Both are therefore offered before the roll as
              well as on arrival. */}
          {standingHere &&
            canAct &&
            onAction &&
            (phase === "field" || phase === "roll") &&
            (hasCrossing || onEnd) && (
            /**
             * One rule at this boundary, and this section owns it.
             *
             * Twice now a pair of them has shown up here with nothing in
             * between, and twice the fix was to work out which of the two
             * should be suppressed — a condition on the section, then another
             * on the control inside it. Two conditions that have to agree are
             * how you get two rules: each was right on its own and they were
             * both true at once.
             *
             * So the boundary has an owner. This section draws the rule
             * whenever it renders, and it only renders with something in it
             * (`hasCrossing || onEnd`); nothing inside it draws one at all.
             * `gap-3` is what separates a crossing from the button below it,
             * which is what separates every other pair of things in here.
             */
            <section className="flex flex-col gap-3 border-t border-edge/60 pt-3">
              {crossingFrom(fieldId) && (
                <Crossing
                  crossing={crossingFrom(fieldId)!}
                  simulated={simulated}
                  busy={busy}
                  onAction={onAction}
                />
              )}
              {BRIDGE_ORDEAL.has(fieldId) && (
                <BridgeOrdeal fieldId={fieldId} busy={busy} onAction={onAction} />
              )}

              {/* "Po zakończeniu ruchu" — so it sits with the things done after
                  arriving, and only in the `field` phase: `roll` shares this
                  gate for the two crossings 11.4 and the Most put in the next
                  turn, and a raid is not one of them. */}
              {phase === "field" && raid}

              {/* The Księżniczka and the Władca, on the one Obszar each of them
                  is worth something. Same gate as the wyprawa: after the move,
                  where you ended it. */}
              {phase === "field" && friend}

              {/* Ending the turn, which lives here and nowhere else.
                  
                  It was a small button in the box in the corner, across the
                  screen from everything it comes after — so a turn was read in
                  one place and finished in another. The Obszar's window is the
                  last thing a turn does, and this is the last thing in it.

                  There is no button until the turn really can end, and nothing
                  in its place. */}
              {onEnd && (
                <div className="flex flex-col gap-1">
                  {/**
                   * The button, and nothing when there is no button.
                   *
                   * Two things went before it. A greyed control, on the
                   * reasoning that a disabled thing which does not say why
                   * looks broken — but with the kolejka and the Obszar's own
                   * instruction counted as duties, the turn cannot be ended for
                   * most of the time it is being played, so it was greyed
                   * nearly always. Then the refusal standing alone in its
                   * place, which was the same sentence said a fourth time: the
                   * kolejka strip names what is next, the turn's pill names it,
                   * and the notice up beside the Karty names it under 12.1.
                   *
                   * The foot of the Obszar is where a turn ends. A running
                   * commentary on why it has not is not what it is for.
                   */}
                  {canEnd ? (
                    <button
                      onClick={onEnd}
                      disabled={busy}
                      className="rounded border border-ochre bg-ochre/10 px-3 py-2 font-[family-name:var(--font-display)] text-sm tracking-wide text-ochre transition hover:bg-ochre/20 disabled:opacity-40"
                    >
                      Zakończ turę
                    </button>
                  ) : null}
                </div>
              )}
            </section>
          )}
          </>
          )}
        </div>
    </Drawer>
  );
}
