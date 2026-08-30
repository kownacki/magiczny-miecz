import { describe, expect, it } from "vitest";
import { nodeAt, isSettled, pendingIn } from "./resolve";
import { FIELD_SCRIPTS } from "./fieldScript";
import { SCRIPTS } from "./cardScript";
import type { Effect } from "./cardScript";

describe("what the app may carry out on its own", () => {
  it("settles what has one outcome", () => {
    expect(isSettled({ op: "nic" })).toBe(true);
    expect(isSettled({ op: "punkty", stat: "gold", delta: -1 })).toBe(true);
    expect(isSettled({ op: "tura-stracona", turns: 1 })).toBe(true);
    expect(isSettled({ op: "zaklecie", count: 1 })).toBe(true);
    expect(isSettled({ op: "kamien" })).toBe(true);
    expect(isSettled({ op: "walka", nazwa: "Osiłek", miecz: 4 })).toBe(true);
    expect(isSettled({ op: "przenies", to: { kind: "pole", fieldId: "karczma" } })).toBe(true);
  });

  it("refuses what the rules leave to the player", () => {
    // "wedle własnego wyboru" — a referee that chose would be playing your
    // character, which is the whole line this function draws.
    expect(
      isSettled({
        op: "wybor",
        options: [
          { label: "a", effect: { op: "punkty", stat: "sword", delta: 1 } },
          { label: "b", effect: { op: "punkty", stat: "magic", delta: 1 } },
        ],
      }),
    ).toBe(false);
    expect(isSettled({ op: "strata", co: "przedmiot" })).toBe(false);
    expect(isSettled({ op: "przenies", to: { kind: "dowolne-w-kregu" } })).toBe(false);
    expect(isSettled({ op: "zgadnij", nagroda: { op: "zaklecie", count: 1 } })).toBe(false);
    // Free healing has one answer; paid healing is a purchase, and how much to
    // buy is the buyer's.
    expect(isSettled({ op: "uzdrow", upTo: 4 })).toBe(true);
    expect(isSettled({ op: "uzdrow", upTo: 4, cena: 1 })).toBe(false);
  });

  it("is only as settled as its least settled step", () => {
    const withChoice: Effect = {
      op: "po-kolei",
      steps: [
        { op: "punkty", stat: "gold", delta: 1 },
        { op: "wybor", options: [{ label: "a", effect: { op: "nic" } }] },
      ],
    };
    expect(isSettled(withChoice)).toBe(false);
    expect(
      isSettled({ op: "po-kolei", steps: [{ op: "nic" }, { op: "kamien" }] }),
    ).toBe(true);
  });

  it("settles the Karczma, which is the whole point", () => {
    // Six faces, five of them things that simply happen and one — "przenieś się
    // na dowolny Obszar w tym Kręgu" — that is the player pointing at a board.
    const karczma = FIELD_SCRIPTS.karczma!.offers[0].effect;
    if (karczma.op !== "rzut") throw new Error("expected a die table");
    const settled = [1, 2, 3, 4, 5, 6].filter((face) => isSettled(karczma.faces[face]));
    expect(settled).toEqual([1, 2, 3, 4, 6]);
  });

  it("answers for every encoded card without throwing", () => {
    // The switch is exhaustive over `Effect`, so a new op added without a
    // decision about it fails to compile. This checks the corpus as it stands.
    for (const [cardId, script] of Object.entries(SCRIPTS)) {
      expect(() => isSettled(script!.effect), cardId).not.toThrow();
    }
    for (const [fieldId, script] of Object.entries(FIELD_SCRIPTS)) {
      for (const offer of script!.offers) {
        expect(() => isSettled(offer.effect), `${fieldId}/${offer.name}`).not.toThrow();
      }
    }
  });
});

/**
 * The walk that decides which question the sheet is asking right now.
 *
 * `isSettled` answers about a whole card; this answers about one node of it,
 * after the branch the player has already stepped into. It is the browser's
 * prediction of what `applyEffect` will report `pending`, and the two are kept
 * equal by nothing but these tests — so what they mostly do is pin the shapes
 * where the prediction is allowed to differ, and the invariant that ties the
 * two functions in this file together.
 */
describe("what an effect is still waiting on", () => {
  const nested: Effect = {
    op: "wybor",
    options: [
      {
        label: "w lewo",
        effect: {
          op: "wybor",
          options: [
            { label: "dalej", effect: { op: "strata", co: "przedmiot" } },
            { label: "z powrotem", effect: { op: "nic" } },
          ],
        },
      },
      { label: "w prawo", effect: { op: "nic" } },
    ],
  };

  it("asks nothing about an effect the app can simply carry out", () => {
    expect(pendingIn({ op: "nic" }, [])).toBeNull();
    expect(pendingIn({ op: "punkty", stat: "gold", delta: -1 }, [])).toBeNull();
    expect(pendingIn({ op: "przenies", to: { kind: "pole", fieldId: "karczma" } }, [])).toBeNull();
  });

  it("owes an unsettled leaf as itself, so the sheet knows what to put on screen", () => {
    const loss: Effect = { op: "strata", co: "przedmiot" };
    expect(pendingIn(loss, [])).toBe(loss);
    expect(pendingIn({ op: "przenies", to: { kind: "dowolne-w-kregu" } }, [])).toEqual({
      op: "przenies",
      to: { kind: "dowolne-w-kregu" },
    });
  });

  it("owes the choice itself until one of its options has been picked", () => {
    expect(pendingIn(nested, [])).toBe(nested);
    // A pick that names no option is the same situation as no pick: the server
    // refuses it too, and asking again is better than resolving something else.
    expect(pendingIn(nested, [7])).toBe(nested);
  });

  it("asks about the branch already stepped into, not the top of the card", () => {
    // Two steps down and the answer is a loss, not either of the choices above
    // it — which is the whole reason the choices travel with the question.
    expect(pendingIn(nested, [0])).toEqual({
      op: "wybor",
      options: [
        { label: "dalej", effect: { op: "strata", co: "przedmiot" } },
        { label: "z powrotem", effect: { op: "nic" } },
      ],
    });
    expect(pendingIn(nested, [0, 0])).toEqual({ op: "strata", co: "przedmiot" });
    expect(pendingIn(nested, [0, 1])).toBeNull();
    expect(pendingIn(nested, [1])).toBeNull();
  });

  it("reads one queue across a sequence rather than one per step", () => {
    // The queue is `Decisions.choices` in the order the effect asks. A copy
    // taken per step would answer the second question with the first answer.
    const twice: Effect = {
      op: "po-kolei",
      steps: [
        {
          op: "wybor",
          options: [
            { label: "a", effect: { op: "nic" } },
            { label: "b", effect: { op: "kamien" } },
          ],
        },
        {
          op: "wybor",
          options: [
            { label: "c", effect: { op: "nic" } },
            { label: "d", effect: { op: "zaklecie", count: 1 } },
          ],
        },
      ],
    };
    expect(pendingIn(twice, [])).toBe(twice.op === "po-kolei" ? twice.steps[0] : null);
    expect(pendingIn(twice, [0])).toBe(twice.op === "po-kolei" ? twice.steps[1] : null);
    expect(pendingIn(twice, [0, 1])).toBeNull();
  });

  it("does not eat the answers it was handed", () => {
    // The walk consumes a queue, and it used to consume the caller's — every
    // call site spread the array itself to survive being asked twice in one
    // render. The copy is the function's now.
    const answers = [0, 0];
    expect(pendingIn(nested, answers)).toEqual({ op: "strata", co: "przedmiot" });
    expect(answers).toEqual([0, 0]);
  });

  it("stops a sequence at the first step that is owed", () => {
    const stopped: Effect = {
      op: "po-kolei",
      steps: [
        { op: "punkty", stat: "gold", delta: 1 },
        { op: "strata", co: "przedmiot" },
        { op: "przenies", to: { kind: "dowolne-w-kregu" } },
      ],
    };
    expect(pendingIn(stopped, [])).toEqual({ op: "strata", co: "przedmiot" });
  });

  /**
   * The two places this walk is allowed to differ from the server's.
   *
   * Both are the browser admitting it does not have what the answer needs: a
   * `gdy` is tested against a seat, and a Snapshot is never sent to a device
   * (9.3); a `rzut` is decided by a die the server throws. Saying "nothing is
   * owed" is what puts a "Rzuć i rozpatrz" button on screen instead of a
   * question nobody can answer yet — the real question arrives with the result.
   */
  it("owes nothing for a condition it has no seat to test", () => {
    expect(
      pendingIn(
        {
          op: "gdy",
          warunek: { is: "ma-zloto" },
          to: { op: "strata", co: "przedmiot" },
          inaczej: { op: "wybor", options: [{ label: "a", effect: { op: "nic" } }] },
        },
        [],
      ),
    ).toBeNull();
  });

  it("owes nothing for a die table, even one with an unsettled face", () => {
    // The Karczma's 5 is "przenieś się na dowolny Obszar w tym Kręgu", so the
    // table as a whole is not settled — and is still nothing to ask about
    // before the die is thrown.
    const karczma = FIELD_SCRIPTS.karczma!.offers[0].effect;
    expect(isSettled(karczma)).toBe(false);
    expect(pendingIn(karczma, [])).toBeNull();
  });

  it("asks the Strażnik's toll until it is answered (16.5)", () => {
    const toll = FIELD_SCRIPTS["straznik-magicznych-wrot"]!.offers[0].effect;
    expect(pendingIn(toll, [])).toBe(toll);
    expect(pendingIn(toll, [0])).toBeNull();
    expect(pendingIn(toll, [1])).toBeNull();
  });

  it("never asks about a card the app could have carried out on its own", () => {
    // The one thing the two functions in this file must agree about, checked
    // over the whole corpus: if nothing is left to a player, nothing is owed.
    // The converse does not hold, and must not — see the two divergences above.
    for (const [cardId, script] of Object.entries(SCRIPTS)) {
      if (!isSettled(script!.effect)) continue;
      expect(pendingIn(script!.effect, []), cardId).toBeNull();
    }
    for (const [fieldId, script] of Object.entries(FIELD_SCRIPTS)) {
      for (const offer of script!.offers) {
        if (!isSettled(offer.effect)) continue;
        expect(pendingIn(offer.effect, []), `${fieldId}/${offer.name}`).toBeNull();
      }
    }
  });
});

describe("nodeAt — the node a script frame's cursor stands on", () => {
  const card: Effect = {
    op: "po-kolei",
    steps: [
      { op: "punkty", stat: "sword", delta: 1, target: "ty" },
      {
        op: "rzut",
        faces: {
          3: {
            op: "gdy",
            warunek: { is: "ma-zloto" },
            to: {
              op: "wybor",
              options: [{ label: "A", effect: { op: "nic" } }],
            },
          },
        },
      },
    ],
  };

  it("follows steps, faces, branches and picks by plain indexing", () => {
    expect(nodeAt(card, [])).toBe(card);
    expect(nodeAt(card, [0])).toMatchObject({ op: "punkty" });
    expect(nodeAt(card, [1, 3, 0])).toMatchObject({ op: "wybor" });
    expect(nodeAt(card, [1, 3, 0, 0])).toMatchObject({ op: "nic" });
  });

  /** A path the effect does not have is nothing, not the wrong question. */
  it("answers null off the edge of the tree", () => {
    expect(nodeAt(card, [7])).toBeNull();
    expect(nodeAt(card, [1, 5])).toBeNull();
    expect(nodeAt(card, [1, 3, 1])).toBeNull();
    expect(nodeAt(card, [0, 0])).toBeNull();
  });
});
