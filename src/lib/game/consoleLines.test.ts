import { describe, expect, it } from "vitest";
import { overflowLines, said, waitingOn } from "./consoleLines";
import type { TurnPhase } from "@/lib/engine/turn";
import { aTable, aSeat, aUser, aHolding } from "./fixture";
import { openOverflow } from "@/lib/engine/overflow";
import { asTurnState } from "@/lib/engine/stack";

/**
 * The surplus, and the ways out of it, as the console prints them.
 *
 * The verb and the parenthetical are two different facts and were read off one
 * field: everything shed said „(na Obszar)", which is true of a Przedmiot and
 * false of the only card the rulebook is strict about. A Zaklęcie goes to the
 * stos Kart już zużytych (9.6) — 12.1 lists złoto, Przedmioty and Przyjaciół
 * and no Zaklęcia, so one left on a field would be a card nobody could take.
 */
function table(holdings: ReturnType<typeof aHolding>[], magia: number, what: "przedmioty" | "zaklecia") {
  const seat = aSeat({ id: "seat-a", seat_index: 0, magic_own: magia, sword_own: 2 });
  const base = aTable({
    seats: [seat],
    users: [aUser({ seat_index: 0, name: "Ania" })],
    holdings: holdings.map((one) => ({ ...one, seat_id: "seat-a" })),
  });
  return {
    ...base,
    game: {
      ...base.game,
      turn_state: openOverflow(asTurnState({ phase: "roll" }), {
        phase: "overflow",
        seatId: "seat-a",
        what,
      }),
    },
  };
}

describe("overflowLines", () => {
  it("says where a Zaklęcie goes, and it is not the Obszar", () => {
    const lines = overflowLines(
      table(
        [
          aHolding({ id: "h-1", card_id: "fatum", kind: "spell" }),
          aHolding({ id: "h-2", card_id: "olsnienie", kind: "spell" }),
        ],
        1,
        "zaklecia",
      ),
    );
    // By the printed name, which is what the line says. This used to filter on
    // the ids, and matched only because one of the two fixtures named a card the
    // box does not have — `cardName` hands an unknown id straight back, so the
    // line carried it verbatim while FATUM's said "FATUM".
    const ways = lines.filter((line) => line.includes("FATUM") || line.includes("OLŚNIENIE"));
    expect(ways.length).toBeGreaterThan(0);
    for (const way of ways) {
      expect(way).toContain("odrzuć");
      expect(way).toContain("na stos zużytych");
      expect(way).not.toContain("na Obszar");
    }
  });

  it("says a Przedmiot is put down, in the word the hand uses", () => {
    const lines = overflowLines(
      table(
        [
          aHolding({ id: "h-1", card_id: "miecz" }),
          aHolding({ id: "h-2", card_id: "zbroja" }),
          aHolding({ id: "h-3", card_id: "helm" }),
          aHolding({ id: "h-4", card_id: "tarcza" }),
          aHolding({ id: "h-5", card_id: "sztylet" }),
        ],
        2,
        "przedmioty",
      ),
    );
    const dropped = lines.filter((line) => line.includes("upuść"));
    expect(dropped.length).toBeGreaterThan(0);
    for (const way of dropped) expect(way).toContain("na Obszar");
    // „odrzuć" is the other card's word now, and must not appear for these.
    expect(lines.some((line) => line.includes("odrzuć"))).toBe(false);
  });

  it("says nothing at all when nobody is over", () => {
    expect(overflowLines(aTable({ seats: [aSeat({ id: "seat-a", seat_index: 0 })] }))).toEqual([]);
  });
});

/**
 * A Karta mid-sentence, as `look` prints it.
 *
 * `look` printed nothing at all for a `script` frame while two other places
 * sent the player here to read it: `answer`'s own summary promises „`look`
 * shows the question", and the browser's panel, met with a question it has no
 * controls for, says „odpowiedzcie w konsoli". Both were pointing at a blank
 * line, which is how the Eremita's die came to be thrown in silence.
 */
describe("waitingOn, for a Karta the turn is suspended on", () => {
  const frame = (over: Partial<Extract<TurnPhase, { phase: "script" }>>) =>
    ({
      phase: "script",
      seatId: "seat-a",
      cardId: "cudotworca",
      reason: "CUDOTWÓRCA",
      cursor: [],
      effect: {
        op: "wybor",
        options: [
          { label: "odzyskujesz 2 punkty Życia", effect: { op: "nic" } },
          { label: "Pomiń", effect: { op: "nic" } },
        ],
      },
      ...over,
    }) as Extract<TurnPhase, { phase: "script" }>;

  it("numbers the options the way `answer <n>` takes them", () => {
    expect(waitingOn(frame({}))).toEqual([
      "CUDOTWÓRCA: pick one — `answer <n>`",
      "  0 — odzyskujesz 2 punkty Życia",
      "  1 — Pomiń",
    ]);
  });

  /**
   * A thrown die is not a question: the face is chosen and what waits is the
   * one press that lets it take effect (`heldAt`). The face is in `reason`.
   */
  it("says a held die is waiting to take effect, not that a choice is owed", () => {
    const held = frame({ reason: "EREMITA (3)", held: true, cardId: "eremita" });
    expect(waitingOn(held)).toEqual([
      "EREMITA (3): kostka padła — `answer` puts it into effect.",
    ]);
  });

  /**
   * An Obszar to point at, listed — the same list the server refuses against
   * and the same list the browser draws buttons for (`question.ts`).
   */
  it("names the Obszary the Karta allows, and the word that settles it", () => {
    const owed = frame({
      effect: { op: "poloz-karte", gdzie: { kind: "jedno-z", fieldIds: ["bagna-1", "bagna-2"] } },
      reason: "LEWIATAN",
    });
    expect(waitingOn(owed, { standingOn: "osada", occupied: ["bagna-1"] })).toEqual([
      "LEWIATAN: name an Obszar — `answer [n] to <Obszar>`",
      "  Bagna II",
    ]);
  });

  /** Named rather than guessed at, and named the same way in the browser. */
  it("admits a question nobody can ask rather than printing nothing", () => {
    const owed = frame({ effect: { op: "przenies-karte" } as never });
    expect(waitingOn(owed)[0]).toContain("no surface can ask yet (przenies-karte)");
  });
});

describe("said", () => {
  /**
   * The throw is the one act the player has no part in, so it is reported. It
   * was not: the Eremita's answer read „Nic się nie stało" in the same breath
   * as a die that had just chosen his Obszar.
   */
  it("names the face, even when nothing has happened yet", () => {
    expect(said([], { op: "wybor", options: [] }, 3)).toBe(
      "Wypadło 3.\nWciąż czeka — odpowiedz jeszcze raz (`look`).",
    );
  });

  it("still shrugs when there was no die and nothing happened", () => {
    expect(said([], null)).toBe("Nic się nie stało.");
  });

  /**
   * A card owed an Obszar says which word settles it. „odpowiedz jeszcze raz
   * (`look`)" is useless there: the card does not suspend into a frame, so
   * `look` has nothing to show and every `answer 0` re-asks the same question.
   */
  it("names the word for a question whose answer is a place", () => {
    const owed = { op: "przenies", to: { kind: "dowolne-w-kregu" } } as const;
    expect(said(["przenosisz się"], owed)).toBe(
      "przenosisz się\nWskaż Obszar — `answer [n] to <Obszar>`.",
    );
  });
});
