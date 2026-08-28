# Przyjaciele — what is done, and what is left

This page was a handoff for the browser half, and that half is finished. It is
now a statement of where the chapter stands, which is **not finished**: twelve of
the eighteen cards are fully encoded and six are not.

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

## The six that are still `czesciowe`

Every one of the eighteen now has encoded abilities; none is `brak`. What is
left is the half of six cards that the app names but does not do — `MANUAL` in
`coverage.ts`, printed on the card and applied by the players:

| Karta | what is left to the table |
| --- | --- |
| NAJEMNIK | joining costs 1 Sztuka Złota; unpaid, he stays on the Obszar and waits |
| TRAGARZ | 1 Sz. Z. upkeep, and losing him loses the Przedmioty he was carrying |
| KSIĘŻNICZKA | may be given up at the Zamek for 3 Sztuki Złota |
| WŁADCA | the same at the Twierdza |
| CHOCHLIK | 1 Życie to look at two Zaklęcia and choose |
| ALCHEMIK | the swap is irreversible — the Przedmiot's card goes back on the pile |

Two mechanisms and two one-offs. **A friend with a price** (NAJEMNIK, TRAGARZ)
and **a friend sold at a named place** (KSIĘŻNICZKA, WŁADCA, 3 Sztuki Złota
each) would close four of the six between them; CHOCHLIK stands alone, and
ALCHEMIK's note is a warning rather than a gap.

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
