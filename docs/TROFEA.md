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

**Why it is mechanical, not cosmetic.** There are **32 Wrogowie among 165 Kart
Zdarzeń**. A held trophy is a card out of circulation and 9.5 reshuffles only the
*used* pile, so a few players hoarding beaten foes lock away most of the enemy
pool — and the table runs short of things to fight exactly when everyone is
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

Unruled. The argument here is for the subset. In „Punkty" mode the fork
dissolves: convert in multiples of seven, keep the remainder, no card selection
needed anywhere.

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

## Attributing work between sessions

Commits carry a `Claude-Session:` trailer, and that is the only reliable way to
tell three sessions apart — the git author is Michał for all of them. Read it
before crediting or blaming a change; a dirty working tree says who is *editing*
a file, never who committed it. See CLAUDE.md for staging by name, which is what
keeps one session's unfinished work out of another's commit.
