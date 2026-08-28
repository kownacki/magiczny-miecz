# Przyjaciele — what is done, and what is left

This page was a handoff for the browser half, and that half is finished. It is
now a statement of where the chapter stands: sixteen of the eighteen cards are
fully encoded, and the two that are not are each waiting on a mechanism the app
does not have rather than on somebody getting round to them.

## Custody, and the four things the browser draws

Chapter 6 itself (6.1–6.4) is done and ✅ in COVERAGE — friends are gained, lie
face up, may be held without limit, and go to the used pile when they die. What
a friend *does* is printed on its own card and lives in `ABILITIES`, not in the
chapter, which is why COVERAGE could mark 6 complete while a Rycerz stood there
being decorative.

All four of the drawing tasks this page used to list are built:

- **Friends are out of the Plecak**, in a section of their own with no
  denominator. 6.3 gives them no limit and `carriedCount` has only ever counted
  `kind === "item"`, so the number over the pack was always right — it was the
  picture that put a Rycerz inside a "2 / 4" he was not one of the two of.
- **`fights_for_you` is named under the rails.** The Rycerz's 3 and 3 *replace*
  the character's own, so for most Postacie the fight figure goes **down** when
  he joins, and unexplained that reads as a bug rather than as the card doing
  what it says.
- **Both figures are shown** — own points and the total are different numbers,
  and the fight figure is a third.
- **The `raid`** (Poszukiwacz Przygód) is offered in the `field` phase, after the
  move: `targetSeatId` **or** `raidFieldCardId`, exactly one; range
  `RAID_RANGE` = 3 by `withinRaid`, same ring only, because a Przeprawa is a
  turn's work that can fail rather than a step. `engine/raid.ts` holds both, so
  the targets the browser offers and the check `sendRaider` refuses against
  cannot come apart.

The ŁOTR is the one Postać barred from friends outright — `mayHaveFriends`, off
his own Karta, which 8.2 puts above 6.3.

## The two that are still `czesciowe`

Sixteen of the eighteen are `pelne`. Four were closed by giving two mechanisms
to the cards that share them — **a friend who charges to join** (NAJEMNIK,
TRAGARZ, CHOCHLIK, `cena-przyjecia`) and **a friend who mends you at one Obszar
or is given up there for gold** (KSIĘŻNICZKA, WŁADCA, `uzdrowienie` +
`oddaj-w`) — and a fifth, the ALCHEMIK, was never a gap: his note described what
`sellHolding` already does, and the Lichwiarz makes the identical irreversible
trade with nothing written against his name.

Two clauses are left, and neither is a card that has been forgotten. Each needs
something the app does not have yet:

| Karta | what is left | what it would take |
| --- | --- | --- |
| CHOCHLIK | at a spell draw, look at the top two Zaklęcia and choose one | a pending decision the player answers, which the spell draw has no shape for — `wybor` exists but belongs to card scripts, and a Zaklęcie draw is not one |
| TRAGARZ | losing him loses the Przedmioty he was carrying | knowing *which* Przedmioty are his. `udzwig` raises the limit by four and nothing records who carries what, so there is no honest answer to which cards go with him |

Both are named on the card in the app, which is what `MANUAL` is for: the table
applies them and knows it is doing so. Guessing at either would be worse than
saying so — the second especially, where the app would have to pick somebody's
cards for them.

## The database owes nothing

`moves_kind_check` matches `JOURNAL_KINDS`, `holdings_kind_check` has `carried`,
and `holdings.carried_by` exists. Each round was generated from the source list
rather than retyped, and named `magiczny_miecz` and nothing else — that database
is shared with three other projects, two of which take real payments, so
schema-qualify everything and ask first. A new journal kind still needs its own
`ALTER`; the note above the list in `db/schema.sql` says so.

Fuller notes: `docs/TASKS.md` → "Przyjaciele". Card behaviour:
`src/lib/engine/abilities.ts`. What each card leaves undone:
`src/lib/engine/coverage.ts`.
