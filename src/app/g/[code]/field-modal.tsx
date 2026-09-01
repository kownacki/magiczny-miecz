"use client";

import { Fragment, useState } from "react";

import { fieldWithText } from "@/lib/view/fieldText";
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
import { fieldScriptFor, offersFromCard } from "@/lib/engine/fieldScript";
import { BridgeOrdeal, Crossing, Ferry } from "./crossing-controls";
import { FieldServices } from "./field-services";
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
import { Overlay } from "./overlay";
import { CloseButton } from "./chrome";

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
   * cares about; what they do not have is a row id, so `take-field` cannot name
   * them and the "weź" button belongs to the sheet that is working through them
   * rather than to this list.
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
type ShelfKey = FieldGroupKey | "zloto";

/**
 * Where the Złoto shelf stands: after the loot, before the residents.
 *
 * 12.1 lists what may be taken in that order — "zabrać leżące złoto, Przedmioty
 * lub Przyjaciół" — and gold answers the same question the loot does, which is
 * the only one this window is really asked: what of this is mine to take. So it
 * sits with the things you pick up rather than at the foot under the Miejsca,
 * which is where a shelf appended to the list would have put it.
 *
 * Said as "before these" rather than as an index, because `fieldGroups` drops
 * the empty groups: a position counted into a list that changes length is right
 * until the first Obszar with no Wrogowie on it.
 */
const AFTER_THE_LOOT = new Set<FieldGroupKey>(["mieszkancy", "inne"]);

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
  whyNotEnd,
  onEnd,
  busy,
  owed,
  onDraw,
  revealing = false,
  onDealSeen,
  onTake,
  gold = 0,
  onTakeGold,
  asked = [],
  onInspect,
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
  /** The rule that refuses, quoted, when they do not. */
  whyNotEnd?: string | null;
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
  busy: boolean;
  onTake: (fieldCardId: string) => void;
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
  onInspect: (cardId: CardId) => void;
  onClose: () => void;
}) {
  /**
   * Which groups the reader has shut, by key.
   *
   * Shut rather than open, so the default needs no seeding and a group that
   * appears mid-turn — somebody drops a Miecz on the Obszar you are reading —
   * arrives open like the rest. Local to the window on purpose: this is one
   * reader tidying one Obszar, not a preference about how the app looks, and
   * `preferences.ts` is for the second kind.
   */
  const [shut, setShut] = useState<ReadonlySet<ShelfKey>>(() => new Set());
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
   * here. `findIndex` answers -1 when nothing comes after the loot, and then
   * the money is simply last — which on an Obszar holding only gold is also
   * first.
   */
  const goldAt = (() => {
    if (gold <= 0) return null;
    const residents = groups.findIndex((group) => AFTER_THE_LOOT.has(group.key));
    return residents === -1 ? groups.length : residents;
  })();
  /** What the deal just turned over, for the reveal above the rest. */
  const drawnNow = cards.filter((card) => card.justDrawn);

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
    (field.text !== undefined && parseRollTable(field.text) !== null) ||
    fieldScriptFor(fieldId) !== null ||
    // What has settled here counts too: the services of an Obszar are not all
    // printed on it. See `offersFromCard`.
    cards.some((card) => offersFromCard(card.cardId));
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
        canTake={standingHere && canAct && arrived && onTakeGold !== undefined}
        busy={busy}
        onTake={(amount) => onTakeGold?.(amount)}
      />
    </Fold>
  );

  return (
    <Overlay label={field.name} onDismiss={onClose} tone="bg-night/80">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
        <header className="flex items-baseline justify-between gap-3 border-b border-edge px-4 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-ochre">
            {field.name}
          </h2>
          <CloseButton onClose={onClose} />
        </header>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 py-3">
          {notice && (
            <p className="rounded border-l-2 border-ochre bg-ochre/5 px-3 py-2 text-sm text-ochre">
              <WithRules text={notice} />
            </p>
          )}

          <section>
            {field.draw ? (
              <p className="mb-1 text-[11px] uppercase tracking-wide text-verdigris">
                Wyciągnij {field.draw} {field.draw === 1 ? "kartę" : "karty"}
                {/* 13.4: what is already lying here counts against that number,
                    which is why a field that has silted up draws nothing. */}
                {cards.length > 0 && ` — leżą tu już ${cards.length}`}
              </p>
            ) : null}
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

            <p className="whitespace-pre-line text-xs leading-relaxed text-muted">
              {field.text ?? "Brak przepisanego tekstu dla tego Obszaru."}
            </p>
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
                    onClick={() => onInspect(card.cardId)}
                  />
                ))}
              </TileRow>
            </section>
          )}

          <section>
            {/* "Leży tutaj" was the old heading and it said the wrong thing
                twice: a Karta gets here by being *placed* as often as by being
                left — the Upiór's die table names six Obszary, the Eremita's
                six more, and Władca Zdarzeń moves any face-up Karta to a chosen
                one — and "leży" reads as abandoned, which a Cudotwórca living
                here to the end of the game is not. What they all have in common
                is the Obszar, so the heading says that and nothing else. */}
            <h3 className="mb-2 text-[11px] uppercase tracking-widest text-muted">
              Na tym Obszarze
            </h3>
            {groups.length === 0 && goldAt === null ? (
              <p className="text-xs text-muted/70">Nic — Obszar jest pusty.</p>
            ) : (
              /* One `Fold` per group, the same section every shelf in the app
                 is built from — the rule above it, the small capitals, the
                 tally beside the name, the triangle.

                 `fieldGroups` has already dropped the empty ones, so an Obszar
                 with a single Wróg on it reads "Wrogowie 1" and stops. */
              <>
                {groups.map((group, at) => (
                  <Fragment key={group.key}>
                    {at === goldAt && goldShelf(at === 0)}
                    <Fold
                      title={group.title}
                      tally={group.cards.length}
                      first={at === 0 && goldAt !== 0}
                      /* A step below "Na tym Obszarze", which is the same size and
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
                              onClick={() => onInspect(lying.cardId)}
                            >
                              {takeable && !lying.viaTurn && standingHere && canAct && arrived && (
                                <button
                                  /* Only this card's own ask, never the table's
                                     `busy`: what is lying on one Obszar is several
                                     independent questions, and closing all of them
                                     because one is out makes a player wait a round
                                     trip per card for no reason the rules give. */
                                  disabled={asked.includes(lying.id)}
                                  onClick={() => onTake(lying.id)}
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
                {goldAt === groups.length && goldShelf(groups.length === 0)}
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

              {/* The ten fields that sell, buy or mend (and the shops that
                  arrive on a card and settle here). */}
              {fieldScriptFor(fieldId) && (
                <FieldServices
                  fieldId={fieldId}
                  fieldCards={cards.map((card) => ({ cardId: card.cardId, pool: card.pool }))}
                  busy={busy}
                  typedRolls={typedRolls}
                  onRollOffer={(offer) => onAction({ action: "pole-tabela", offer })}
                  purse={purse}
                  stock={stock}
                  sellable={sellable}
                  onSuggestion={onSuggestion ?? (() => {})}
                  onService={onService}
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

                  Disabled says why. `dutiesBeforeEnding` quotes the rule that
                  refuses — 10.1's move, 14.7's Bestia — and a greyed control
                  that does not say why is a control that looks broken. */}
              {onEnd && (
                <div className="flex flex-col gap-1">
                  {/**
                   * The button, or the reason there is no button — never both.
                   *
                   * It used to be a greyed control with the refusal under it,
                   * on the reasoning that a disabled thing which does not say
                   * why looks broken. That was right about the sentence and
                   * wrong about the button: now that the kolejka and the
                   * Obszar's own instruction are duties too, the turn cannot be
                   * ended for most of the time it is being played, so the
                   * control was greyed nearly always and the sentence under it
                   * was doing all the work. A button that is almost never
                   * pressable is furniture.
                   *
                   * So the sentence stands alone until the turn really can end,
                   * and then the button appears. Nothing is lost: the refusal
                   * still names what is owed and the rule that owes it.
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
                  {!canEnd && whyNotEnd && (
                    <p className="text-[11px] text-muted">
                      {/* „Najpierw: Stocz walkę z Bestią (14.7)." — the number
                          is the refusal's evidence. */}
                      <WithRules text={whyNotEnd} />
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </Overlay>
  );
}
