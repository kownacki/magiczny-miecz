import { describe, expect, it } from "vitest";
import type { CardId } from "@/data/ids";
import { SCRIPTS } from "@/lib/engine/cardScript";
import { mismatches, playExample } from "./examples";

/**
 * Every Karta's own examples, played.
 *
 * One runner for all of them, so a card is tested by what is written on it
 * rather than by a test file that has to be found beside it — docs/KARTA.md
 * §5. A card with no `examples` is simply not here; `strangers.test.ts` and
 * its siblings still cover what they cover, and move here as their examples
 * do.
 */
describe("what the Karty say about themselves", () => {
  for (const [cardId, script] of Object.entries(SCRIPTS)) {
    const examples = script?.examples;
    if (!examples?.length) continue;
    describe(cardId, () => {
      for (const example of examples) {
        it(example.name, async () => {
          const played = await playExample(cardId as CardId, example);
          expect(mismatches(played, example), played.said.join(" | ")).toEqual([]);
        });
      }
    });
  }
});
