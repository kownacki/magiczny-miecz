import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JOURNAL_KINDS } from "./journal";

/**
 * The database now knows the list too, and the two copies must agree.
 *
 * `moves.kind` carries a CHECK naming all 57, because the reader drops a kind
 * it does not recognise rather than rendering a blank line — the journal is
 * opened to settle arguments, and a line with no sentence settles none. Without
 * the constraint a mistyped kind is a row that goes in happily and never
 * appears again; with it, the write fails where the mistake is.
 *
 * The cost is that a new kind needs a migration. This test is what makes that
 * cost visible at the moment it is incurred, rather than at the table.
 */
describe("the journal's kinds, in both places that hold them", () => {
  const schema = readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf8");

  const inTheDatabase = (() => {
    // `holdings.kind` has a CHECK of its own with the same opening words, so
    // the search starts from the moves table rather than from the first match.
    const table = schema.indexOf("create table if not exists magiczny_miecz.moves");
    const at = schema.indexOf("kind text not null check (kind in (", table);
    const close = schema.indexOf("))", at);
    return [...schema.slice(at, close).matchAll(/'([a-z-]+)'/g)].map((one) => one[1]);
  })();

  it("finds the constraint at all, so this suite cannot pass by checking nothing", () => {
    expect(inTheDatabase.length).toBeGreaterThan(50);
  });

  it("names exactly the kinds the code knows", () => {
    expect([...inTheDatabase].sort()).toEqual([...JOURNAL_KINDS].sort());
  });
});
