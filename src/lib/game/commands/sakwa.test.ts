/**
 * The Tajemna Sakwa: a place a Karta makes, and the one thing that can reach it.
 *
 * "W Sakwie możesz umieścić 1 Przedmiot. Przedmiot ten i Sakwę będziesz mógł
 * utracić jedynie w wypadku użycia Zaklęcia »Pan Bogactwa« (nikt nie może go
 * zażądać jako okupu za przegraną walkę, nie stracisz go na Bagnach, etc.)."
 *
 * Two rules, and they are tested apart because they answer to different halves
 * of the app: what the bag does to 5.4's count, and what it does to every rule
 * that takes a Przedmiot away.
 */

import { afterEach, describe, expect, it } from "vitest";
import { emptyTables, memoryHandle, memoryStore, resetStore, setStore, activeStore } from "../gameStore";
import { createGame } from "../store";
import { setReady } from "../lobbyStore";
import { equipCard as equip, grantCard, startGame, takeNewCharacter } from "../turnStore";
import { aHolding, aSeat, aTable } from "../fixture";
import { carriedCount } from "@/lib/engine/derive";
import { asHolding } from "./seat";
import {
  equipCard,
  spilled,
} from "./wearing";
import { inPlayAt, openStorage, type Slot } from "@/lib/engine/slots";
import { inEffect } from "@/lib/engine/holdings";
import { carryLimit } from "@/lib/engine/derive";
import { apply } from "../change";
import type { EqMode } from "@/lib/engine/slots";

const table = (
  holdings: { card_id: string; slot?: string | null }[],
  eqMode: EqMode = "classic",
) =>
  aTable({
    game: { eq_mode: eqMode },
    seats: [aSeat({ id: "seat-a" })],
    holdings: holdings.map((one, at) =>
      aHolding({ id: `h${at}`, seat_id: "seat-a", kind: "item", ...one }),
    ) as never,
  });

const packed = (snapshot: ReturnType<typeof table>, eqMode: EqMode) =>
  carriedCount(snapshot.holdings.map(asHolding), eqMode);

describe("what the Sakwa does to 5.4's count", () => {
  const withBag = [
    { card_id: "tajemna-sakwa" },
    { card_id: "miecz", slot: "tajemna-sakwa" },
    { card_id: "helm" },
  ];

  /**
   * The point of putting it above the `eqMode` test in `carriedCount`.
   *
   * Everything below that test is the slotted variant's house rule — a card
   * counts where it is worn — and this is not that. The place is made by a
   * Karta, so it exists at a klasyczny table too, and the same Sakwa must not
   * cost a place at one table and nothing at the next.
   */
  it("keeps what is inside out of the pack in both variants", () => {
    // The bag and the Hełm; the Miecz inside is not carried.
    expect(packed(table(withBag, "classic"), "classic")).toBe(2);
    expect(packed(table(withBag, "slots"), "slots")).toBe(2);
  });

  it("still counts the Sakwa itself", () => {
    // Only the Magiczna Sakwa carries "(sama Sakwa nie jest liczona jako
    // Przedmiot)", and that note is about the bag. This one is one of your four.
    const alone = table([{ card_id: "tajemna-sakwa" }]);
    expect(packed(alone, "classic")).toBe(1);
  });

  /**
   * Which is the whole trade: using the card costs no space beyond the place
   * the protected Karta was already taking.
   */
  it("charges nothing for using it, over simply carrying the same cards", () => {
    const loose = table([{ card_id: "tajemna-sakwa" }, { card_id: "miecz" }]);
    const tucked = table([{ card_id: "tajemna-sakwa" }, { card_id: "miecz", slot: "tajemna-sakwa" }]);
    expect(packed(loose, "classic")).toBe(2);
    expect(packed(tucked, "classic")).toBe(1);
  });
});

describe("putting something in it", () => {
  it("works at a klasyczny table, where nothing else may be put anywhere", () => {
    const at = table([{ card_id: "tajemna-sakwa" }, { card_id: "miecz" }], "classic");
    const { writes } = equipCard(at, { holdingId: "h1", slot: "tajemna-sakwa" });
    expect(writes.holdings?.patch?.[0]).toMatchObject({ id: "h1", patch: { slot: "tajemna-sakwa" } });
  });

  it("still refuses an ordinary place at a klasyczny table", () => {
    const at = table([{ card_id: "helm" }], "classic");
    expect(() => equipCard(at, { holdingId: "h0", slot: "head" })).toThrow(/klasycznym/);
  });

  it("refuses when the Karta that makes the place is not held", () => {
    const at = table([{ card_id: "miecz" }], "classic");
    expect(() => equipCard(at, { holdingId: "h0", slot: "tajemna-sakwa" })).toThrow(
      /nie masz Karty, która robi to miejsce/,
    );
  });

  it("lets the one inside come back out", () => {
    const at = table([{ card_id: "tajemna-sakwa" }, { card_id: "miecz", slot: "tajemna-sakwa" }], "classic");
    const { writes } = equipCard(at, { holdingId: "h1", slot: null });
    expect(writes.holdings?.patch?.[0]).toMatchObject({ id: "h1", patch: { slot: null } });
  });

  /**
   * 5.3 guards the body, and the bag is not the body.
   *
   * A DOBRY character may not swing a Miecz Chaosu, and in slotowy the card
   * stays in their Plecak doing nothing rather than being taken off them (the
   * variant's own deviation). The Sakwa is that same nothing with a lid: not
   * worn, not in effect, not counted against 5.4. Refusing it there while the
   * pack one square away is allowed was the rule guarding a door it has no
   * business at.
   */
  const chaotic = (eqMode: EqMode) =>
    aTable({
      game: { eq_mode: eqMode },
      seats: [aSeat({ id: "seat-a", nature: "good" })],
      holdings: [
        aHolding({ id: "h0", seat_id: "seat-a", kind: "item", card_id: "tajemna-sakwa", slot: eqMode === "slots" ? "pouch" : null }),
        aHolding({ id: "h1", seat_id: "seat-a", kind: "item", card_id: "miecz-chaosu" }),
      ] as never,
    });

  it("takes a card the holder's Natura forbids, because nothing in it is used", () => {
    const { writes } = equipCard(chaotic("slots"), { holdingId: "h1", slot: "tajemna-sakwa" });
    expect(writes.holdings?.patch?.[0]).toMatchObject({
      id: "h1",
      patch: { slot: "tajemna-sakwa" },
    });
  });

  it("still keeps it off the body", () => {
    expect(() => equipCard(chaotic("slots"), { holdingId: "h1", slot: "main-hand" })).toThrow(
      /Natura/,
    );
  });

  /**
   * Klasyczny keeps the guard: there a card in the bag is in effect like
   * everything else held, so the bag would be a way of holding what 5.3 says
   * may not be held.
   */
  it("keeps it out of the bag at a klasyczny table", () => {
    expect(() => equipCard(chaotic("classic"), { holdingId: "h1", slot: "tajemna-sakwa" })).toThrow(
      /Natura/,
    );
  });
});


/**
 * When the place closes.
 *
 * In slotowy the bag has to be worn for its inside to exist — the same thing
 * `carryLimit` asks of the whole bearer family, where a Koń in the Plecak pulls
 * nothing. So the place can close under something that is in it, and a Karta
 * left in a place that does not exist would be the worst of both halves of this
 * card: uncounted against 5.4 and still unreachable by every rule that takes a
 * Przedmiot.
 */
describe("a bag that is not open", () => {
  const held = (slot: string | null) => [
    { card_id: "tajemna-sakwa", slot },
    { card_id: "miecz", slot: "tajemna-sakwa" },
  ];

  const open = (at: ReturnType<typeof table>, mode: "classic" | "slots") =>
    openStorage(at.holdings.map((h) => ({ cardId: h.card_id, slot: h.slot })), mode);

  it("is open in klasyczny by being held, because there is nowhere to wear it", () => {
    expect(open(table(held(null), "classic"), "classic")).toEqual(["tajemna-sakwa"]);
  });

  it("is shut in slotowy while it is in the Plecak", () => {
    expect(open(table(held(null), "slots"), "slots")).toEqual([]);
  });

  it("is open in slotowy once it is worn", () => {
    expect(open(table(held("pouch"), "slots"), "slots")).toEqual(["tajemna-sakwa"]);
  });

  it("refuses to take anything in while it is shut", () => {
    const at = table([...held("pouch"), { card_id: "helm" }], "slots");
    const off = apply(at, { holdings: { patch: [{ id: "h0", patch: { slot: null } }] } });
    expect(() => equipCard(off, { holdingId: "h2", slot: "tajemna-sakwa" })).toThrow(
      /musi być założona/,
    );
  });

  it("puts what was inside back in the Plecak when the bag comes off", () => {
    const at = table(held("pouch"), "slots");
    // Taking the bag off is the write; the Miecz inside has nowhere to be.
    const off = { holdings: { patch: [{ id: "h0", patch: { slot: null } }] } };
    expect(spilled(at, off).holdings?.patch).toEqual([{ id: "h1", patch: { slot: null } }]);
  });

  it("leaves it alone while the bag is still on", () => {
    expect(spilled(table(held("pouch"), "slots"))).toEqual({});
    expect(spilled(table(held(null), "classic"))).toEqual({});
  });

  it("spills it when the bag leaves the seat entirely", () => {
    const at = table(held("pouch"), "slots");
    const dropped = { holdings: { delete: ["h0"] } };
    expect(spilled(at, dropped).holdings?.patch).toEqual([{ id: "h1", patch: { slot: null } }]);
  });
});

/**
 * And the same thing through the store, because `spilled` being right is only
 * half of it: it has to be *called*, on the write that closes the place, before
 * the limit is judged.
 */
describe("taking the bag off, end to end", () => {
  afterEach(() => resetStore());

  async function playing() {
    const tables = emptyTables();
    const handle = memoryHandle(tables);
    const { game } = await createGame("Ola", "simulation", "slots", null, handle);
    setStore(memoryStore(tables));
    const seat = tables.seats[0].id as string;
    const user = (tables.users[0] as { id: string }).id;
    await takeNewCharacter(game.id, seat, "goblin", seat);
    await setReady(game.id, user, true);
    await startGame(game.id);
    return { gameId: game.id, seat };
  }

  it("puts what was inside back in the Plecak, and counts it again", async () => {
    const { gameId, seat } = await playing();
    await grantCard(gameId, seat, "tajemna-sakwa");
    await grantCard(gameId, seat, "miecz");

    const held = async (cardId: string) =>
      (await activeStore().load(gameId)).holdings.find((one) => one.card_id === cardId)!;

    // `grantCard` wears what it can, so the bag is already in the pouch.
    expect((await held("tajemna-sakwa")).slot).toBe("pouch");
    await equip(gameId, (await held("miecz")).id, "tajemna-sakwa");
    expect((await held("miecz")).slot).toBe("tajemna-sakwa");

    // Off it comes, and the Miecz has nowhere to be.
    await equip(gameId, (await held("tajemna-sakwa")).id, null);
    expect((await held("miecz")).slot).toBeNull();
  });
});


/**
 * Put away is not worn.
 *
 * The slotted variant's whole idea is that a card works *where it is worn* — a
 * Miecz cuts in a hand, a Koń pulls where it is ridden — and `slot != null` was
 * the same question for as long as every place was on the body. The Sakwa's
 * inside is the one that is not: "W Sakwie możesz **umieścić** 1 Przedmiot" is
 * storage, and the rest of the card is about nobody being able to reach it.
 *
 * A Miecz that is safe from every thief in the box *and* still swinging in
 * every fight would be a strictly better sword for no reason the Karta gives.
 */
describe("a Karta in the Sakwa is out of play, not on the body", () => {
  const held = (cardId: string, slot: Slot | null) => ({
    cardId,
    slot,
    kind: "item" as const,
    face: "open" as const,
  });

  it("knows which places put a card in play", () => {
    for (const slot of ["main-hand", "head", "mount", "pouch"]) {
      expect(inPlayAt(slot), slot).toBe(true);
    }
    expect(inPlayAt("tajemna-sakwa")).toBe(false);
    expect(inPlayAt(null)).toBe(false);
  });

  it("keeps a stored Miecz out of the reckoning", () => {
    const inHand = [held("miecz", "main-hand")];
    const stowed = [held("miecz", "tajemna-sakwa")];
    expect(inEffect(inHand, "slots").map((one) => one.cardId)).toEqual(["miecz"]);
    expect(inEffect(stowed, "slots")).toEqual([]);
  });

  it("keeps a stored Koń from pulling anything", () => {
    // "Koń może nieść 8 twoich Przedmiotów" — from under you, not from a bag.
    const ridden = [held("kon", "mount")];
    const stowed = [held("kon", "tajemna-sakwa")];
    // The Koń's eight on top of the slotted pack's four; stowed, just the four.
    expect(carryLimit(ridden, "slots")).toBe(12);
    expect(carryLimit(stowed, "slots")).toBe(4);
  });

  it("still keeps it out of the Plecak's four, which is the other half", () => {
    // Out of play and out of the count: it is somewhere else entirely.
    const at = table([{ card_id: "tajemna-sakwa", slot: "pouch" }, { card_id: "miecz", slot: "tajemna-sakwa" }], "slots");
    expect(packed(at, "slots")).toBe(0);
  });
});
