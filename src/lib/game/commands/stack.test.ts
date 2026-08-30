import { describe, it } from "vitest";

/**
 * The resolution stack's acceptance test — docs/STACK.md, "The acceptance test".
 *
 * Written before the stack exists, as step 0 of that page: ten moments in one
 * turn, each with the stack it should leave behind, each traced to the rule it
 * enforces. Every card in it is in the box. Nothing here runs until step 2
 * lands; until then it is the specification, kept where the build will find it
 * and where it cannot drift from the code without the build saying so.
 *
 * The assertions that matter most, so they are not lost in the moments:
 *
 * - After 3, the field's cards are in 15.2 order *including the one Bartek
 *   drew* — the order is re-derived when a cast frame pops.
 * - After 7, `top().seatId` is Ania's and the frame beneath it is Bartek's —
 *   two seats owing things, both legible without inference.
 * - After 8, the Smok is `fought` this turn (17.4) and still on the field, with
 *   zero heads cut.
 * - After 10, the Smok Celina abandoned is still on Płaskowyż, unfought, with
 *   Grota beside it — a cut drops her frames and keeps the field's cards.
 * - At no point are two `ask` frames on the stack at once.
 */
describe.skip("the resolution stack (docs/STACK.md)", () => {
  // Ania (Barbarzyńca, Miecz 5) is active. Bartek (Mag) holds Odmiana Losu and
  // Krąg Płomieni. Celina (Elf, Zła). Darek.

  it.todo("1. rolls 4 and moves to Płaskowyż Mgieł → [field(plaskowyz, draw 3)]");
  it.todo("2. draws Ścieżka, Smok, Grota, in 15.2 order → [field{drawn:3}]");
  it.todo(
    "3. Bartek casts Odmiana Losu into the draw: Ścieżka out, Koszmar in → cast(B) pops, order re-derived (laws 4, 5)",
  );
  it.todo("4. Koszmar: Ania is not Zła; the card stays and is resolved for the turn (law 1)");
  it.todo("5. Smok cannot be walked past (16.4): [field, loop(smok,3), fight(head 1)] (law 3)");
  it.todo("6. head 1 won → [field, loop{done:1}, fight(head 2)]");
  it.todo(
    "7. Bartek takes the floor, casts Krąg Płomieni → [field, loop, fight, cast(B), ask(A)] — four deep (laws 4, 5)",
  );
  it.todo("8. no Władca Zaklęć: the fight beneath stops, heads reset, Smok is fought this turn → [field{fought}]");
  it.todo("9. Grota is unreachable behind the Smok and settles as a fixture → [field] → [end]");
  it.todo(
    "10. Celina arrives, draws zero (15.1), takes Koszmar's wish: teleport is a cut → [field(chosen, draw 0)] (laws 2, 5)",
  );
  it.todo("never holds two ask frames at once");
});
