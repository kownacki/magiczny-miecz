/** Arranging what a character already holds: putting a Przedmiot on, taking it off, ordering the Plecak, and what falls out when a place closes. */

import type { Nature } from "@/data/types";
import { carriedCount, carryLimit } from "@/lib/engine/derive";
import { forbiddenIn, forbiddenSaid } from "@/lib/engine/holdings";
import {
  SLOT_LABEL,
  STORAGE,
  fitsIn,
  isWearable,
  openStorage,
  type Slot,
} from "@/lib/engine/slots";
import { apply, type Changeset, type Outcome, type Snapshot } from "../change";
import { eqModeOf, holdingsOf } from "./seat";
import { cardName } from "@/lib/engine/polish";

/**
 * Puts a seat's pack in the order its owner wants it in.
 *
 * Not a rule — 5.4 counts what you carry and has no opinion about the order it
 * sits in — but a pack of four cards you cannot arrange is one you have to read
 * every time instead of recognising. The order has to be the server's, or the
 * next two-second poll would put the cards back where they were.
 *
 * Every id is checked against the seat that claims them, and only those ids are
 * written: a request naming somebody else's card renumbers nothing, rather than
 * quietly reaching into their pack.
 *
 * Not journalled. The journal is what the *table* is allowed to read, and the
 * order of somebody's own pack is not something the rules or anybody else at
 * the table has a stake in.
 */
export function reorderPack(
  snapshot: Snapshot,
  command: { seatId: string; holdingIds: readonly string[] },
): Outcome<void> {
  const mine = new Set(
    snapshot.holdings
      .filter((held) => held.seat_id === command.seatId)
      .map((held) => held.id),
  );
  const order = command.holdingIds.filter((id) => mine.has(id));
  if (order.length === 0) return { writes: {}, result: undefined };

  return {
    writes: {
      // One-based, so a card that has never been arranged — which is null, and
      // sorts last — cannot collide with the first arranged one.
      holdings: {
        patch: order.map((id, index) => ({ id, patch: { ordinal: index + 1 } })),
      },
    },
    result: undefined,
  };
}

/**
 * Puts a Przedmiot on, or takes it off (the slotowy variant only).
 *
 * `slot` of null takes the card off and puts it back in the pack. Anything
 * already in the place being filled comes off in the same breath, which is what
 * a player means by putting on a different sword.
 *
 * Nothing is journalled here, deliberately. Gear moves around constantly — a
 * card is picked up, tried in a place, put back, swapped for a better one — and
 * a line for each would bury the turn it happened in. What the table needs to
 * see is a character *gaining* something ("zabranie"), which is the event with
 * consequences; where it then hangs on the body is arrangement.
 */
export function equipCard(
  snapshot: Snapshot,
  command: { holdingId: string; slot: Slot | null },
): Outcome<void> {
  const held = snapshot.holdings.find((h) => h.id === command.holdingId);
  if (!held) throw new Error("Nie ma takiej karty.");
  if (held.kind !== "item") throw new Error("Zakładać można tylko Przedmioty.");

  /**
   * The Sakwa's inside is not a place on the body, so klasyczny has it too.
   *
   * Everything else this function moves is the slotted variant's — a house
   * rule about wearing things, and a klasyczny table has no body to wear them
   * on. The Tajemna Sakwa is not that: the place is made by a Karta anybody
   * can be holding, and "W Sakwie możesz umieścić 1 Przedmiot" is printed in
   * the same box as 5.4. Refusing it at a klasyczny table would be the app
   * withholding a card's own rule over a variant the card knows nothing about.
   *
   * Both directions: putting one in, and taking the one that is in out.
   */
  const stowing =
    STORAGE.includes(command.slot as Slot) || STORAGE.includes(held.slot as Slot);
  if (snapshot.game.eq_mode !== "slots" && !stowing) {
    throw new Error("Ten stół gra klasycznym ekwipunkiem — nie ma miejsc na przedmioty.");
  }

  /**
   * And there is no place unless the Karta that makes it is held.
   *
   * `fitsIn` answers what may go in; this answers whether there is an "in" at
   * all. Separate because they fail differently: a relic offered to the bag is
   * a rule about the card, and a bag nobody is carrying is a place that does
   * not exist.
   */
  if (
    STORAGE.includes(command.slot as Slot) &&
    !openStorage(
      snapshot.holdings
        .filter((one) => one.seat_id === held.seat_id)
        .map((one) => ({ cardId: one.card_id, slot: one.slot })),
      eqModeOf(snapshot.game),
    ).includes(command.slot as Slot)
  ) {
    const place = SLOT_LABEL[command.slot as Slot];
    throw new Error(
      snapshot.game.eq_mode === "slots"
        ? `${place}: Karta, która robi to miejsce, musi być założona — w plecaku jest zamknięta.`
        : `${place}: nie masz Karty, która robi to miejsce.`,
    );
  }

  if (command.slot === null) {
    // Taking something off puts it in the pack, and the pack is still the four
    // of 5.4. A character with four things already carried has nowhere to put
    // its helmet, and the rulebook's answer to being over the limit is to drop
    // something (5.6) — so it says so rather than quietly making a fifth place.
    const mine = holdingsOf(snapshot, held.seat_id);
    if (carriedCount(mine, "slots") >= carryLimit(mine, "slots")) {
      throw new Error("Plecak jest pełny — najpierw coś odrzuć (5.4, 5.6).");
    }
    // Nothing to write when the card is already there: the client sends this
    // whenever a card is dropped, including onto the pack it was picked up
    // from.
    if (held.slot === null) return { writes: {}, result: undefined };
    return {
      writes: { holdings: { patch: [{ id: held.id, patch: { slot: null } }] } },
      result: undefined,
    };
  }

  /**
   * 5.3, at the moment of putting it on.
   *
   * `takeCard` refuses a card a Natura may not hold, so this is unreachable by
   * play alone — but the console hands cards out by fiat, a Natura can change
   * under a card already held (7.2), and the browser is not what enforces
   * anything here. Putting on a card that would do nothing is a click that
   * looks like it worked and changes no number, which is worse than a refusal
   * that says why.
   */
  const wearer = snapshot.seats.find((seat) => seat.id === held.seat_id);
  if (
    forbiddenIn(
      held.card_id,
      command.slot,
      (wearer?.nature ?? null) as Nature | null,
      eqModeOf(snapshot.game),
    )
  ) {
    throw new Error(forbiddenSaid(cardName(held.card_id)));
  }

  if (!fitsIn(held.card_id, command.slot)) {
    // Two different refusals wearing one sentence. "It does not go there" is
    // useful when there is somewhere it does go; when there is nowhere at all,
    // it reads as a puzzle about which place to try next.
    const name = cardName(held.card_id);
    throw new Error(
      isWearable(held.card_id)
        ? `${name} nie pasuje w to miejsce (${SLOT_LABEL[command.slot]}).`
        : `${name} to nie jest rzecz do noszenia — zostaje w plecaku.`,
    );
  }

  /**
   * One thing per place, and the thing already there goes back in the pack
   * rather than vanishing. Only this seat's — everybody else's Miecz stays on.
   *
   * It goes back into the square the new one is leaving, so the two change
   * places. Landing on the end of the row instead was the tidy answer and the
   * wrong one: a player swapping a Miecz for an Excalibur has not decided
   * anything about where the Miecz should sit, and finding it at the back of a
   * pack of sixteen is a small punishment for an ordinary move.
   */
  const occupant = snapshot.holdings.find(
    (h) => h.seat_id === held.seat_id && h.slot === command.slot && h.id !== held.id,
  );

  const patch = [
    ...(occupant
      ? [{ id: occupant.id, patch: { slot: null, ordinal: held.ordinal } }]
      : []),
    ...(held.slot !== command.slot
      ? [{ id: held.id, patch: { slot: command.slot } }]
      : []),
  ];

  return {
    writes: patch.length > 0 ? { holdings: { patch } } : {},
    result: undefined,
  };
}

/**
 * Picks up a card that was lying on the field a character is standing on.
 *
 * Distinct from `takeCard`, which lifts something out of the turn's own stack —
 * a card just drawn. This one reaches for what was already lying there: gear a
 * dead character left, something a previous visitor dropped, a Przedmiot nobody
 * could carry. Every rule about *whether* you may have it is `takeCard`'s, so
 * this establishes the right to reach and then defers.
 *
 * "Postać, której ruch kończy się na danym Obszarze" — you must be standing on
 * it, and it must be your turn, because 13.1 is explicit that nothing happens
 * on a field you merely passed through.
 */
/**
 * What was in the Sakwa when the Sakwa stopped being open.
 *
 * Taking the bag off, dropping it, or having Pan Bogactwa take it all close
 * the place — and a Karta sitting in a place that no longer exists would be
 * the worst of both halves of this card: uncounted against 5.4 and still
 * unreachable by every rule that takes a Przedmiot.
 *
 * So it goes back in the Plecak, where anything without a place goes. That can
 * put the holder over the four of 5.4, and it should: the overflow frame opens
 * and asks them what goes, which is the same answer 5.6 gives to losing a Koń.
 *
 * Chained through `apply` for the usual reason — the write that closes the
 * place is the one being made, so the stored snapshot still has it open.
 */
export function spilled(snapshot: Snapshot, soFar: Changeset = {}): Changeset {
  const after = apply(snapshot, soFar);
  const mode = eqModeOf(after.game);
  const stranded = after.holdings.filter((held) => {
    if (!STORAGE.includes(held.slot as Slot)) return false;
    const theirs = after.holdings.filter((one) => one.seat_id === held.seat_id);
    const open = openStorage(
      theirs.map((one) => ({ cardId: one.card_id, slot: one.slot })),
      mode,
    );
    return !open.includes(held.slot as Slot);
  });
  if (stranded.length === 0) return {};
  return {
    holdings: { patch: stranded.map((held) => ({ id: held.id, patch: { slot: null } })) },
  };
}
