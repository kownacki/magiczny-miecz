import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { columnsOf as columnsInFile } from "./schemaFile";
import {
  FIELD_CARD_COLUMNS,
  GAME_COLUMNS,
  HOLDING_COLUMNS,
  USER_COLUMNS,
} from "./store";

/**
 * The column lists a read asks for, against the columns that exist.
 *
 * A Supabase read ends in a cast — `(data ?? []) as HoldingRow[]` — which
 * asserts the shape rather than checking it. So a column in the row type and
 * missing from the `select` is invisible from every direction at once: `tsc`
 * is satisfied, the query succeeds, the rows come back, and the field is
 * `undefined` in a place typed `string | null`. Nothing fails until a rule
 * quietly stops working.
 *
 * That is not hypothetical. `carried_by` was added to `holdings` and to
 * `HoldingRow` and not to the select, so every holding in every game arrived
 * without it — and the Zaklęcie a Krzyżowiec or a Gnom walks around with had no
 * bearer. Putting the Przyjaciel down (6.4) left his Karta on the Obszar and
 * his spell in nobody's hands, `ask` could not find who was carrying what, and
 * the console printed an empty name where his should have been.
 *
 * `check-schema.ts` compares the file to the live database and would not have
 * caught it: both agreed the column was there. It is the *reader* that had
 * fallen behind, which is what this holds still.
 */
const SCHEMA = readFileSync("db/schema.sql", "utf8");

/**
 * Columns a read deliberately does not ask for, and why.
 *
 * Every one of them is a decision rather than an omission — which is the whole
 * point of listing them here, where the next person to add a column has to say
 * which of the two theirs is.
 */
const NOT_READ: Record<string, readonly string[]> = {
  /**
   * `started_at` is written when the first die is thrown and read by nobody —
   * it is there for whoever looks at the table in Postgres one day, which is
   * why it is not on `GameRow` either. The other two are the lobby's, read
   * through `recentGames` and its own column list rather than through this one.
   */
  games: ["created_at", "last_played_at", "started_at"],
  /**
   * `claim_token` is the secret that proves a device owns a seat. It is
   * compared against what a caller already holds, inside `verifyActor`, with
   * its own query — it must never be part of a list that anything sends back.
   */
  users: ["game_id", "claim_token"],
  // Which table a row belongs to is the filter, not something to read back;
  // `created_at` is the sort.
  holdings: ["game_id", "created_at"],
  field_cards: ["game_id", "created_at"],
};

describe("what a read asks the database for", () => {
  it.each([
    ["games", GAME_COLUMNS],
    ["users", USER_COLUMNS],
    ["holdings", HOLDING_COLUMNS],
    ["field_cards", FIELD_CARD_COLUMNS],
  ])("%s: every column of the table, or a stated reason", (table, list) => {
    const asked = new Set(list.split(","));
    const skipped = new Set(NOT_READ[table] ?? []);
    for (const column of columnsInFile(SCHEMA, table)) {
      if (skipped.has(column)) continue;
      expect(asked, `${table}.${column} is in db/schema.sql and in no select`).toContain(column);
    }
  });

  it("asks for nothing the table does not have", () => {
    for (const [table, list] of [
      ["games", GAME_COLUMNS],
      ["users", USER_COLUMNS],
      ["holdings", HOLDING_COLUMNS],
      ["field_cards", FIELD_CARD_COLUMNS],
    ] as const) {
      const real = new Set(columnsInFile(SCHEMA, table));
      for (const column of list.split(",")) {
        expect(real, `${table}.${column} is asked for and does not exist`).toContain(column);
      }
    }
  });
});
