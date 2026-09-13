import { describe, expect, it } from "vitest";
import { COMPOSING_OPS, SCRIPTS, type Effect } from "./cardScript";
import { FIELD_SCRIPTS } from "./fieldScript";
import { everyNode, isSettled, nodeAt } from "./resolve";
import { SPELLS } from "./spells";
import { OPS_IN_ORDER, WORDS, wordOf } from "./words";

/**
 * The vocabulary table against the corpus and against the walk.
 *
 * Most of what `WORDS` promises is held by the compiler — an op without an
 * entry, an entry without an op, a field missing from `params`, a `composes` that
 * disagrees with `COMPOSING_OPS` — so what is left to test is what the table
 * *says* about the cards, and that the readers built on it agree with the
 * walk that writes cursors.
 */

/** Every node of every encoded effect, Zaklęcia and Obszary included. */
function corpus(): Effect[] {
  const roots: Effect[] = [];
  for (const script of Object.values(SCRIPTS)) {
    if (!script) continue;
    roots.push(script.effect);
    if (script.onDraw) roots.push(script.onDraw);
    if (script.onLoss) roots.push(script.onLoss);
  }
  for (const spell of Object.values(SPELLS)) if (spell.stosuje) roots.push(spell.stosuje);
  for (const field of Object.values(FIELD_SCRIPTS)) {
    field?.offers.forEach((offer) => roots.push(offer.effect));
  }
  return roots.flatMap(everyNode);
}

describe("the vocabulary table", () => {
  it("marks exactly the composing ops as shapes", () => {
    const shapes = OPS_IN_ORDER.filter((op) => WORDS[op].composes).sort();
    expect(shapes).toEqual([...COMPOSING_OPS].sort());
  });

  it("uses every word somewhere in the box", () => {
    const used = new Set(corpus().map((node) => node.op));
    const unused = OPS_IN_ORDER.filter((op) => !used.has(op));
    expect(unused, "a word no card speaks is vocabulary nobody needs").toEqual([]);
  });

  it("asks a question only of a node that is not settled", () => {
    for (const node of corpus()) {
      const ask = wordOf(node).asks(node);
      if (ask && ask.kind !== "unsupported") {
        expect(isSettled(node), `${node.op} asks ${ask.kind} yet is settled`).toBe(false);
      }
    }
  });

  it("leaves no unsettled leaf without a question of some kind", () => {
    for (const node of corpus()) {
      if (wordOf(node).composes || isSettled(node)) continue;
      expect(wordOf(node).asks(node), `${node.op} is unsettled and asks nothing`).not.toBeNull();
    }
  });
});

describe("following a cursor into the shapes the old switch did not know", () => {
  it("reaches the prayer a Kapliczka borrows from its Świątynia", () => {
    const prayer = FIELD_SCRIPTS["swiatynia-bogini-nemed"]?.offers[0].effect;
    expect(prayer).toBeDefined();
    const borrowed: Effect = { op: "as-field", fieldId: "swiatynia-bogini-nemed" };
    // The walk pushes `0` for a borrowed table, then the face it rolled.
    expect(nodeAt(borrowed, [0])).toBe(prayer);
    if (prayer?.op === "roll") {
      expect(nodeAt(borrowed, [0, 7])).toBe(prayer.faces[7]);
    }
  });

  it("reaches the riddle's reward by the face that was guessed", () => {
    const riddle: Effect = { op: "guess", prize: { op: "gain-spell", count: 1 } };
    for (const guess of [1, 2, 3, 4, 5, 6]) {
      expect(nodeAt(riddle, [guess])).toBe(riddle.prize);
    }
    expect(nodeAt(riddle, [7])).toBeNull();
  });

  it("still answers null off the edge of the tree", () => {
    const table: Effect = { op: "roll", faces: { 1: { op: "nothing" } } };
    expect(nodeAt(table, [2])).toBeNull();
    expect(nodeAt({ op: "nothing" }, [0])).toBeNull();
  });
});
