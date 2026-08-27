# Przyjaciele in the browser — start here

The engine half is done and committed (`1cda398`). **No rules work is needed** —
the browser reads derived figures, so the cards already arrive through the API.

## What the API already sends (per seat, from `envelope.ts`)

- `sword_total` / `magic_total` — 1.5's "parametr", the number on the Karta
- `sword_in_fight` / `magic_in_fight` — what it becomes when somebody swings
- `fights_for_you` — cardId of the Przyjaciel doing the fighting, or `null`
- `holdings[]` — each with `kind: "spell" | "item" | "friend" | "trophy"`

## Four things worth drawing

1. **Group friends away from gear.** 6.3 makes them unlimited and they never
   count against 5.4's four. The console got this wrong for a while, listing a
   Rycerz inside a "Pack 2/4" he was not one of the two of.
2. **Show both figures.** Own points and the total are different numbers, and
   the fight figure is a third. A Pasterz lending +1/+1 is invisible if you
   print only own points.
3. **Name who is swinging when `fights_for_you` is set.** The Rycerz's 3 and 3
   *replace* the character's own, so for most Postacie the fight number goes
   **down** when he joins. Unexplained, that reads as a bug in your UI.
4. **The `raid` turn action** (Poszukiwacz Przygód): send `targetSeatId` **or**
   `raidFieldCardId`, exactly one. Range 3 Obszary, same ring only. Offer it in
   the `field` phase, after the move.

## The database — nothing owed

A second round went in after the sweep below, for the Przyjaciele who carry a
Zaklęcie: `carried` added to `holdings_kind_check`, a `carried_by text` column
on `holdings`, and `carried-spell` in `moves_kind_check` (61 kinds now, again
generated from `JOURNAL_KINDS` rather than retyped). Applied and read back;
nothing outside `magiczny_miecz` was touched. **The schema is in step with the
code — start drawing.**

## The thing that would have bitten you — done

`moves_kind_check` on the live database has been altered and is back in step
with `JOURNAL_KINDS`. It was staler than one kind: it held 50 and the list holds
60, so `died-for-you`, `paid-friend`, `card-table`, the two `beast-*` and all
six `bridge-*` would each have been refused. It also carried `adjust` and
`arrived`, which the list has dropped and no row used, so the constraint
validated clean. Generated from `journal.ts` rather than retyped, and nothing
outside `magiczny_miecz.moves` was touched — that database is shared with three
other projects, two of which take real payments, so schema-qualify everything
and ask first.

Fuller notes: `docs/TASKS.md` → "Przyjaciele, and what the browser still has to
draw". Card behaviour: `src/lib/engine/abilities.ts`.
