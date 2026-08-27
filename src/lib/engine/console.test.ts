import { describe as suite, expect, it } from "vitest";
import {
  COMMANDS,
  complete,
  helpLines,
  confirmationFor,
  needsConfirming,
  parseCommand,
  pickPlayer,
  statReply,
} from "./console";

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
    expect(ok("   ENDTURN   ")).toEqual({ kind: "endturn" });
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
    expect(ok("give MAGICZNY MIECZ")).toMatchObject({ cardId: "magiczny-miecz" });
    expect(ok("go Świątynia Tolimana")).toMatchObject({ fieldId: "swiatynia-tolimana" });
    expect(ok("pick BŁĘDNY RYCERZ")).toMatchObject({ characterId: "bledny-rycerz" });
  });

  it("finds a card by the name printed on it", () => {
    expect(ok("give MAGICZNY MIECZ")).toEqual({ kind: "give", cardId: "magiczny-miecz" });
  });

  it("does not need a Polish keyboard", () => {
    expect(ok("give swiety graal")).toEqual({ kind: "give", cardId: "swiety-graal" });
  });

  it("prefers an exact name over the longer names containing it", () => {
    // MIECZ and MIECZ CHAOSU both exist; typing the whole of one is not
    // ambiguous just because the other starts the same way.
    expect(ok("give miecz")).toEqual({ kind: "give", cardId: "miecz" });
  });

  it("asks which one when a query really does name several", () => {
    // KRYSZTAŁ LOSU and KRYSZTAŁ MAGÓW both start here and neither is what was
    // typed, which is the only case where guessing would be wrong.
    expect(err("give krysz")).toMatch(/Which one/);
    expect(err("give krysz")).toContain("KRYSZTAŁ LOSU");
  });

  it("leaves a card where you stand, or on the Obszar you name", () => {
    expect(ok("place MIECZ")).toEqual({ kind: "place", cardId: "miecz", fieldId: null });
    expect(ok("place MIECZ at Karczma")).toEqual({
      kind: "place",
      cardId: "miecz",
      fieldId: "karczma",
    });
    // `put` and `drop` are the two words somebody reaches for first; `place` is
    // the one the store already uses for putting a character on a field.
    expect(ok("drop MIECZ at Karczma")).toMatchObject({ kind: "place", fieldId: "karczma" });
    expect(ok("put MIECZ")).toMatchObject({ kind: "place", cardId: "miecz" });
  });

  it("names both halves of a place, and complains about the one that is wrong", () => {
    expect(err("place")).toMatch(/Which card/);
    expect(err("place MIECZ at Narnia")).toContain("Narnia");
    expect(err("place nothing at Karczma")).toMatch(/No card/);
  });

  it("reaches the Wyposażenie deck, which is not the Karty Zdarzeń", () => {
    // The card that could once not be asked for at all, because only the event
    // deck was searched.
    expect(ok("give tarcza tolimana")).toMatchObject({ cardId: "tarcza-tolimana" });
    expect(ok("place tarcza tolimana")).toMatchObject({ cardId: "tarcza-tolimana" });
  });

  it("takes a Natura by its English name, and says which three there are", () => {
    expect(ok("nature evil")).toEqual({ kind: "nature", nature: "evil", who: null });
    expect(ok("nature good Ola")).toEqual({ kind: "nature", nature: "good", who: "Ola" });
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
    expect(ok("stone Ola")).toEqual({ kind: "stone", who: "Ola" });
    expect(ok("effect fog")).toEqual({ kind: "effect", effect: "fog", who: null });
    expect(ok("effect barred Ola")).toEqual({ kind: "effect", effect: "barred", who: "Ola" });
    // Closed on purpose: the alternative is a modifier typed as JSON, which is
    // writing cards with no rule behind any of it.
    expect(err("effect haste")).toMatch(/fog, frozen, barred/);
  });

  it("hands the turn to whoever is named", () => {
    expect(ok("turn Ola")).toEqual({ kind: "turn", who: "Ola" });
    expect(ok("turn")).toEqual({ kind: "turn", who: null });
  });

  it("names a Zaklęcie where a hand can hold one, and not where a field cannot", () => {
    // 9.3 keeps a granted spell face down; `grantCard` has always taken one.
    expect(ok("give kamien filozoficzny")).toMatchObject({ cardId: "kamien-filozoficzny" });
    // 9.6 sends a spent spell to the used pile, and none lies on a board.
    expect(err("place kamien filozoficzny")).toMatch(/No card/);
  });

  it("finds an Obszar", () => {
    expect(ok("go Karczma")).toEqual({ kind: "go", fieldId: "karczma" });
  });

  it("fights only a Wróg", () => {
    expect(ok("fight WILKOŁAK")).toEqual({ kind: "fight", cardId: "wilkolak" });
    // A Przedmiot is not a creature, so it is not there to be found.
    expect(err("fight magiczny miecz")).toMatch(/No Wróg/);
  });

  it("asks for the name when none was given", () => {
    expect(err("give")).toMatch(/Which card/);
    expect(err("go")).toMatch(/Which Obszar/);
  });

  it("says when nothing is called that", () => {
    expect(err("go Narnia")).toContain("Narnia");
  });
});

suite("the rest of the vocabulary", () => {
  it("settles a fight three ways", () => {
    expect(ok("winfight")).toEqual({ kind: "settle", outcome: "wygrana" });
    expect(ok("losefight")).toEqual({ kind: "settle", outcome: "przegrana" });
    expect(ok("drawfight")).toEqual({ kind: "settle", outcome: "remis" });
  });

  it("ends the game, which is a different thing from ending a fight", () => {
    expect(ok("wingame")).toEqual({ kind: "endgame", won: true });
    expect(ok("losegame")).toEqual({ kind: "endgame", won: false });
  });

  it("has no bare win or lose to be ambiguous with", () => {
    expect(err("win")).toMatch(/No command/);
    expect(err("lose")).toMatch(/No command/);
  });

  it("kills, draws and ends things", () => {
    expect(ok("kill")).toEqual({ kind: "kill", who: null });
    expect(ok("kill Ola")).toEqual({ kind: "kill", who: "Ola" });
    expect(ok("spell")).toEqual({ kind: "spell", who: null });
    expect(ok("endfight")).toEqual({ kind: "endfight" });
    expect(ok("pass")).toEqual({ kind: "endturn" });
  });
});

suite("help", () => {
  it("explains one command when asked about one", () => {
    expect(ok("help place")).toEqual({ kind: "help", about: "place" });
    // By any of its names, since the one you would ask about is the one you
    // just typed and got wrong.
    expect(ok("help drop")).toEqual({ kind: "help", about: "drop" });
    expect(helpLines("drop")).toEqual([
      "place MIECZ at Karczma",
      "leave a card on an Obszar, the one you stand on unless named",
      "also: put, drop",
    ]);
  });

  it("leaves out the `also` line for a command with no other names", () => {
    expect(helpLines("endfight")).toEqual([
      "endfight",
      "drop the fight without settling it",
    ]);
  });

  it("says there is no such command rather than explaining nothing", () => {
    expect(err("help teleport")).toMatch(/No command `teleport`/);
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
    expect(helpLines()).toHaveLength(COMMANDS.length);
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
    for (const word of ["miecz", "magia", "win", "lose", "grant", "walcz", "teleport"]) {
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
    expect(tab("gi")).toEqual({ line: "give ", options: [] });
    expect(tab("endf")).toEqual({ line: "endfight ", options: [] });
  });

  it("keeps the slash somebody typed", () => {
    expect(tab("/gi").line).toBe("/give ");
  });

  it("goes as far as the candidates agree, and lists them", () => {
    // give, go and gold all start here, so there is nothing to add.
    expect(tab("g")).toEqual({ line: "g", options: ["give", "go", "gold"] });
    expect(tab("give krysz")).toEqual({
      line: "give KRYSZTAŁ ",
      options: ["KRYSZTAŁ LOSU", "KRYSZTAŁ MAGÓW"],
    });
  });

  it("finishes a name without a Polish keyboard, in the case it is printed in", () => {
    expect(tab("go kar")).toEqual({ line: "go Karczma ", options: [] });
    expect(tab("give swiety g")).toEqual({ line: "give ŚWIĘTY GRAAL ", options: [] });
  });

  it("completes a card from any word of its name", () => {
    expect(tab("give magiczny mie").line).toBe("give MAGICZNY MIECZ ");
  });

  it("offers cards before the `at` and Obszary after it", () => {
    expect(tab("place magiczny mie").line).toBe("place MAGICZNY MIECZ ");
    expect(tab("place MIECZ at kar").line).toBe("place MIECZ at Karczma ");
    // The half being typed decides the list, so a field name never turns up
    // where a card goes.
    expect(tab("drop kar").options).toEqual([]);
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

  it("offers only Wrogowie to a fight", () => {
    expect(tab("fight magiczny")).toEqual({ line: "fight magiczny", options: [] });
    expect(tab("fight wilko").line).toBe("fight WILKOŁAK ");
  });

  it("completes a player where a player goes, and after the amount", () => {
    expect(tab("kill o").line).toBe("kill Ola ");
    expect(tab("gold +5 o").line).toBe("gold +5 Ola ");
  });

  it("leaves a line it cannot finish exactly as it was", () => {
    expect(tab("xyz")).toEqual({ line: "xyz", options: [] });
    expect(tab("go Narnia")).toEqual({ line: "go Narnia", options: [] });
  });

  it("finishes a command name after `help`", () => {
    expect(tab("help pl").line).toBe("help place ");
    expect(tab("help end")).toEqual({ line: "help end", options: ["endfight", "endturn"] });
  });

  it("takes nothing where nothing goes", () => {
    expect(tab("endturn ").options).toEqual([]);
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
    becomes: { kind: "nature", nature: "evil", who: "Ola" },
  },
  turn: { line: "turn Ola", becomes: { kind: "turn", who: "Ola" } },
  stone: { line: "stone Ola", becomes: { kind: "stone", who: "Ola" } },
  effect: {
    line: "effect fog Ola",
    becomes: { kind: "effect", effect: "fog", who: "Ola" },
  },
  give: { line: "give MAGICZNY MIECZ", becomes: { kind: "give", cardId: "magiczny-miecz" } },
  place: {
    line: "place MIECZ at Karczma",
    becomes: { kind: "place", cardId: "miecz", fieldId: "karczma" },
  },
  go: { line: "go Karczma", becomes: { kind: "go", fieldId: "karczma" } },
  fight: { line: "fight WILKOŁAK", becomes: { kind: "fight", cardId: "wilkolak" } },
  winfight: { line: "winfight", becomes: { kind: "settle", outcome: "wygrana" } },
  wingame: { line: "wingame", becomes: { kind: "endgame", won: true } },
  endfight: { line: "endfight", becomes: { kind: "endfight" } },
  endturn: { line: "endturn", becomes: { kind: "endturn" } },
  spell: { line: "spell Ola", becomes: { kind: "spell", who: "Ola" } },
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
    expect(err("seat 3")).toBe("Seat whom?");
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
    expect(err("kick")).toBe("Kick whom?");
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
      const typed = spec.usage
        .replace(/\[[^\]]+\]/g, "")
        .replace(/(\S*\|\S*)/g, (word) => word.split("|")[0])
        .trim();
      const parsed = parseCommand(typed);
      expect("ok" in parsed, `${spec.name}: ${typed}`).toBe(true);
    }
  });

  it("reads every alias as the same command as the name it stands for", () => {
    const alias: Record<string, string> = {
      "?": "help",
      sword: "gold",
      card: "give",
      put: "place",
      drop: "place",
      move: "go",
      pass: "endturn",
    };
    // Not every alias is a synonym — losefight and losegame mean the other
    // outcome, and sword names another parameter — so only the ones that are
    // are compared, and the rest are covered above.
    expect(ok("? ")).toEqual(ok("help"));
    expect(ok("card MIECZ")).toEqual(ok("give MIECZ"));
    expect(ok("put MIECZ")).toEqual(ok("place MIECZ"));
    expect(ok("drop MIECZ")).toEqual(ok("place MIECZ"));
    expect(ok("move Karczma")).toEqual(ok("go Karczma"));
    expect(ok("pass")).toEqual(ok("endturn"));
    expect(Object.keys(alias).length).toBe(7);
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
