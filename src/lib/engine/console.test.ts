import { describe as suite, expect, it } from "vitest";
import { COMMANDS, complete, helpLines, parseCommand } from "./console";

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

  it("knows the four parameters by their English names", () => {
    expect(ok("sword +1")).toMatchObject({ stat: "miecz" });
    expect(ok("magic +1")).toMatchObject({ stat: "magia" });
    expect(ok("life -1")).toMatchObject({ stat: "zycie" });
    expect(ok("gold +1")).toMatchObject({ stat: "zloto" });
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

  it("reads every alias it advertises", () => {
    for (const spec of COMMANDS) {
      for (const alias of spec.aliases) {
        const parsed = parseCommand(alias);
        const refused = "error" in parsed ? parsed.error : "";
        expect(refused, alias).not.toMatch(/No command/);
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
