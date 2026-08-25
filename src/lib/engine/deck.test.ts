import { describe, expect, it } from "vitest";
import {
  buildDeck,
  cardRef,
  discardTo,
  drawFrom,
  remaining,
  removeCopy,
  returningRef,
  shuffleWith,
  type DeckState,
} from "./deck";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";

/** Deterministic "shuffle" that leaves order untouched, so draws are predictable. */
const identity = <T,>(items: readonly T[]): T[] => [...items];
/** Reverses instead, so a recycle is visible in the resulting order. */
const reverse = <T,>(items: readonly T[]): T[] => [...items].reverse();

describe("card references", () => {
  it("identifies a card by its slice, because ids repeat", () => {
    const deck = events as EventCard[];
    const golds = deck.filter((c) => c.name === "1 SZTUKA ZŁOTA");
    expect(golds.length).toBeGreaterThan(1);
    const refs = new Set(golds.map((c) => cardRef(c.source)));
    // Same id, different refs — otherwise discarding one would discard all.
    expect(new Set(golds.map((c) => c.id)).size).toBe(1);
    expect(refs.size).toBe(golds.length);
  });
});

describe("drawing", () => {
  it("takes from the top and leaves the rest", () => {
    const deck = buildDeck(["a", "b", "c"], identity);
    const { deck: after, drawn } = drawFrom(deck, 2, identity);
    expect(drawn).toEqual(["a", "b"]);
    expect(after.draw).toEqual(["c"]);
  });

  it("does nothing for a zero draw", () => {
    const deck = buildDeck(["a"], identity);
    expect(drawFrom(deck, 0, identity).drawn).toEqual([]);
  });

  it("recycles the discard when the draw pile runs dry (9.5)", () => {
    let deck = buildDeck(["a", "b"], identity);
    const first = drawFrom(deck, 2, identity);
    deck = discardTo(first.deck, first.drawn);
    expect(deck.draw).toHaveLength(0);

    const second = drawFrom(deck, 1, reverse);
    expect(second.recycled).toBe(true);
    expect(second.drawn).toEqual(["b"]); // reversed discard puts b on top
    expect(second.deck.discard).toHaveLength(0);
  });

  it("returns what it has rather than throwing when everything is exhausted", () => {
    const deck = buildDeck(["a"], identity);
    const { drawn } = drawFrom(deck, 5, identity);
    expect(drawn).toEqual(["a"]);
  });

  it("never deals a card twice across a full pass of the deck", () => {
    const refs = (events as EventCard[]).map((c) => cardRef(c.source));
    let deck = buildDeck(refs, shuffleWith(Math.random));
    const seen: string[] = [];
    while (deck.draw.length > 0) {
      const { deck: after, drawn } = drawFrom(deck, 3, identity);
      seen.push(...drawn);
      deck = after;
    }
    expect(seen).toHaveLength(refs.length);
    expect(new Set(seen).size).toBe(refs.length);
  });
});

describe("deck composition", () => {
  it("holds every event card", () => {
    const refs = (events as EventCard[]).map((c) => cardRef(c.source));
    expect(remaining(buildDeck(refs, shuffleWith(Math.random)))).toBe(165);
  });

  it("shuffles without losing or inventing cards", () => {
    const refs = (events as EventCard[]).map((c) => cardRef(c.source));
    const deck = buildDeck(refs, shuffleWith(Math.random));
    expect([...deck.draw].sort()).toEqual([...refs].sort());
  });
});

/**
 * The duplicates are not a transcription artefact — the printed sheets are cut
 * up with scissors, and a card appearing four times is the designer making it
 * four times as likely to come up. The deck must preserve that exactly.
 */
describe("duplicate multiplicity is part of the design", () => {
  const cards = events as EventCard[];

  it("puts every printed copy in the deck, not one per distinct card", () => {
    const deck = buildDeck(cards.map((c) => cardRef(c.source)), shuffleWith(Math.random));
    const distinctNames = new Set(cards.map((c) => c.name)).size;
    expect(remaining(deck)).toBe(165);
    expect(remaining(deck)).toBeGreaterThan(distinctNames);
  });

  it("keeps each card's exact count, so draw odds match the printed sheets", () => {
    const counts = new Map<string, number>();
    for (const card of cards) counts.set(card.id, (counts.get(card.id) ?? 0) + 1);

    const deck = buildDeck(cards.map((c) => cardRef(c.source)), shuffleWith(Math.random));
    const dealt = new Map<string, number>();
    for (const ref of deck.draw) {
      const card = cards.find((c) => cardRef(c.source) === ref)!;
      dealt.set(card.id, (dealt.get(card.id) ?? 0) + 1);
    }
    for (const [id, count] of counts) {
      expect(dealt.get(id), `${id} should appear ${count}x`).toBe(count);
    }
  });

  it("has a genuinely commoner card, which is the point", () => {
    const counts = new Map<string, number>();
    for (const card of cards) counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
    const commonest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(commonest[1]).toBeGreaterThan(3);
  });
});

describe("returning a card whose ref was forgotten", () => {
  // A hand stores an id; the piles store refs. `returningRef` is the way back,
  // and the reason the discard cannot be fed with ids: a pile of ids is a pile
  // the draw can never look up again.
  const copies = ["zdarzenia-4#11", "zdarzenia-4#12", "zdarzenia-4#13"];

  it("picks a copy neither pile is already counting", () => {
    const deck: DeckState = { draw: ["zdarzenia-4#11"], discard: ["zdarzenia-4#12"] };
    expect(returningRef(deck, copies)).toBe("zdarzenia-4#13");
  });

  it("refuses to invent a copy the box does not have", () => {
    // Called twice by mistake, the second call finds every copy accounted for
    // and returns null rather than conjuring a fourth Magiczny Miecz.
    const deck: DeckState = { draw: [copies[0]], discard: [copies[1], copies[2]] };
    expect(returningRef(deck, copies)).toBeNull();
  });

  it("survives the round trip a discarded card has to make", () => {
    // The bug this exists for: a spent Zaklęcie used to be pushed onto the
    // pile as its *id*, so the moment 9.5 shuffled the pile back in, the draw
    // came up with a ref nothing could resolve.
    let deck: DeckState = { draw: [], discard: [] };
    const ref = returningRef(deck, copies)!;
    deck = discardTo(deck, [ref]);
    const { drawn, recycled } = drawFrom(deck, 1, (items) => [...items]);
    expect(recycled).toBe(true);
    expect(copies).toContain(drawn[0]);
  });
});

describe("taking a copy out without dealing it", () => {
  const copies = ["zdarzenia-4#11", "zdarzenia-4#12"];

  it("prefers the draw pile, which is where it would have come from", () => {
    const deck: DeckState = { draw: ["x#1", copies[0], "x#2"], discard: [copies[1]] };
    expect(removeCopy(deck, copies)).toEqual({
      draw: ["x#1", "x#2"],
      discard: [copies[1]],
    });
  });

  it("falls back to the used pile", () => {
    const deck: DeckState = { draw: ["x#1"], discard: ["x#2", copies[1]] };
    expect(removeCopy(deck, copies)).toEqual({ draw: ["x#1"], discard: ["x#2"] });
  });

  it("takes exactly one, however many copies are there", () => {
    const deck: DeckState = { draw: [...copies], discard: [] };
    expect(removeCopy(deck, copies)?.draw).toEqual([copies[1]]);
  });

  it("says nothing is left to take when every copy is in play", () => {
    expect(removeCopy({ draw: [], discard: [] }, copies)).toBeNull();
  });

  it("round-trips with returningRef", () => {
    // Granting a card and then discarding it should leave the piles exactly as
    // they were — one copy out, one copy back — rather than losing it or
    // duplicating it, which is what happened either way before.
    const start: DeckState = { draw: [...copies], discard: [] };
    const granted = removeCopy(start, copies)!;
    const back = returningRef(granted, copies)!;
    expect(discardTo(granted, [back])).toEqual({ draw: [copies[1]], discard: [copies[0]] });
  });
});
