import { describe as suite, expect, it } from "vitest";
import { COMMANDS, complete, helpLines, parseCommand, pickPlayer } from "./console";

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
    expect(ok("sword+1")).toEqual({ kind: "stat", stat: "miecz", delta: 1, who: null });
    expect(ok("gold+5 Ola")).toMatchObject({ delta: 5, who: "Ola" });
    expect(ok("gold-2")).toMatchObject({ delta: -2 });
  });

  it("takes the slash a person types out of habit, and without it", () => {
    expect(ok("/help")).toEqual({ kind: "help" });
    expect(ok("help")).toEqual({ kind: "help" });
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
    expect(ok("gold +5")).toEqual({ kind: "stat", stat: "zloto", delta: 5, who: null });
    expect(ok("gold 5")).toEqual({ kind: "stat", stat: "zloto", delta: 5, who: null });
    expect(ok("gold -3")).toEqual({ kind: "stat", stat: "zloto", delta: -3, who: null });
  });

  it("knows the four parameters in both languages", () => {
    expect(ok("sword +1")).toMatchObject({ stat: "miecz" });
    expect(ok("magic +1")).toMatchObject({ stat: "magia" });
    expect(ok("life -1")).toMatchObject({ stat: "zycie" });
    expect(ok("gold +1")).toMatchObject({ stat: "zloto" });
    // The one place this console has any business in Polish: these are the
    // words printed on the card somebody is looking at while they type, and the
    // ± that used to sit under the number is gone in test mode.
    expect(ok("miecz +1")).toMatchObject({ stat: "miecz" });
    expect(ok("magia +1")).toMatchObject({ stat: "magia" });
    expect(ok("zycie -1")).toMatchObject({ stat: "zycie" });
    expect(ok("zloto +1")).toMatchObject({ stat: "zloto" });
  });

  it("takes a player after the amount, and nobody as yourself", () => {
    expect(ok("life -1 Ola")).toMatchObject({ who: "Ola" });
    expect(ok("life -1")).toMatchObject({ who: null });
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
    expect(ok("nature evil")).toEqual({ kind: "nature", nature: "zla", who: null });
    expect(ok("nature good Ola")).toEqual({ kind: "nature", nature: "dobra", who: "Ola" });
    expect(ok("nature chaotic")).toMatchObject({ nature: "chaotyczna" });
    expect(err("nature")).toMatch(/good, evil, chaotic/);
    expect(err("nature zla")).toMatch(/Which Natura/);
  });

  it("revives a seat with a drawn character, or the one named after `as`", () => {
    expect(ok("revive")).toEqual({ kind: "revive", who: null, characterId: null });
    expect(ok("revive Ola")).toEqual({ kind: "revive", who: "Ola", characterId: null });
    expect(ok("revive Ola as MAGOG")).toEqual({
      kind: "revive",
      who: "Ola",
      characterId: "magog",
    });
    expect(ok("revive as magog")).toMatchObject({ who: null, characterId: "magog" });
    expect(err("revive Ola as Gandalf")).toContain("Gandalf");
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
    for (const word of ["win", "lose", "grant", "walcz", "teleport"]) {
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

  it("offers players before the `as` and Postacie after it", () => {
    expect(tab("revive o").line).toBe("revive Ola ");
    // MAG and MAGOG are both at the table's disposal, so this is the shell's
    // answer: as far as they agree, and the list.
    expect(tab("revive Ola as mag")).toEqual({
      line: "revive Ola as MAG",
      options: ["MAG", "MAGOG"],
    });
    expect(tab("revive Ola as mago").line).toBe("revive Ola as MAGOG ");
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
  help: { line: "help", becomes: { kind: "help" } },
  gold: { line: "gold +5 Ola", becomes: { kind: "stat", stat: "zloto", delta: 5, who: "Ola" } },
  kill: { line: "kill Ola", becomes: { kind: "kill", who: "Ola" } },
  revive: {
    line: "revive Ola as MAGOG",
    becomes: { kind: "revive", who: "Ola", characterId: "magog" },
  },
  nature: {
    line: "nature evil Ola",
    becomes: { kind: "nature", nature: "zla", who: "Ola" },
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
});
