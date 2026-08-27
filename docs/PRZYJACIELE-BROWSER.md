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

## One thing that will bite you

`died-for-you` is a new journal kind and the live database's CHECK constraint is
**not** yet altered, so the first time a Giermek or Bojowy Rumak dies for its
owner in a browser game the write is refused. Ask before touching that database:
it is shared with three other projects, two of which take real payments.

Fuller notes: `docs/TASKS.md` → "Przyjaciele, and what the browser still has to
draw". Card behaviour: `src/lib/engine/abilities.ts`.
