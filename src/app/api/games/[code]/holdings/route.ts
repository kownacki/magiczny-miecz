/** The holdings route: every action in `actions/holdings.ts`, open to any seated player. */

import { actions } from "@/app/api/actions";
import { HOLDINGS } from "@/lib/game/actions/holdings";
import { seated } from "@/lib/game/permission";

export const POST = actions("holdings", HOLDINGS, seated);
