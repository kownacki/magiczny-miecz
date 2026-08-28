# Trofea — the rule, the variant, and who builds which half

A page for whoever picks up 1.4 next. Three Claude sessions work in this repo at
once, so it also says where the seam is: **the engine and the rules decision are
one job, the seat card is another**, and they meet at one envelope field.

## Where it stands

`dd74cba` fixed the thing that made all of this moot: the trophy machinery was
built and nothing fed it. `tradeTrophies` had counted sevens since it was
written, `killSeat` returned them to the pile, the Bagna could take one — and no
beaten Wróg ever became one, so 1.4's economy was unreachable in an ordinary
game. COVERAGE marked 16.2 ✅ citing `kindForCard`, which only ever answered what
kind a trophy *would* be if something made one.

The same commit settled which foes qualify, and settled it right: only those
with a printed Miecz. 1.4 says it — "z napotkanymi Wrogami (mającymi określony
parametr Miecza)" — and 16.2 says it again, keeping "Karty pokonanych Wrogów
**tego rodzaju**". A Demon is fought magically and carries a Magia, so he is
beaten and gone, and the seven-point arithmetic never has to price a Magia in
Miecze. Ten of the thirty-two Wrogowie are magical, so this was not an edge.

## What the rules actually say

- **1.4** — keep the Karty; **"w dowolnym momencie"** they may be exchanged; 1
  point of Miecz per **7** points of beaten Wrogowie; **"punkty ponad
  wielokrotność 7 są stracone"**; after the exchange the Karta goes to the stos
  zużytych.
- **4.4** — on death, Przedmioty and Przyjaciele stay on the Obszar, Zaklęcia go
  to the used pile, and trophies are **not mentioned**. `killSeat` sends them to
  the pile, which is the only coherent answer: a Wróg card left face up on an
  Obszar is a live enemy again under 16.8, so dropping a beaten Smok on the
  ground would resurrect him.
- **20.x** — petrification strips "Przedmiotów, Przedmiotów Magicznych, Sztuk
  Złota, ani Przyjaciół". Four kinds named and trophies deliberately not among
  them, so a Postać turned to stone keeps them.
- **14.5** — falling off the Most rolls "za każdego ze swoich Przyjaciół lub
  Przedmiotów". Trophies are neither, so a fall never costs one.

Nothing in the box targets a trophy: the Łotr takes a point of Miecz or Magii,
the Awanturnik a Zaklęcie. A trophy is a receipt, not an object — it has exactly
two exits and both lead to the used pile.

## The decision: a second mode, defaulting to the new one

Same shape as the two table settings that already exist, and for the same
reason — the printed rule encodes what cardboard costs rather than a mechanic
anybody chose.

- **„Punkty"** (default) — a beaten Wróg goes straight to the stos zużytych and
  the seat accrues trophy *points*. No cards held.
- **„Karty pokonanych"** — 1.4 as printed, which is what works today.

Ordered variant-first, like `Slotowy/Klasyczny` and `Niewyczerpany/Skończony`;
`endlessStock` already defaults away from 21.2 the same way.

**Why it is mechanical, not cosmetic.** There are 32 Wróg cards among the 165
Kart Zdarzeń, but only **21 of them can ever be held**: since `dd74cba` the ten
magical ones are beaten and gone, never banked. So the hoardable pool is 21 of
165 — an eighth of the deck, worth 75 points in all, which is ten Miecze if one
character somehow beat every tradeable foe in the box. A held trophy is a card
out of circulation and 9.5 reshuffles only the *used* pile, so several players
hoarding beaten foes lock away a large part of the enemy pool — and the table runs short of things to fight exactly when everyone is
finally strong enough to want them. In 1993 the card *is* the counter, with the
number printed on it; an app that tracks numbers perfectly is keeping the
ceremony after removing its reason.

**Constraints, so the variant does not quietly become an easier game:**

- **Points must die with the character.** 4.4 sends trophies to the pile today;
  the variant's points must go the same way. Hoarding has to keep costing
  something, and it does — a lost fight at the Bestia is 2 Życia, and 14.5 can
  put you off the Most on the way.
- Settled in the poczekalnia and refused once the game starts, like `setEqMode`.
- `docs/COVERAGE.md` wants 1.4 as carried-with-a-variant rather than plain ✅.

## The one open question

**In printed mode, does an exchange hand in *all* trophies, or a subset the
player chooses?** `tradeTrophies` cashes everything, reasoning in its comment
that points above a multiple of seven are lost so holding one back is not
allowed. That does not follow from the text: 1.4 says "za każde 7 punktów...
punkty ponad wielokrotność 7 są stracone" and never says you must hand in
everything you hold. Under the subset reading you offer cards summing to exactly
seven and lose nothing.

The values decide whether that is livable, and they are kind to it — **1×2, 2×6,
3×7, 4×1, 5×2, 6×1, 10×2** — so exact sevens are usually easy (3+2+2, 3+3+1).
Under all-in, holding 13 and trading burns 6, which punishes a good run.

**Ruled: the subset.** Michał chose it, and the counter-argument that nearly
carried the day does not survive the values. It ran: if you may pick, then
"punkty ponad wielokrotność 7 są stracone" becomes dead text, because sevens are
always assemblable — and a clause that never bites is one nobody would have
written. But a card cannot be split and the largest is six, so a character
holding a single Cyklop still loses six or waits. The clause bites less often,
not never.

Built in `tradeTrophies`: naming nothing still hands in everything, which is
what a player cashing out is usually after, and naming Karty hands in those. The
console prints the ledger beside the hand — what each is worth, the total, and
what an all-in trade would burn — because a choice you have to do arithmetic for
on paper is a choice the referee is not helping with.

In „Punkty" mode the fork dissolves: convert in multiples of seven, keep the
remainder, no card selection needed anywhere.

## The seam

**Engine half** — the mode, `tradeTrophies` for both paths, the fork above, and
whatever records points in „Punkty" mode.

**Seat-card half** — trophies come out of the Plecak, where they are currently
drawn inside 5.4's four squares even though `carriedCount` has only ever counted
`kind === "item"`; a fold of their own, after PRZYJACIELE; a ledger in its
heading — points held, swords earned, what a trade right now would waste; and
the trade button moved out from under the pack with real numbers in its label.

**Where they meet, and it is the only place they do:** the browser can compute
points itself from `combatValueOf` for „Karty pokonanych", so that mode needs
**no envelope change**. If „Punkty" mode keeps a running total on the seat, name
the field and the seat card will draw it.

## Built — the engine half, and the field the seat card asked for

The variant is in, verified at the terminal rather than only in tests: nine
Nobbiny → 18 pkt → `trade` → 2 Miecze and 4 points left standing, and `kill`
takes the score to zero.

- **`games.trophy_mode`** — `'punkty'` (default) or `'karty'`. Read it through
  `trophyModeOf` in `commands/seat.ts`; never off the row.
- **`seats.trophy_points`** — the running total the seat card asked to be named.
  Integer, never null, zero in „Karty" mode. **This is the field to draw.**
- `setTrophyMode` in `commands/lobby.ts` refuses once `status !== "lobby"`, the
  same shape as `setEqMode` and for a sharper reason: by then the choice is
  already applied to a card, and neither direction can be reinterpreted —
  switching to „Punkty" would have to invent points for Karty already held,
  switching back would have to invent Karty for points already banked.
- `trophiesFrom` in `commands/fight.ts` forks: „Karty" inserts holdings,
  „Punkty" adds the printed Miecz to the seat and sends the Karta to the stos
  zużytych. A conjured Wróg (`granted`) scores and returns nothing, because the
  deck still holds its own copy.
- `killSeat` zeroes the points beside `eliminated`, which is the constraint above.
- Console: `trophies` reads the mode, `trophies punkty|karty` sets it in the
  poczekalnia, and `me` prints the ledger in whichever mode the table plays.

**Not yet applied to the live database.** Both columns are in `db/schema.sql`;
a browser game will error on the first fight won until the migration is run.

## Attributing work between sessions

Commits carry a `Claude-Session:` trailer, and that is the only reliable way to
tell three sessions apart — the git author is Michał for all of them. Read it
before crediting or blaming a change; a dirty working tree says who is *editing*
a file, never who committed it. See CLAUDE.md for staging by name, which is what
keeps one session's unfinished work out of another's commit.
