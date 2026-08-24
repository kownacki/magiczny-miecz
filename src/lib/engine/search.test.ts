import { describe, expect, it } from "vitest";
import { matchRank } from "@/app/g/[code]/turn-panel";

/**
 * Ranking matters more than matching here. Polish is full of shared stems —
 * "czar-" opens czarownica, czarodziej, czarny — so a plain substring search
 * buries the card the player is actually holding under its relatives.
 */
describe("card name ranking", () => {
  it("puts a name that starts with the query first", () => {
    expect(matchRank("ZARAZA", "zar")).toBe(0);
  });

  it("ranks a mid-word match below a prefix match", () => {
    expect(matchRank("SABAT CZAROWNIC", "zar")).toBeGreaterThan(matchRank("ZARAZA", "zar"));
    expect(matchRank("CZARODZIEJ", "zar")).toBeGreaterThan(matchRank("ZARAZA", "zar"));
  });

  it("ranks a later word starting with the query above a mid-word match", () => {
    // "SABAT CZAROWNIC": no word starts with "czar"? it does — second word.
    expect(matchRank("SABAT CZAROWNIC", "czar")).toBe(1);
    expect(matchRank("SABAT CZAROWNIC", "zar")).toBe(2);
  });

  it("rejects a non-match", () => {
    expect(matchRank("ZARAZA", "qqq")).toBe(3);
  });

  it("ignores diacritics so a Polish keyboard is not required", () => {
    expect(matchRank("ZŁY DUCH", "zly")).toBe(0);
    expect(matchRank("MGŁA", "mgla")).toBe(0);
  });
});
