/** The turn route: every action in `actions/turn.ts`, behind `mayAct`. */

import { actions } from "@/app/api/actions";
import { TURN } from "@/lib/game/actions/turn";
import { mayAct } from "@/lib/game/permission";

// Every rule about who may press what, and the four exceptions to "not your
// turn", live in `mayAct`.
export const POST = actions("turn", TURN, mayAct);
