import { describe as suite, expect, it } from "vitest";
import {
  COMMANDS,
  GROUPS,
  availableIn,
  needsOf,
  permits,
  stageOf,
  worksOffTable,
  type Stage,
  complete,
  helpLines,
  confirmationFor,
  needsConfirming,
  parseCommand,
  pickPlayer,
  statReply,
} from "./console";

/**
 * Just the command rows: not the headings, the blank lines or the footer.
 *
 * A row is indented by a space or the idle dot; a heading sits hard against the
 * left margin. That is the whole difference, and it is the one a reader uses.
 */
function commandRows(lines: readonly string[]): string[] {
  return lines.filter(
    (line) => /^[ \u00b7]\S/.test(line) && !line.includes("`help all`"),
  );
}


const ok = (line: string) => {
  const parsed = parseCommand(line);
  if ("error" in parsed) throw new Error(`refused: ${parsed.error}`);
  return parsed.ok;
};
const err = (line: string) => {
  const parsed = parseCommand(line);
  if ("ok" in parsed) throw new Error(`accepted: ${JSON.stringify(parsed.ok)}`);
  return parsed.error;
};

suite("reading a line", () => {
  it("splits a verb from a number somebody glued to it", () => {
    // `sword+1` is what a hand types in a hurry. Split only where the sign or
    // the digit begins, so a name with a number in it is never broken.
    expect(ok("sword+1")).toEqual({ kind: "stat", stat: "sword", delta: 1, set: null, who: null, force: false });
    expect(ok("gold+5 Ola")).toMatchObject({ delta: 5, who: "Ola" });
    expect(ok("gold-2")).toMatchObject({ delta: -2 });
  });

  it("takes the slash a person types out of habit, and without it", () => {
    expect(ok("/help")).toEqual({ kind: "help", about: null });
    expect(ok("help")).toEqual({ kind: "help", about: null });
  });

  it("does not care about case or spacing", () => {
    expect(ok("   ENDTURN   ")).toEqual({ kind: "turn", act: "end", force: false });
  });

  /** Case and spacing are nobody's business but the reader's. */
  it("reads the acts whatever case they are typed in", () => {
    expect(ok("PASS Force")).toEqual({ kind: "turn", act: "end", force: true });
    expect(ok("TURN Reset")).toEqual({ kind: "turn", act: "reset" });
    // Anything else in that position is a person, which is the one act that
    // cannot default to you — a bare `turn` is handing your own on.
    expect(ok("turn now")).toEqual({ kind: "turn", act: "reach", who: "now" });
  });

  it("says so when there is nothing to read", () => {
    expect(err("")).toMatch(/help/);
    expect(err("   ")).toMatch(/help/);
  });

  it("names the command it does not know", () => {
    expect(err("frobnicate")).toContain("frobnicate");
  });
});

suite("moving a parameter", () => {
  it("reads a sign, and reads a bare number as a gain", () => {
    expect(ok("gold +5")).toEqual({ kind: "stat", stat: "gold", delta: 5, set: null, who: null, force: false });
    expect(ok("gold 5")).toEqual({ kind: "stat", stat: "gold", delta: 5, set: null, who: null, force: false });
    expect(ok("gold -3")).toEqual({ kind: "stat", stat: "gold", delta: -3, set: null, who: null, force: false });
  });

  it("knows the four parameters, and only by their English names", () => {
    expect(ok("sword +1")).toMatchObject({ stat: "sword" });
    expect(ok("magic +1")).toMatchObject({ stat: "magic" });
    expect(ok("life -1")).toMatchObject({ stat: "life" });
    expect(ok("gold +1")).toMatchObject({ stat: "gold" });
    // The line between the two languages: what you type is English, what you
    // name keeps the name printed on it. A stat is typed.
    expect(err("miecz +1")).toMatch(/No command/);
    expect(err("magia +1")).toMatch(/No command/);
    expect(err("zycie -1")).toMatch(/No command/);
    expect(err("zloto +1")).toMatch(/No command/);
  });

  it("takes a player after the amount, and nobody as yourself", () => {
    expect(ok("life -1 Ola")).toMatchObject({ who: "Ola" });
    expect(ok("life -1")).toMatchObject({ who: null });
  });

  it("puts a number where you want it with `=`, and moves it without", () => {
    expect(ok("gold =12")).toMatchObject({ delta: 0, set: 12 });
    // The space somebody types when being careful.
    expect(ok("gold = 12")).toMatchObject({ set: 12 });
    expect(ok("magic =3 Ola force")).toMatchObject({ set: 3, who: "Ola", force: true });
    // A bare number stays a gain, which is what it has always meant.
    expect(ok("gold 5")).toMatchObject({ delta: 5, set: null });
  });

  it("takes a nought to set, where a nought to move is a no-op with a journal line", () => {
    expect(ok("gold =0")).toMatchObject({ set: 0 });
    expect(err("gold 0")).toContain("0");
  });

  it("refuses to set a number below nothing, which no parameter can be", () => {
    expect(err("gold =-1")).toMatch(/below zero/);
  });

  it("takes `force` after the player, because it is about the change", () => {
    expect(ok("magic -1 force")).toMatchObject({ who: null, force: true });
    expect(ok("magic -1 Ola force")).toMatchObject({ who: "Ola", force: true });
    expect(ok("magic -1 Ola")).toMatchObject({ who: "Ola", force: false });
    // Only as the last word. Somebody actually called Force would be found by
    // `pickPlayer` and told there is nobody by that name, which is the truth.
    expect(ok("magic -1 force Ola")).toMatchObject({ who: "force Ola", force: false });
  });

  it("refuses an amount that is not a whole number of points", () => {
    expect(err("gold")).toMatch(/How much/);
    expect(err("gold five")).toContain("five");
    expect(err("gold 0.5")).toContain("0.5");
    // Zero is not a correction, it is a no-op with a journal line.
    expect(err("gold 0")).toContain("0");
  });
});

suite("naming a card, a field or a creature", () => {
  /**
   * The line between the two languages, in one test.
   *
   * Everything you type at this console is English, because the words are the
   * names of functions. Everything you name keeps the name printed on it,
   * because those are the names on the cards and the board in front of you.
   */
  it("types English and names Polish", () => {
    expect(ok("magic +1")).toMatchObject({ stat: "magic" });
    expect(err("magia +1")).toMatch(/No command/);
    expect(ok("deal MAGICZNY MIECZ")).toMatchObject({ cardIds: ["magiczny-miecz"] });
    expect(ok("teleport Świątynia Tolimana")).toMatchObject({ fieldId: "swiatynia-tolimana" });
    expect(ok("pick BŁĘDNY RYCERZ")).toMatchObject({ characterId: "bledny-rycerz" });
  });

  it("finds a card by the name printed on it", () => {
    expect(ok("deal MAGICZNY MIECZ")).toEqual({ kind: "deal", cardIds: ["magiczny-miecz"] });
  });

  it("does not need a Polish keyboard", () => {
    expect(ok("deal swiety graal")).toEqual({ kind: "deal", cardIds: ["swiety-graal"] });
  });

  it("prefers an exact name over the longer names containing it", () => {
    // MIECZ and MIECZ CHAOSU both exist; typing the whole of one is not
    // ambiguous just because the other starts the same way.
    expect(ok("deal miecz")).toEqual({ kind: "deal", cardIds: ["miecz"] });
  });

  it("asks which one when a query really does name several", () => {
    // KRYSZTAŁ LOSU and KRYSZTAŁ MAGÓW both start here and neither is what was
    // typed, which is the only case where guessing would be wrong.
    expect(err("deal krysz")).toMatch(/Which one/);
    expect(err("deal krysz")).toContain("KRYSZTAŁ LOSU");
  });

  it("leaves a card where you stand, or on the Obszar you name", () => {
    expect(ok("place MIECZ")).toEqual({ kind: "place", cardId: "miecz", gold: null, fieldId: null });
    expect(ok("place MIECZ at Karczma")).toEqual({
      kind: "place",
      cardId: "miecz",
      gold: null,
      fieldId: "karczma",
    });
    // `put` and `drop` are the two words somebody reaches for first; `place` is
    // the one the store already uses for putting a character on a field.
    expect(ok("put MIECZ at Karczma")).toMatchObject({ kind: "place", fieldId: "karczma" });
    expect(ok("put MIECZ")).toMatchObject({ kind: "place", cardId: "miecz" });
  });

  /**
   * The money half, which is not a card and must not be looked up as one.
   *
   * The box does print two gold Karty — „1 SZTUKA ZŁOTA", „2 SZTUKI ZŁOTA" —
   * and those still go through the card lookup, because they are Przedmioty
   * that lie on the Obszar until somebody takes them. What `place gold 5` puts
   * down is the coins themselves, which is what 4.4 spills and what 12.1 lets
   * you pick up an arbitrary amount of.
   */
  it("lays down loose gold, which no card is called", () => {
    expect(ok("place gold 5")).toEqual({ kind: "place", cardId: null, gold: 5, fieldId: null });
    expect(ok("place gold 2 at Karczma")).toEqual({
      kind: "place",
      cardId: null,
      gold: 2,
      fieldId: "karczma",
    });
    // The Polish word too, with and without its diacritic — this console is
    // typed at by somebody reading a Polish rulebook.
    expect(ok("place złoto 3")).toMatchObject({ gold: 3 });
    expect(ok("place zloto 3")).toMatchObject({ gold: 3 });
  });

  it("still means the Karta when the Karta is the one named", () => {
    expect(ok("place 1 SZTUKA ZŁOTA")).toMatchObject({
      kind: "place",
      cardId: "1-sztuka-zlota",
      gold: null,
    });
  });

  it("wants a whole number of coins, and says so", () => {
    expect(err("place gold")).toMatch(/How much/);
    expect(err("place gold nic")).toContain("place gold 5");
    expect(err("place gold 0")).toContain("place gold 5");
    expect(err("place gold -2")).toContain("place gold 5");
  });

  /**
   * `clear`'s money form, which bare `clear` was doing anyway and no line could
   * ask for on its own.
   *
   * Bare `clear` sweeps the coins along with the Karty and `clear MIECZ` leaves
   * them, so "just the coins" and "three of them" were both unsayable — and
   * three of them is the only way to put a square back to a particular amount,
   * since `place gold` can only add.
   */
  it("takes the gold off an Obszar, all of it unless a number says", () => {
    expect(ok("clear gold")).toEqual({ kind: "clear", cardId: null, gold: "all", fieldId: null });
    expect(ok("clear gold all")).toMatchObject({ gold: "all" });
    expect(ok("clear gold 3")).toEqual({ kind: "clear", cardId: null, gold: 3, fieldId: null });
    expect(ok("clear gold 3 at Karczma")).toEqual({
      kind: "clear",
      cardId: null,
      gold: 3,
      fieldId: "karczma",
    });
    expect(ok("clear złoto 2")).toMatchObject({ gold: 2 });
  });

  it("still means the Karta, and the Obszar, where those are what was named", () => {
    expect(ok("clear 1 SZTUKA ZŁOTA")).toMatchObject({ cardId: "1-sztuka-zlota", gold: null });
    expect(ok("clear Karczma")).toMatchObject({ fieldId: "karczma", cardId: null, gold: null });
    expect(ok("clear")).toEqual({ kind: "clear", cardId: null, gold: null, fieldId: null });
  });

  it("names both halves of a place, and complains about the one that is wrong", () => {
    // Bare is the catalogue, as bare `deal` is — a mistake is a name nothing
    // is called, and that is what still complains.
    expect(ok("place")).toEqual({ kind: "place", cardId: null, gold: null, fieldId: null });
    expect(err("place MIECZ at Narnia")).toContain("Narnia");
    expect(err("place nothing at Karczma")).toMatch(/No card/);
  });

  /**
   * 12.1 puts the amount in the player's gift — Talisman's 12:1, the sentence
   * it is adapted from, says *any* Gold Counters may be taken — so a number is
   * allowed and bare means the lot, which is what a hand does at a table.
   */
  it("takes gold off an Obszar, all of it unless a number says", () => {
    expect(ok("take gold")).toEqual({ kind: "take", name: null, gold: null });
    expect(ok("take gold all")).toEqual({ kind: "take", name: null, gold: null });
    expect(ok("take gold 3")).toEqual({ kind: "take", name: null, gold: 3 });
    expect(ok("take złoto 3")).toMatchObject({ gold: 3 });
    // A Karta whose name happens to be about gold is still a Karta.
    expect(ok("take 2 SZTUKI ZŁOTA")).toEqual({ kind: "take", name: "2 SZTUKI ZŁOTA" });
  });

  it("reaches the Wyposażenie deck, which is not the Karty Zdarzeń", () => {
    // The card that could once not be asked for at all, because only the event
    // deck was searched.
    expect(ok("deal tarcza tolimana")).toMatchObject({ cardIds: ["tarcza-tolimana"] });
    expect(ok("place tarcza tolimana")).toMatchObject({ cardId: "tarcza-tolimana" });
  });

  it("takes a Natura by its English name, and says which three there are", () => {
    expect(ok("nature evil")).toEqual({ kind: "nature", nature: "evil", who: null, force: false });
    expect(ok("nature good Ola")).toEqual({ kind: "nature", nature: "good", who: "Ola", force: false });
    expect(ok("nature chaotic")).toMatchObject({ nature: "chaotic" });
    expect(err("nature")).toMatch(/good, evil, chaotic/);
    expect(err("nature zla")).toMatch(/Which Natura/);
  });

  /**
   * 4.4's "może wybrać sobie nową" and a latecomer's first Postać are the same
   * act for different reasons, so they are one command.
   */
  it("puts a Postać into a seat — drawn unless named, yours unless numbered", () => {
    expect(ok("pick")).toEqual({ kind: "pick", characterId: null, seat: null });
    expect(ok("pick MAGOG")).toEqual({ kind: "pick", characterId: "magog", seat: null });
    expect(ok("pick magog 2")).toEqual({ kind: "pick", characterId: "magog", seat: 2 });
    expect(err("pick Gandalf")).toContain("Gandalf");
  });

  it("turns somebody to stone, and knows the three effects by name", () => {
    expect(ok("stone Ola")).toEqual({ kind: "stone", who: "Ola", stone: true });
    // The undo, which is the same pair `ready`/`unready` is.
    expect(ok("unstone Ola")).toEqual({ kind: "stone", who: "Ola", stone: false });
    expect(ok("unstone")).toEqual({ kind: "stone", who: null, stone: false });
    expect(ok("effect fog")).toEqual({ kind: "effect", effect: "fog", who: null });
    expect(ok("effect barred Ola")).toEqual({ kind: "effect", effect: "barred", who: "Ola" });
    // Closed on purpose: the alternative is a modifier typed as JSON, which is
    // writing cards with no rule behind any of it.
    expect(err("effect haste")).toMatch(/fog, frozen, barred/);
  });

  /**
   * One noun, three things done to it — and the bare word is the one anybody
   * types twenty times a session.
   */
  it("reads the three things done to a turn", () => {
    expect(ok("turn")).toEqual({ kind: "turn", act: "end", force: false });
    expect(ok("turn end")).toEqual({ kind: "turn", act: "end", force: false });
    expect(ok("turn end force")).toEqual({ kind: "turn", act: "end", force: true });
    expect(ok("turn force")).toEqual({ kind: "turn", act: "end", force: true });
    expect(ok("turn reset")).toEqual({ kind: "turn", act: "reset" });
    expect(ok("turn Ola")).toEqual({ kind: "turn", act: "reach", who: "Ola" });
    // The two words that used to be verbs of their own still say the bare act.
    expect(ok("pass")).toEqual(ok("turn"));
    expect(ok("endturn force")).toEqual(ok("turn force"));
    // `force` belongs to the act that refuses things, and to no other.
    expect(err("turn reset force")).toMatch(/refuses nothing/);
    expect(err("turn Ola force")).toMatch(/`turn end`/);
  });

  it("names a Zaklęcie where a hand can hold one, and not where a field cannot", () => {
    // 9.3 keeps a granted spell face down; `grantCard` has always taken one.
    expect(ok("deal kamien filozoficzny")).toMatchObject({ cardIds: ["kamien-filozoficzny"] });
    // 9.6 sends a spent spell to the used pile, and none lies on a board.
    expect(err("place kamien filozoficzny")).toMatch(/No card/);
  });

  it("finds an Obszar", () => {
    expect(ok("teleport Karczma")).toEqual({ kind: "teleport", fieldId: "karczma" });
  });

  /**
   * Two forms, and they cannot collide: no card in the box is called a number.
   * A bare number is the Karty Zdarzeń, which are *the* deck — the Zaklęcia are
   * always asked for by their own name.
   */
  it("stacks by name or by position", () => {
    expect(ok("stack WILKOŁAK")).toEqual({
      kind: "stack",
      cardId: "wilkolak",
      pile: null,
      at: null,
    });
    expect(ok("stack 10")).toEqual({ kind: "stack", cardId: null, pile: "events", at: 10 });
    expect(ok("stack spells 3")).toEqual({ kind: "stack", cardId: null, pile: "spells", at: 3 });
    // Polish for the two piles, since that is what they are called on screen.
    expect(ok("stack zaklęcia 3")).toEqual({ kind: "stack", cardId: null, pile: "spells", at: 3 });
  });

  it("looks through either pile, or both", () => {
    expect(ok("pile")).toEqual({ kind: "pile", pile: null });
    expect(ok("pile events")).toEqual({ kind: "pile", pile: "events" });
    expect(ok("deck spells")).toEqual({ kind: "pile", pile: "spells" });
    expect(err("pile trophies")).toMatch(/Which pile/);
  });

  /**
   * Every class, which is the whole of why `deal` replaced two verbs.
   *
   * `give` matched what a hand could hold and `summon` what could be fought,
   * so a Spotkanie was on neither list and answering "No card called `MGŁA`"
   * about a card that is printed once was the result.
   */
  it("names a Karta of any class at all", () => {
    for (const [said, cardId] of [
      ["deal WILKOŁAK", "wilkolak"],
      ["deal MAGICZNY MIECZ", "magiczny-miecz"],
      ["deal MGŁA", "mgla"],
      ["deal ALCHEMIK", "alchemik"],
      ["deal TARGOWISKO", "targowisko"],
      ["deal KRĄG PŁOMIENI", "krag-plomieni"],
    ] as const) {
      expect(ok(said), said).toEqual({ kind: "deal", cardIds: [cardId] });
    }
  });

  it("asks for the name when none was given", () => {
    expect(err("teleport")).toMatch(/Which Obszar/);
    expect(err("stack")).toMatch(/Which card/);
  });

  /**
   * Except `deal`, where naming nothing is a question rather than a mistake.
   *
   * "What can I ask for?" is the thing somebody dressing a test table wants,
   * and Tab answers with a grid readline draws itself, which no heading
   * survives — so the console lists them by kind instead.
   */
  /**
   * And Tab keeps the three kinds apart, which is the most a grid can carry.
   *
   * `complete` sorts every pool alphabetically, which is right for a list of
   * names with no shape of its own and wrong for this one — it put ALCHEMIK
   * between 2 SZTUKI ZŁOTA and ARONDIGHT and shuffled the kinds together. The
   * pool says it has already chosen an order; readline prints what it is given.
   */
  it("offers the cards grouped, not shuffled together alphabetically", () => {
    const { options } = complete("deal ", []);
    const at = (name: string) => options.indexOf(name);
    // Last Przedmiot, first Przyjaciel, first Wróg — in that order.
    expect(at("ZWIERCIADŁO ZNISZCZENIA")).toBeLessThan(at("ALCHEMIK"));
    expect(at("ALCHEMIK")).toBeLessThan(at("CYKLOP"));
    // Alphabetical *within* a group, so a name is still findable.
    expect(at("ALCHEMIK")).toBeLessThan(at("RYCERZ"));
    // And every class is on it, which is the change: none of these could be
    // asked for before, because neither verb owned them.
    for (const reachable of ["CYKLOP", "MGŁA", "TARGOWISKO"]) {
      expect(options, reachable).toContain(reachable);
    }
  });

  /**
   * And the same hits under headings, for a console that draws its own list.
   *
   * A terminal cannot use them: readline builds its grid from a flat array and
   * no heading survives. The browser console builds its own, so it gets the
   * three kinds labelled rather than ninety names in one run.
   */
  it("cuts the cards into named groups for a surface that can draw them", () => {
    const { sections } = complete("deal ", []);
    expect(sections?.map((one) => one.title)).toEqual([
      "Przedmioty",
      "Przyjaciele",
      "Wrogowie",
      "Spotkania",
      "Nieznajomi",
      "Miejsca",
      "Zaklęcia",
    ]);
    // The same hits, cut up rather than added to.
    const { options } = complete("deal ", []);
    expect(sections?.flatMap((one) => one.options).sort()).toEqual([...options].sort());
  });

  /**
   * Past a comma, Tab is offering the *next* card and not finishing the last.
   *
   * Without this it went quiet after the first name: the fragment is every word
   * from `at` onwards joined, so `deal MGŁA, WILKO` matched against the whole of
   * that and no card starts with it. The comma is the only boundary a name with
   * spaces in it can have, which is why the parser reads it and why Tab has to
   * read the same one.
   */
  it("offers the next card after a comma, keeping what is already named", () => {
    expect(complete("deal MGŁA, WILKO", []).line).toBe("deal MGŁA, WILKOŁAK ");
    // And with nothing typed after the comma, the whole catalogue again.
    expect(complete("deal MGŁA, ", []).options.length).toBeGreaterThan(50);
  });

  it("drops a heading the fragment has emptied", () => {
    // TARCZA TOLIMANA is a Przedmiot and TAJEMNE PRZEJŚCIE / TARGOWISKO are
    // Miejsca. No Przyjaciel, Wróg, Spotkanie, Nieznajomy or Zaklęcie begins
    // "TA", so those five headings go rather than standing empty.
    expect(complete("deal TA", []).sections?.map((one) => one.title)).toEqual([
      "Przedmioty",
      "Miejsca",
    ]);
  });

  /**
   * The same shelves everywhere the same question is asked.
   *
   * `deal`, `place`, `clear`, `stack` and `card` all ask "which Karta do you
   * mean?" of different halves of the box, and three of them used to answer
   * with one alphabetical run of a hundred and sixty-five names.
   */
  it("cuts every card pool into the same kinds", () => {
    const titles = (line: string) => complete(line, []).sections?.map((one) => one.title);
    const KARTY = [
      "Przedmioty",
      "Przyjaciele",
      "Wrogowie",
      "Spotkania",
      "Nieznajomi",
      "Miejsca",
    ];
    // No Zaklęcie ever lies on an Obszar (9.5), so `place` is the six kinds —
    // and the money, which is not a Karta and leads them the way 12.1 lists it.
    expect(titles("place ")).toEqual(["Złoto", ...KARTY]);
    expect(titles("take ")).toEqual(["Złoto", ...KARTY]);
    // `clear` grew one too: bare it sweeps the coins with the Karty, and named
    // it takes the coins alone.
    expect(titles("clear ")).toEqual(["Złoto", ...KARTY]);
    // A Hełm has no pile to sit on top of (21.2); a Zaklęcie has its own.
    expect(titles("stack ")).toContain("Zaklęcia");
    // And the one shelf that is not a Karta Zdarzeń class.
    expect(titles("card ")?.at(-1)).toBe("Postacie");
  });

  /**
   * The board as four shelves, everywhere an Obszar is named.
   *
   * Ninety-odd names in one alphabetical heap made you read every one to find
   * the field you wanted, when what you know about a field is its Krąg.
   */
  it("cuts the board into its four parts, outermost first", () => {
    const kregi = ["Dolny Krąg", "Środkowy Krąg", "Górny Krąg", "Kamienny Most"];
    for (const line of ["teleport ", "cross ", "place MIECZ at ", "clear MIECZ at "]) {
      expect(complete(line, []).sections?.map((one) => one.title), line).toEqual(kregi);
    }
    // Board order inside a Krąg, not alphabetical: Urwisko I and II sit
    // opposite each other and the order is what says so.
    const gorny = complete("teleport ", []).sections?.find((one) => one.title === "Górny Krąg");
    expect(gorny?.options[0]).toBe("Urwisko I");
  });

  /**
   * Tab went quiet after a finished card name, which is the one place it must
   * not: `at` is the only word that can come next.
   */
  it("offers the `at` a finished card name is waiting for", () => {
    expect(complete("place EREMITA ", []).line).toBe("place EREMITA at ");
    expect(complete("clear GROTA ", []).line).toBe("clear GROTA at ");
    // Not while the name could still be a longer one: TARCZA is a card, and so
    // are TARCZA TOLIMANA and TARCZA BOGA TOLIMANA. The two longer names are
    // still what Tab offers, because finishing the wrong one puts a different
    // Karta on the Obszar.
    expect(complete("place TARCZA ", []).options).toEqual([
      "TARCZA BOGA TOLIMANA",
      "TARCZA TOLIMANA",
    ]);
    // And not for a fragment that names nothing.
    expect(complete("place ZZZ ", []).options).toEqual([]);
  });

  /**
   * `drop` sat in `place`'s branch from when the two shared a word, so Tab
   * offered it an `at` the grammar rejects — `drop` puts a Karta down on the
   * Obszar you are standing on (12.1) and names no other.
   */
  it("does not offer `drop` an Obszar it cannot take", () => {
    expect(complete("drop MIECZ ", []).options).toEqual([]);
    expect(complete("drop MIE", []).options).toContain("MIECZ");
  });

  /**
   * A catalogue must not offer a name the next line rejects.
   *
   * This is the failure the note above `STACKABLE` describes, and it is the
   * whole risk of cutting one pool into shelves: a heading is a promise that
   * what is under it can be typed. Every name, through the real parser, at the
   * verb that offered it.
   */
  it("offers nothing the grammar will not take back", () => {
    const typed = (line: string) => {
      const parsed = parseCommand(line);
      if ("error" in parsed) throw new Error(`${line}: ${parsed.error}`);
      return parsed.ok;
    };
    for (const { title, options } of complete("place ", []).sections ?? []) {
      /**
       * Złoto is the one shelf whose entry is not a whole line.
       *
       * `gold` is a word the amount follows, and Tab cannot finish a number —
       * so what the heading promises is that `place gold 5` is typeable, not
       * that `place gold` is. The promise is still kept, and it is still worth
       * checking: a heading whose word the parser did not know would send
       * somebody down the same blind alley either way.
       */
      const amount = title === "Złoto" ? " 5" : "";
      for (const name of options) {
        expect(typed(`place ${name}${amount}`), `${title}: ${name}`).toBeTruthy();
      }
    }
    for (const { title, options } of complete("take ", []).sections ?? []) {
      // Bare `take gold` is a whole line here — it means the lot (12.1).
      for (const name of options) expect(typed(`take ${name}`), `${title}: ${name}`).toBeTruthy();
    }
    for (const { options } of complete("teleport ", []).sections ?? []) {
      for (const name of options) expect(typed(`teleport ${name}`), name).toBeTruthy();
    }
    for (const { options } of complete("stack ", []).sections ?? []) {
      for (const name of options) expect(typed(`stack ${name}`), name).toBeTruthy();
    }
    for (const { options } of complete("card ", []).sections ?? []) {
      for (const name of options) expect(typed(`card ${name}`), name).toBeTruthy();
    }
  });

  /**
   * The money word, offered where the grammar takes it and nowhere else.
   *
   * A completer that offers a word the parser rejects is worse than one that
   * offers nothing: it teaches a line, and the line is refused.
   */
  it("offers gold where a Karta or money could go, and gets out of the way after", () => {
    expect(complete("place ", []).options[0]).toBe("gold");
    expect(complete("take ", []).options[0]).toBe("gold");
    // A number cannot be finished, so nothing is offered where it goes and the
    // line is handed back untouched.
    expect(complete("place gold ", [])).toMatchObject({ line: "place gold ", options: [] });
    // Once it has been typed the only thing left is where, and one option is
    // typed for you rather than listed.
    expect(complete("place gold 5 ", []).line).toBe("place gold 5 at ");
    expect(complete("place gold 5 at ", []).sections?.[0].title).toBe("Dolny Krąg");
    // Bare `take gold` is already the lot; `all` is the word for saying so.
    expect(complete("take gold ", []).line).toBe("take gold all ");
    // `clear` has the same money form, and its amount is optional — so `at` is
    // what comes next whether or not one was typed.
    expect(complete("clear ", []).options[0]).toBe("gold");
    expect(complete("clear gold ", []).line).toBe("clear gold at ");
    expect(complete("clear gold 3 ", []).line).toBe("clear gold 3 at ");
  });

  /** Every other pool is a list of names with no shape, and stays one run. */
  it("says nothing about groups where there are none", () => {
    // One heading over a whole pool is no heading at all. Both printed classes
    // of Wróg stand together here, as the Księga shelves them.
    expect(complete("fight ", []).sections).toBeUndefined();
    expect(complete("pick ", []).sections).toBeUndefined();
  });

  it("takes a bare `deal` as a request for the list", () => {
    expect(ok("deal")).toEqual({ kind: "deal", cardIds: [] });
  });

  /**
   * Several Karty on one line, separated by commas.
   *
   * A comma because no card in the box has one in its name and every card has
   * spaces in it, so nothing else can tell TOPÓR ŚWIATŁA I CIEMNOŚCI from two
   * cards.
   */
  it("takes several cards separated by commas", () => {
    expect(ok("deal MGŁA, WILKOŁAK, TARGOWISKO")).toEqual({
      kind: "deal",
      cardIds: ["mgla", "wilkolak", "targowisko"],
    });
  });

  it("does not mind how the commas are spaced", () => {
    expect(ok("deal MGŁA,WILKOŁAK ,  TARGOWISKO")).toEqual({
      kind: "deal",
      cardIds: ["mgla", "wilkolak", "targowisko"],
    });
  });

  /** A line halfway through being typed, not a mistake to refuse. */
  it("ignores a trailing comma", () => {
    expect(ok("deal MGŁA,")).toEqual({ kind: "deal", cardIds: ["mgla"] });
  });

  /** Which one is wrong, said by name — with three on the line, "no card" is not enough. */
  it("names the one it could not find", () => {
    expect(err("deal MGŁA, NARNIA, WILKOŁAK")).toContain("NARNIA");
  });

  /** A name with spaces survives the split, because the split is on commas. */
  it("keeps a multi-word name in one piece", () => {
    expect(ok("deal MAGICZNY MIECZ, ŚWIĘTY GRAAL")).toEqual({
      kind: "deal",
      cardIds: ["magiczny-miecz", "swiety-graal"],
    });
  });

  it("says when nothing is called that", () => {
    expect(err("teleport Narnia")).toContain("Narnia");
  });
});

suite("the rest of the vocabulary", () => {
  /**
   * The spoil is `gold`, and the two Polish spellings still answer.
   *
   * The vocabulary is the engine's and the engine is English; only what is
   * printed on the box — a Karta's name, an Obszar's — is Polish. `zloto` was
   * the word this line printed, which put a localisation word in the app's own
   * grammar.
   */
  it("takes the coin by the app's word, and by the box's two", () => {
    const coin = { kind: "spoils", take: "zloto", card: null };
    expect(ok("spoils gold")).toEqual(coin);
    expect(ok("spoils zloto")).toEqual(coin);
    expect(ok("spoils złoto")).toEqual(coin);
  });

  it("settles a fight three ways", () => {
    // The outcome is an argument, which is how the engine has always modelled
    // it — `winfight` flattened it into the verb and nothing else here does.
    expect(ok("settle won")).toEqual({ kind: "settle", outcome: "wygrana" });
    expect(ok("settle lost")).toEqual({ kind: "settle", outcome: "przegrana" });
    expect(ok("settle draw")).toEqual({ kind: "settle", outcome: "remis" });
    expect(ok("settle drawn")).toEqual({ kind: "settle", outcome: "remis" });
    expect(err("settle")).toContain("settle won|lost|draw");
  });

  it("ends the game, which is a different thing from ending a fight", () => {
    expect(ok("endgame won")).toEqual({ kind: "endgame", won: true });
    expect(ok("endgame lost")).toEqual({ kind: "endgame", won: false });
    expect(err("endgame")).toContain("endgame won|lost");
  });

  it("has no bare win or lose to be ambiguous with", () => {
    expect(err("win")).toMatch(/No command/);
    expect(err("lose")).toMatch(/No command/);
  });

  it("kills, draws and ends things", () => {
    expect(ok("kill")).toEqual({ kind: "kill", who: null });
    expect(ok("kill Ola")).toEqual({ kind: "kill", who: "Ola" });
    expect(ok("spell")).toEqual({ kind: "spell", who: null, wand: false });
    expect(ok("endfight")).toEqual({ kind: "endfight" });
    expect(ok("pass")).toEqual({ kind: "turn", act: "end", force: false });
  });
});

suite("playing the game, and overruling it", () => {
  /**
   * The two lists have to agree, and they are keyed differently — `COMMANDS` on
   * the word you type, `NEEDS` on what it parsed to, and `gold|sword|magic|life`
   * are four words with one kind between them. So every usage line `help` prints
   * is typed here and the capability it lands on is checked against the spec it
   * came from. Nothing else keeps them together.
   */
  it("classifies every command exactly once, and the same way twice", () => {
    for (const spec of COMMANDS) {
      const line = usageAsTyped(spec.usage);
      const parsed = parseCommand(line);
      if ("error" in parsed) throw new Error(`${spec.name}: ${parsed.error}`);
      expect(needsOf(parsed.ok), spec.name).toBe(spec.needs);
    }
  });

  it("lets a plain player play, and stops them overruling", () => {
    // Playing: nothing here breaks a rule the game has.
    for (const line of ["who", "endturn", "pick MAGOG", "help"]) {
      expect(permits(ok(line), { testmode: false }).ok, line).toBe(true);
    }
    // Overruling: every one of these is a rule the game states otherwise.
    for (const line of ["kill", "revive 3", "deal MAGICZNY MIECZ", "teleport Karczma", "gold +5"]) {
      expect(permits(ok(line), { testmode: false }).ok, line).toBe(false);
    }
  });

  /**
   * Three verbs that looked like two acts and were one.
   *
   * `stone`, `spell` and `nature` each call exactly the function the browser's
   * own control calls — `turnToStone`, `drawSpell`, `changeNature` — so naming
   * a second testmode word for them would have been inventing a difference
   * that is not there. What overrules a rule is `force`, and only on `nature`.
   */
  it("joins a spell to its target with `at`, like everything else that takes two", () => {
    expect(ok("cast BŁYSKAWICA at Ola")).toEqual({
      kind: "cast",
      name: "BŁYSKAWICA",
      who: "Ola",
      to: null,
    });
    expect(ok("cast BŁYSKAWICA")).toEqual({
      kind: "cast",
      name: "BŁYSKAWICA",
      who: null,
      to: null,
    });
    expect(err("cast")).toContain("cast <spell>");
  });

  /**
   * The one Zaklęcie that names two places: which Karta, and where it goes.
   * „Przenieś odkrytą Kartę Zdarzeń na inny, nie zajęty Obszar w tym samym
   * Kręgu" — and the cast is refused until both are said, so `to` is the other
   * half of the card rather than a convenience.
   */
  it("takes the Władca Zdarzeń's second place with `to`", () => {
    expect(ok("cast WŁADCA ZDARZEŃ at CYKLOP to Mroczna Polana")).toEqual({
      kind: "cast",
      name: "WŁADCA ZDARZEŃ",
      who: "CYKLOP",
      to: "Mroczna Polana",
    });
  });

  it("takes the Różdżka's refill as a flag on the same draw", () => {
    // The wand's second clause is a different condition from 2.6's ceiling and
    // so a different draw — but it is the same act, reached because a card says
    // you may, which is what a flag is for.
    expect(ok("spell wand")).toEqual({ kind: "spell", who: null, wand: true });
    expect(ok("spell Ola wand")).toEqual({ kind: "spell", who: "Ola", wand: true });
    expect(ok("spell Ola")).toEqual({ kind: "spell", who: "Ola", wand: false });
  });

  it("takes a number of points to heal, and only a number", () => {
    expect(ok("heal")).toEqual({ kind: "heal", points: null });
    expect(ok("heal 2")).toEqual({ kind: "heal", points: 2 });
    expect(err("heal lots")).toContain("heal [n]");
  });

  it("reads an answer as a path, not a single pick", () => {
    // An effect can ask twice, and the server re-walks the card against the
    // whole list — so the numbers are in the order they were decided.
    expect(ok("answer 2 1")).toEqual({ kind: "answer", card: null, choices: [2, 1] });
    // Named when more than one card is waiting.
    expect(ok("answer 1 WILKOŁAK")).toEqual({
      kind: "answer",
      card: "WILKOŁAK",
      choices: [1],
    });
    // Nothing to choose is a real answer: the Karczma rolls and does not ask.
    expect(ok("answer")).toEqual({ kind: "answer", card: null, choices: [] });
  });

  /**
   * Offering and allowing are different jobs, and only one of them is a rule.
   *
   * `availableIn` decides what to put in front of somebody; every command still
   * refuses for itself at the wrong moment, and *that* is the rule. So a wrong
   * answer here costs a bad suggestion rather than a bad game — which is the
   * only reason it is allowed to be as coarse as it is.
   */
  it("offers a verb where it belongs and not before", () => {
    const at = (stage: Stage) => availableIn({ stage }).map((spec) => spec.name);
    expect(at("lobby")).toContain("ready");
    expect(at("lobby")).not.toContain("roll");
    expect(at("lobby")).not.toContain("endturn");
    expect(at("roll")).toContain("roll");
    expect(at("roll")).not.toContain("move");
    expect(at("field")).toContain("answer");
    // 4.4 lets a player whose Postać died choose again mid-game, so `pick` is
    // not a poczekalnia verb even though that is where it is usually typed.
    expect(at("roll")).toContain("pick");
  });

  /**
   * No game open is its own state, and not a poczekalnia.
   *
   * Conflating them put `ready`, `start` and `pick` in front of somebody who
   * had not opened a table — thirteen words, none of which could run. What is
   * left is the pair that read the box rather than a game.
   */
  it("offers nothing that needs a game when there is not one", () => {
    const names = availableIn({ stage: "none", testmode: true }).map((one) => one.name);
    expect(names).toEqual(["help", "rule", "card"]);
    // Even with the overrides unlocked: `kill` needs somebody to kill.
    expect(names).not.toContain("kill");
  });

  it("reads a game as a stage the same way for everybody", () => {
    expect(stageOf("lobby", "roll")).toBe("lobby");
    expect(stageOf("playing", "roll")).toBe("roll");
    expect(stageOf("playing", "field")).toBe("field");
    // A phase nothing is keyed on is still a phase, and still not the lobby.
    expect(stageOf("playing", "bridge")).toBe("other");
    expect(stageOf("playing", undefined)).toBe("other");
  });

  /**
   * `offTable` is on the spec for `help` to read and `OFF_TABLE` is keyed on
   * the kind for `worksOffTable` to read, so the two can drift. Typing every
   * usage line is the only thing that stops them.
   */
  it("agrees with itself about which lines need no game", () => {
    for (const spec of COMMANDS) {
      const parsed = parseCommand(usageAsTyped(spec.usage));
      if ("error" in parsed) throw new Error(`${spec.name}: ${parsed.error}`);
      expect(worksOffTable(parsed.ok), spec.name).toBe(spec.offTable === true);
    }
    // And the pair that are: reading the box, and reading the vocabulary.
    expect(worksOffTable(ok("card MAGOG"))).toBe(true);
    expect(worksOffTable(ok("help"))).toBe(true);
    expect(worksOffTable(ok("roll"))).toBe(false);
  });

  it("keeps the overrides out of an offer until testmode is on", () => {
    expect(availableIn({ testmode: false }).map((one) => one.name)).not.toContain("kill");
    expect(availableIn({ testmode: true }).map((one) => one.name)).toContain("kill");
    // `help all` still reaches them, and `help kill` still explains one — the
    // plain list counts them instead of carrying them.
    expect(helpLines(null, { testmode: false, all: true }).join("\n")).toContain("kill");
    expect(helpLines("kill", { testmode: false }).join(" ")).toMatch(/locked/);
  });

  it("does not lock a verb that is the game working", () => {
    // `spell` is 9.5 drawing a Zaklęcie, which is a turn happening.
    for (const line of ["spell", "draw", "roll"]) {
      expect(permits(ok(line), { testmode: false }).ok, line).toBe(true);
    }
  });

  /**
   * Two that read as the game and are not.
   *
   * `nature` was `play` unless you added `force`, and `stone` was `play`
   * outright — a reading that works for companion mode, where typing one is
   * recording what a Karta just did at a physical table. In simulation the
   * Karta does it, and typing it is a Natura changed with no card and a Postać
   * turned to stone by nobody. 7.2 and 20.1 both say what causes them.
   */
  it("locks the two that look like the game and are not", () => {
    for (const line of ["stone", "nature evil", "nature evil force"]) {
      expect(permits(ok(line), { testmode: false }).ok, line).toBe(false);
      expect(permits(ok(line), { testmode: true }).ok, line).toBe(true);
    }
  });

  /**
   * One verb, two capabilities — the flag carries the difference.
   *
   * `endturn` is 10.1 and belongs to everybody. `endturn force` walks past
   * 5.6, 14.7 and a Karta the turn has not finished, so it is the console
   * overruling the rules and needs the same key `kill` does. A second verb
   * would have said the same thing in a word nobody would think to look for.
   */
  it("locks the act rather than the verb", () => {
    // 10.1 belongs to everybody, and so does the word for it.
    expect(permits(ok("turn"), { testmode: false }).ok).toBe(true);
    expect(permits(ok("turn end"), { testmode: false }).ok).toBe(true);
    expect(permits(ok("pass"), { testmode: false }).ok).toBe(true);
    for (const line of ["turn force", "turn reset", "turn Ola"]) {
      const refused = permits(ok(line), { testmode: false });
      expect(refused.ok, line).toBe(false);
      // Naming the bare verb would send somebody looking for what is wrong
      // with a line they can type perfectly well.
      if (!refused.ok) expect(refused.why, line).not.toBe("`turn` overrules the rules — turn testmode on first.");
      expect(permits(ok(line), { testmode: true }).ok, line).toBe(true);
    }
  });

  it("allows everything once testmode is on", () => {
    for (const line of ["kill", "teleport Karczma", "endgame won", "effect fog"]) {
      expect(permits(ok(line), { testmode: true }).ok, line).toBe(true);
    }
  });

  it("says what was refused, rather than pretending not to know the word", () => {
    const refused = permits(ok("kill"), { testmode: false });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.why).toMatch(/testmode/);
    // And it still parses, so the console can say that rather than "no command".
    expect(ok("kill")).toEqual({ kind: "kill", who: null });
  });

  it("counts the locked ones rather than carrying them", () => {
    const locked = helpLines(null, { testmode: false });
    const open = helpLines(null, { testmode: true });
    expect(open.length).toBeGreaterThan(locked.length);
    // Not hidden — the tail says how many and where they are.
    expect(locked.at(-1)).toMatch(/more/);
    expect(open.some((line) => line.includes("kill"))).toBe(true);
  });

  /**
   * The list is what applies, and a count of what does not.
   *
   * It used to be all thirty-odd commands whatever was going on, on the
   * argument that a command you cannot discover does not exist. That is right
   * about discovery and wrong about a list: a poczekalnia offering `winfight`
   * and `teleport` teaches nobody the vocabulary, it buries the six words that
   * work. So the count and `help all` carry the discovery instead.
   */
  it("lists what applies and says how much it left out", () => {
    const lobby = helpLines(null, { testmode: false, stage: "lobby" });
    expect(lobby.join("\n")).toContain("pick");
    expect(lobby.join("\n")).not.toContain("teleport");
    // Nothing becomes unfindable: the tail says how many and how to see them.
    expect(lobby.at(-1)).toMatch(/more/);
    expect(lobby.at(-1)).toContain("help all");
  });

  it("shows everything when asked, marking what does not apply", () => {
    const all = helpLines(null, { testmode: false, stage: "lobby", all: true });
    expect(commandRows(all)).toHaveLength(COMMANDS.length);
    expect(all.join("\n")).toContain("teleport");
    // Marked, so the list still says which of them you could type now.
    expect(all.filter((line) => line.startsWith("·")).length).toBeGreaterThan(10);
    expect(all.some((line) => line.startsWith(" ") && line.includes("pick"))).toBe(true);
  });

  /**
   * Being stopped is the moment the shape is worth seeing.
   *
   * These were written by hand and about half remembered the usage, so `card`
   * taught you how to type it and `kick` did not, for no reason anybody chose.
   */
  it("shows the shape whenever something is missing", () => {
    for (const [line, shape] of [
      ["kick", "kick <player>"],
      ["host", "host <player>"],
      ["seat 3", "seat <player> <seat>"],
      ["rename", "rename <player> as <name>"],
      ["card", "card <name>"],
      ["gold", "gold +5|=12 [player] [force]"],
      ["move", "move <field>"],
      ["teleport", "teleport <field>"],
      // `deal` is not here: naming nothing is a request for the list rather
      // than a line with something missing, and an unknown name gets the real
      // answer instead of the shape — see the test below.
      ["remove", "remove <character> [hard]"],
    ] as const) {
      expect(err(line), line).toContain(shape);
    }
  });

  it("does not bury a real answer under the usage", () => {
    // An ambiguous name already carries the candidates, which is the useful
    // half; the shape would be noise on top of it.
    expect(err("deal krysz")).toBe("Which one — KRYSZTAŁ LOSU, KRYSZTAŁ MAGÓW?");
    // A name nothing answers to is a wrong answer, not a missing one.
    expect(err("deal Narnia")).toBe("No card called `Narnia`.");
  });

  it("takes `all` as a word about the list rather than a command name", () => {
    expect(parseCommand("help all")).toEqual({ ok: { kind: "help", about: "all" } });
    expect(parseCommand("help nonsense")).toHaveProperty("error");
  });

  it("explains a command it did not list", () => {
    // The whole point of counting rather than hiding: the word still works.
    const said = helpLines("settle", { testmode: false, stage: "lobby" }).join(" ");
    expect(said).toContain("settle the fight");
    expect(said).toMatch(/locked/);
  });

  it("explains why one is locked when asked about it", () => {
    expect(helpLines("kill", { testmode: false }).join(" ")).toMatch(/locked/);
    expect(helpLines("kill", { testmode: true }).join(" ")).not.toMatch(/locked/);
  });
});

/** A stand-in for each placeholder a usage line uses, so every line can be typed. */
/**
 * A printed usage line, typed back in.
 *
 * Optional parts come off as whole groups — `[at field]` is two words and one
 * option, and dropping tokens that merely *start* with a bracket left `obszar]`
 * behind, which is how `clear [TARGOWISKO] [at Karczma]` came to fail this
 * check and had to be written round rather than fixed.
 *
 * What is left is the required part, with each `<placeholder>` swapped for
 * something real. That is the whole point of the check: `help` prints these and
 * a player types them back, so a line that cannot be typed is a line that lies.
 */
function usageAsTyped(usage: string): string {
  /**
   * Innermost brackets first, and repeatedly.
   *
   * One pass of `\[[^\]]*\]` reads `[gold [N]|card]` as `[gold [N]` and leaves
   * `|card]` standing, which the parser then goes looking for a card called. It
   * also quietly took the teeth out of this whole check for `take`, whose
   * `<gold [N]|card>` came out as the string `<gold |card>` — a thing `take`
   * accepts as a card name, so a usage line that could not be typed passed the
   * test that exists to say it can.
   */
  let said = usage;
  for (let was = ""; was !== said; ) {
    was = said;
    said = said.replace(/\[[^[\]]*\]/g, " ");
  }
  return said
    // What an optional left behind inside a placeholder: `<gold [N]|card>`
    // becomes `<gold |card>`, and the space is not part of the name.
    .replace(/<([^>]*)>/g, (_, inner: string) => `<${inner.replace(/\s+/g, "")}>`)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => EXAMPLE[word] ?? word)
    .join(" ");
}

const EXAMPLE: Record<string, string> = {
  "<player>": "Ola",
  // The engine's own words, each standing in for something the box holds. The
  // placeholders are English because the vocabulary is the app's; only what is
  // printed on a Karta or an Obszar is Polish.
  "<card>": "MIECZ",
  "<field>": "Karczma",
  "<spell>": "BŁYSKAWICA",
  "<character>": "MAGOG",
  // Serves `card <name>`, which wants a real one, and `rename … as <name>`,
  // which takes anything.
  "<name>": "MAGOG",
  "<seat>": "3",
  // Two verbs whose one argument is a Karta or the money. The Karta stands
  // in, since the money form has its own worked lines just below.
  "<gold|card>": "MIECZ",
  "won|lost|draw": "won",
  "won|lost": "won",
  "<command>": "help",
  "+5|=12": "+5",
  "3": "3",
  "3|MAGOG": "MAGOG",
  "good|evil|chaotic": "good",
  "fog|frozen|barred": "fog",
  "MAGICZNY": "MAGICZNY",
  "HEŁM": "HEŁM",
  "BŁYSKAWICA": "BŁYSKAWICA",
  "2": "2",
  "KRYSZTAŁ": "KRYSZTAŁ",
  LOSU: "LOSU",
  "MIECZ": "MIECZ",
  Karczma: "Karczma",
  at: "at",
  as: "as",
  Ola: "Ola",
  WILKOŁAK: "WILKOŁAK",
  MAGOG: "MAGOG",
};

suite("help", () => {
  it("explains one command when asked about one", () => {
    expect(ok("help place")).toEqual({ kind: "help", about: "place" });
    // By any of its names, since the one you would ask about is the one you
    // just typed and got wrong.
    expect(ok("help put")).toEqual({ kind: "help", about: "put" });
    expect(helpLines("put")).toEqual([
      "place [gold N|card] [at field]",
      "leave loose Złoto or a card on an Obszar, the one you stand on unless named — bare, the catalogue",
      "also: put",
    ]);
  });

  it("leaves out the `also` line for a command with no other names", () => {
    expect(helpLines("endfight")).toEqual([
      "endfight",
      "drop the fight without settling it",
    ]);
  });

  /**
   * A bare number is a count of Miecze, not a card — no Karta is called "2",
   * and knowing how much Miecz you are short is the thing a player knows.
   */
  it("reads a number after `trade` as how many Miecze to buy", () => {
    expect(ok("trade 2")).toEqual({ kind: "trade", cards: [], swords: 2 });
    expect(ok("trade CYKLOP, NOBBIN")).toEqual({
      kind: "trade",
      cards: ["CYKLOP", "NOBBIN"],
      swords: null,
    });
    expect(err("trade 0")).toMatch(/at least one/);
  });

  it("says there is no such command rather than explaining nothing", () => {
    expect(err("help przenies")).toMatch(/No command `przenies`/);
  });

  it("explains every command it lists", () => {
    for (const spec of COMMANDS) {
      for (const word of [spec.name, ...spec.aliases]) {
        const lines = helpLines(word);
        expect(lines[0], word).toBe(spec.usage);
        expect(lines[1], word).toBe(spec.summary);
      }
    }
  });

  it("lists every command it knows", () => {
    expect(commandRows(helpLines())).toHaveLength(COMMANDS.length);
  });

  /**
   * Fifty-nine in one column is a list nobody reads twice, so `help` groups
   * them — and a heading over nothing is the same burying, one level up.
   */
  it("puts every command under a heading, and prints no empty ones", () => {
    const lines = helpLines(null, { testmode: true, stage: "lobby" });
    const titles = GROUPS.map((one) => one.title);
    const headings = lines.filter((line) => titles.includes(line));
    expect(headings.length).toBeGreaterThan(0);
    // Something under each one.
    for (const title of headings) {
      expect(lines[lines.indexOf(title) + 1], title).toMatch(/^[ \u00b7]\S/);
    }
    // In the declared order, and never twice.
    expect(headings).toEqual(titles.filter((one) => headings.includes(one)));
  });

  it("gives every command a group that exists", () => {
    const ids = GROUPS.map((one) => one.id);
    for (const spec of COMMANDS) expect(ids, spec.name).toContain(spec.group);
  });

  it("gives every command a usage and a summary", () => {
    for (const spec of COMMANDS) {
      expect(spec.usage.length).toBeGreaterThan(0);
      expect(spec.summary.length).toBeGreaterThan(0);
    }
  });

  it("lists nothing it cannot then read", () => {
    // The usage line starts with the word you type, so `help` cannot advertise
    // a command the parser does not have.
    for (const spec of COMMANDS) {
      const verb = spec.usage.split(/\s+/)[0];
      const parsed = parseCommand(verb);
      const refused = "error" in parsed ? parsed.error : "";
      expect(refused).not.toMatch(/No command/);
    }
  });

  it("reads nothing it does not advertise", () => {
    // Not a sample: the parser refuses anything outside the printed list before
    // it looks at it, so `help` is the whole vocabulary by construction.
    const printed = new Set(COMMANDS.flatMap((spec) => [spec.name, ...spec.aliases]));
    // `teleport` was on this list until it became a command, which is the
    // hazard of naming the words nobody types.
    for (const word of ["miecz", "magia", "win", "lose", "grant", "walcz", "przenies"]) {
      expect(printed.has(word), word).toBe(false);
      expect(err(word)).toMatch(/No command/);
    }
  });

  it("reads every alias it advertises", () => {
    for (const spec of COMMANDS) {
      for (const alias of spec.aliases) {
        const parsed = parseCommand(alias);
        const refused = "error" in parsed ? parsed.error : "";
        expect(refused, alias).not.toMatch(/No command/);
      }
    }
  });

  it("carries out everything it lists, rather than shrugging at it", () => {
    for (const spec of COMMANDS) {
      for (const word of [spec.name, ...spec.aliases]) {
        const parsed = parseCommand(word);
        const refused = "error" in parsed ? parsed.error : "";
        expect(refused, word).not.toMatch(/does nothing yet/);
      }
    }
  });
});

suite("finishing a half-typed line", () => {
  const tab = (line: string) => complete(line, ["Michał", "Ola"]);

  it("finishes a command and leaves room for its argument", () => {
    expect(tab("gu")).toEqual({ line: "guardian ", options: [] });
    expect(tab("endf")).toEqual({ line: "endfight ", options: [] });
  });

  it("keeps the slash somebody typed", () => {
    expect(tab("/gu").line).toBe("/guardian ");
  });

  it("goes as far as the candidates agree, and lists them", () => {
    // get, gold and guardian all start here, so there is nothing to add.
    expect(tab("g")).toEqual({ line: "g", options: ["get", "gold", "guardian"] });
    // `deal` also hands back the same hits under their headings, which a
    // terminal ignores and the browser console draws.
    expect(tab("deal krysz")).toMatchObject({
      line: "deal KRYSZTAŁ ",
      options: ["KRYSZTAŁ LOSU", "KRYSZTAŁ MAGÓW"],
    });
  });

  it("finishes a name without a Polish keyboard, in the case it is printed in", () => {
    expect(tab("teleport kar")).toEqual({ line: "teleport Karczma ", options: [] });
    expect(tab("deal swiety g")).toEqual({ line: "deal ŚWIĘTY GRAAL ", options: [] });
  });

  it("completes a card from any word of its name", () => {
    expect(tab("deal magiczny mie").line).toBe("deal MAGICZNY MIECZ ");
  });

  it("offers cards before the `at` and Obszary after it", () => {
    expect(tab("place magiczny mie").line).toBe("place MAGICZNY MIECZ ");
    expect(tab("place MIECZ at kar").line).toBe("place MIECZ at Karczma ");
    // The half being typed decides the list, so a field name never turns up
    // where a card goes.
    expect(tab("put kar").options).toEqual([]);
  });

  it("finishes a Natura, then who it belongs to", () => {
    expect(tab("nature ev").line).toBe("nature evil ");
    expect(tab("nature evil o").line).toBe("nature evil Ola ");
  });

  it("finishes an effect, then who it is on", () => {
    expect(tab("effect fr").line).toBe("effect frozen ");
    expect(tab("effect fog o").line).toBe("effect fog Ola ");
    expect(tab("stone o").line).toBe("stone Ola ");
  });

  it("offers Postacie to the commands that name one", () => {
    // MAG and MAGOG are both at the table's disposal, so this is the shell's
    // answer: as far as they agree, and the list.
    expect(tab("pick mag")).toEqual({ line: "pick MAG", options: ["MAG", "MAGOG"] });
    expect(tab("pick mago").line).toBe("pick MAGOG ");
    expect(tab("remove mago").line).toBe("remove MAGOG ");
    expect(tab("revive mago").line).toBe("revive MAGOG ");
  });

  /** Every class, and the Wrogowie among them — `deal` took `summon`'s job. */
  it("offers a Wróg alongside everything else", () => {
    expect(tab("deal wilko").line).toBe("deal WILKOŁAK ");
    expect(tab("deal magiczny mie").line).toBe("deal MAGICZNY MIECZ ");
  });

  it("completes a player where a player goes, and after the amount", () => {
    expect(tab("kill o").line).toBe("kill Ola ");
    expect(tab("gold +5 o").line).toBe("gold +5 Ola ");
  });

  it("leaves a line it cannot finish exactly as it was", () => {
    expect(tab("xyz")).toEqual({ line: "xyz", options: [] });
    expect(tab("teleport Narnia")).toEqual({ line: "teleport Narnia", options: [] });
  });

  it("finishes a command name after `help`", () => {
    expect(tab("help pl").line).toBe("help place ");
    expect(tab("help end")).toEqual({
      line: "help end",
      options: ["endcast", "endfight", "endgame", "endturn"],
    });
  });

  it("takes nothing where nothing goes", () => {
    expect(tab("roll ").options).toEqual([]);
  });

  /**
   * What there is to do to a turn, offered the moment the noun is typed —
   * `force` above all, which is a word you reach for at a console that has
   * just refused you, and that is the worst moment to be remembering one.
   */
  it("offers the acts a turn takes, and `force` after the one that refuses", () => {
    expect(tab("turn ").options).toEqual(["end", "Michał", "Ola", "reset"]);
    expect(tab("turn re").line).toBe("turn reset ");
    expect(tab("turn end ").line).toBe("turn end force ");
    expect(tab("pass ").options).toContain("reset");
    // Outside test mode there is one act, and Tab does not teach the others.
    expect(complete("turn ", [], { testmode: false }).line).toBe("turn end ");
  });
});

/* ---------------------------------------------------------------------------
 * Every command, once each.
 * ------------------------------------------------------------------------ */

/**
 * One worked line per command, checked against `COMMANDS` so it cannot fall
 * behind.
 *
 * The tests above cover each command where it is interesting — what `place`
 * does without an `at`, which Natury there are, what an ambiguous card name
 * answers. This is the flat sweep underneath them: every word `help` prints,
 * typed the way it is printed, read once and compared to exactly what it should
 * become. A command added without a line here fails the first test in the
 * suite, which is the only way a list like this stays true.
 */
const USAGE: Record<string, { line: string; becomes: unknown }> = {
  help: { line: "help", becomes: { kind: "help", about: null } },
  rule: { line: "rule 5.3", becomes: { kind: "rule", about: "5.3" } },
  ready: { line: "ready", becomes: { kind: "ready", who: null, ready: true } },
  start: { line: "start", becomes: { kind: "start" } },
  roll: { line: "roll", becomes: { kind: "roll" } },
  answer: { line: "answer 2", becomes: { kind: "answer", card: null, choices: [2] } },
  card: { line: "card MAGOG", becomes: { kind: "card", name: "MAGOG" } },
  fight: { line: "fight", becomes: { kind: "fight", cardId: null } },
  take: { line: "take MAGICZNY MIECZ", becomes: { kind: "take", name: "MAGICZNY MIECZ" } },
  beast: { line: "beast", becomes: { kind: "beast" } },
  buy: { line: "buy MIECZ", becomes: { kind: "buy", name: "MIECZ" } },
  sell: { line: "sell MIECZ", becomes: { kind: "sell", name: "MIECZ" } },
  heal: { line: "heal", becomes: { kind: "heal", points: null } },
  trade: { line: "trade", becomes: { kind: "trade", cards: [], swords: null } },
  // 17.9: bare is the Życie, which is what the app always took.
  spoils: { line: "spoils", becomes: { kind: "spoils", take: "zycie", card: null } },
  trophies: { line: "trophies points", becomes: { kind: "trophies", mode: "points" } },
  cast: {
    line: "cast BŁYSKAWICA",
    becomes: { kind: "cast", name: "BŁYSKAWICA", who: null, to: null },
  },
  bridge: { line: "bridge", becomes: { kind: "bridge" } },
  cross: { line: "cross", becomes: { kind: "cross", to: null } },
  guardian: { line: "guardian", becomes: { kind: "guardian" } },
  ferry: { line: "ferry", becomes: { kind: "ferry", pay: false } },
  drop: { line: "drop MAGICZNY MIECZ", becomes: { kind: "putdown", name: "MAGICZNY MIECZ" } },
  equip: { line: "equip HEŁM", becomes: { kind: "equip", name: "HEŁM", slot: null } },
  use: { line: "use KRYSZTAŁ LOSU", becomes: { kind: "use", name: "KRYSZTAŁ LOSU" } },
  escape: { line: "escape", becomes: { kind: "escape" } },
  attack: { line: "attack Ola", becomes: { kind: "attack", who: "Ola" } },
  raid: { line: "raid Ola", becomes: { kind: "raid", who: "Ola" } },
  pay: { line: "pay", becomes: { kind: "pay" } },
  ask: { line: "ask", becomes: { kind: "ask" } },
  free: { line: "free", becomes: { kind: "free" } },
  claim: { line: "claim", becomes: { kind: "claim" } },
  move: { line: "move Karczma", becomes: { kind: "move", fieldId: "karczma" } },
  draw: { line: "draw", becomes: { kind: "draw" } },
  look: { line: "look", becomes: { kind: "look" } },
  me: { line: "me", becomes: { kind: "me", who: null } },
  gold: { line: "gold +5 Ola", becomes: { kind: "stat", stat: "gold", delta: 5, set: null, who: "Ola", force: false } },
  kill: { line: "kill Ola", becomes: { kind: "kill", who: "Ola" } },
  kick: { line: "kick Ola", becomes: { kind: "kick", who: "Ola" } },
  who: { line: "who", becomes: { kind: "who" } },
  seat: { line: "seat Ola 3", becomes: { kind: "seat", who: "Ola", seat: 3 } },
  unseat: { line: "unseat Ola", becomes: { kind: "unseat", who: "Ola" } },
  leave: { line: "leave", becomes: { kind: "leave" } },
  rename: { line: "rename Ola as Basia", becomes: { kind: "rename", who: "Ola", name: "Basia" } },
  host: { line: "host Ola", becomes: { kind: "host", who: "Ola" } },
  pick: { line: "pick MAGOG 3", becomes: { kind: "pick", characterId: "magog", seat: 3 } },
  remove: {
    line: "remove 3",
    becomes: { kind: "remove", seat: 3, characterId: null, hard: false },
  },
  revive: { line: "revive MAGOG", becomes: { kind: "revive", seat: null, characterId: "magog" } },
  nature: {
    line: "nature evil Ola",
    becomes: { kind: "nature", nature: "evil", who: "Ola", force: false },
  },
  turn: { line: "turn", becomes: { kind: "turn", act: "end", force: false } },
  stone: { line: "stone Ola", becomes: { kind: "stone", who: "Ola", stone: true } },
  effect: {
    line: "effect fog Ola",
    becomes: { kind: "effect", effect: "fog", who: "Ola" },
  },
  deal: { line: "deal MAGICZNY MIECZ", becomes: { kind: "deal", cardIds: ["magiczny-miecz"] } },
  place: {
    line: "place MIECZ at Karczma",
    becomes: { kind: "place", cardId: "miecz", gold: null, fieldId: "karczma" },
  },
  teleport: { line: "teleport Karczma", becomes: { kind: "teleport", fieldId: "karczma" } },
  settle: { line: "settle won", becomes: { kind: "settle", outcome: "wygrana" } },
  endgame: { line: "endgame won", becomes: { kind: "endgame", won: true } },
  stack: {
    line: "stack WILKOŁAK",
    becomes: { kind: "stack", cardId: "wilkolak", pile: null, at: null },
  },
  pile: { line: "pile events", becomes: { kind: "pile", pile: "events" } },
  clear: {
    line: "clear Karczma",
    becomes: { kind: "clear", fieldId: "karczma", cardId: null, gold: null },
  },
  endcast: { line: "endcast", becomes: { kind: "endcast" } },
  endfight: { line: "endfight", becomes: { kind: "endfight" } },
  spell: { line: "spell Ola", becomes: { kind: "spell", who: "Ola", wand: false } },
};

suite("people and Postacie are addressed differently", () => {
  it("reads a bare number on the end of `seat` as the seat", () => {
    expect(ok("seat Ola 3")).toEqual({ kind: "seat", who: "Ola", seat: 3 });
    // No name here begins with a digit, so the line tells itself apart without
    // a keyword between the two arguments.
    expect(ok("seat Anna Maria 2")).toEqual({ kind: "seat", who: "Anna Maria", seat: 2 });
  });

  it("wants to know which seat", () => {
    expect(err("seat Ola")).toMatch(/Into which seat/);
    // Being stopped is the moment the shape is worth seeing, so every
    // missing-argument answer carries the usage.
    expect(err("seat 3")).toBe("Seat whom? seat <player> <seat>");
  });

  it("means me when `unseat` is given nobody", () => {
    expect(ok("unseat")).toEqual({ kind: "unseat", who: null });
  });

  /**
   * Every other `[player]` command means you when you leave it off, which is
   * right when the worst case is a Życie you can put back. `kick` puts somebody
   * out of the table, and a bare one reading as "kick me" is a way to lose your
   * own seat to a fumbled line.
   */
  it("refuses a bare kick rather than reading it as `kick me`", () => {
    expect(err("kick")).toBe("Kick whom? kick <player>");
  });

  it("splits a rename on `as`, like `place` splits on `at`", () => {
    expect(ok("rename Ola as Basia")).toEqual({ kind: "rename", who: "Ola", name: "Basia" });
    expect(err("rename Ola")).toMatch(/Rename them to what/);
  });

  it("finishes a player's name like the other commands that take one", () => {
    expect(complete("kick O", ["Ola", "Michał"]).line).toBe("kick Ola ");
    expect(complete("unseat O", ["Ola", "Michał"]).line).toBe("unseat Ola ");
  });
});

suite("a Postać into a seat, and out of one", () => {
  it("takes the Postać, the seat, both or neither", () => {
    expect(ok("pick MAGOG 3")).toEqual({ kind: "pick", characterId: "magog", seat: 3 });
    expect(ok("pick MAGOG")).toEqual({ kind: "pick", characterId: "magog", seat: null });
    // Nothing named at all is 4.4's own case: a Postać drawn, into your seat.
    expect(ok("pick")).toEqual({ kind: "pick", characterId: null, seat: null });
    expect(ok("pick 3")).toEqual({ kind: "pick", characterId: null, seat: 3 });
  });

  it("removes by seat or by name, and only a name reaches the dead", () => {
    expect(ok("remove 3")).toEqual({ kind: "remove", seat: 3, characterId: null, hard: false });
    expect(ok("remove MAGOG")).toEqual({
      kind: "remove",
      seat: null,
      characterId: "magog",
      hard: false,
    });
  });

  it("takes `hard` last, the way a stat takes `force`", () => {
    expect(ok("remove MAGOG hard")).toMatchObject({ characterId: "magog", hard: true });
    expect(ok("erase 3 hard")).toMatchObject({ kind: "remove", seat: 3, hard: true });
  });

  it("refuses `hard` on a revival, which is not a removal", () => {
    expect(err("revive MAGOG hard")).toMatch(/removal's word/);
  });

  it("says so when nothing is named", () => {
    expect(err("remove")).toMatch(/Which Postać/);
    expect(err("revive")).toMatch(/Which Postać/);
  });

  it("finishes a Postać's name", () => {
    expect(complete("remove MAGO", []).line).toBe("remove MAGOG ");
  });
});

suite("what the console asks about first", () => {
  /**
   * Confirm what no other command can undo. A question asked once is read; one
   * asked every third line is dismissed, and a console full of those protects
   * nothing.
   */
  it("asks before scattering a hand of Karty nothing can gather back", () => {
    expect(needsConfirming(ok("remove 3"))).toBe(true);
    expect(needsConfirming(ok("remove 3 hard"))).toBe(true);
    expect(needsConfirming(ok("kill Ola"))).toBe(true);
  });

  it("asks before being rude to somebody else, and not before leaving yourself", () => {
    expect(needsConfirming(ok("kick Ola"))).toBe(true);
    expect(needsConfirming(ok("leave"))).toBe(false);
  });

  it("asks in the words of what it would do, not \"are you sure\"", () => {
    // The same question every time is a question nobody reads. These name the
    // thing that goes, so the second they cost buys something.
    expect(confirmationFor(ok("kick Ola"))).toContain("Ola goes from the table");
    expect(confirmationFor(ok("remove 3"))).toContain("seat 3 leaves the game");
    expect(confirmationFor(ok("remove 3 hard"))).toContain("for good");
    expect(confirmationFor(ok("kill Ola"))).toContain("0 Życia");
    // `kill` with nobody named is the commonest way to type it, and the subject
    // still has to agree with the verb: it read "You drops to 0 Życia".
    expect(confirmationFor(ok("kill"))).toContain("Your Postać drops");
    // And every one of them says how to agree, in the same words.
    expect(confirmationFor(ok("kick Ola"))).toContain("`yes`");
  });

  it("has nothing to ask about a line that takes nothing away", () => {
    expect(confirmationFor(ok("unseat Ola"))).toBeNull();
    expect(confirmationFor(ok("leave"))).toBeNull();
    expect(confirmationFor(ok("pick MAGOG"))).toBeNull();
  });

  it("does not ask about what takes nothing away", () => {
    // The Postać stays exactly where it was standing.
    expect(needsConfirming(ok("unseat Ola"))).toBe(false);
    expect(needsConfirming(ok("seat Ola 3"))).toBe(false);
    expect(needsConfirming(ok("pick MAGOG"))).toBe(false);
    expect(needsConfirming(ok("revive MAGOG"))).toBe(false);
  });
});

suite("every command, once each", () => {
  it("has a worked line for every command, and no line for a command that went", () => {
    expect(Object.keys(USAGE).sort()).toEqual(COMMANDS.map((spec) => spec.name).sort());
  });

  for (const { line, becomes } of Object.values(USAGE)) {
    it(`reads \`${line}\``, () => {
      expect(ok(line)).toEqual(becomes);
    });
  }

  /**
   * The usage line is not decoration: what `help` shows has to be typeable.
   *
   * `[player]` comes off, an `a|b|c` becomes its first word, and what is left
   * is a line somebody read off the screen and typed back.
   */
  it("reads back every usage line it prints", () => {
    for (const spec of COMMANDS) {
      // The same reading as `usageAsTyped`, plus `a|b|c` collapsing to its
      // first word — this check is about the shape being typeable at all.
      const typed = usageAsTyped(spec.usage).replace(/(\S*\|\S*)/g, (word) => word.split("|")[0]);
      const parsed = parseCommand(typed);
      expect("ok" in parsed, `${spec.name}: ${typed}`).toBe(true);
    }
  });

  it("reads every alias as the same command as the name it stands for", () => {
    const alias: Record<string, string> = {
      "?": "help",
      sword: "gold",
      put: "place",
      pass: "endturn",
    };
    // Not every alias is a synonym — `sword` names another parameter — so only
    // the ones that are get compared, and the rest are covered above.
    expect(ok("? ")).toEqual(ok("help"));
    expect(ok("put MIECZ")).toEqual(ok("place MIECZ"));
    expect(ok("pass")).toEqual(ok("endturn"));
    // `drop` and `move` were aliases here and are gone on purpose: both words
    // belong to the lawful vocabulary — putting a Przedmiot down, and walking
    // the roll out — and neither can also mean its testmode namesake.
    // `card` was one of these and is a verb now: reading a Karta is the
    // commoner want for that word, and conjuring one is `deal`.
    expect(Object.keys(alias).length).toBe(4);
  });
});

/* ---------------------------------------------------------------------------
 * Saying what a parameter did.
 * ------------------------------------------------------------------------ */

suite("what the console says a parameter did", () => {
  const said = (over: Partial<Parameters<typeof statReply>[0]>) =>
    statReply({ who: "Michał", stat: "magic", asked: -1, moved: -1, now: 2, floor: 3, ...over });

  it("says the change when the whole of it landed", () => {
    expect(said({})).toBe("Michał: magic -1 → 2");
    expect(said({ asked: 2, moved: 2, now: 5 })).toBe("Michał: magic +2 → 5");
  });

  /**
   * The bug this exists for. A Magia at its floor answered "magic -1 → 3",
   * which is the value it ended on and reads exactly like it worked — twice in
   * a row, identically, which is how it was found.
   */
  it("says nothing happened, rather than printing the value it did not change", () => {
    expect(said({ moved: 0, now: 3 })).toBe(
      "Michał: magic stays at 3 — magic cannot go below the 3 this character started with (1.3, 2.3) — say `force` to.",
    );
  });

  it("says how much of it landed when the floor took the rest", () => {
    expect(said({ asked: -5, moved: -2, now: 3 })).toContain("magic -2 → 3, not -5");
  });

  it("does not offer `force` to somebody who already said it", () => {
    expect(said({ moved: 0, now: 0, forced: true })).toBe(
      "Michał: magic stays at 0 — magic cannot go below 0.",
    );
    expect(said({ forced: true })).toBe("Michał: magic -1 → 2 (forced)");
  });

  it("says the same thing about a number under its floor as one sitting on it", () => {
    // Under the floor is `force`'s doing and behaves a shade differently, but
    // what somebody typing needs is the same either way: it did not move, here
    // is the rule, here is the word that gets past it.
    expect(said({ moved: 0, now: 1 })).toBe(
      "Michał: magic stays at 1 — magic cannot go below the 3 this character started with (1.3, 2.3) — say `force` to.",
    );
  });

  it("says the ceiling in its own words, not the floor's", () => {
    expect(said({ asked: 500, moved: 0, now: 999 })).toBe(
      "Michał: magic stays at 999 — magic stops at 999.",
    );
  });

  it("says it for Złoto without quoting a rule about own points", () => {
    expect(said({ stat: "gold", moved: 0, now: 0, floor: 0 })).toBe(
      "Michał: gold stays at 0 — gold cannot go below 0.",
    );
  });
});

/* ---------------------------------------------------------------------------
 * Naming somebody at the table.
 * ------------------------------------------------------------------------ */

suite("which player a `[player]` names", () => {
  const table = [
    { seat: 0, name: "Michał", character: "bledny-rycerz" },
    { seat: 1, name: "Ola", character: "magog" },
    { seat: 2, name: null, character: "goblin" },
    { seat: 3, name: "Kasia", character: null },
  ];
  const at = (who: string) => {
    const hit = pickPlayer(table, who);
    if ("error" in hit) throw new Error(hit.error);
    return hit.at;
  };
  const no = (who: string) => {
    const hit = pickPlayer(table, who);
    if ("at" in hit) throw new Error(`found seat ${hit.at}`);
    return hit.error;
  };

  it("takes the number printed beside the seat, which is one-based", () => {
    expect(at("1")).toBe(0);
    expect(at("4")).toBe(3);
    expect(no("9")).toMatch(/Nobody/);
  });

  it("takes the player's name, in any case and without the Polish letters", () => {
    expect(at("Michał")).toBe(0);
    expect(at("michal")).toBe(0);
    expect(at("ola")).toBe(1);
  });

  it("takes the character's printed name, not the id nobody types", () => {
    // The row holds `bledny-rycerz`; what is on the card, and on the screen, is
    // BŁĘDNY RYCERZ.
    expect(at("BŁĘDNY RYCERZ")).toBe(0);
    expect(at("bledny rycerz")).toBe(0);
    expect(at("MAGOG")).toBe(1);
  });

  it("names a seat that has only one of the two", () => {
    // A seat playing with no player name is found by its character…
    expect(at("goblin")).toBe(2);
    // …and a latecomer with no character yet by their name, which is the seat
    // `revive` exists for.
    expect(at("Kasia")).toBe(3);
  });

  it("asks which, rather than guessing, when a name fits two people", () => {
    const two = [
      { seat: 0, name: "Ola", character: null },
      { seat: 1, name: "Olek", character: null },
    ];
    const hit = pickPlayer(two, "ol");
    expect("error" in hit && hit.error).toMatch(/Which one/);
  });

  it("prefers an exact name over a longer one containing it", () => {
    const two = [
      { seat: 0, name: "Ola", character: null },
      { seat: 1, name: "Olaf", character: null },
    ];
    expect(pickPlayer(two, "Ola")).toEqual({ at: 0 });
  });

  it("says so when nobody is called that", () => {
    expect(no("Gandalf")).toContain("Gandalf");
    expect(no("   ")).toBe("Who?");
  });

  /**
   * The same question asked about *people*, where two things are different: a
   * spectator drives no seat, and everybody has an id.
   */
  it("names somebody by the id off the roster, whole and exact", () => {
    const room = [
      { seat: 0, name: "Michał", character: "bledny-rycerz", id: "a3f9" },
      { seat: null, name: "Ola", character: null, id: "b2k4" },
    ];
    expect(pickPlayer(room, "a3f9")).toEqual({ at: 0 });
    expect(pickPlayer(room, "B2K4")).toEqual({ at: 1 });
    // Four characters with no meaning in them: half of one is a coincidence.
    expect(pickPlayer(room, "b2")).toEqual({ error: "Nobody called `b2` is at this table." });
  });

  it("finds somebody who is only watching, who has no seat to be named by", () => {
    const room = [
      { seat: 0, name: "Michał", character: "bledny-rycerz", id: "a3f9" },
      { seat: null, name: "Kasia", character: null, id: "c5m1" },
    ];
    expect(pickPlayer(room, "Kasia")).toEqual({ at: 1 });
    // And the number still means the chair, not the row: nobody is in seat 2.
    expect(pickPlayer(room, "2")).toEqual({ error: "Nobody called `2` is at this table." });
  });
});
