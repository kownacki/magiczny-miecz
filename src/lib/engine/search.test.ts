import { describe, expect, it } from "vitest";
import { fold, matchRank } from "./search";

/**
 * These two are the whole of card identification. The numeral at the top of a
 * card is a Roman numeral for its resolution class, not an id (15.2), so
 * nothing in the box can be named by number and a player finds the card they
 * are holding by typing at it. If the ranking is wrong the card is not there.
 *
 * They had been written out three times — here, the turn panel's copy that
 * this file used to import, and the card library's — which is why the file
 * they belong to already existed and was not the one under test.
 */

describe("folding a Polish name", () => {
  it("takes the accents off the seven that carry them", () => {
    expect(fold("ĄĆĘŃÓŚŹŻ")).toBe("acenoszz");
  });

  it("handles ł, which is not a decorated l and survives NFD untouched", () => {
    // The one letter the Unicode decomposition does nothing for: strip
    // diacritics off "MGŁA" and you still have "mgła", which "mgla" misses.
    expect("MGŁA".toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")).toBe("mgła");
    expect(fold("MGŁA")).toBe("mgla");
  });

  it("folds the capital Ł too, because the sheets print names in capitals", () => {
    expect(fold("ŁÓDŹ")).toBe("lodz");
  });

  it("leaves spaces and punctuation where they are", () => {
    // `matchRank` splits on whitespace afterwards, so folding must not eat it.
    expect(fold("KIJ I SZNUR")).toBe("kij i sznur");
  });

  it("changes nothing about a name that is already folded", () => {
    expect(fold(fold("ŚWIĘTY GRAAL"))).toBe(fold("ŚWIĘTY GRAAL"));
  });
});

describe("ranking a name against what was typed", () => {
  it("puts a name that starts with the query first", () => {
    expect(matchRank("ZARAZA", "zar")).toBe(0);
  });

  it("ranks a mid-word match below a prefix match", () => {
    // The complaint this ranking exists for. Polish stems are shared — "czar-"
    // opens czarownica, czarodziej and czarny — so plain substring matching put
    // SABAT CZAROWNIC and CZARODZIEJ above ZARAZA for "zar", because both
    // contain it in the middle of a word.
    expect(matchRank("SABAT CZAROWNIC", "zar")).toBeGreaterThan(matchRank("ZARAZA", "zar"));
    expect(matchRank("CZARODZIEJ", "zar")).toBeGreaterThan(matchRank("ZARAZA", "zar"));
  });

  it("ranks a later word starting with the query above a mid-word match", () => {
    // Same name, two queries: "czar" opens its second word and "zar" only sits
    // inside it, and the two must not come out equal.
    expect(matchRank("SABAT CZAROWNIC", "czar")).toBe(1);
    expect(matchRank("SABAT CZAROWNIC", "zar")).toBe(2);
  });

  it("keeps the three ranks strictly ordered, best to worst", () => {
    const first = matchRank("KRÓL SZCZURÓW", "krol");
    const later = matchRank("KRÓL SZCZURÓW", "szczur");
    const inside = matchRank("KRÓL SZCZURÓW", "zczur");
    const none = matchRank("KRÓL SZCZURÓW", "qqq");
    expect([first, later, inside, none]).toEqual([0, 1, 2, 3]);
  });

  it("rejects a non-match", () => {
    expect(matchRank("ZARAZA", "qqq")).toBe(3);
  });

  it("ignores diacritics so a Polish keyboard is not required", () => {
    expect(matchRank("ZŁY DUCH", "zly")).toBe(0);
    expect(matchRank("MGŁA", "mgla")).toBe(0);
  });

  it("reads a query that is the whole of a later word as opening that word", () => {
    expect(matchRank("KIJ I SZNUR", "sznur")).toBe(1);
  });

  it("gives two names the same rank when the query does not choose between them", () => {
    // Ranking alone cannot resolve this and must not pretend to: it is
    // `findByName`'s job to notice the tie and say which names it could not
    // choose between, rather than picking whichever the deck happened to list
    // first.
    expect(matchRank("MIECZ", "miecz")).toBe(matchRank("MIECZ CHAOSU", "miecz"));
  });

  it("matches everything at the best rank when nothing has been typed", () => {
    // Every string starts with "", so an empty query is not a filter at all.
    // This is why `findByName` rejects one before it gets here, and the reason
    // is worth a test rather than a comment on the guard.
    expect(matchRank("ZARAZA", "")).toBe(0);
  });

  it("expects the query to arrive already folded", () => {
    // The name is folded here and the query is not, deliberately: `findByName`
    // folds once and then ranks a whole deck against it. Passing raw input
    // straight in finds nothing, which is a caller's bug and not a silent one.
    expect(matchRank("ZARAZA", "ZAR")).toBe(3);
  });
});
