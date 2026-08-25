import { readFileSync } from "node:fs";
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
    expect(text("zabranie", { cardId: "magiczny-miecz" })).toBe("Michał zdobywa: MAGICZNY MIECZ.");
  });

  it("falls back to the raw id for a card it does not know", () => {
    // The deck is transcribed progressively, so an unknown id is normal and
    // must not blank the line.
    expect(text("zabranie", { cardId: "nie-ma-takiej" })).toBe("Michał zdobywa: nie-ma-takiej.");
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

  it("says a card took a turn away, and names the card", () => {
    // Distinct from the seat later sitting out, which describeTurnChange says.
    expect(text("tura-stracona", { turns: 1, reason: "ZAKLINACZ CZASU" })).toBe(
      "Michał traci 1 turę — ZAKLINACZ CZASU.",
    );
    expect(text("tura-stracona", { turns: 2 })).toBe("Michał traci 2 tury.");
  });

  it("says what was left behind, and on which field", () => {
    expect(
      text("zostawienie", { fieldId: "kurhan", cardIds: ["magiczny-miecz", "upior"] }),
    ).toBe("Michał zostawia na polu Kurhan: MAGICZNY MIECZ, UPIÓR.");
  });

  it("says nothing when nothing was left", () => {
    expect(text("zostawienie", { fieldId: "kurhan", cardIds: [] })).toBeNull();
  });

  it("records the field and cards it named, so they can be looked up", () => {
    const line = describe(
      entry("zostawienie", { fieldId: "kurhan", cardIds: ["magiczny-miecz", "upior"] }),
      SEATS,
      null,
    );
    expect(line?.refs).toEqual([
      { kind: "field", id: "kurhan", name: "Kurhan" },
      { kind: "card", id: "magiczny-miecz", name: "MAGICZNY MIECZ" },
      { kind: "card", id: "upior", name: "UPIÓR" },
    ]);
    // Every recorded name really appears in the sentence, which is what lets
    // the reader find it there.
    for (const ref of line!.refs!) expect(line!.text).toContain(ref.name);
  });

  it("records nothing for a line that names nothing", () => {
    expect(describe(entry("start", { seats: 2 }), SEATS, null)?.refs).toBeUndefined();
  });

  it("does not record the same name twice", () => {
    const line = describe(
      entry("zostawienie", { fieldId: "kurhan", cardIds: ["upior", "upior"] }),
      SEATS,
      null,
    );
    expect(line?.refs?.filter((ref) => ref.kind === "card")).toHaveLength(1);
  });

  it("says what a card gave or took, and is not a correction", () => {
    expect(text("punkty", { stat: "zloto", delta: 1, reason: "1 SZTUKA ZŁOTA" })).toBe(
      "Michał zyskuje 1 Sztukę Złota — 1 SZTUKA ZŁOTA.",
    );
    expect(text("punkty", { stat: "zycie", delta: -2 })).toBe("Michał traci 2 Życia.");
    expect(text("punkty", { stat: "miecz", delta: 1 })).toBe("Michał zyskuje 1 punkt Miecza.");
    expect(text("punkty", { stat: "magia", delta: 3 })).toBe("Michał zyskuje 3 punkty Magii.");
  });

  it("says which Natura was left behind, not only the new one", () => {
    // What everybody has been playing against all game — whether the Święta
    // Włócznia still works, whether the Czarci Młyn heals or hurts.
    expect(text("zmiana-natury", { from: "dobra", to: "zla" })).toBe(
      "Michał zmienia naturę z dobra na zła.",
    );
    // Nothing known to have been left: say only where it went.
    expect(text("zmiana-natury", { to: "chaotyczna" })).toBe(
      "Michał zmienia naturę na: chaotyczna.",
    );
  });

  it("says what a card took off you", () => {
    expect(text("strata", { co: "przedmiot", cardIds: ["magiczny-miecz"] })).toBe(
      "Michał traci: MAGICZNY MIECZ.",
    );
    expect(text("strata", { co: "zloto", zloto: 3 })).toBe("Michał traci: 3 Sztuki Złota.");
  });

  it("says nothing when a loss took nothing", () => {
    expect(text("strata", { co: "przedmiot", cardIds: [] })).toBeNull();
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
      "tura-stracona", "zostawienie", "punkty", "strata",
    ];
    const gendered = /\b\w+(ął|ęła|iła|ył|yła|szedł|szła|any|ony|iony)\b/;
    for (const kind of kinds) {
      const rendered = text(kind, { loss: 1, saved: true, target: 1, price: 1, points: 1 });
      // Some kinds render nothing without their own payload — leaving cards
      // behind says nothing when no cards were left — and silence cannot
      // misgender anybody.
      if (rendered === null) continue;
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
      "Michał kończy turę.",
      "Michał zaczyna turę.",
    ]);
  });

  it("colours each half of the handover for its own player", () => {
    // The reason the two are separate lines: one sentence can only carry one
    // seat, and the feed is read by scanning those colours for your own.
    const lines = describeTurnChange(entry("koniec-tury", { next: 1, skipped: [] }), SEATS);
    expect(lines.map((line) => line.seatIndex)).toEqual([0, 1]);
  });

  it("still says the handover when nobody was passed over", () => {
    const lines = describeTurnChange(entry("koniec-tury", { next: 1, skipped: [] }), SEATS);
    expect(lines.map((line) => line.text)).toEqual([
      "Michał kończy turę.",
      "Ania zaczyna turę.",
    ]);
  });

  it("says only the ending when there is nobody to hand over to", () => {
    // Everyone left is eliminated or frozen; finishTurn parks active_seat at
    // null and there is no next player to name.
    const lines = describeTurnChange(entry("koniec-tury", { next: null, skipped: [] }), SEATS);
    expect(lines.map((line) => line.text)).toEqual(["Michał kończy turę."]);
  });

  it("names the round when play comes back round to the first seat", () => {
    // The counter 20.1's three turns of Stone are measured in, so it is worth
    // its own line — and it carries no seat, because it belongs to the table.
    const lines = describeTurnChange(
      entry("koniec-tury", { next: 0, skipped: [], wrapped: true, turnAfter: 4 }),
      SEATS,
    );
    // The heading sits BETWEEN the halves: the round it names is the one the
    // next player is about to take, so after them it would be announcing a
    // round that had already started a line earlier.
    expect(lines.map((line) => line.text)).toEqual([
      "Michał kończy turę.",
      "Tura 4",
      "Michał zaczyna turę.",
    ]);
    const marker = lines.find((line) => line.marker)!;
    expect(marker.seatIndex).toBeNull();
    // The turn that starts is filed under the round that just began, so the
    // expanded view groups it beneath that heading and not the previous one.
    expect(lines.at(-1)!.turn).toBe(4);
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
      "Michał zdobywa: MAGICZNY MIECZ.",
      "Ania traci turę.",
      "Michał kończy turę.",
      "Ania zaczyna turę.",
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

/**
 * Every kind the store writes has a sentence here, or is deliberately silent.
 *
 * This is the check that would have caught `przestawienie`: the vocabulary had
 * the sentence for a manual re-placement from the start and nothing ever wrote
 * that row, so the one action most in need of being visible left no trace at
 * all — and nothing failed, because both halves were individually fine. Reading
 * the store's source is blunt, but the alternative is a hand-kept list of kinds
 * that goes stale exactly the way the journal did.
 */
suite("every event has a sentence", () => {
  const source = readFileSync(
    new URL("../game/turnStore.ts", import.meta.url),
    "utf8",
  );
  // `journal(gameId, seatId, turn, "kind"` — the literal ones. The two written
  // through a variable (`record.kind`, and the move that is either a step or an
  // attempt at the Most) are listed after, because a regex cannot read them.
  const written = new Set([
    ...[...source.matchAll(/await journal\(\s*[\s\S]{0,120}?"([a-z-]+)"/g)].map((m) => m[1]),
    "korekta",
    "punkty",
    "ruch",
  ]);

  it("finds the kinds in the store at all", () => {
    // A guard on the guard: if the regex ever stops matching, this suite would
    // pass by checking nothing.
    expect(written.size).toBeGreaterThan(30);
    expect(written.has("smierc")).toBe(true);
  });

  for (const kind of [...written].sort()) {
    it(`says something about "${kind}", or nothing on purpose`, () => {
      const said = describe(entry(kind, PAYLOADS[kind] ?? {}), SEATS, null);
      if (said) expect(said.text).not.toBe("");
      else expect(SILENT).toContain(kind);
    });
  }
});

/** Kinds with nothing to say to the table, and why. */
const SILENT = [
  // Raw dice: the line that uses them says the result instead.
  "rzut",
  "walka-rzut",
  "straznik-sila",
  // The tables a card or a field was read against — shown in the panel that
  // asked, not narrated afterwards.
  "karta-tabela",
  "pole-tabela",
  // Dealt before the first turn; the seat card is the record of it.
  "wyposazenie-poczatkowe",
  // Several lines rather than one, built by describeTurnChange.
  "koniec-tury",
  // A card handed over by a test, which is not a game event.
  "test-karta",
];

/** Payloads that keep a line from rendering as a shrug. */
const PAYLOADS: Record<string, Record<string, unknown>> = {
  strata: { cardIds: ["miecz"] },
  zostawienie: { cardIds: ["miecz"], fieldId: "kurhan" },
  punkty: { stat: "zycie", delta: -1 },
};
