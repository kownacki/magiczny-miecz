import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import items from "@/data/items.json";
import type { EventCard, Item } from "@/data/types";
import { bonusOf } from "./cards";
import { bonusFromHoldings } from "./holdings";
import { FIELDS, type FieldId } from "./board";
import {
  ABILITIES,
  abilitiesOf,
  canEscapeAt,
  carryLimit,
  crossingDice,
  tollIsWaived,
  heldAbilities,
  isSpared,
  moveBonusRange,
  opensTheWayTo,
  rollModifier,
  spellsOverLimit,
  skipsRollAt,
  wardThreshold,
  bestShield,
} from "./abilities";

const KNOWN_CARDS = new Set<string>([
  ...(events as EventCard[]).map((card) => card.id),
  ...(items as Item[]).map((item) => item.id),
]);

describe("the ability registry against the real deck", () => {
  it("only describes cards that are actually in the box", () => {
    // A typo in a key is otherwise invisible: the ability simply never fires,
    // and the card goes on working by its printed text as if unencoded.
    for (const cardId of Object.keys(ABILITIES)) {
      expect(KNOWN_CARDS.has(cardId), cardId).toBe(true);
    }
  });

  it("only names fields that exist on the board", () => {
    for (const [cardId, abilities] of Object.entries(ABILITIES)) {
      for (const ability of abilities) {
        const named =
          ability.kind === "bezpieczny" || ability.kind === "ucieczka"
            ? ability.fields
            : ability.kind === "uzdrowienie"
              ? [ability.field]
              : [];
        for (const fieldId of named) {
          expect(FIELDS.get(fieldId), `${cardId} -> ${fieldId}`).toBeDefined();
        }
      }
    }
  });

  it("covers both printed copies of every field named in pairs", () => {
    // Mokradła, Step, Urwisko, Bagna, Ruchome Skały and Rozstajne Drogi each
    // appear twice on the board with suffixed ids. A card that says "on the
    // Bagna" means both of them, and listing only one is the easiest mistake
    // to make here.
    const pairs = [
      ["urwisko-1", "urwisko-2"],
      ["bagna-1", "bagna-2"],
      ["ruchome-skaly-1", "ruchome-skaly-2"],
      ["mokradla-1", "mokradla-2"],
    ];
    for (const [cardId, abilities] of Object.entries(ABILITIES)) {
      for (const ability of abilities) {
        if (ability.kind !== "bezpieczny" && ability.kind !== "ucieczka") continue;
        for (const [a, b] of pairs as [FieldId, FieldId][]) {
          const hasA = ability.fields.includes(a);
          const hasB = ability.fields.includes(b);
          expect(hasA, `${cardId}: names ${a} but not ${b}`).toBe(hasB);
        }
      }
    }
  });
});

describe("what the armour does (Hełm, Tarcza, Zbroja)", () => {
  it("saves on the roll each card prints", () => {
    expect(wardThreshold(abilitiesOf("helm"))).toBe(1);
    expect(wardThreshold(abilitiesOf("tarcza"))).toBe(2);
    expect(wardThreshold(abilitiesOf("zbroja"))).toBe(3);
  });

  it("gives nothing to a character wearing none of it", () => {
    expect(wardThreshold(heldAbilities(["miecz", "sztylet"]))).toBe(0);
  });

  it("takes the kindest threshold rather than stacking rolls", () => {
    // Each text describes one roll, not a sequence, so wearing all three does
    // not mean three chances.
    expect(wardThreshold(heldAbilities(["helm", "tarcza", "zbroja"]))).toBe(3);
  });
});

describe("walking past what a field does to you", () => {
  it("skips the roll where a friend says the roll is skipped", () => {
    const opiekun = abilitiesOf("opiekun");
    expect(skipsRollAt(opiekun, "wieza-przeznaczenia")).toBe(true);
    expect(skipsRollAt(opiekun, "urwisko-2")).toBe(true);
    expect(skipsRollAt(opiekun, "krypta-upiorow")).toBe(false);
  });

  it("keeps the point the Ruchome Skały would take, without skipping a roll", () => {
    // Rękawice spare the Życie; that field has no roll to skip in the first
    // place, and conflating the two would silently skip rolls elsewhere.
    const rekawice = abilitiesOf("rekawice");
    expect(isSpared(rekawice, "ruchome-skaly-1", "zycie")).toBe(true);
    expect(skipsRollAt(rekawice, "ruchome-skaly-1")).toBe(false);
  });

  it("keeps what the Bagna would take", () => {
    expect(isSpared(abilitiesOf("kij-i-sznur"), "bagna-2", "utrata")).toBe(true);
    expect(isSpared(abilitiesOf("kij-i-sznur"), "bagna-2", "zycie")).toBe(false);
  });

  it("lets Elflin and Rusałka slip away where their cards say", () => {
    expect(canEscapeAt(abilitiesOf("elflin"), "kamienny-las")).toBe(true);
    expect(canEscapeAt(abilitiesOf("rusalka"), "las-blednych-ogni")).toBe(true);
    expect(canEscapeAt(abilitiesOf("elflin"), "las-blednych-ogni")).toBe(false);
  });
});

describe("crossings and tolls", () => {
  it("halves the Trzęsawiska for Rusałka", () => {
    expect(crossingDice(abilitiesOf("rusalka"), "trzesawiska", 2)).toBe(1);
  });

  it("leaves everyone else on two dice", () => {
    expect(crossingDice(heldAbilities(["miecz"]), "trzesawiska", 2)).toBe(2);
    // Her help is specific to the Trzęsawiska; the Lodowy Las is a fight.
    expect(crossingDice(abilitiesOf("rusalka"), "lodowy-las", 2)).toBe(2);
  });

  it("waives the ferryman's Sztuka Złota for the Przewoźnik, at both Przeprawy", () => {
    const p = abilitiesOf("przewoznika");
    expect(tollIsWaived(p, "przeprawa-1")).toBe(true);
    expect(tollIsWaived(p, "przeprawa-2")).toBe(true);
    // His help is the ferry, not every toll on the board.
    expect(tollIsWaived(p, "straznik-magicznych-wrot")).toBe(false);
    expect(tollIsWaived(abilitiesOf("rusalka"), "przeprawa-1")).toBe(false);
  });
});

describe("keys to the two places that need one", () => {
  it("opens the Most only with the Magiczny Miecz", () => {
    expect(opensTheWayTo(abilitiesOf("magiczny-miecz"), "most")).toBe(true);
    expect(opensTheWayTo(abilitiesOf("miecz"), "most")).toBe(false);
  });

  it("opens the Zamek Bestii only with the Tarcza Tolimana", () => {
    expect(opensTheWayTo(abilitiesOf("tarcza-tolimana"), "zamek-bestii")).toBe(true);
    expect(opensTheWayTo(abilitiesOf("tarcza"), "zamek-bestii")).toBe(false);
  });
});

describe("carrying and moving", () => {
  it("adds each transport's stated capacity", () => {
    expect(carryLimit(abilitiesOf("kon"), 4)).toBe(12);
    expect(carryLimit(abilitiesOf("magiczna-sakwa"), 4)).toBe(9);
  });

  it("treats only the Zaprzęg as unbounded", () => {
    expect(carryLimit(abilitiesOf("zaprzeg"), 4)).toBe(Infinity);
    expect(carryLimit(heldAbilities(["kon", "zaprzeg"]), 4)).toBe(Infinity);
  });

  it("reports the movement bonus a mount allows", () => {
    expect(moveBonusRange(abilitiesOf("wierzchowiec"))).toEqual({ min: 1, max: 3 });
    expect(moveBonusRange(abilitiesOf("zaprzeg"))).toEqual({ min: 1, max: 1 });
    expect(moveBonusRange(abilitiesOf("miecz"))).toBeNull();
  });
});

describe("the two places a bonus can come from", () => {
  it("counts a card that has both a printed number and an encoded one only once", () => {
    // Excalibur prints 1 in the corner and is encoded as punkty miecz 1. Summing
    // the two sources instead of preferring one would silently make it worth
    // two, and nothing on screen would say so.
    const held = [{ cardId: "excalibur", kind: "item" as const, face: "open" as const }];
    expect(bonusFromHoldings(held, "klasyczny", "parametr")).toEqual({ miecz: 1, magia: 0 });
  });

  it("counts a card whose bonus is only in its text", () => {
    // Srebrna Strzała prints no numbers at all; before it was encoded it added
    // nothing, which was an undercount rather than a safe default.
    const held = [{ cardId: "srebrna-strzala", kind: "item" as const, face: "open" as const }];
    expect(bonusFromHoldings(held, "klasyczny", "parametr")).toEqual({ miecz: 1, magia: 1 });
  });

  it("keeps the encoded value and the printed value in step", () => {
    // Where a card has both, they must agree — otherwise whichever source wins
    // is a coin toss nobody reviewed. This fails loudly if one is edited alone.
    for (const [cardId, abilities] of Object.entries(ABILITIES)) {
      const points = abilities.find((a) => a.kind === "punkty");
      if (!points || points.kind !== "punkty") continue;
      const card = (events as EventCard[]).find((c) => c.id === cardId);
      const printed = card ? bonusOf(card) : null;
      if (!printed) continue;
      expect({ miecz: points.miecz ?? 0, magia: points.magia ?? 0 }, cardId).toEqual(printed);
    }
  });
});

describe("who dies in your place", () => {
  it("lets the Bojowy Rumak take any defeat", () => {
    const rumak = abilitiesOf("bojowy-rumak").find((a) => a.kind === "ginie-zamiast-ciebie");
    expect(rumak).toEqual({ kind: "ginie-zamiast-ciebie" });
  });

  it("limits the Poszukiwacz to the raid he was sent on", () => {
    // "W przypadku porażki ty nie tracisz punktu Życia, ale twój Przyjaciel
    // ginie" — of the raid, not of your own fights.
    // Asserted on the rule itself, not on it being the only rule the card has:
    // the Poszukiwacz also raids with three points of Miecz, and pinning the
    // whole array made adding that look like a regression.
    expect(abilitiesOf("poszukiwacz-przygod")).toContainEqual({
      kind: "ginie-zamiast-ciebie",
      onlyWhenRaiding: true,
    });
  });
});

describe("shifting a die roll", () => {
  it("applies the Talizmany to the kind of fight each names", () => {
    const ognia = abilitiesOf("talizman-ognia");
    expect(rollModifier(ognia, { walka: "zwykla" }).delta).toBe(1);
    // "podczas walki (lecz nie magicznej)" — the parenthesis is the whole point.
    expect(rollModifier(ognia, { walka: "magiczna" }).delta).toBe(0);
    expect(rollModifier(abilitiesOf("talizman-powietrza"), { walka: "magiczna" }).delta).toBe(1);
  });

  it("takes two off the Pułapka it names and nothing off the other", () => {
    const tabliczka = abilitiesOf("gliniana-tabliczka");
    expect(rollModifier(tabliczka, { fieldId: "pulapka" }).delta).toBe(-2);
    expect(rollModifier(tabliczka, { fieldId: "magiczna-pulapka" }).delta).toBe(0);
    expect(rollModifier(abilitiesOf("magiczny-manuskrypt"), { fieldId: "magiczna-pulapka" }).delta).toBe(-2);
  });

  it("keeps the Czarodziejska Kość off the two Pułapki", () => {
    // Its bonus there is a point of Miecza or Magii, not a roll shift, and is
    // deliberately not encoded — so the roll modifier must not leak onto them.
    const kosc = abilitiesOf("czarodziejska-kosc");
    expect(rollModifier(kosc, { fieldId: "cerber" }).delta).toBe(1);
    expect(rollModifier(kosc, { fieldId: "pulapka" }).delta).toBe(0);
    expect(rollModifier(kosc, { fieldId: "magiczna-pulapka" }).delta).toBe(0);
  });

  it("lets the Jabłko's holder choose the sign", () => {
    const jablko = abilitiesOf("jablko-natchnienia");
    const at = rollModifier(jablko, { fieldId: "swiatynia-tolimana" });
    expect(at).toEqual({ delta: 1, dowolnyZnak: true });
  });

  it("adds two modifiers that both apply", () => {
    const both = heldAbilities(["talizman-ognia", "czarodziejska-kosc"]);
    expect(rollModifier(both, { walka: "zwykla", fieldId: "cerber" }).delta).toBe(2);
  });
});

describe("protections that depend on who holds them", () => {
  it("spares the Relikwiarz's holder only where their Natura says", () => {
    const r = abilitiesOf("relikwiarz");
    expect(isSpared(r, "czarci-mlyn", "zycie", "dobra")).toBe(true);
    expect(isSpared(r, "czarci-mlyn", "zycie", "zla")).toBe(false);
    expect(isSpared(r, "studnia-wiecznosci", "zycie", "zla")).toBe(true);
    expect(isSpared(r, "studnia-wiecznosci", "zycie", "dobra")).toBe(false);
    // A Chaotyczna Postać gets nothing from it at either field.
    expect(isSpared(r, "czarci-mlyn", "zycie", "chaotyczna")).toBe(false);
  });

  it("still spares unconditionally where a card sets no condition", () => {
    expect(isSpared(abilitiesOf("rekawice"), "ruchome-skaly-1", "zycie")).toBe(true);
  });
});

describe("carrying more Zaklęcia than Magia allows", () => {
  it("counts the Różdżka and nothing else", () => {
    expect(spellsOverLimit(abilitiesOf("rozdzka-zaklec"))).toBe(1);
    expect(spellsOverLimit(abilitiesOf("pierscien-mocy"))).toBe(0);
  });
});

describe("osłona against the point of Życie (17.4)", () => {
  it("gives nothing when nothing is worn", () => {
    expect(bestShield([])).toBe(0);
  });

  it("takes the widest save rather than adding them up", () => {
    // A Hełm saves on a 1, a Tarcza on 1-2, a Zbroja on 1-3. Wearing all three
    // is one roll against three, not three rolls — the cards each grant "the
    // right to roll", singular, for the same point of Życie.
    expect(bestShield(abilitiesOf("helm"))).toBe(1);
    expect(bestShield(abilitiesOf("tarcza"))).toBe(2);
    expect(bestShield(abilitiesOf("zbroja"))).toBe(3);
    expect(bestShield(heldAbilities(["helm", "tarcza", "zbroja"]))).toBe(3);
    expect(bestShield(heldAbilities(["helm", "tarcza"]))).toBe(2);
  });
});
