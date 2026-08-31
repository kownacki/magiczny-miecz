/** What happens to the stack when a frame finishes: the card beneath carries on, and a fight closes all the way down. */

import { shuffleFor } from "../decks";
import {
  apply,
  merge,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type Snapshot,
} from "../change";
import { continueTopScript } from "./effects";
import { shutFight } from "./fight";
import { topIf, type TurnState } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";

/**
 * Runs the card the closed frame was sitting on, in the same commit.
 *
 * A fight opened by a `walka` step sits above a `script` frame, and closing it
 * reveals a card mid-sentence. The player already pressed the only button
 * there was — the fight's — so the card continues by itself: one call, because
 * one is all it can take. A completion pops the frame; a second `walka` opens
 * the next fight and the top is a fight again; an unanswered question leaves
 * the frame waiting for `answerScript`. None of those wants a second call.
 *
 * This lived in `turnStore.ts` until now, which made it unreachable from the
 * commands it completes: `fight.ts` could close a fight but not finish the
 * card the fight interrupted, so no command test could assert the chain. It
 * reads a Snapshot, calls one command and merges — no read, no mint, no write
 * of the game row — so the store edge was never its place.
 */
export async function resume<T>(
  snapshot: Snapshot,
  done: { writes: Changeset; result: T },
  ports: CommandPorts,
): Promise<{ writes: Changeset; result: T }> {
  const after = apply(snapshot, done.writes);
  if (!topIf(after.game.turn_state, "script")) return done;
  const more = await continueTopScript(
    after,
    { shuffle: shuffleFor(snapshot.game) },
    ports,
  );
  return { writes: merge(done.writes, more.writes), result: done.result };
}

/**
 * The whole of ending a fight: the frame pops, the loop beneath it settles,
 * and the card it interrupted carries on.
 *
 * The three steps were composed by hand at seven sites and no two sites did
 * all three, which is what this exists to stop. Callers that close a fight
 * *inside* a command — `landSpell`, `escape`, `resolveFight` — reach for
 * `shutFight` instead and let their store edge `resume`, because the
 * continuation needs ports and they already have a Changeset in hand.
 */
export async function closeFight(
  snapshot: Snapshot,
  frame: Extract<TurnPhase, { phase: "fight" }>,
  ports: CommandPorts,
  said: Changeset = {},
): Promise<Outcome<void>> {
  const shut: TurnState = shutFight(snapshot.game.turn_state, frame);
  return resume(
    snapshot,
    { writes: merge({ game: { turn_state: shut } }, said), result: undefined },
    ports,
  );
}
