import { describe as suite, expect, it } from "vitest";
import { JOURNAL_KINDS, asJournalKind, type JournalKind } from "./journal";
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

function entry(kind: JournalKind, payload: Record<string, unknown> = {}, over: Partial<JournalEntry> = {}) {
  return { seq: 1, seatId: "a", turn: 2, kind, payload, manual: false, ...over };
}

const text = (kind: JournalKind, payload: Record<string, unknown> = {}, seatId = "a") =>
  describe(entry(kind, payload, { seatId }), SEATS, null)?.text ?? null;

suite("journal vocabulary", () => {
  it("names the player, then the character, then the seat", () => {
    expect(text("taken", { cardId: "magiczny-miecz" }, "a")).toContain("Michał");
    expect(text("taken", { cardId: "magiczny-miecz" }, "c")).toContain("TROLL");
    expect(text("taken", { cardId: "magiczny-miecz" }, "d")).toContain("Miejsce 4");
  });

  it("resolves card ids to their printed names", () => {
    expect(text("taken", { cardId: "magiczny-miecz" })).toBe("Michał (GOBLIN) zdobywa: MAGICZNY MIECZ.");
  });

  it("falls back to the raw id for a card it does not know", () => {
    // The deck is transcribed progressively, so an unknown id is normal and
    // must not blank the line.
    expect(text("taken", { cardId: "nie-ma-takiej" })).toBe("Michał (GOBLIN) zdobywa: nie-ma-takiej.");
  });

  it("resolves field ids to their board names", () => {
    expect(text("move", { from: "karczma", to: "kurhan" })).toBe(
      "Michał (GOBLIN) idzie z Karczma na Kurhan.",
    );
  });

  it("says who lost and who won a fight", () => {
    expect(text("fight-end", { cardId: "upior", outcome: "wygrana" })).toContain("wygrywa");
    expect(text("fight-end", { cardId: "upior", outcome: "przegrana" })).toContain("przegrywa");
    expect(text("fight-end", { cardId: "upior", outcome: "remis" })).toContain("remisuje");
  });

  it("names the other player in a duel", () => {
    expect(text("duel", { target: 1 })).toBe("Michał (GOBLIN) atakuje: Ania (KAPŁANKA).");
  });

  it("says a card took a turn away, and names the card", () => {
    // Distinct from the seat later sitting out, which describeTurnChange says.
    expect(text("turn-lost", { turns: 1, reason: "ZAKLINACZ CZASU" })).toBe(
      "Michał (GOBLIN) traci 1 turę — ZAKLINACZ CZASU.",
    );
    expect(text("turn-lost", { turns: 2 })).toBe("Michał (GOBLIN) traci 2 tury.");
  });

  it("says what was left behind, and on which field", () => {
    expect(
      text("left-behind", { fieldId: "kurhan", cardIds: ["magiczny-miecz", "upior"] }),
    ).toBe("Michał (GOBLIN) zostawia na polu Kurhan: MAGICZNY MIECZ, UPIÓR.");
  });

  it("says nothing when nothing was left", () => {
    expect(text("left-behind", { fieldId: "kurhan", cardIds: [] })).toBeNull();
  });

  it("records the field and cards it named, so they can be looked up", () => {
    const line = describe(
      entry("left-behind", { fieldId: "kurhan", cardIds: ["magiczny-miecz", "upior"] }),
      SEATS,
      null,
    );
    expect(line?.refs).toEqual([
      // The character comes first because the sentence opens with whoever did
      // it, and the list is recorded in the order the names were resolved.
      { kind: "character", id: "goblin", name: "GOBLIN" },
      { kind: "field", id: "kurhan", name: "Kurhan" },
      { kind: "card", id: "magiczny-miecz", name: "MAGICZNY MIECZ" },
      { kind: "card", id: "upior", name: "UPIÓR" },
    ]);
    // Every recorded name really appears in the sentence, which is what lets
    // the reader find it there.
    for (const ref of line!.refs!) expect(line!.text).toContain(ref.name);
  });

  it("records nothing for a line that names nobody", () => {
    // "Gra się zaczyna" belongs to the table rather than to a player, so the
    // row carries no seat and the sentence names nothing to look at.
    expect(
      describe(entry("start", { seats: 2 }, { seatId: null }), SEATS, null)?.refs,
    ).toBeUndefined();
  });

  it("records the character of whoever acted, so the Karta is a hover away", () => {
    const line = describe(entry("escape"), SEATS, null);
    expect(line?.refs).toEqual([{ kind: "character", id: "goblin", name: "GOBLIN" }]);
  });

  it("names a seat with no character by its number, and records nothing", () => {
    expect(text("escape", {}, "d")).toBe("Miejsce 4 ucieka z walki.");
    expect(describe(entry("escape", {}, { seatId: "d" }), SEATS, null)?.refs)
      .toBeUndefined();
  });

  it("does not record the same name twice", () => {
    const line = describe(
      entry("left-behind", { fieldId: "kurhan", cardIds: ["upior", "upior"] }),
      SEATS,
      null,
    );
    expect(line?.refs?.filter((ref) => ref.kind === "card")).toHaveLength(1);
  });

  it("says what a card gave or took, and is not a correction", () => {
    expect(text("points", { stat: "gold", delta: 1, reason: "1 SZTUKA ZŁOTA" })).toBe(
      "Michał (GOBLIN) zyskuje 1 Sztukę Złota — 1 SZTUKA ZŁOTA.",
    );
    expect(text("points", { stat: "life", delta: -2 })).toBe("Michał (GOBLIN) traci 2 Życia.");
    expect(text("points", { stat: "sword", delta: 1 })).toBe("Michał (GOBLIN) zyskuje 1 punkt Miecza.");
    expect(text("points", { stat: "magic", delta: 3 })).toBe("Michał (GOBLIN) zyskuje 3 punkty Magii.");
  });

  it("says which Natura was left behind, not only the new one", () => {
    // What everybody has been playing against all game — whether the Święta
    // Włócznia still works, whether the Czarci Młyn heals or hurts.
    expect(text("nature-change", { from: "good", to: "evil" })).toBe(
      "Michał (GOBLIN) zmienia naturę z dobra na zła.",
    );
    // Nothing known to have been left: say only where it went.
    expect(text("nature-change", { to: "chaotic" })).toBe(
      "Michał (GOBLIN) zmienia naturę na: chaotyczna.",
    );
  });

  it("says when a Natura was set to the one already in force", () => {
    // The row exists so the table can see a card that did what it said and had
    // no effect. Reading it as a change would report a turn that never was.
    expect(text("nature-change", { from: "evil", to: "evil" })).toBe(
      "Michał (GOBLIN) ma już naturę: zła — nic się nie zmienia.",
    );
  });

  it("says what a card took off you", () => {
    expect(text("lost-card", { co: "item", cardIds: ["magiczny-miecz"] })).toBe(
      "Michał (GOBLIN) traci: MAGICZNY MIECZ.",
    );
    expect(text("lost-card", { co: "gold", gold: 3 })).toBe("Michał (GOBLIN) traci: 3 Sztuki Złota.");
  });

  it("says nothing when a loss took nothing", () => {
    expect(text("lost-card", { co: "item", cardIds: [] })).toBeNull();
  });

  it("marks a manual correction as one", () => {
    const line = describe(
      entry("override", { stat: "life", delta: -1, from: 4, to: 3 }, { manual: true }),
      SEATS,
      null,
    );
    expect(line?.manual).toBe(true);
    expect(line?.text).toContain("life -1");
  });

  it("carries the seat so the line can be coloured", () => {
    expect(describe(entry("taken", {}, { seatId: "b" }), SEATS, null)?.seatIndex).toBe(1);
  });
});

suite("what the journal does not say", () => {
  it("stays silent on raw die rolls", () => {
    // Public at a table, but logging each one buries what the journal is for.
    const dice: JournalKind[] = [
      "roll",
      "fight-roll",
      "guardian-strength",
      "card-table",
      "field-table",
    ];
    for (const kind of dice) {
      expect(describe(entry(kind, { roll: 4 }), SEATS, null)).toBeNull();
    }
  });

  /**
   * A row written by a version that knew a kind this one does not.
   *
   * It cannot be typed as a `JournalKind` any more, which is the point — the
   * only way one reaches `describe` is out of the database, and
   * `asJournalKind` drops it at the boundary before it gets here. Both halves
   * are checked: the guard refuses it, and the renderer survives it.
   */
  it("stays silent on a kind it has no sentence for", () => {
    expect(asJournalKind("cos-nowego")).toBeNull();
    expect(describe(entry("cos-nowego" as JournalKind), SEATS, null)).toBeNull();
  });

  it("names a spell that was cast, because casting is spoken aloud", () => {
    // 12.5 — the cast payload carries cardId/name.
    expect(text("spell", { cardId: "formula-czasu", name: "FORMUŁA CZASU" })).toBe(
      "Michał (GOBLIN) wypowiada Zaklęcie: FORMUŁA CZASU.",
    );
  });

  it("names who a spell was aimed at", () => {
    expect(text("spell", { cardId: "formula-czasu", name: "X", target: "Ania" })).toContain(
      "na: Ania",
    );
  });

  it("NEVER names a spell that was merely drawn", () => {
    // The leak this guards: drawSpell journals the same kind with { spellId },
    // and dealStartingKit calls it for the Zaklęcia some characters begin with.
    // 9.3 keeps those hidden — the holding is even stored face:"hidden" — so
    // naming one here would undo the concealment the rest of the app enforces.
    const drawn = text("spell", { spellId: "formula-czasu" });
    expect(drawn).toBe("Michał (GOBLIN) dobiera Zaklęcie.");
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
      expect(text("spell", payload)).not.toMatch(/FORMUŁA|formula-czasu/);
    }
  });
});

suite("Polish agreement", () => {
  it("counts lives one, few and many", () => {
    expect(text("bridge-cerberus", { loss: 1 })).toContain("1 Życie");
    expect(text("bridge-cerberus", { loss: 2 })).toContain("2 Życia");
    expect(text("bridge-cerberus", { loss: 5 })).toContain("5 Żyć");
  });

  it("counts gold the same way", () => {
    expect(text("bought", { cardId: "kon", price: 1 })).toContain("1 Sztukę Złota");
    expect(text("bought", { cardId: "kon", price: 3 })).toContain("3 Sztuki Złota");
    expect(text("bought", { cardId: "kon", price: 12 })).toContain("12 Sztuk Złota");
  });

  it("uses the many form for the teens", () => {
    // 12-14 take the many form even though they end in 2-4.
    expect(text("bridge-cerberus", { loss: 13 })).toContain("13 Żyć");
    expect(text("bridge-cerberus", { loss: 22 })).toContain("22 Życia");
  });

  it("never uses a gendered past tense", () => {
    // Player names carry no gender, and Polish past tense does. Every sentence
    // is third-person present so it reads correctly for anyone at the table.
    const kinds = [
      "move", "bridge-attempt", "moved-by-hand", "crossing", "crossing-failed",
      "ferry", "ferry-refused", "bridge-entry", "bridge-failed",
      "guardian-start", "guardian-end", "bridge-cerberus", "bridge-trap",
      "fight-start", "fight-end", "duel", "escape", "escape-failed",
      "shielded", "taken", "discarded", "bought", "sold", "trophies-traded",
      "card", "healed", "healing", "nature-change", "stone", "death", "used",
      "test-card", "test-card-field", "test-fight-end", "reshuffle",
      "new-character", "joined", "spell", "victory", "beast-loss", "beast-draw",
      "turn-lost", "left-behind", "points", "lost-card",
    ] satisfies JournalKind[];
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
      entry("turn-end", { next: 0, skipped: [1, 2] }),
      SEATS,
    );
    expect(lines.map((line) => line.text)).toEqual([
      "Ania (KAPŁANKA) traci turę.",
      "TROLL traci turę.",
      "Michał (GOBLIN) kończy turę.",
      "Michał (GOBLIN) zaczyna turę.",
    ]);
  });

  it("colours each half of the handover for its own player", () => {
    // The reason the two are separate lines: one sentence can only carry one
    // seat, and the feed is read by scanning those colours for your own.
    const lines = describeTurnChange(entry("turn-end", { next: 1, skipped: [] }), SEATS);
    expect(lines.map((line) => line.seatIndex)).toEqual([0, 1]);
  });

  it("still says the handover when nobody was passed over", () => {
    const lines = describeTurnChange(entry("turn-end", { next: 1, skipped: [] }), SEATS);
    expect(lines.map((line) => line.text)).toEqual([
      "Michał (GOBLIN) kończy turę.",
      "Ania (KAPŁANKA) zaczyna turę.",
    ]);
  });

  it("says only the ending when there is nobody to hand over to", () => {
    // Everyone left is eliminated or frozen; finishTurn parks active_seat at
    // null and there is no next player to name.
    const lines = describeTurnChange(entry("turn-end", { next: null, skipped: [] }), SEATS);
    expect(lines.map((line) => line.text)).toEqual(["Michał (GOBLIN) kończy turę."]);
  });

  it("names the round when play comes back round to the first seat", () => {
    // The counter 20.1's three turns of Stone are measured in, so it is worth
    // its own line — and it carries no seat, because it belongs to the table.
    const lines = describeTurnChange(
      entry("turn-end", { next: 0, skipped: [], wrapped: true, turnAfter: 4 }),
      SEATS,
    );
    // The heading sits BETWEEN the halves: the round it names is the one the
    // next player is about to take, so after them it would be announcing a
    // round that had already started a line earlier.
    expect(lines.map((line) => line.text)).toEqual([
      "Michał (GOBLIN) kończy turę.",
      "Tura 4",
      "Michał (GOBLIN) zaczyna turę.",
    ]);
    const marker = lines.find((line) => line.marker)!;
    expect(marker.seatIndex).toBeNull();
    // The turn that starts is filed under the round that just began, so the
    // expanded view groups it beneath that heading and not the previous one.
    expect(lines.at(-1)!.turn).toBe(4);
  });

  it("does not name a round when play merely moved on", () => {
    const lines = describeTurnChange(
      entry("turn-end", { next: 1, skipped: [], wrapped: false, turnAfter: 3 }),
      SEATS,
    );
    expect(lines.some((line) => /^Tura /.test(line.text))).toBe(false);
  });

  it("says nothing about rows that are not the end of a turn", () => {
    expect(describeTurnChange(entry("taken", { skipped: [1] }), SEATS)).toEqual([]);
  });
});

suite("journalLines", () => {
  it("keeps everything in order, turn changes included", () => {
    const lines = journalLines(
      [
        entry("taken", { cardId: "magiczny-miecz" }, { seq: 1 }),
        entry("turn-end", { next: 1, skipped: [1] }, { seq: 2 }),
        entry("move", { from: "karczma", to: "kurhan" }, { seq: 3 }),
      ],
      SEATS,
      null,
    );
    expect(lines.map((line) => line.text)).toEqual([
      "Michał (GOBLIN) zdobywa: MAGICZNY MIECZ.",
      "Ania (KAPŁANKA) traci turę.",
      "Michał (GOBLIN) kończy turę.",
      "Ania (KAPŁANKA) zaczyna turę.",
      "Michał (GOBLIN) idzie z Karczma na Kurhan.",
    ]);
  });

  it("drops the rows nobody should read and keeps the rest", () => {
    const lines = journalLines(
      [entry("roll", { roll: 5 }, { seq: 1 }), entry("taken", { cardId: "kon" }, { seq: 2 })],
      SEATS,
      null,
    );
    expect(lines).toHaveLength(1);
  });
});

/**
 * Every kind has a sentence here, or is deliberately silent.
 *
 * This used to read the store's source with a regular expression and count the
 * kinds it found — which caught the bug it was written for and then quietly
 * stopped seeing things: a `kind` chosen by a ternary, one written on a single
 * line, one with a comment between `turn:` and `kind:`, and one where `turn`
 * was passed in shorthand. Four blind spots in one file, each found by accident.
 *
 * `JOURNAL_KINDS` is the list now, the writer is typed against it, and this
 * walks it. A kind nobody can write is a kind nobody has to render, and the
 * compiler is what says which is which.
 */
suite("every event has a sentence", () => {
  for (const kind of JOURNAL_KINDS) {
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
  "roll",
  "fight-roll",
  "guardian-strength",
  // The tables a card or a field was read against — shown in the panel that
  // asked, not narrated afterwards.
  "card-table",
  "field-table",
  // Dealt before the first turn; the seat card is the record of it.
  "starting-kit",
  // Several lines rather than one, built by describeTurnChange.
  "turn-end",
  // A card handed over by a test, which is not a game event.
  "test-card",
];

/** Payloads that keep a line from rendering as a shrug. */
const PAYLOADS: Record<string, Record<string, unknown>> = {
  "lost-card": { cardIds: ["miecz"] },
  "left-behind": { cardIds: ["miecz"], fieldId: "kurhan" },
  "test-card-field": { cardId: "miecz", fieldId: "kurhan" },
  points: { stat: "life", delta: -1 },
};

/* ---------------------------------------------------------------------------
 * A change the floor refused.
 * ------------------------------------------------------------------------ */

suite("points a rule would not let through", () => {
  /**
   * It happened, and it came to nothing, and the journal owes the table both.
   *
   * A card that takes a Magia off a character with none to give was read off
   * the delta alone — "traci 1 punkt Magii" — so the feed said a point was lost
   * and the number beside the character never moved. Two turns later somebody
   * asks why, and the record of the game is what they ask.
   */
  it("says a card's point was taken and that nothing came of it", () => {
    expect(text("points", { stat: "magic", delta: -1, from: 3, to: 3, floor: 3 })).toBe(
      "Michał (GOBLIN) traci 1 punkt Magii — bez zmiany: Magia nie spada poniżej 3 (1.3, 2.3).",
    );
  });

  it("says how much of it landed when only part did", () => {
    expect(text("points", { stat: "sword", delta: -3, from: 4, to: 2, floor: 2 })).toBe(
      "Michał (GOBLIN) traci 3 punkty Miecza — z tego 2: Miecz nie spada poniżej 2 (1.3, 2.3).",
    );
  });

  it("does not quote a rule about own points at Złoto", () => {
    expect(text("points", { stat: "gold", delta: -2, from: 0, to: 0, floor: 0 })).toContain(
      "bez zmiany: nie ma poniżej czego zejść",
    );
  });

  it("says the ceiling in its own words", () => {
    expect(text("points", { stat: "gold", delta: 5, from: 999, to: 999, floor: 0 })).toContain(
      "bez zmiany: wyżej niż 999 nie idzie",
    );
  });

  it("stays quiet about a row written before it knew what stopped things", () => {
    // `floor` arrived with this sentence, so a row without one is older than
    // the question. The numbers are there and what cut them is not, and a
    // guess about that is worse than the plain line.
    expect(text("points", { stat: "magic", delta: 1, from: 1, to: 3 })).toBe(
      "Michał (GOBLIN) zyskuje 1 punkt Magii.",
    );
  });

  it("says nothing extra when the whole of it landed", () => {
    expect(text("points", { stat: "magic", delta: -1, from: 4, to: 3 })).toBe(
      "Michał (GOBLIN) traci 1 punkt Magii.",
    );
  });

  it("says the same about a number under its floor as one sitting on it", () => {
    expect(text("points", { stat: "magic", delta: -1, from: 1, to: 1, floor: 3 })).toBe(
      "Michał (GOBLIN) traci 1 punkt Magii — bez zmiany: Magia nie spada poniżej 3 (1.3, 2.3).",
    );
  });

  it("says where a forced change stopped, which is nothing and not the floor", () => {
    // Both halves: that it was forced, and that it still did not all land.
    expect(
      text("override", { stat: "magic", delta: -9, from: 6, to: 0, floor: 3, forced: true }),
    ).toBe("Michał (GOBLIN): magic -9 (6 → 0) — wymuszone — z tego 6: nie ma poniżej czego zejść.");
  });

  it("marks a correction that was forced past the floor", () => {
    expect(text("override", { stat: "magic", delta: -2, from: 3, to: 1, floor: 3, forced: true })).toBe(
      "Michał (GOBLIN): magic -2 (3 → 1) — wymuszone.",
    );
  });

  it("says as much on a correction the floor refused", () => {
    expect(text("override", { stat: "magic", delta: -1, from: 3, to: 3, floor: 3 })).toContain(
      "bez zmiany: Magia nie spada poniżej 3",
    );
  });
});

suite("spending a card by using it", () => {
  it("says it the same way for every card", () => {
    expect(text("used", { cardId: "eliksir-sily" })).toBe("Michał (GOBLIN) używa: ELIKSIR SIŁY.");
    expect(text("used", { cardId: "owoc-jarzebiny-wiedzy" })).toContain("używa");
    expect(text("used", { cardId: "rozdzka-przeznaczenia" })).toContain("używa");
  });

  it("quotes the die where the app threw one", () => {
    expect(text("used", { cardId: "tajemnicza-szkatula", face: 4 })).toBe(
      "Michał (GOBLIN) używa: TAJEMNICZA SZKATUŁA — wypadło 4.",
    );
  });

  it("still names a card it has no entry for", () => {
    expect(text("used", { cardId: "nie-ma-takiej" })).toBe("Michał (GOBLIN) używa: nie-ma-takiej.");
  });

  it("says which pile turned over, and belongs to no player", () => {
    // 9.5's reshuffle is the table's event, not anybody's move — so it names
    // no seat. It used to be carried as a flag on the draw line that nothing
    // read, which made the loudest moment in a deck's life silent.
    expect(text("reshuffle", { pile: "zaklecia" })).toContain("Zaklęć");
    expect(text("reshuffle", { pile: "zaklecia" })).toContain("9.5");
    expect(text("reshuffle", { pile: "zdarzenia" })).toContain("Kart Zdarzeń");
  });

  it("keeps breaking a fight off apart from fleeing one", () => {
    // The test hatch and 19.1 must not read alike: the whole reason to have a
    // way out of a staged fight is to test the fights, and a row saying
    // "ucieka z walki" would be the one row you could not trust while doing it.
    const said = text("test-fight-end", { cardName: "CYKLOP" });
    expect(said).toBe("Michał (GOBLIN) przerywa walkę z: CYKLOP.");
    expect(said).not.toContain("ucieka");
    // The badge on a manual row says this, and said it twice while the
    // sentence did too.
    expect(said).not.toContain("tryb testowy");
  });

  it("names a pack or a duel it has no card for", () => {
    // 17.5 joins several creatures into one fight, and a duel carries a
    // player's name — neither is a card id, so neither is looked up.
    expect(text("test-fight-end", { cardName: "CYKLOP + SMOK" })).toContain("CYKLOP + SMOK");
    expect(text("test-fight-end", {})).toContain("przeciwnikiem");
  });

  it("says a card handed over by the test shortcut, rather than nothing at all", () => {
    // It used to write a row no case could render, so granting a card in test
    // mode left the journal silent about where it came from.
    expect(text("test-card-field", { cardId: "miecz", fieldId: "kurhan" })).toBe(
      "Michał (GOBLIN) kładzie na polu Kurhan: MIECZ.",
    );
    expect(text("test-card", { cardId: "swiety-graal", kind: "item" })).toBe(
      "Michał (GOBLIN) bierze z talii: ŚWIĘTY GRAAL.",
    );
  });
});

suite("sitting down at a table already running", () => {
  it("is not the same line as coming back from a death", () => {
    // Both go through takeNewCharacter and they are not the same event: one
    // player has lost a character, the other never had one. A table reading
    // its own history back should be able to tell which happened.
    expect(text("joined", { characterId: "troll" })).toBe(
      "Michał (GOBLIN) dosiada się do stołu jako TROLL.",
    );
    expect(text("joined", { characterId: "troll" })).not.toContain("zgin");
  });
});

suite("choosing again after death", () => {
  it("names the new character", () => {
    expect(text("new-character", { characterId: "troll" })).toBe("Michał (GOBLIN) gra dalej jako: TROLL.");
  });

  it("says when the pile chose rather than the player", () => {
    // Which card it is, is public either way; that it was drawn is a different
    // decision from picking it, and worth the word.
    expect(text("new-character", { characterId: "troll", losowa: true })).toBe(
      "Michał (GOBLIN) gra dalej jako: TROLL (wylosowana).",
    );
  });
});

suite("something a character is under", () => {
  it("says what it is and how long it lasts", () => {
    expect(
      text("effect", { source: "eliksir-sily", label: "+2 Miecza", ends: { kind: "turns", turns: 1 } }),
    ).toBe("Michał (GOBLIN): +2 Miecza — do końca tej tury.");
  });

  it("still says something when the shape is older than the sentence", () => {
    expect(text("effect", { label: "coś" })).toBe("Michał (GOBLIN): coś.");
  });
});
