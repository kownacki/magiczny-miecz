/** What a settled fight comes to: who takes what, what it costs, and what the trophy is worth (17.4, 17.9, 1.4).*/


import { abilitiesOf, stealsLife } from "@/lib/engine/abilities";
import { combatValueOf } from "@/lib/engine/cards";
import {
  advanceLoop,
  closeLoopFrame,
  loopBeneath,
  roundFinishes,
  roundOf,
} from "@/lib/engine/loop";
import { type Fight } from "@/lib/engine/turn";
import { EVENTS } from "../decks";
import { cardName } from "@/lib/engine/polish";
import {
  apply,
  merge,
  mergeAll,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type Snapshot,
} from "../change";
import { applyEffect } from "./effects";
import { scriptFor } from "@/lib/engine/cardScript";
import { asReturnable, putOnPile } from "./piles";
import { push, replaceTop, requireTop, top, type TurnState } from "@/lib/engine/stack";
import { activeSeat, eqModeOf, holdingsOf, seatView, trophyModeOf } from "./seat";
import { slotOnArrival } from "@/lib/engine/holdings";
import type { Nature } from "@/data/types";
import type { Slot } from "@/lib/engine/slots";
import { afterFight, missionOf } from "@/lib/engine/status";
import { keepOnly, storedStatuses } from "./turn";
import type { SeatRow } from "../store";
import { settleBridge, settleCrossing } from "./bridge";
import { spendLife } from "./life";
import { againstThese, closeFightFrame, friendDiesInstead, shieldSaves } from "./fight";

/**
 * Settles a fight whose dice have been compared (17.4).
 *
 * The join between this cluster and the bridge's, which is why it is last: a
 * guardian is not a card. It charges what its doorway charges rather than the
 * usual point of Życie, and winning carries the character through instead of
 * returning it to the Obszar the fight interrupted — so the two endings share
 * only the clearing-up at the top.
 *
 * One die, and only sometimes: the Hełm/Tarcza/Zbroja save of 17.4, thrown
 * once against the widest of them rather than once per item.
 */
/**
 * What the winner of a duel takes (17.9).
 *
 * "Zwycięzca ma prawo zmusić pokonanego do utraty jednego punktu Życia (czemu
 * może zapobiec użycie odpowiednich Przedmiotów lub Zaklęć) lub zabrać mu jeden
 * Przedmiot (również Magiczny) albo Sztukę Złota."
 *
 * Three ways to end a duel and the app could only do one of them: it always
 * took the Życie, so a winner who wanted the Magiczny Miecz off a beaten rival
 * had no way to say so, and the referee was making the choice the rulebook
 * gives the player — the same fault the trophies had before the subset ruling.
 *
 * Only a duel offers it. Against a Karta there is nobody to rob: a Wróg has no
 * purse and no pack, and 1.4 already says what a beaten one is worth.
 */
export type Spoils =
  | { take: "zycie" }
  | { take: "zloto" }
  /** Which Przedmiot, because "jeden Przedmiot" is one the winner points at. */
  | { take: "przedmiot"; holdingId: string };

export async function resolveFight(
  snapshot: Snapshot,
  command: { spoils?: Spoils } | void,
  ports: CommandPorts,
): Promise<Outcome<void>> {
  const state = requireTop(snapshot.game.turn_state, "fight");

  const seat = activeSeat(snapshot);
  const { fight } = state;
  if (!fight.result) throw new Error("Walka nie jest rozstrzygnięta.");

  /**
   * Whether this fight was a round of something bigger, and whether settling
   * it settles the creature (law 3, docs/STACK.md).
   *
   * Everything a kill pays out — the trophy (1.4), the Władca's errand,
   * Excalibur's stolen point — is owed for beating the Wróg, and a head is not
   * the Wróg. What a round does cost is the ordinary one: 17.4 takes a point
   * of Życie for losing a fight, and a head is a fight.
   */
  const inLoop = loopBeneath(snapshot.game.turn_state);
  const kill = inLoop === null || roundFinishes(inLoop, fight.result.outcome);

  // 17.4 ends a fight the moment the dice are compared — win, lose or draw —
  // so anything that lasts "one fight" is spent whichever way it went.
  const cleared = keepOnly(snapshot, seat.id, afterFight(storedStatuses(snapshot, seat.id)));

  if (fight.guardian) {
    const outcome = fight.result.outcome;
    const at = apply(snapshot, cleared);
    const settled =
      fight.guardian.kind === "bridge"
        ? settleBridge(at, fight.guardian.entrance, outcome).writes
        : fight.guardian.kind !== "bridge-field"
          ? settleCrossing(at, fight.guardian.crossing, outcome).writes
          : {};

    const said: Changeset = {
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "guardian-end",
          payload: { guardian: fight.cardName, outcome, enemyTotal: fight.enemyTotal },
        },
      ],
    };

    // 14.6: the Demon and the Monstrum stand in the way rather than at a door.
    // Beating one lets the character walk on next turn; losing costs a point of
    // Życie and it is still there. Either way the character does not move — the
    // bridge is one Obszar a turn and this turn was the fight. Merged after the
    // line above so the journal reads in the order it happened: beaten by the
    // creature, then dead of it.
    const soFar = mergeAll(cleared, settled, said);
    if (fight.guardian.kind !== "bridge-field" || outcome !== "przegrana") {
      return { writes: soFar, result: undefined };
    }
    const cost = spendLife(apply(snapshot, soFar), seat.id, 1);
    return { writes: merge(soFar, cost.writes), result: undefined };
  }

  // In a duel the loser may be either side; against a card only the character
  // can lose.
  const loser =
    fight.result.outcome === "przegrana"
      ? seat
      : fight.result.outcome === "wygrana" && fight.opponentSeat !== undefined
        ? snapshot.seats.find((s) => s.seat_index === fight.opponentSeat)
        : undefined;

  /**
   * 17.9's other two spoils, which end the duel without a blow being struck.
   *
   * Taken here rather than after the life machinery because they replace it:
   * "lub zabrać mu jeden Przedmiot albo Sztukę Złota" is an alternative to
   * forcing the loss, so no osłona is rolled (17.4 is about a blow landing and
   * none does), no Giermek dies in anybody's place, and Excalibur takes
   * nothing — its own clause is about a point of Życie.
   *
   * Only where the winner is the one who asked. A duel the *drawer* lost is
   * settled against them and there is nothing for them to choose.
   */
  const spoils = command && command.spoils ? command.spoils : null;
  const robbing =
    spoils !== null &&
    spoils.take !== "zycie" &&
    loser !== undefined &&
    fight.opponentSeat !== undefined &&
    fight.result.outcome === "wygrana";

  /**
   * The DIAMENT KRÓLÓW, which pays for a lost duel in its owner's place.
   *
   * "Jeżeli przegrasz walkę z inną Postacią, będzie ci musiała odebrać Diament,
   * dzięki czemu nie utracisz 1 punktu Życia."
   *
   * # The ruling
   *
   * Two readings, and the card's own words pick one. "Musiała" is compulsion on
   * the winner, so she does not get to insist on the Życie — but "dzięki czemu
   * nie utracisz 1 punktu Życia" only says anything if a punkt Życia was
   * otherwise going to be lost. A winner who elected the gold or another
   * Przedmiot was never taking one, and the clause would be describing a
   * benefit nobody was about to be denied.
   *
   * So it fires **on the Życie spoil and only there**, and it fires without the
   * winner's leave. That is also the reading 17.9 itself sets up from the other
   * side: "Zwycięzca ma prawo zmusić pokonanego do utraty jednego punktu Życia
   * (czemu **może zapobiec użycie odpowiednich Przedmiotów lub Zaklęć**)". The
   * Diament is one of those Przedmioty, said from the card's end, and what it
   * costs to use is itself.
   *
   * # Where it goes
   *
   * With the other two spoils, not in the save chain — no osłona is rolled and
   * no Giermek dies, for the reason written above them: 17.4 is about a blow
   * landing, and none does. The Diament changes hands instead.
   *
   * Asked of the ability and not of the card's id, so a second Przedmiot with
   * the same clause — an expansion, a house card — needs only the registry
   * line. The DIAMENT KRÓLÓW is the base game's only one.
   *
   * Both directions of a duel, which is why the winner is worked out here
   * rather than taken as `seat`: 17.9's choice is only offered to the asker,
   * but the Diament is not a choice — a drawer who loses their own duel while
   * carrying it pays with it just the same.
   */
  const victor =
    fight.opponentSeat === undefined
      ? undefined
      : fight.result.outcome === "wygrana"
        ? seat
        : snapshot.seats.find((one) => one.seat_index === fight.opponentSeat);
  const diamond =
    loser !== undefined && victor !== undefined && (spoils === null || spoils.take === "zycie")
      ? snapshot.holdings.find(
          (one) =>
            one.seat_id === loser.id &&
            one.kind === "item" &&
            abilitiesOf(one.card_id).some((a) => a.kind === "placi-za-przegrana"),
        )
      : undefined;

  let paid: Changeset = {};
  if (diamond && loser && victor) {
    paid = takeSpoils(snapshot, victor, loser, { take: "przedmiot", holdingId: diamond.id });
  } else if (robbing && loser && spoils) {
    paid = takeSpoils(snapshot, seat, loser, spoils);
  } else if (loser) {
    // Nothing is rolled for a raid: the character never stood in the fight, so
    // there is no blow for a Zbroja to turn (17.4).
    const save = fight.raid
      ? { writes: {} as Changeset, result: false }
      : await shieldSaves(apply(snapshot, cleared), { seatId: loser.id, kind: fight.kind }, ports);
    if (fight.raid) {
      /**
       * A raid the friend lost. "W przypadku porażki ty nie tracisz punktu
       * Życia, ale twój Przyjaciel ginie" — so no osłona is rolled (17.4 is
       * about a blow landing on the character, and none did) and no life is
       * spent. The Poszukiwacz is the only one who can answer here, because
       * `raiding` is what his `onlyWhenRaiding` was waiting for.
       */
      paid =
        fight.result.outcome === "przegrana" && !fight.raid.summoned
          ? (await friendDiesInstead(apply(snapshot, cleared), { seatId: seat.id, raiding: true }, ports))
              .writes
          : {};
    } else if (save.result) {
      paid = save.writes;
    } else {
      // 17.4 failed, so the point is really about to be lost — which is the
      // moment the Giermek rolls and the Rumak steps in. A friend that dies
      // here saves the point outright, so nothing is spent after it.
      const stoodIn = await friendDiesInstead(
        apply(snapshot, mergeAll(cleared, save.writes)),
        { seatId: loser.id },
        ports,
      );
      const upToNow = mergeAll(cleared, save.writes, stoodIn.writes);
      paid = stoodIn.result
        ? merge(save.writes, stoodIn.writes)
        : mergeAll(
            save.writes,
            stoodIn.writes,
            spendLife(apply(snapshot, upToNow), loser.id, 1).writes,
          );
    }
  }

  /**
   * The Władca's errand, if this fight was it.
   *
   * "1 - pokonasz Wroga; 2-3 pokonasz inną Postać (po wypełnieniu misji
   * zostaniesz natychmiast przeniesiony do Twierdzy)." Read here because this
   * is where a win becomes a fact, and marked rather than paid out: the Tarcza
   * is the Władca's to give and he is at the Twierdza. The Postać errand is the
   * one the board carries you back for, which is the difference between an
   * errand you have done and one you have delivered.
   *
   * A raid does not count. The Poszukiwacz Przygód fights on his own account —
   * it is his three points against them — and the Władca asked *you* to beat
   * somebody.
   */
  const errand = fight.raid || !kill ? {} : missionDone(snapshot, seat, fight);

  /**
   * Excalibur's point of Życie, taken after everything the loss already cost.
   *
   * Chained through `apply` rather than merged flat, because the point it takes
   * is off a Życie the lines above may already have moved — `paid` spends the
   * loser's for losing — and `merge` resolves two writes to one column as later
   * wins rather than as a sum.
   */
  const upToNow = mergeAll(cleared, paid, errand);
  const stolen = kill ? stolenLife(apply(snapshot, upToNow), seat, fight) : {};
  const cleared_ = beatenOffTheBoard(apply(snapshot, mergeAll(upToNow, stolen)), fight);

  /**
   * What the stack does with a settled round.
   *
   * The fight pops either way; what is underneath decides the rest. Under a
   * loop, a win that is not the last one puts the next head up in this same
   * commit — the player pressed the only button there was, and a loop frame is
   * never left on screen by itself — and anything else closes the attempt.
   *
   * The next head's `playerTotal` is read again rather than copied, because
   * `keepOnly(afterFight(...))` has just spent everything that lasted one
   * fight: a Zaklęcie that made the first head easy is gone by the second, and
   * carrying the old figure forward would fight three heads with one card.
   */
  const closed = ((): { state: TurnState; said: Record<string, unknown> } => {
    const popped = closeFightFrame(snapshot.game.turn_state, state);
    if (!inLoop) return { state: popped, said: {} };

    // Which round this was, for a line that says "głowa 2 z 3" rather than
    // reporting the whole creature beaten or lost three times over.
    const which = { creature: inLoop.round, round: inLoop.done + 1, times: inLoop.times };
    const step = advanceLoop(inLoop, fight.result.outcome);
    if (step.go === "again") {
      const fresh = againstThese(apply(snapshot, mergeAll(upToNow, stolen)), seat.id, [
        inLoop.of.cardId,
      ]);
      const next = roundOf(step.loop);
      return {
        state: push(replaceTop(popped, step.loop), {
          ...next,
          fight: {
            ...next.fight,
            playerTotal: inLoop.of.kind === "magical" ? fresh.magia : fresh.miecz,
          },
        }),
        said: which,
      };
    }
    return {
      state: closeLoopFrame(popped, inLoop),
      // A win on the last round is the creature dead, and the line says so
      // with no talk of heads. Anything else is the attempt ending, and what
      // it cost is the heads that grew back.
      said: step.go === "won" ? {} : { ...which, regrown: step.regrown },
    };
  })();

  /**
   * What the creature's own card takes off whoever it beat.
   *
   * Exactly one Wróg in the box has this — "Każdej pokonanej Postaci,
   * Złoczyńca zabiera do wyboru: 1 Sztukę Złota lub jeden Przedmiot" — and it
   * is on top of 17.4's point of Życie rather than instead of it.
   *
   * Run after the frame has closed, against the state that close produced, so
   * the toll's own question suspends onto the field the fight was interrupting
   * rather than onto the fight itself. A duel has no card to consult, and a
   * raid was not the character's own fight to lose.
   */
  /**
   * A Wróg who lost is written down as dead, and stops being on the Obszar.
   *
   * Nothing recorded it. `trophiesFrom` put his Karta in the winner's pack and
   * `leaveCardsBehind` wrote the same Karta back onto the square at the end of
   * the turn, so a beaten Wilk finished as a trophy in a pack *and* a live
   * creature on the board — and 21.2's `copiesInPlay`, which counts holdings
   * and Obszary together, saw one card twice.
   *
   * 16.2 is the rule: "Karty pokonanych Wrogów tego rodzaju można zachować",
   * and kept is the opposite of left lying.
   *
   * Written onto the frame rather than cut out of `drawn`, which is what this
   * did first. Cutting settled the Obszar and lost the turn's record of what
   * happened on it, so the kolejka could not show the Wróg struck through — and
   * a row that simply drops a creature the table watched die is a worse account
   * of the turn than one that crosses him out.
   *
   * Keyed on being beaten and not on being worth a trophy: those are different
   * questions and 1.4 answers only the second — a Demon is fought with Magia,
   * earns nothing under "Wrogami (mającymi określony parametr Miecza)", and is
   * every bit as dead.
   *
   * Not a duel, where the loser is a Postać and there is no Karta; not a raid,
   * which `beatenOffTheBoard` lifts off by its `field_cards` row; not a
   * guardian, who is nobody's drawn card and stays at his door either way.
   */
  const swept = ((): TurnState => {
    if (fight.result?.outcome !== "wygrana") return closed.state;
    if (fight.opponentSeat !== undefined || fight.raid || fight.guardian) return closed.state;
    const state = top(closed.state);
    if (state.phase !== "field") return closed.state;
    const dead = fight.fought ?? [fight.cardId];
    const already = state.beaten ?? [];
    const fresh = dead.filter((cardId) => !already.includes(cardId));
    if (fresh.length === 0) return closed.state;
    return replaceTop(closed.state, { ...state, beaten: [...already, ...fresh] });
  })();

  const beaten = mergeAll(upToNow, stolen, cleared_, {
    game: { turn_state: swept },
  });
  const toll =
    fight.result.outcome === "przegrana" &&
    fight.opponentSeat === undefined &&
    fight.raid === undefined
      ? await tollFor(apply(snapshot, beaten), seat.id, fight, ports)
      : {};

  return {
    // `toll` comes last of all, and has to: `merge` resolves two writes to one
    // column as later-wins, and the toll's own question is a frame pushed onto
    // the state the close produced. Merged before it, the close would put the
    // state back and the question would be gone.
    writes: mergeAll(upToNow, stolen, cleared_, kill ? trophiesFrom(snapshot, seat, fight) : {}, {
      game: { turn_state: swept },
      journal: [
        {
          seatId: seat.id,
          round: snapshot.game.round,
          kind: "fight-end",
          payload: { cardId: fight.cardId, outcome: fight.result.outcome, ...closed.said },
        },
      ],
    }, toll),
    result: undefined,
  };
}

/**
 * The toll a creature's card charges whoever it beat, if its card charges one.
 *
 * `fought` rather than `cardId`, because 17.5 packs several creatures into one
 * fight and joins their ids with a "+": what beat you may be three cards, and
 * each of them may have something to say about it.
 *
 * Whatever the toll asks is asked through the ordinary suspension machinery —
 * a `wybor` becomes a `script` frame above the field the fight was
 * interrupting, answered by `answerScript` like every other card's question.
 */
async function tollFor(
  snapshot: Snapshot,
  seatId: string,
  fight: Fight,
  ports: CommandPorts,
): Promise<Changeset> {
  let writes: Changeset = {};
  for (const cardId of fight.fought ?? [fight.cardId]) {
    const owed = scriptFor(cardId)?.przegrana;
    if (!owed) continue;
    const done = await applyEffect(
      apply(snapshot, writes),
      {
        seatId,
        effect: owed,
        reason: EVENTS.find((one) => one.id === cardId)?.name ?? cardId,
        cardId,
        shuffle: (items) => [...items],
      },
      ports,
    );
    writes = merge(writes, done.writes);
  }
  return writes;
}

/**
 * A Wróg beaten where he lay, taken off the board (12.1, 16.8).
 *
 * Only a fight the character never stood in: a wyprawa or a summoned creature
 * reaches an Obszar the seat is not on, so the Karta is a row on the board
 * rather than a card in the stack in front of them, and nothing in the ordinary
 * settle knows about it. Beaten and left lying, he could be killed again every
 * turn by the same Przyjaciel — and the Golem's card says outright what happens
 * instead: „Wróg jest zdejmowany z planszy".
 *
 * To the stos zużytych rather than out of the game, like everything else that
 * leaves a hand or a field: `putOnPile` keeps a conjured card out of it and
 * knows the Wyposażenie is a stock. No trophy — `trophiesFrom` already refuses
 * a raid, because the Karta was not beaten by the character.
 */
function beatenOffTheBoard(snapshot: Snapshot, fight: Fight): Changeset {
  const rowId = fight.raid?.fieldCardId;
  if (!rowId || fight.result?.outcome !== "wygrana") return {};
  const lying = snapshot.fieldCards.find((row) => row.id === rowId);
  if (!lying) return {};
  const lifted: Changeset = { fieldCards: { delete: [lying.id] } };
  return merge(lifted, putOnPile(apply(snapshot, lifted), "events", [asReturnable(lying)]));
}

/**
 * A point of Życie off the beaten opponent, for whatever does that (Excalibur).
 *
 * "Po każdej zwycięskiej walce Postać zyskuje także 1 punkt Życia (zabierając
 * ten punkt pokonanemu przeciwnikowi)."
 *
 * The parenthesis is bookkeeping and not flavour, so a duel really does move
 * the point: the loser pays one for losing (17.9) and another to Excalibur, and
 * a lost duel against it costs two. That can be the second one's last, and it
 * goes through `spendLife` for exactly that reason — 4.4 is then somebody
 * else's rule to apply, not a special case here.
 *
 * A Wróg has no Życie track to take from, so the winner simply gains. The gain
 * is uncapped: 4.7's ceiling of four is about what a Uzdrowiciel restores, and
 * 4.6 says points won are not healing.
 *
 * Not on a raid. The Poszukiwacz fights on his own account — his three points
 * against theirs — and the Excalibur is in your pack, not in his hand. The same
 * reading `missionDone` and `trophiesFrom` already take.
 */
function stolenLife(snapshot: Snapshot, seat: SeatRow, fight: Fight): Changeset {
  if (fight.result?.outcome !== "wygrana" || fight.raid) return {};

  const points = stealsLife(seatView(snapshot, seat.id).abilities);
  if (points < 1) return {};

  const winner = snapshot.seats.find((one) => one.id === seat.id);
  if (!winner) return {};

  const gained: Changeset = {
    seats: [{ id: seat.id, patch: { life: winner.life + points } }],
    journal: [
      {
        seatId: seat.id,
        round: snapshot.game.round,
        kind: "healed",
        payload: { points, stolen: true },
      },
    ],
  };

  const loser =
    fight.opponentSeat === undefined
      ? undefined
      : snapshot.seats.find((one) => one.seat_index === fight.opponentSeat);
  if (!loser || loser.eliminated) return gained;

  return merge(gained, spendLife(apply(snapshot, gained), loser.id, points).writes);
}

/**
 * 17.9's Przedmiot or Sztuka Złota, moved from the loser to the winner.
 *
 * A Przedmiot changes hands rather than being destroyed — "zabrać mu jeden
 * Przedmiot" — so the holding is reseated and not deleted, which also keeps
 * 21.2's stock right: the card never leaves play and no pile has to be told.
 * It arrives the way anything else arrives, through `slotOnArrival`, so in
 * slotowy a won Miecz goes onto the arm if the arm is free.
 *
 * The gold is a number on both seats (3.5) and moves as one.
 */
function takeSpoils(
  snapshot: Snapshot,
  winner: SeatRow,
  loser: SeatRow,
  spoils: Spoils,
): Changeset {
  const said = (what: string): Changeset => ({
    journal: [
      {
        seatId: winner.id,
        round: snapshot.game.round,
        kind: "duel",
        payload: { spoils: spoils.take, what, from: loser.seat_index },
      },
    ],
  });

  if (spoils.take === "zycie") return {};

  if (spoils.take === "zloto") {
    if (loser.gold < 1) throw new Error("Pokonany nie ma Sztuki Złota (17.9).");
    return merge(
      {
        seats: [
          { id: loser.id, patch: { gold: loser.gold - 1 } },
          { id: winner.id, patch: { gold: winner.gold + 1 } },
        ],
      },
      said("1 Sz. Z."),
    );
  }

  const held = snapshot.holdings.find(
    (one) => one.id === spoils.holdingId && one.seat_id === loser.id && one.kind === "item",
  );
  if (!held) throw new Error("Pokonany nie ma takiego Przedmiotu (17.9).");

  const slot = slotOnArrival({
    cardId: held.card_id,
    kind: "item",
    eqMode: eqModeOf(snapshot.game),
    nature: (winner.nature ?? null) as Nature | null,
    worn: holdingsOf(snapshot, winner.id).map((one) => one.slot as Slot | null),
  });

  return merge(
    {
      holdings: {
        patch: [{ id: held.id, patch: { seat_id: winner.id, slot, ordinal: null } }],
      },
    },
    said(cardName(held.card_id)),
  );
}

/**
 * The Karty of the Wrogowie just beaten, kept to be cashed in later (1.4, 16.2).
 *
 * "Karty pokonanych Wrogów należy zatrzymać, ponieważ w dowolnym momencie mogą
 * zostać wymienione na dodatkowe punkty Miecza." A beaten Wróg is not spent
 * when it is beaten — that is what makes it a trophy — and `tradeTrophies` is
 * where it finally reaches the used pile.
 *
 * Only the ones with a printed Miecz. 1.4 says so twice over: the walks are
 * "z napotkanymi Wrogami (mającymi określony parametr Miecza)" and 16.2 keeps
 * "Karty pokonanych Wrogów **tego rodzaju**". A Demon is fought magically and
 * carries a Magia, so it is beaten and gone, and the seven-point arithmetic
 * never has to decide what a Magia is worth in Miecze.
 *
 * Nothing for a duel — 17.9 gives the winner a Życie, a Przedmiot or a Sztuka
 * Złota, and the loser is a Postać rather than a Karta — and nothing for a
 * guardian, who is not a drawn card and stays at his door either way.
 *
 * 17.5's pack is settled as one and every creature in it becomes its own
 * trophy, which is what `fought` already lists.
 */
function trophiesFrom(snapshot: Snapshot, seat: SeatRow, fight: Fight): Changeset {
  if (fight.result?.outcome !== "wygrana") return {};
  if (fight.opponentSeat !== undefined || fight.guardian || fight.raid) return {};

  // Carrying the points rather than the card: what a trophy is worth is the
  // only thing either mode wants from it, and `punkty` keeps nothing else.
  const won = (fight.fought ?? [fight.cardId]).flatMap((cardId) => {
    const card = EVENTS.find((one) => one.id === cardId);
    /**
     * `playerTotal` and not `enemyTotal`, for the one card that mirrors.
     *
     * The Sobowtór is worth what he fought at, and what he fought at is his
     * opponent's Miecz — which is this, and stays this whether he came alone or
     * in a pack under 17.5, where `enemyTotal` is the whole pack's sum and his
     * share of it is not separable.
     */
    const foe = card ? combatValueOf(card, { miecz: fight.playerTotal }) : null;
    return foe && foe.kind === "ordinary" ? [{ cardId, points: foe.total }] : [];
  });
  if (won.length === 0) return {};

  // The mark travels onto the holding: a conjured Cyklop must not reach a pile
  // the deck still holds its own copy of. See `granted` in db/schema.sql.
  const staged = new Set(
    (fight.drawn ?? []).filter((entry) => entry.granted === true).map((entry) => entry.cardId),
  );

  const said: Changeset = {
    journal: won.map(({ cardId }) => ({
      seatId: seat.id,
      round: snapshot.game.round,
      kind: "taken" as const,
      payload: { cardId, kind: "trophy" },
    })),
  };

  /**
   * In `punkty` the Karta does not stay: it goes to the used pile at once and
   * the seat keeps the number that was printed on it.
   *
   * Which is the whole of the variant. 9.5 refills the deck from that pile, so
   * a Wróg beaten here is a Wróg somebody can meet again — where in `karty` he
   * sits in a pack until traded, and an eighth of the Karty Zdarzeń can end up
   * doing that at once. See docs/TROFEA.md.
   *
   * A conjured Wróg is worth his points and reaches no pile, because the deck
   * never gave that copy up. Both halves of `granted` matter here and they pull
   * different ways, which is why the pile is asked separately from the score.
   */
  /**
   * The one thing the two modes disagree about: when the cardboard goes back.
   *
   * Both hoard the trophy, both let you choose when and what to hand in, and
   * both lose the points above a multiple of seven — 1.4 entire, in either
   * variant. „Punkty" differs by returning the Wróg's Karta the moment he dies
   * rather than when he is cashed in, so what the seat keeps is a copy of him.
   *
   * Which is the whole of the variant, and it is mechanical: 9.5 refills the
   * deck from that pile, so a Wróg beaten here is a Wróg somebody can meet
   * again — where in „Karty pokonanych" he sits in a pack until traded, and an
   * eighth of the Karty Zdarzeń can be doing that at once. See docs/TROFEA.md.
   *
   * A conjured Wróg is worth his points and reaches no pile, because the deck
   * never gave that copy up. Both halves of `granted` matter and they pull
   * different ways, which is why the pile is asked separately from the trophy.
   */
  const returned =
    trophyModeOf(snapshot.game) === "points"
      ? putOnPile(
          snapshot,
          "events",
          won
            .filter(({ cardId }) => !staged.has(cardId))
            .map(({ cardId }) => ({ cardId, granted: false })),
        )
      : {};

  return mergeAll(
    said,
    {
      holdings: {
        insert: won.map(({ cardId }) => ({
          seat_id: seat.id,
          card_id: cardId,
          kind: "trophy" as const,
          face: "open" as const,
          granted: staged.has(cardId),
        })),
      },
      seats: [
        {
          id: seat.id,
          patch: {
            /**
             * The shelf, in both modes, beside the trophy rather than instead
             * of it — because the trophy stops saying who you beat the moment
             * 1.4 is used on it. A cashed trophy is deleted, so the holdings
             * alone can only ever show who you *still* have.
             *
             * Display only: no rule reads it, and 1.4's arithmetic runs off the
             * holdings in either mode. A conjured Wróg is on it too — he was
             * still beaten, and the shelf is about that rather than about which
             * pile his Karta belongs to.
             *
             * # Reading the two lists together
             *
             * Beaten minus held is the Wrogowie whose trophies have gone, which
             * is what a shelf wants to draw greyed and last. Two things to know
             * before deriving it:
             *
             * - **It is a multiset.** Two Nobbiny are two entries here and two
             *   holdings, and set subtraction would call the second one gone.
             * - **„Sold" is not quite the word.** `dropCard` also lets a trophy
             *   go, and the difference between selling and discarding one is
             *   not recorded. What the list means is "beaten, and no longer
             *   held".
             */
            trophy_beaten: [...seat.trophy_beaten, ...won.map(({ cardId }) => cardId)],
          },
        },
      ],
    },
    returned,
  );
}

/**
 * Marks the Władca's errand done, where this fight was what he asked for.
 *
 * Nothing at all when there is no errand, when it is a gold one, when it is
 * already done, or when the fight was lost — four ways of not being the thing
 * that was asked, and none of them worth a journal line.
 */
function missionDone(snapshot: Snapshot, seat: SeatRow, fight: Fight): Changeset {
  if (fight.result?.outcome !== "wygrana") return {};
  const errand = missionOf(storedStatuses(snapshot, seat.id));
  if (!errand || errand.done) return {};

  const wanted = fight.opponentSeat !== undefined ? "character" : "foe";
  if (errand.what !== wanted) return {};

  return {
    effects: {
      patch: [
        {
          id: errand.id,
          patch: {
            modifier: { kind: "mission", what: errand.what, done: true },
            label: "Misja wypełniona — wróć po Tarczę",
          },
        },
      ],
    },
    // "po wypełnieniu misji zostaniesz natychmiast przeniesiony do Twierdzy" —
    // only the errand against another Postać carries you back.
    ...(errand.what === "character"
      ? { seats: [{ id: seat.id, patch: { field_id: "twierdza-strzegaca-drog" } }] }
      : {}),
    journal: [
      {
        seatId: seat.id,
        round: snapshot.game.round,
        kind: "effect",
        payload: { source: "twierdza-strzegaca-drog", label: "Misja wypełniona" },
      },
    ],
  };
}

