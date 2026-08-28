import { describe, expect, it } from "vitest";
import { scriptedRandom } from "@/lib/engine/ports";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { castSpell, friendDiesInstead, sendRaider } from "./fight";
import { healFromFriend, partWithFriend, payFriend, speakCarriedSpell } from "./friends";
import { apply } from "../change";
import type { TurnPhase } from "@/lib/engine/turn";
import type { FieldId } from "@/lib/engine/board";
import { pointsOf, seatView } from "./seat";
import { dropCard, takeCard } from "./holdings";

/**
 * Przyjaciele, which the rulebook barely describes.
 *
 * Chapter 6 is four rules about custody — how you gain a friend, that it lies
 * face up, that you may hold any number, and where a dead one goes. It never
 * says a friend fights, adds points, or takes a hit for you. Every one of those
 * is printed on the individual card, so this is where the cards are checked
 * rather than the chapter.
 */

const withCards = (...cards: { id: string; kind?: "item" | "friend" }[]) =>
  aTable({
    seats: [aSeat({ id: "seat-a", sword_own: 2, magic_own: 1 })],
    holdings: cards.map((card, at) =>
      aHolding({
        id: `held-${at}`,
        seat_id: "seat-a",
        card_id: card.id,
        kind: card.kind ?? "friend",
      }),
    ),
  });

describe("a friend who fights in your place (Rycerz)", () => {
  /**
   * The bug this pins: the Rycerz prints 3 and 3 because *he* has them, and
   * reading a printed corner as a loan made him a permanent +3/+3 to whoever
   * held him — a statue buff instead of a champion.
   */
  it("lends nothing at all while merely being held", () => {
    expect(pointsOf(withCards({ id: "rycerz" }), "seat-a", "parametr")).toEqual({
      miecz: 2,
      magia: 1,
    });
  });

  /** "będzie walczył zamiast ciebie" — his points, not yours plus his. */
  it("replaces the whole combat figure with his own", () => {
    expect(pointsOf(withCards({ id: "rycerz" }), "seat-a", "walka")).toEqual({
      miecz: 3,
      magia: 3,
    });
  });

  /**
   * "Nie może jednak używać twoich Zaklęć ani Przedmiotów." An Excalibur in the
   * pack is the character's, and the character is not the one swinging.
   */
  it("fights with none of your gear", () => {
    const armed = withCards({ id: "rycerz" }, { id: "excalibur", kind: "item" });
    expect(pointsOf(armed, "seat-a", "walka")).toEqual({ miecz: 3, magia: 3 });
    // The Excalibur still counts for the character's own parameter (1.5).
    expect(pointsOf(armed, "seat-a", "parametr").miecz).toBe(3);
  });
});

/**
 * Two cards carry `walczy-za-ciebie` and they mean different things by it. The
 * Rycerz stands in front of you; the Poszukiwacz Przygód only ever fights at
 * the far end of a raid you send him on. Reading them alike dropped a
 * Barbarzyńca from his own Miecz 5 to the 3 his friend raids with, in fights
 * the friend was not even in.
 */
describe("a friend who raids is not a friend who stands in (Poszukiwacz Przygód)", () => {
  it("leaves your own fights entirely alone", () => {
    const table = withCards({ id: "poszukiwacz-przygod" });
    expect(pointsOf(table, "seat-a", "parametr")).toEqual({ miecz: 2, magia: 1 });
    expect(pointsOf(table, "seat-a", "walka")).toEqual({ miecz: 2, magia: 1 });
  });

  it("is still not a bonus, either standing or fighting", () => {
    const armed = withCards({ id: "poszukiwacz-przygod" }, { id: "excalibur", kind: "item" });
    // The Excalibur's point, and nothing of the Poszukiwacz's three.
    expect(pointsOf(armed, "seat-a", "walka").miecz).toBe(3);
  });
});

describe("the Bojowy Rumak's Magia (magia-do-miecza)", () => {
  it("adds your Magia to your Miecz in a fight, and only in a fight", () => {
    const mounted = withCards({ id: "bojowy-rumak", kind: "item" });
    expect(pointsOf(mounted, "seat-a", "parametr")).toEqual({ miecz: 2, magia: 1 });
    expect(pointsOf(mounted, "seat-a", "walka")).toEqual({ miecz: 3, magia: 1 });
  });

  /**
   * Both at once. The Rycerz is swinging with his own gear, so a Rumak the
   * character is sitting on cannot improve the blow — the card forbids it in as
   * many words.
   */
  it("does nothing while the Rycerz is the one fighting", () => {
    const both = withCards({ id: "rycerz" }, { id: "bojowy-rumak", kind: "item" });
    expect(pointsOf(both, "seat-a", "walka")).toEqual({ miecz: 3, magia: 3 });
  });
});

describe("a friend who dies in your place (6.4)", () => {
  /** "Jeżeli zostaniesz pokonany zginie tylko twój Rumak" — no roll, no escape. */
  it("spends the Rumak without rolling for it", async () => {
    const table = withCards({ id: "bojowy-rumak", kind: "item" });
    const out = await friendDiesInstead(table, { seatId: "seat-a" }, ports());

    expect(out.result).toBe(true);
    expect(out.writes.holdings?.delete).toEqual(["held-0"]);
    expect(out.writes.journal?.[0]).toMatchObject({
      kind: "died-for-you",
      payload: { cardId: "bojowy-rumak", die: null },
    });
  });

  /** "rzuć kostką. Wynik równy 1 oznacza, że zginął Giermek." */
  it("keeps the Giermek on anything but a one", async () => {
    const table = withCards({ id: "giermek" });
    const out = await friendDiesInstead(
      table,
      { seatId: "seat-a" },
      ports({ random: scriptedRandom([4]) }),
    );

    expect(out.result).toBe(false);
    expect(out.writes.holdings).toBeUndefined();
  });

  it("spends the Giermek on a one", async () => {
    const table = withCards({ id: "giermek" });
    const out = await friendDiesInstead(
      table,
      { seatId: "seat-a" },
      ports({ random: scriptedRandom([1]) }),
    );

    expect(out.result).toBe(true);
    expect(out.writes.journal?.[0]).toMatchObject({
      kind: "died-for-you",
      payload: { cardId: "giermek", die: 1 },
    });
  });

  /**
   * Holding both, the Giermek is asked first — the only order under which he
   * can ever be the one to go, since the Rumak is certain and would always
   * answer before him.
   */
  it("asks the one who rolls before the one who is certain", async () => {
    const table = withCards({ id: "bojowy-rumak", kind: "item" }, { id: "giermek" });
    const out = await friendDiesInstead(
      table,
      { seatId: "seat-a" },
      ports({ random: scriptedRandom([1]) }),
    );

    expect(out.writes.journal?.[0]).toMatchObject({ payload: { cardId: "giermek" } });
  });

  /** And the Rumak catches it when the Giermek's roll misses. Only one dies. */
  it("falls through to the Rumak when the roll misses, and stops there", async () => {
    const table = withCards({ id: "bojowy-rumak", kind: "item" }, { id: "giermek" });
    const out = await friendDiesInstead(
      table,
      { seatId: "seat-a" },
      ports({ random: scriptedRandom([5]) }),
    );

    expect(out.result).toBe(true);
    expect(out.writes.holdings?.delete).toEqual(["held-0"]);
    expect(out.writes.journal).toHaveLength(1);
  });

  /**
   * The Poszukiwacz Przygód is spent on the raid you send him out on and stands
   * in for nothing at home. Without the flag he would offer his life every time
   * anybody lost anything.
   */
  it("does not offer the Poszukiwacz Przygód in your own fights", async () => {
    const table = withCards({ id: "poszukiwacz-przygod" });
    const out = await friendDiesInstead(table, { seatId: "seat-a" }, ports());
    expect(out.result).toBe(false);
  });

  it("offers nobody when there is nobody to offer", async () => {
    const out = await friendDiesInstead(
      withCards({ id: "pasterz" }),
      { seatId: "seat-a" },
      ports(),
    );
    expect(out.result).toBe(false);
    expect(out.writes).toEqual({});
  });
});

describe("the friends that were working all along", () => {
  it("still lets the Pasterz lend his point of each (1.5, 2.5)", () => {
    expect(pointsOf(withCards({ id: "pasterz" }), "seat-a", "parametr")).toEqual({
      miecz: 3,
      magia: 2,
    });
  });

  /** "dodawał ci 2 punkty Miecza podczas każdej walki" — in a fight and nowhere else. */
  it("still counts the Krzyżowiec only in a fight", () => {
    const table = withCards({ id: "krzyzowiec" });
    expect(pointsOf(table, "seat-a", "parametr").miecz).toBe(2);
    expect(pointsOf(table, "seat-a", "walka").miecz).toBe(4);
  });

  it("keeps a friend visible in the seat's own reckoning of what it holds", () => {
    const view = seatView(withCards({ id: "rycerz" }), "seat-a");
    expect(view.holdings.map((h) => h.cardId)).toContain("rycerz");
  });
});


/**
 * The raid (Poszukiwacz Przygód).
 *
 * "Po zakończeniu ruchu możesz zlecić temu Przyjacielowi, by zaatakował Postać
 * lub Wroga, oddalonego najwyżej o 3 Obszary. Poszukiwacz Przygód posiada 3
 * punkty Miecza. W przypadku porażki ty nie tracisz punktu Życia, ale twój
 * Przyjaciel ginie."
 *
 * Not an encounter: 13.1 keeps the character on the field their move ended on,
 * and the whole point of this card is that the friend goes instead.
 */
const onField = (over: Partial<Extract<TurnPhase, { phase: "field" }>> = {}): TurnPhase => ({
  phase: "field",
  fieldId: "mroczna-polana",
  from: null,
  draw: 1,
  drawn: [],
  ...over,
});

/** Two characters, the second placed however far off the test wants. */
const twoSeats = (theirField: FieldId, cards: string[] = ["poszukiwacz-przygod"]) =>
  aTable({
    game: { turn_state: onField(), active_seat: 0 },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, field_id: "mroczna-polana", sword_own: 5 }),
      aSeat({
        id: "seat-b",
        seat_index: 1,
        character_id: "elf",
        field_id: theirField,
        sword_own: 2,
      }),
    ],
    holdings: cards.map((cardId, at) =>
      aHolding({ id: `held-${at}`, seat_id: "seat-a", card_id: cardId, kind: "friend" }),
    ),
  });

const fightOf = (writes: { game?: { turn_state?: unknown } }) =>
  (writes.game?.turn_state as Extract<TurnPhase, { phase: "fight" }>).fight;

describe("sending a Przyjaciel out (Poszukiwacz Przygód)", () => {
  it("fights with the friend's three points, not the character's five", () => {
    const out = sendRaider(twoSeats("przelecz-wichrow"), { targetSeatId: "seat-b" });
    expect(fightOf(out.writes).playerTotal).toBe(3);
  });

  it("marks the fight as the friend's, so losing it can charge him", () => {
    const out = sendRaider(twoSeats("przelecz-wichrow"), { targetSeatId: "seat-b" });
    expect(fightOf(out.writes).raid).toEqual({ cardId: "poszukiwacz-przygod" });
  });

  it("reaches exactly three Obszary", () => {
    // przeprawa-1 is 3 round the ring from mroczna-polana.
    expect(() => sendRaider(twoSeats("przeprawa-1"), { targetSeatId: "seat-b" })).not.toThrow();
  });

  it("refuses a fourth", () => {
    expect(() => sendRaider(twoSeats("dolina-cienia"), { targetSeatId: "seat-b" })).toThrow(
      /Zbyt daleko/,
    );
  });

  /**
   * A Przeprawa is a turn's work that can fail, not a step. Counting one would
   * put most of the board within three Obszary of everywhere.
   */
  it("will not count across rings at all", () => {
    expect(() => sendRaider(twoSeats("kurhan"), { targetSeatId: "seat-b" })).toThrow(
      /Zbyt daleko/,
    );
  });

  it("needs a friend who actually raids", () => {
    expect(() =>
      sendRaider(twoSeats("przelecz-wichrow", ["rycerz"]), { targetSeatId: "seat-b" }),
    ).toThrow(/Nie masz Przyjaciela/);
  });

  /** "Po zakończeniu ruchu" — not in the middle of one. */
  it("waits until the move is over", () => {
    const midMove = aTable({
      game: { turn_state: { phase: "roll" } },
      seats: [aSeat({ id: "seat-a", field_id: "mroczna-polana" })],
      holdings: [
        aHolding({ id: "h", seat_id: "seat-a", card_id: "poszukiwacz-przygod", kind: "friend" }),
      ],
    });
    expect(() => sendRaider(midMove, { targetSeatId: "seat-a" })).toThrow(/po ruchu/);
  });
});


/**
 * The Najemnik, who sells what the others lend.
 *
 * "Jako Przyjaciel, Najemnik dodaje ci na jedną turę 3 punkty Miecza, ilekroć
 * zapłacisz mu 1 Sztukę Złota. Płacić Najemnikowi można tylko raz na turę."
 */
const hiring = (gold: number) =>
  aTable({
    seats: [aSeat({ id: "seat-a", sword_own: 5, gold })],
    holdings: [aHolding({ id: "h", seat_id: "seat-a", card_id: "najemnik", kind: "friend" })],
  });

describe("paying a Przyjaciel by the turn (Najemnik)", () => {
  it("lends nothing until somebody pays", () => {
    expect(pointsOf(hiring(2), "seat-a", "walka")).toEqual({ miecz: 5, magia: 1 });
  });

  it("takes the Sztuka Złota and hands over the three points", () => {
    const after = apply(hiring(2), payFriend(hiring(2), {}).writes);
    expect(after.seats[0].gold).toBe(1);
    expect(pointsOf(after, "seat-a", "parametr").miecz).toBe(8);
  });

  /**
   * The half that was broken for every effect in the game, not just this card:
   * `bonusFrom` was called in `envelope.ts` alone, so a bought or drunk bonus
   * was drawn on the screen and never reached the fight.
   */
  it("is worth the points in a fight, not only on the screen", () => {
    const after = apply(hiring(2), payFriend(hiring(2), {}).writes);
    expect(pointsOf(after, "seat-a", "walka").miecz).toBe(8);
  });

  it("will not be paid twice in one turn", () => {
    const after = apply(hiring(2), payFriend(hiring(2), {}).writes);
    expect(() => payFriend(after, {})).toThrow(/już zapłatę w tej turze/);
  });

  it("refuses when the purse is empty", () => {
    expect(() => payFriend(hiring(0), {})).toThrow(/Za mało złota/);
  });

  it("refuses when nobody is for hire", () => {
    expect(() => payFriend(withCards({ id: "pasterz" }), {})).toThrow(/Nie masz Przyjaciela/);
  });

  /**
   * The Rycerz swings with his own 3 and 3 and "nie może używać twoich Zaklęć
   * ani Przedmiotów" — an Eliksir you drank is no more his than your Excalibur.
   */
  it("buys the character nothing the Rycerz can spend", () => {
    const both = aTable({
      seats: [aSeat({ id: "seat-a", sword_own: 5, gold: 2 })],
      holdings: [
        aHolding({ id: "h0", seat_id: "seat-a", card_id: "najemnik", kind: "friend" }),
        aHolding({ id: "h1", seat_id: "seat-a", card_id: "rycerz", kind: "friend" }),
      ],
    });
    const after = apply(both, payFriend(both, {}).writes);
    expect(pointsOf(after, "seat-a", "walka")).toEqual({ miecz: 3, magia: 3 });
  });
});

/**
 * A Zaklęcie that belongs to a card rather than to a character.
 *
 * "weź Kartę Zaklęcia i połóż ją z Kartą Krzyżowca" — it lies with him, not in
 * the hand, which is the whole reason it is a `carried` holding and not a
 * `spell` one: 2.6 must not count it and nothing that takes "your Zaklęcia"
 * may reach it.
 */
const carrying = (friend: string, gold = 2) =>
  aTable({
    seats: [aSeat({ id: "seat-a", gold })],
    holdings: [
      aHolding({ id: "h-friend", seat_id: "seat-a", card_id: friend, kind: "friend" }),
      aHolding({
        id: "h-spell",
        seat_id: "seat-a",
        card_id: "wladca-gromu",
        kind: "carried",
        face: "hidden",
        carried_by: friend,
      }),
    ],
  });

describe("a Zaklęcie carried by a Przyjaciel", () => {
  it("does not count against the hand (2.6)", () => {
    const view = seatView(carrying("krzyzowiec"), "seat-a");
    expect(view.holdings.filter((h) => h.kind === "spell")).toHaveLength(0);
    expect(view.holdings.filter((h) => h.kind === "carried")).toHaveLength(1);
  });

  it("is spoken for nothing by the Krzyżowiec, who stays", async () => {
    const table = carrying("krzyzowiec");
    const out = await speakCarriedSpell(table, {}, ports());
    const after = apply(table, out.writes);

    expect(after.seats[0].gold).toBe(2);
    expect(after.holdings.some((h) => h.card_id === "krzyzowiec")).toBe(true);
    expect(after.holdings.some((h) => h.kind === "carried")).toBe(false);
  });

  /** "zniknie zabierając swoją zapłatę - należy odłożyć jego Kartę i złoto." */
  it("costs the Gnom's fee, and the Gnom", async () => {
    const table = carrying("gnom");
    const out = await speakCarriedSpell(table, {}, ports());
    const after = apply(table, out.writes);

    expect(after.seats[0].gold).toBe(1);
    expect(after.holdings.some((h) => h.card_id === "gnom")).toBe(false);
    expect(after.holdings.some((h) => h.kind === "carried")).toBe(false);
  });

  it("refuses the Gnom when the purse is empty", async () => {
    await expect(speakCarriedSpell(carrying("gnom", 0), {}, ports())).rejects.toThrow(
      /Za mało złota/,
    );
  });

  it("refuses when nobody is carrying one", async () => {
    await expect(
      speakCarriedSpell(withCards({ id: "pasterz" }), {}, ports()),
    ).rejects.toThrow(/Żaden twój Przyjaciel/);
  });

  /**
   * The Gnom's whole bargain is that the spell cannot be had for nothing, so
   * the ordinary casting path must not reach a carried card at all.
   */
  it("cannot be spoken by the character through the ordinary cast", async () => {
    await expect(
      castSpell(carrying("gnom"), { seatId: "seat-a", holdingId: "h-spell" }, ports()),
    ).rejects.toThrow(/nie ma tego Zaklęcia/);
  });

  /** 6.4: the friend leaves, and what he was holding goes where 9.6 sends it. */
  it("leaves with its Przyjaciel when he is put down", () => {
    const table = carrying("krzyzowiec");
    const after = apply(table, dropCard(table, { holdingId: "h-friend" }).writes);
    expect(after.holdings).toHaveLength(0);
  });
});

/**
 * The two who mend you where they belong, and may be given up there instead.
 *
 * "Dzięki przyjaźni Księżniczki będziesz mógł odzyskać do 2 punktów Życia,
 * podczas każdej wizyty w Zamku. Jeżeli zrezygnujesz tam z jej Karty, otrzymasz
 * 3 Sztuki Złota." The Władca says the same of the Twierdza Strzegąca Dróg.
 *
 * The healing half was declared in `ABILITIES` and read by nothing: `payHealer`
 * asks the *Obszar* what it offers and never the cards in the hand, so both
 * cards behaved exactly as they would have with the clause absent.
 */
describe("a friend who mends you at her own Obszar (Księżniczka, Władca)", () => {
  const at = (field: FieldId | null, friend = "ksiezniczka", life = 1, gold = 0) =>
    aTable({
      seats: [aSeat({ id: "seat-a", field_id: field, life, gold })],
      holdings: [aHolding({ id: "h-friend", seat_id: "seat-a", card_id: friend, kind: "friend" })],
    });

  it("gives back what was lost, up to the two the card names", () => {
    const { writes, result } = healFromFriend(at("zamek"), { seatId: "seat-a", points: 2 });
    expect(result).toBe(2);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { life: 3 } }]);
  });

  it("costs nothing — the friendship is the payment", () => {
    // The Medyk charges by the point; this is a friend, and the card names no
    // price at all.
    const { writes } = healFromFriend(at("zamek", "ksiezniczka", 1, 0), {
      seatId: "seat-a",
      points: 2,
    });
    expect(writes.seats?.[0].patch).not.toHaveProperty("gold");
  });

  it("stops at 4.7's ceiling rather than at the card's number", () => {
    // Two points offered, one point missing: you get the one.
    const { result } = healFromFriend(at("zamek", "ksiezniczka", 3), {
      seatId: "seat-a",
      points: 2,
    });
    expect(result).toBe(1);
  });

  it("refuses anywhere else, however friendly she is", () => {
    expect(() => healFromFriend(at("przelecz-wichrow"), { seatId: "seat-a", points: 1 })).toThrow(
      /nie leczy na tym Obszarze/,
    );
  });

  it("is the Twierdza for the Władca, and only the Twierdza", () => {
    expect(
      healFromFriend(at("twierdza-strzegaca-drog", "wladca"), { seatId: "seat-a", points: 2 })
        .result,
    ).toBe(2);
    expect(() => healFromFriend(at("zamek", "wladca"), { seatId: "seat-a", points: 1 })).toThrow(
      /nie leczy/,
    );
  });

  it("helps once in a turn, and says so the second time", () => {
    const table = at("zamek");
    const after = apply(table, healFromFriend(table, { seatId: "seat-a", points: 1 }).writes);
    expect(() => healFromFriend(after, { seatId: "seat-a", points: 1 })).toThrow(
      /już w tej turze/,
    );
  });
});

describe("giving that friend up for gold, where she belongs", () => {
  const at = (field: FieldId | null, friend = "ksiezniczka") =>
    aTable({
      seats: [aSeat({ id: "seat-a", field_id: field, gold: 1 })],
      holdings: [aHolding({ id: "h-friend", seat_id: "seat-a", card_id: friend, kind: "friend" })],
    });

  it("pays the three the card names and takes the Karta for good", () => {
    const { writes, result } = partWithFriend(at("zamek"), {
      seatId: "seat-a",
      holdingId: "h-friend",
    });
    expect(result).toBe(3);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { gold: 4 } }]);
    expect(writes.holdings?.delete).toEqual(["h-friend"]);
  });

  it("refuses at any other Obszar", () => {
    // 6.4 lets you put a friend down anywhere for nothing — that is `dropCard`.
    // This is the one place she is worth something.
    expect(() =>
      partWithFriend(at("przelecz-wichrow"), { seatId: "seat-a", holdingId: "h-friend" }),
    ).toThrow(/tylko w/);
  });

  it("refuses a friend who is not one of the two", () => {
    expect(() =>
      partWithFriend(at("zamek", "pasterz"), { seatId: "seat-a", holdingId: "h-friend" }),
    ).toThrow(/nie jest kartą/);
  });
});

/**
 * The three friends who charge to join at all.
 *
 * "Najemnik będzie twoim Przyjacielem, jeżeli zapłacisz mu 1 Sztukę Złota."
 * The Tragarz is paid "przedtem" and the Chochlik takes a point of Życie
 * instead. Taking the card is agreeing to the price — there is no third state
 * between paying and walking away, and walking away is leaving it on the
 * Obszar.
 */
describe("a friend who charges to join (Najemnik, Tragarz, Chochlik)", () => {
  const arriving = (gold = 2, life = 4) =>
    aTable({ seats: [aSeat({ id: "seat-a", gold, life, field_id: "przelecz-wichrow" })] });

  it("takes the Sztuka Złota as the Najemnik joins", () => {
    const { writes } = takeCard(arriving(2), { seatId: "seat-a", cardId: "najemnik" });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { gold: 1, life: 4 } }]);
    expect(writes.holdings?.insert?.[0]).toMatchObject({ card_id: "najemnik", kind: "friend" });
  });

  it("refuses when the purse is empty", () => {
    expect(() => takeCard(arriving(0), { seatId: "seat-a", cardId: "najemnik" })).toThrow(
      /za mało złota/i,
    );
  });

  it("takes a point of Życie for the Chochlik instead of gold", () => {
    const { writes } = takeCard(arriving(2, 4), { seatId: "seat-a", cardId: "chochlik" });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { gold: 2, life: 3 } }]);
  });

  it("will not let the Chochlik take your last point of Życie", () => {
    // 15.5 kills a Postać at zero, and no card in the box asks you to die in
    // order to make a friend.
    expect(() => takeCard(arriving(2, 1), { seatId: "seat-a", cardId: "chochlik" })).toThrow(
      /ostatni/,
    );
  });

  it("charges nothing for a friend who asks nothing", () => {
    const { writes } = takeCard(arriving(2), { seatId: "seat-a", cardId: "pasterz" });
    expect(writes.seats).toBeUndefined();
  });
});
