import { describe, expect, it } from "vitest";
import { buildDeck, cardRef, discardTo, drawFrom, remaining, shuffleWith } from "./deck";
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
