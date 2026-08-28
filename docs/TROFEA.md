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

- **`games.trophy_mode`** — `'points'` (default) or `'cards'`. Read it through
  `trophyModeOf` in `commands/seat.ts`; never off the row.
- **`seats.trophy_points`** — the running total the seat card asked to be named.
  Integer, never null, zero in „Karty pokonanych" mode. **This is the field to draw.**
- `setTrophyMode` in `commands/lobby.ts`. Free either way in the poczekalnia.
  Once the game is running it closes in **one direction only**, which the
  seat-card session had right and this first got wrong: turning „Punkty" *on*
  is a conversion the table can make together, because every held Karta has its
  Miecz printed on it and becomes that many points; turning it back *off* would
  have to hand Karty out again, and the Wrogowie are on the stos zużytych by
  then. `convertTrophies` in `commands/shop.ts` does the sweep — every seat at
  once, `granted` Karty scoring but returning nothing, one journal line per
  seat that was holding something and one for the table.
- `trophiesFrom` in `commands/fight.ts` forks: „Karty" inserts holdings,
  „Punkty" adds the printed Miecz to the seat and sends the Karta to the stos
  zużytych. A conjured Wróg (`granted`) scores and returns nothing, because the
  deck still holds its own copy.
- `killSeat` zeroes the points beside `eliminated`, which is the constraint above.
- Console: `trophies` reads the mode, `trophies points|cards` sets it in the
  poczekalnia, and `me` prints the ledger in whichever mode the table plays.

**Applied to the live database**, 2026-08-28, and the settings route now reads
`trophyMode` — it declared the field and ignored it, so the switch moved on
screen and changed nothing.

**The values are English**, `points` / `cards`, not the Polish of this doc's
headings. They were `punkty` / `karty` for a day. Every other stored enum in the
schema is English — `classic|slots`, `lobby|playing|finished`,
`good|evil|chaotic` — and the seat-card session had already written its toggle
against `points`, so the Polish outlier was the thing to move. The Polish stays
where a player reads it: „Punkty" and „Karty pokonanych" are labels, not values.

## Built for the seat card: who was beaten, in „Punkty"

Michał wants the trofea drawn with their art in **both** modes. In „Karty
pokonanych" that already happens — the Karty are holdings and the tiles show
`cardArtUrl` like any Przedmiot. In „Punkty" there is nothing to draw: the Karta
goes to the stos zużytych as the Wróg dies, only his number is kept, and the
envelope carries no journal, so the browser has no way to learn that it was a
Wilkołak.

**What would fix it:** a display-only list on the seat — `trophy_beaten`, the
card ids of Wrogowie beaten and banked. Appended where `trophy_points` is
appended, cleared with the seat on death exactly as those points are, and never
read by the arithmetic. The points stay the authority on what a trade costs;
this is only so the shelf has faces on it.

**One thing to decide with it, because the two modes are not symmetric.** In
„Karty pokonanych" the tiles *are* the currency: hand them in and they leave,
because those are the Karty you gave up. In „Punkty" you trade points, which are
fungible — no particular corpse paid for the sword, so no particular portrait
should vanish when you cash one.

That points at the honest reading: in „Punkty" the art is a **memorial rather
than a wallet**. It never shrinks. Everyone you beat stays on the shelf for the
rest of the game while the ledger beside it rises and falls — you did kill the
Wilkołak, and trading does not un-kill him. Which is the half of 1.4 the printed
rule throws away, and the better feature for the app to keep.

**Built, and the ruling above is the one taken.** `seats.trophy_beaten` is
`text[] not null default '{}'`, live on the database, in `SEAT_COLUMNS`, and
therefore already on the wire — the envelope spreads the whole seat row, so
there is no further contract to agree. Draw it where the Karty are drawn.

Three places write it, and the third is the one that is easy to miss:

- `trophiesFrom` appends as the Wróg falls, beside the points. A conjured Wróg
  goes on too — he was still beaten, and which pile his Karta belongs to is a
  separate fact.
- `convertTrophies` appends everyone converted when a table switches mid-game.
  Without that the switch would lose every Wróg beaten before it: their Karty
  are on their way to the stos zużytych and in „Punkty" the hand is where they
  had been remembered.
- `killSeat` empties it beside `trophy_points`, so the shelf dies with the
  Postać (4.4).

Nothing reads it. It never shrinks on a trade — the memorial reading, above.

## Which trofea have left the hand — for the shelf

Asked for by the seat-card session: sold trophies should sort last and draw
dimmed. They could not be, and the finding was theirs: **nothing recorded it.**
In „Karty pokonanych" a cashed trophy is deleted and 1.4 sends its Karta to the
stos zużytych, so the hand can only ever say who you *still* have; and
`trophy_beaten` was written on a win in „Punkty" only.

**Now it is written in both modes**, on the win, beside the Karta rather than
instead of it. No schema change — the column was already there — and no rule
reads it in either mode. So:

> **beaten − held = the Wrogowie whose Karty have left the hand.**

Three things to know before deriving it, each of them a way to get it wrong:

- **It is a multiset.** Two Nobbiny are two entries on the shelf and two
  holdings. A set difference calls the second one gone.
- **„Sold" is not quite the word.** `dropCard` also lets a trophy go — to the
  same stos zużytych, so nothing leaks — and which of the two happened is not
  recorded. The honest label is "beaten, and no longer in hand". If the
  difference ever matters, that is a new column and a conversation, not a
  derivation.
- **Only in „Karty pokonanych".** „Punkty" never has a trophy holding to
  subtract, so the difference there is the whole shelf and means nothing. In
  that mode the shelf is a memorial and stays whole — the ruling recorded
  above.

`convertTrophies` no longer appends on the mode switch: both modes write the
shelf on the win now, so everyone held is already on it and appending would
list each of them twice.

The console prints it under the hand as `Beaten, not held: SMOK, NOBBIN`, which
is the same subtraction and a worked example to check a browser against.

## Asking for an outcome instead of naming Karty

The subset ruling made the choice real and did nothing to help anybody make it.
Holding CYKLOP 6, SMOK 5, NOBBIN 2, NOBBIN 2, one Miecz costs either 5+2 and
nothing wasted or — reaching for the biggest first, which is what a person does
— 6+5 and four points burned. Same sword, four points apart, invisible unless
somebody adds it up.

`src/lib/engine/trophies.ts` adds it up, and is pure: `offersFor(held)` returns
every number of Miecze a hand can buy, each by the set that reaches it with the
least waste, and among equally wasteful sets the fewest Karty — which keeps the
small denominations back, because a hand of ones and twos is what hits an exact
seven next time and a hand of tens is not. Exhaustive rather than greedy,
because greedy gets the case above wrong; the hand is at most twenty-one cards
totalling 75, so it costs nothing.

`pointOffers(points)` answers the same question in „Punkty" through the same
shape, so a surface that can draw one can draw the other.

**For the seat card:** `offersFor` over the holdings already on the wire is
exactly a stepper's model — one row per buyable count, with the Karty it would
cost and what it would burn. `POST /api/games/:code/holdings` with
`{ action: "trade", swords: 2 }` spends it; `cardIds` still wins if both are
sent, because a named list is an explicit answer. The console does the same
thing with `trade 2`, and `me` prints the menu.

## Attributing work between sessions

Commits carry a `Claude-Session:` trailer, and that is the only reliable way to
tell three sessions apart — the git author is Michał for all of them. Read it
before crediting or blaming a change; a dirty working tree says who is *editing*
a file, never who committed it. See CLAUDE.md for staging by name, which is what
keeps one session's unfinished work out of another's commit.

## Correction: „Punkty" was built on the wrong difference

**Built.** Engine, console and seat card, in one change. Everything above about
„Punkty" being fungible is wrong, including the
ruling that it keeps the remainder and the argument that no portrait can dim
there. Michał said what the variant is, and it is not what this page assumed:

> In both modes we don't need to spend them immediately — that's the point, you
> always decide: wait, or exchange with possible loss. The difference is only
> **when the card of the enemy goes back to used**. 1. the cards are hoarded
> physically until spent (then go back to used). 2. the cards physically go to
> used immediately — in the trophies it's just a trophy as a copy.

So the fork does **not** dissolve in „Punkty". It is the same trade in both
modes — pick a subset, `offersFor` finds the cheapest set, points above the
multiple of seven are lost — and the only thing that differs is one
`putOnPile` call, at the moment of victory instead of at the moment of trade.

### What that makes wrong today

- **`trophy_points` is the wrong shape.** A single integer cannot hold a choice
  between Wrogowie. Beating a Wilkołak (10) and cashing him for one Miecz has
  to burn 3, and today it cannot: the pool is always divisible by seven, so
  „punkty ponad wielokrotność 7 są stracone" is dead text in the mode that was
  supposed to keep the rule and drop only the cardboard.
- **"Keep the remainder" was a ruling about the wrong thing.** The remainder to
  keep is the *trophies you did not hand in*, which both modes keep. Waste
  inside the set you did hand in is lost in both. Those got conflated.
- **The fungibility argument goes with it.** „No particular corpse paid for a
  given Miecz" is true of a pool and false of a list, and a list is what this
  is. It was my reason for refusing to dim anything in „Punkty", and it was
  reasoning from a wrong premise, not from the rule.

### The shape that collapses the special case

A beaten Wróg inserts a `trophy` holding in **both** modes. „Punkty" *also*
returns the Karta to the stos zużytych there and then; „Karty pokonanych" holds
it back until the trade. One branch, at one `putOnPile`, and after it every
other piece is shared: `offersFor`, `tradeTrophies`, the console ledger, the
seat card, and `shelfFor`'s beaten-minus-held — which then dims spent trophies
in both modes, which is what was asked for in the first place.

That is Michał's "just a trophy as a copy": the holding is the copy, and the
Karta is back in circulation. It also keeps the mechanical difference this page
argues for — in „Punkty" a Wróg can be drawn again immediately, where the
printed rule takes 21 of the 32 out of the deck for as long as they are hoarded.

`trophy_points` becomes vestigial. Existing „Punkty" tables carry a total with
no trophies behind it, so a conversion has to decide between reading it as
already-spent or seeding a holding per `trophy_beaten` entry — the shelf is
written on every win in both modes since `d5fd4e7`, so for anything played
after that the entries are there to seed from.

### As built

`trophiesFrom` inserts a `trophy` holding in both modes and, in „Punkty" only,
returns the Karta at once. Everything downstream is now shared: `tradeTrophies`
lost its points branch, `offersFor` answers for both, the console prints one
ledger, and the seat card's own „Punkty" branch is down to a single sentence
saying where the cardboard went.

**One rule needed a home.** Four things can take a trophy away — the trade,
`dropCard`, death and withdrawal — and each used to put its Karta on the pile.
In „Punkty" the pile already has it, so all four now go through
`trophiesToPile`, which returns nothing in that mode. Written out four times,
three of them would eventually be right and the fourth would quietly deal a
second Wilkołak.

**`convertTrophies` barely does anything now.** Switching a running table to
„Punkty" used to cash every hoard in; it hands the Karty back and leaves the
trophies alone. Going the other way is still refused, and for a better reason
than before: the trophies would survive the trip, the cardboard cannot — 9.5
may already have dealt some of it out again.

**`trophy_points` is vestigial.** Nothing writes it and nothing reads it; the
column stays because dropping one is not worth a migration. Two consequences
worth knowing: a „Punkty" table started before this change carries a total with
no trophies behind it and those points are now unreachable, and its
`trophy_beaten` will draw every entry as spent, because the seat holds none of
them. Both are correct readings of what is stored and neither can be recovered
— the record of which Wrogowie those points came from was never kept.
