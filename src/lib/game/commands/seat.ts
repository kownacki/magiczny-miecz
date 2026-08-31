/** One seat, read off a snapshot: everything a rule asks about a character, worked out once. */

import { cardName, plural } from "@/lib/engine/polish";
import { abilitiesOfCharacter, asCharacterId, startingKit } from "@/lib/engine/characters";
import {
  addsMagiaToMiecz,
  fightsForYou,
  heldAbilities,
  type Ability,
} from "@/lib/engine/abilities";
import { bonusFromHoldings, inEffect, type Reckoning } from "@/lib/engine/holdings";
import { carriedCount, carryLimit, spellAllowance } from "@/lib/engine/derive";
import {
  allStatuses,
  bonusFrom,
  frozenBy,
  magiaCountsAsMiecz,
  spellsHushed,
  type Status,
} from "@/lib/engine/status";
import type { TargetSeat } from "@/lib/engine/targets";
import type { Holding } from "@/lib/engine/state";
import type { EqMode, Slot } from "@/lib/engine/slots";
import type { Nature } from "@/data/types";
import type { HoldingRow, SeatRow } from "../store";
import type { Outcome, Snapshot } from "../change";

export function eqModeOf(game: { eq_mode: string }): EqMode {
  return game.eq_mode === "slots" ? "slots" : "classic";
}

/**
 * How a beaten Wróg is kept (1.4). See docs/TROFEA.md.
 *
 * `punkty` is the variant and the database's default; `karty` is the printed
 * rule. Read through one function for the same reason `eqModeOf` is: the column
 * is a `string` and every reader would otherwise have its own opinion about
 * what an unrecognised value means.
 */
export function trophyModeOf(game: { trophy_mode?: string }): "points" | "cards" {
  return game.trophy_mode === "cards" ? "cards" : "points";
}

export function asHolding(row: HoldingRow): Holding {
  return {
    cardId: row.card_id,
    kind: row.kind,
    face: row.face,
    slot: (row.slot ?? null) as Slot | null,
  };
}

export function seatById(snapshot: Snapshot, seatId: string): SeatRow {
  const seat = snapshot.seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");
  return seat;
}

export function activeSeat(snapshot: Snapshot): SeatRow {
  const seat = snapshot.seats.find((s) => s.seat_index === snapshot.game.active_seat);
  if (!seat) throw new Error("Brak aktywnego gracza.");
  return seat;
}

export function holdingsOf(snapshot: Snapshot, seatId: string): Holding[] {
  return snapshot.holdings.filter((h) => h.seat_id === seatId).map(asHolding);
}

/**
 * Everything a rule asks about one character, worked out once.
 *
 * The store answered these questions wherever they came up, which meant the sum
 * of own points and lent points was written out eleven times and the abilities
 * a character has were assembled seven ways. Assembled here instead, so a rule
 * asks rather than derives.
 *
 * Only the character's own Miecz and Magia are stored (1.2, 2.2); everything on
 * this object except `row` is computed at read time and never written back,
 * which is the whole of why a total cannot drift from the cards actually held.
 */
export interface SeatView {
  /** The stored row, for the columns nothing has a better name for yet. */
  row: SeatRow;
  id: string;
  index: number;
  characterId: string | null;
  fieldId: SeatRow["field_id"];
  nature: Nature | null;
  eliminated: boolean;

  holdings: Holding[];

  /**
   * The abilities a card lends where it is, plus the character's own.
   *
   * In slotowy a card works where it is worn and nowhere else, which is what
   * `inEffect` reads. This is the one to ask for anything happening *to* the
   * character now — a fight, a crossing, a toll.
   */
  abilities: Ability[];
  /**
   * What the cards owned lend, worn or packed, trophies aside — and nothing the
   * character is by itself.
   *
   * A narrower question with a wider answer, and both halves of the difference
   * are deliberate. Wider, because the Różdżka Zaklęć says "Właściciel": owning
   * it is the whole condition, so a wand in the pack raises the limit exactly
   * as one on the body does. Narrower, because this answers what a character
   * *has*, and what it *is* is not a card.
   */
  fromCards: Ability[];

  /** Own points plus what the cards lend (1.5, 2.5), as a parameter. */
  parametr: { miecz: number; magia: number };
  /** The same, reckoned for a fight — 1.5's other figure. */
  walka: { miecz: number; magia: number };

  /** How many Przedmioty count against 5.4, and how many are allowed. */
  carried: number;
  carryLimit: number;
  /** How many Zaklęcia this hand may hold (2.6, 9.2). */
  spellCapacity: number;

  /** Everything the character is under, from both halves of the model. */
  statuses: Status[];

  /** The seat as the targeting rules see it. */
  asTarget: TargetSeat;
}

function natureOf(row: SeatRow): Nature | null {
  return row.nature === "good" || row.nature === "evil" || row.nature === "chaotic"
    ? row.nature
    : null;
}

/**
 * What the character is worth once a fight has actually started (1.5).
 *
 * Two cards rewrite the sum rather than adding to it, so neither can be a
 * `punkty` bonus and both have to land after the ordinary reckoning:
 *
 * - the Rycerz "będzie walczył zamiast ciebie w każdej walce (również
 *   magicznej)" and "nie może używać twoich Zaklęć ani Przedmiotów", so his own
 *   3 and 3 REPLACE the whole figure — the character's own points included,
 *   because the character is not the one swinging;
 * - the Bojowy Rumak lets you "do punktów Miecza dodać swoje punkty Magii",
 *   which is the Magia total as reckoned for a fight, arrived at last so the
 *   Miecz it folds in is the one everything else has already agreed on.
 *
 * The stand-in wins when both are held: a Rumak improves a swing the Rycerz is
 * taking on your behalf with his own gear, which the card forbids in as many
 * words.
 */
function inFight(
  total: { miecz: number; magia: number },
  abilities: readonly Ability[],
  statuses: readonly Status[],
): { miecz: number; magia: number } {
  const champion = fightsForYou(abilities);
  if (champion) return champion;
  // A held card and a spoken Zaklęcie do the same thing here — the Bojowy Rumak
  // and Magia i Miecz — and a character with both folds its Magia in once.
  return addsMagiaToMiecz(abilities) || magiaCountsAsMiecz(statuses)
    ? { miecz: total.miecz + total.magia, magia: total.magia }
    : total;
}

export function seatView(snapshot: Snapshot, seatId: string): SeatView {
  const row = seatById(snapshot, seatId);
  const mode = eqModeOf(snapshot.game);
  const holdings = holdingsOf(snapshot, seatId);
  const mine = abilitiesOfCharacter(asCharacterId(row.character_id));

  // Where the character is standing can change what its cards are worth: the
  // Zaczarowane Wzgórza suspend every Przedmiot, by the board's own words.
  //
  // And so can who they are: 5.3 forbids a Natura certain cards, and a card a
  // character may not hold lends nothing while they hold it (see `inEffect`).
  const nature = natureOf(row);
  const fromCards = heldAbilities(
    holdings.filter((h) => h.kind !== "trophy").map((h) => h.cardId),
  );

  const statuses = allStatuses(
    snapshot.effects
      .filter((e) => e.seat_id === row.id)
      .map((e) => ({
        id: e.id,
        source: e.source,
        label: e.label,
        modifier: e.modifier,
        ends: e.ends,
      })),
    {
      turnsLost: row.turns_lost,
      stoneUntilRound: row.stone_until_round,
      bridgeBlockedUntilRound: row.bridge_blocked_until_round,
      natureChangedRound: row.nature_changed_round,
    },
    snapshot.game.round,
  );

  /**
   * What the cards lend, read after the statuses because one of them changes it.
   *
   * The Wojna Żywiołów suspends Zaklęcia *and* Magiczne Przedmioty — "ani
   * ciągnąć z nich żadnych korzyści" — so the same status that hushes the
   * spells also takes the Excalibur out of the sum, and leaves the plain Miecz
   * in it. Narrower than the Zaczarowane Wzgórza, which suspend every Przedmiot
   * by the board's own words.
   */
  const noMagical = spellsHushed(statuses) !== null;
  const parametr = bonusFromHoldings(holdings, mode, "parametr", row.field_id, nature, noMagical);
  const walka = bonusFromHoldings(holdings, mode, "walka", row.field_id, nature, noMagical);

  /**
   * Points a character is under rather than points its cards lend (1.2, 2.2).
   *
   * An Eliksir drunk this turn and a Najemnik paid this turn both land here,
   * and until now both were *displayed* and never fought with: `bonusFrom` was
   * called in `envelope.ts` alone, so the browser drew a Miecz of 7 while every
   * rule — the fight, the Pułapka, the Trap on the bridge — went on reading 5.
   *
   * Added before `inFight` gets it, so the Rycerz still replaces the lot: he
   * "nie może używać twoich Zaklęć ani Przedmiotów", and an Eliksir you drank
   * is no more his to swing with than your Excalibur is.
   */
  const under = bonusFrom(statuses);

  return {
    row,
    id: row.id,
    index: row.seat_index,
    characterId: row.character_id,
    fieldId: row.field_id,
    nature,
    eliminated: row.eliminated,
    holdings,
    abilities: [...heldAbilities(inEffect(holdings, mode, nature).map((h) => h.cardId)), ...mine],
    fromCards,
    parametr: {
      miecz: row.sword_own + parametr.miecz + under.miecz,
      magia: row.magic_own + parametr.magia + under.magia,
    },
    walka: inFight(
      {
        miecz: row.sword_own + walka.miecz + under.miecz,
        magia: row.magic_own + walka.magia + under.magia,
      },
      heldAbilities(inEffect(holdings, mode, nature).map((h) => h.cardId)),
      statuses,
    ),
    carried: carriedCount(holdings, mode),
    carryLimit: carryLimit(holdings, mode),
    // Deliberately without `under`: a Zaklęcie's own bonus is not in the basis
    // the draw is refused against, and a cap that moved when a spell landed
    // would be a cap nothing honoured. Same reasoning the envelope had.
    spellCapacity: spellAllowance(
      row.magic_own + parametr.magia,
      startingKit(asCharacterId(row.character_id)).spells ?? 0,
      fromCards,
    ),
    statuses,
    asTarget: {
      seatIndex: row.seat_index,
      characterId: row.character_id,
      fieldId: row.field_id,
      nature,
      eliminated: row.eliminated,
    },
  };
}

/** The active seat, as a view. */
export function activeView(snapshot: Snapshot): SeatView {
  return seatView(snapshot, activeSeat(snapshot).id);
}

/**
 * How far a seat is over 5.4's limit, or null when it is not.
 *
 * "Postać, która zdobyła więcej niż 4 Przedmioty i nie dysponuje żadnym
 * środkiem transportu (5.4.) musi natychmiast odrzucić Przedmioty, których nie
 * jest w stanie unieść." (5.6)
 *
 * Taking a fifth is already refused, so the limit holds at the moment it would
 * be broken. This is the other direction, which nothing watched: lose the
 * transport and the limit falls under what you are already carrying. The
 * Awanturnik takes your Koń at the Bagna, the Pułapka shakes it loose off the
 * Most, or you simply put it down — and the pack reads 5/4 while play goes on.
 *
 * Not positional: `carryLimit` reads the cards themselves rather than what they
 * lend, so the Zaczarowane Wzgórza suspend a Koń's *points* and never its
 * carrying. An overflow is a fact about a hand, not about where it is standing,
 * which is what makes it something a player can be asked to fix.
 */
export function overCarried(
  snapshot: Snapshot,
  seatId: string,
): { carried: number; limit: number } | null {
  const view = seatView(snapshot, seatId);
  return view.carried > view.carryLimit
    ? { carried: view.carried, limit: view.carryLimit }
    : null;
}

/**
 * How many Zaklęcia a seat holds above what its Magia allows, or null.
 *
 * "Jeżeli w jakimkolwiek momencie gry, Postać posiada więcej Zaklęć niż wynosi
 * limit ustalony przez jej Magię, musi tę nadwyżkę natychmiast zlikwidować
 * odkładając odpowiednią liczbę Zaklęć." (2.6)
 *
 * Unlike the pack, this one *is* positional, and 2.6's own worked example is
 * the proof: "Gdy Mag trafi na Zaczarowane Wzgórza, gdzie nie będzie mógł
 * liczyć na punkty Magii zyskane dzięki Przedmiotom Magicznym, jego Magia
 * zmniejszy się do 5 punktów, co pozwoli mu na posiadanie tylko 2 Zaklęć. W
 * związku z tym, będzie musiał natychmiast odrzucić 1 Zaklęcie." Walking onto
 * an Obszar can put you over, and the spell you shed does not come back when
 * you leave it — "to trzecie, rzecz jasna musi sobie znaleźć".
 */
export function overSpelled(
  snapshot: Snapshot,
  seatId: string,
): { held: number; limit: number } | null {
  const view = seatView(snapshot, seatId);
  const held = view.holdings.filter((one) => one.kind === "spell").length;
  return held > view.spellCapacity ? { held, limit: view.spellCapacity } : null;
}

/**
 * The refusal, worded the same wherever it is raised.
 *
 * Both rules say "natychmiast" and neither says what goes: 5.4 leaves the
 * Przedmiot to the player — "zależy wyłącznie od decyzji gracza" — and 2.6
 * leaves the Zaklęcie the same way. So the app picks nothing. It stops the game
 * and says how many have to go, which makes the choice theirs and the timing
 * the rule's, and `dropCard` is the way out of both — it refuses to shed a
 * Zaklęcie under 9.4 *unless* the hand is over this very limit.
 */
export function refuseWhileOverLimit(snapshot: Snapshot, seatId: string): void {
  const pack = overCarried(snapshot, seatId);
  if (pack) {
    const many = pack.carried - pack.limit;
    throw new Error(
      `Niesiesz ${pack.carried} ${plural(pack.carried, "Przedmiot", "Przedmioty", "Przedmiotów")}` +
        ` przy limicie ${pack.limit} — odrzuć ${many}, zanim zagrasz dalej (5.6).` +
        ` Które, wybierasz ty (5.4).`,
    );
  }

  const spells = overSpelled(snapshot, seatId);
  if (spells) {
    const many = spells.held - spells.limit;
    throw new Error(
      `Masz ${spells.held} ${plural(spells.held, "Zaklęcie", "Zaklęcia", "Zaklęć")}` +
        ` przy limicie ${spells.limit} — odrzuć ${many}, zanim zagrasz dalej (2.6).`,
    );
  }
}

/**
 * Held where you stand, and unable to do anything about it.
 *
 * The Krąg Płomieni is the first thing in the box that stops a character
 * without stopping their turn: „ofiara… nie może zrobić nic poza użyciem
 * Władcy Zaklęć". Kamień and a lost turn are the other two `frozen` statuses
 * and they are settled by the turn order — `nextSeat` passes those seats over —
 * so nothing had ever asked this question at an action's door.
 *
 * Asked at the doors the turn actually opens through rather than at all forty
 * of them: you cannot roll, and you cannot speak anything but the one Zaklęcie
 * the card names. Everything else in a turn hangs off having rolled, so a
 * character who cannot roll can do nothing but end the turn — which is left
 * possible on purpose, since a prison nobody can leave and the game cannot pass
 * is a jammed table rather than a rule.
 *
 * `casting` is the Zaklęcie being spoken, when the door is `castSpell`. The
 * card names its own antidote and `oprocz` carries it, so nothing here has to
 * know which spell that is.
 */
export function refuseWhileHeld(
  snapshot: Snapshot,
  seatId: string,
  casting?: string,
): void {
  const held = frozenBy(
    snapshot.effects
      .filter((row) => row.seat_id === seatId)
      .map((row) => ({
        id: row.id,
        source: row.source,
        label: row.label,
        modifier: row.modifier,
        ends: row.ends,
      })),
  );
  if (!held) return;
  if (casting !== undefined && held.oprocz.includes(casting)) return;
  throw new Error(
    held.oprocz.length > 0
      ? `${held.label} — nie możesz zrobić nic poza rzuceniem: ${held.oprocz
          .map((id) => cardName(id))
          .join(", ")}.`
      : `${held.label} — nie możesz nic zrobić.`,
  );
}

/**
 * Own points plus what the cards lend (1.5, 2.5).
 *
 * Kept as a function of its own because most callers want one reckoning and
 * not a whole view; it is `seatView`'s two totals under one name.
 */
export function pointsOf(
  snapshot: Snapshot,
  seatId: string,
  as: Reckoning,
): { miecz: number; magia: number } {
  const view = seatView(snapshot, seatId);
  return as === "walka" ? view.walka : view.parametr;
}

/* --------------------------------------------------------------------------
 * The table's own answer to 21.2.
 * ----------------------------------------------------------------------- */

/**
 * Stops the Wyposażenie pile running out, for the rest of this game.
 *
 * One way only, and that is the rule rather than a caution. Turning it *on*
 * changes nothing that has already happened: a card refused an hour ago stays
 * refused in the journal, and the pile simply stops being counted from here.
 * Turning it off cannot say the same. By then there may be six Miecze on the
 * board where the box holds five, and 21.2 would have to answer "how did we
 * get here" — so the honest choices are to confiscate somebody's card or to
 * carry a negative supply, and neither is a thing a referee should do.
 *
 * So it is refused rather than hidden: a table that wants the printed rule
 * back opens a new one, and is told so.
 */
export function setEndlessStock(
  snapshot: Snapshot,
  command: { on: boolean },
): Outcome<void> {
  /**
   * Off is refused once play has begun, and freely allowed before it.
   *
   * The refusal is about what is already on the table: by then there may be six
   * Miecze on a board the finite pile holds five of, and switching back would
   * make the app start refusing cards people are holding. In the poczekalnia
   * none of that is true — nothing has been dealt, nothing is in anybody's
   * pack — so this is still just a table settling its house rules, and a
   * setting you cannot take back while still choosing your Postać is a trap
   * rather than a rule.
   */
  if (!command.on) {
    if (snapshot.game.status !== "lobby") {
      throw new Error(
        "Niewyczerpanego Wyposażenia nie da się już wyłączyć w trakcie gry — otwórz nowy stół (21.2).",
      );
    }
    if (!snapshot.game.endless_stock) return { writes: {}, result: undefined };
    return { writes: { game: { endless_stock: false } }, result: undefined };
  }
  if (snapshot.game.endless_stock) return { writes: {}, result: undefined };
  return {
    writes: {
      game: { endless_stock: true },
      journal: [
        {
          seatId: null,
          round: snapshot.game.round,
          kind: "override",
          payload: { what: "endless-stock" },
          // Not `manual`. That flag draws "tryb testowy" beside the line and
          // means somebody overruled the referee from the console; this is the
          // host settling a house rule, which the table agreed to and which the
          // app then keeps. Marking it manual would file a legitimate decision
          // as a correction.
        },
      ],
    },
    result: undefined,
  };
}
