import { describe, expect, it } from "vitest";
import { asFieldId } from "./board";
import { bridgeOptions } from "./turn";

/**
 * "Postać, która wejdzie na Most nie posiadając tej Tarczy, musi ominąć Zamek
 * (potraktować to pole tak, jakby go nie było)."
 *
 * Not a door you decline to open: the square is not there. The Zamek sits dead
 * centre of the nine, so a character without a Tarcza crosses it in whichever
 * direction they were walking — and 10.3's one field per turn means the step
 * lands on the far side rather than costing a turn.
 */
const at = (id: string) => asFieldId(id)!;
const to = (options: ReturnType<typeof bridgeOptions>) => options.map((one) => one.fieldId);

describe("the Zamek, for somebody with no Tarcza", () => {
  it("is a stop for a character carrying one", () => {
    expect(to(bridgeOptions(at("demon-zaglady"), true))).toContain("zamek-bestii");
  });

  it("is stepped over from the near side", () => {
    const options = bridgeOptions(at("demon-zaglady"), false);
    expect(to(options)).toContain("monstrum");
    expect(to(options)).not.toContain("zamek-bestii");
  });

  it("is stepped over from the far side too", () => {
    const options = bridgeOptions(at("monstrum"), false);
    expect(to(options)).toContain("demon-zaglady");
    expect(to(options)).not.toContain("zamek-bestii");
  });

  /** The skipped field is recorded, the way a walk records what it passed. */
  it("says what it walked over", () => {
    const onward = bridgeOptions(at("demon-zaglady"), false).find(
      (one) => one.fieldId === "monstrum",
    );
    expect(onward?.through).toEqual(["zamek-bestii"]);
  });

  it("leaves the rest of the bridge alone", () => {
    expect(to(bridgeOptions(at("pulapka"), false))).toEqual(
      to(bridgeOptions(at("pulapka"), true)),
    );
  });

  /** An entrance has one neighbour, whichever way the Tarcza question goes. */
  it("still gives an entrance only one way on", () => {
    expect(bridgeOptions(at("wejscie-na-most-a"), false)).toHaveLength(1);
  });
});
