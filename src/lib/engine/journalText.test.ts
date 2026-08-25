import { describe as suite, expect, it } from "vitest";
import {
  describe,
  describeTurnChange,
  journalLines,
  type JournalEntry,
  type JournalSeat,
} from "./journalText";

const SEATS: JournalSeat[] = [
  { id: "a", seatIndex: 0, playerName: "Michał", characterId: "goblin" },
  { id: "b", seatIndex: 1, playerName: "Ania", characterId: "kaplanka" },
  { id: "c", seatIndex: 2, playerName: null, characterId: "troll" },
  { id: "d", seatIndex: 3, playerName: null, characterId: null },
];

function entry(kind: string, payload: Record<string, unknown> = {}, over: Partial<JournalEntry> = {}) {
  return { seq: 1, seatId: "a", turn: 2, kind, payload, manual: false, ...over };
}

const text = (kind: string, payload: Record<string, unknown> = {}, seatId = "a") =>
  describe(entry(kind, payload, { seatId }), SEATS, null)?.text ?? null;

suite("journal vocabulary", () => {
  it("names the player, then the character, then the seat", () => {
    expect(text("zabranie", { cardId: "magiczny-miecz" }, "a")).toContain("Michał");
    expect(text("zabranie", { cardId: "magiczny-miecz" }, "c")).toContain("TROLL");
    expect(text("zabranie", { cardId: "magiczny-miecz" }, "d")).toContain("Miejsce 4");
  });

  it("resolves card ids to their printed names", () => {
    expect(text("zabranie", { cardId: "magiczny-miecz" })).toBe("Michał bierze: MAGICZNY MIECZ.");
  });

  it("falls back to the raw id for a card it does not know", () => {
    // The deck is transcribed progressively, so an unknown id is normal and
    // must not blank the line.
    expect(text("zabranie", { cardId: "nie-ma-takiej" })).toBe("Michał bierze: nie-ma-takiej.");
  });

  it("resolves field ids to their board names", () => {
    expect(text("ruch", { from: "karczma", to: "kurhan" })).toBe(
      "Michał idzie z Karczma na Kurhan.",
    );
  });

  it("says who lost and who won a fight", () => {
    expect(text("walka-koniec", { cardId: "upior", outcome: "wygrana" })).toContain("wygrywa");
    expect(text("walka-koniec", { cardId: "upior", outcome: "przegrana" })).toContain("przegrywa");
    expect(text("walka-koniec", { cardId: "upior", outcome: "remis" })).toContain("remisuje");
  });

  it("names the other player in a duel", () => {
    expect(text("pojedynek", { target: 1 })).toBe("Michał atakuje: Ania.");
  });

  it("marks a manual correction as one", () => {
    const line = describe(
      entry("korekta", { stat: "zycie", delta: -1, from: 4, to: 3 }, { manual: true }),
      SEATS,
      null,
    );
    expect(line?.manual).toBe(true);
    expect(line?.text).toContain("zycie -1");
  });

  it("carries the seat so the line can be coloured", () => {
    expect(describe(entry("zabranie", {}, { seatId: "b" }), SEATS, null)?.seatIndex).toBe(1);
  });
});

suite("what the journal does not say", () => {
  it("stays silent on raw die rolls", () => {
    // Public at a table, but logging each one buries what the journal is for.
    for (const kind of ["rzut", "walka-rzut", "straznik-sila", "karta-tabela", "pole-tabela"]) {
      expect(describe(entry(kind, { roll: 4 }), SEATS, null)).toBeNull();
    }
  });

  it("stays silent on a kind it has no sentence for", () => {
    expect(describe(entry("cos-nowego"), SEATS, null)).toBeNull();
  });

  it("names a spell that was cast, because casting is spoken aloud", () => {
    // 12.5 — the cast payload carries cardId/name.
    expect(text("zaklecie", { cardId: "formula-czasu", name: "FORMUŁA CZASU" })).toBe(
      "Michał wypowiada Zaklęcie: FORMUŁA CZASU.",
    );
  });

  it("names who a spell was aimed at", () => {
    expect(text("zaklecie", { cardId: "formula-czasu", name: "X", target: "Ania" })).toContain(
      "na: Ania",
    );
  });

  it("NEVER names a spell that was merely drawn", () => {
    // The leak this guards: drawSpell journals the same kind with { spellId },
    // and dealStartingKit calls it for the Zaklęcia some characters begin with.
    // 9.3 keeps those hidden — the holding is even stored face:"hidden" — so
    // naming one here would undo the concealment the rest of the app enforces.
    const drawn = text("zaklecie", { spellId: "formula-czasu" });
    expect(drawn).toBe("Michał dobiera Zaklęcie.");
    expect(drawn).not.toContain("FORMUŁA");
    expect(drawn).not.toContain("formula-czasu");
  });

  it("leaks no spell name through any payload that lacks a cast marker", () => {
    // Belt and braces: whatever else a draw payload picks up, the absence of
    // cardId/name must keep the card anonymous.
    for (const payload of [
      { spellId: "formula-czasu" },
      { spellId: "formula-czasu", seatId: "a" },
      { spellId: "formula-czasu", turn: 3 },
    ]) {
      expect(text("zaklecie", payload)).not.toMatch(/FORMUŁA|formula-czasu/);
    }
  });
});

suite("Polish agreement", () => {
  it("counts lives one, few and many", () => {
    expect(text("most-cerber", { loss: 1 })).toContain("1 Życie");
    expect(text("most-cerber", { loss: 2 })).toContain("2 Życia");
    expect(text("most-cerber", { loss: 5 })).toContain("5 Żyć");
  });

  it("counts gold the same way", () => {
    expect(text("kupno", { cardId: "kon", price: 1 })).toContain("1 Sztukę Złota");
    expect(text("kupno", { cardId: "kon", price: 3 })).toContain("3 Sztuki Złota");
    expect(text("kupno", { cardId: "kon", price: 12 })).toContain("12 Sztuk Złota");
  });

  it("uses the many form for the teens", () => {
    // 12-14 take the many form even though they end in 2-4.
    expect(text("most-cerber", { loss: 13 })).toContain("13 Żyć");
    expect(text("most-cerber", { loss: 22 })).toContain("22 Życia");
  });

  it("never uses a gendered past tense", () => {
    // Player names carry no gender, and Polish past tense does. Every sentence
    // is third-person present so it reads correctly for anyone at the table.
    const kinds = [
      "ruch", "proba-mostu", "przestawienie", "przeprawa", "przeprawa-nieudana",
      "przewoznik", "przewoznik-odmowa", "wejscie-na-most", "most-nieudane",
      "straznik-start", "straznik-koniec", "most-cerber", "most-pulapka",
      "walka-start", "walka-koniec", "pojedynek", "ucieczka", "ucieczka-nieudana",
      "oslona", "zabranie", "odrzucenie", "kupno", "sprzedaz", "wymiana-trofeow",
      "karta", "uzdrowienie", "leczenie", "zmiana-natury", "kamien", "smierc",
      "nowa-postac", "zaklecie", "zwyciestwo", "bestia-porazka", "bestia-remis",
    ];
    const gendered = /\b\w+(ął|ęła|iła|ył|yła|szedł|szła|any|ony|iony)\b/;
    for (const kind of kinds) {
      const rendered = text(kind, { loss: 1, saved: true, target: 1, price: 1, points: 1 });
      expect(rendered, `${kind}: ${rendered}`).not.toMatch(gendered);
    }
  });
});

suite("the end of a turn", () => {
  it("says who was passed over, then who has it now", () => {
    const lines = describeTurnChange(
      entry("koniec-tury", { next: 0, skipped: [1, 2] }),
      SEATS,
    );
    expect(lines.map((line) => line.text)).toEqual([
      "Ania traci turę.",
      "TROLL traci turę.",
      "Michał kończy turę — teraz Michał.",
    ]);
  });

  it("still says the handover when nobody was passed over", () => {
    const lines = describeTurnChange(entry("koniec-tury", { next: 1, skipped: [] }), SEATS);
    expect(lines.map((line) => line.text)).toEqual(["Michał kończy turę — teraz Ania."]);
  });

  it("names the round when play comes back round to the first seat", () => {
    // The counter 20.1's three turns of Stone are measured in, so it is worth
    // its own line — and it carries no seat, because it belongs to the table.
    const lines = describeTurnChange(
      entry("koniec-tury", { next: 0, skipped: [], wrapped: true, turnAfter: 4 }),
      SEATS,
    );
    expect(lines.map((line) => line.text)).toEqual([
      "Michał kończy turę — teraz Michał.",
      "Tura 4",
    ]);
    expect(lines.at(-1)!.seatIndex).toBeNull();
    // Drawn as the heading rather than as a move — see `JournalLine.marker`.
    expect(lines.at(-1)!.marker).toBe(true);
  });

  it("does not name a round when play merely moved on", () => {
    const lines = describeTurnChange(
      entry("koniec-tury", { next: 1, skipped: [], wrapped: false, turnAfter: 3 }),
      SEATS,
    );
    expect(lines.some((line) => /^Tura /.test(line.text))).toBe(false);
  });

  it("says nothing about rows that are not the end of a turn", () => {
    expect(describeTurnChange(entry("zabranie", { skipped: [1] }), SEATS)).toEqual([]);
  });
});

suite("journalLines", () => {
  it("keeps everything in order, turn changes included", () => {
    const lines = journalLines(
      [
        entry("zabranie", { cardId: "magiczny-miecz" }, { seq: 1 }),
        entry("koniec-tury", { next: 1, skipped: [1] }, { seq: 2 }),
        entry("ruch", { from: "karczma", to: "kurhan" }, { seq: 3 }),
      ],
      SEATS,
      null,
    );
    expect(lines.map((line) => line.text)).toEqual([
      "Michał bierze: MAGICZNY MIECZ.",
      "Ania traci turę.",
      "Michał kończy turę — teraz Ania.",
      "Michał idzie z Karczma na Kurhan.",
    ]);
  });

  it("drops the rows nobody should read and keeps the rest", () => {
    const lines = journalLines(
      [entry("rzut", { roll: 5 }, { seq: 1 }), entry("zabranie", { cardId: "kon" }, { seq: 2 })],
      SEATS,
      null,
    );
    expect(lines).toHaveLength(1);
  });
});
