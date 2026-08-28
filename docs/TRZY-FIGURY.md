# Trzy figury — własne, parametr, w walce

**Built.** All of it: three engine corrections, the notation in the engine, and
the three places that draw the figures. What follows is the page as it was
written, with a section at the end recording the four claims in it that did not
survive checking — two of them made the work bigger, and one was a bug the page
said did not exist.

## The three figures, and what is in each

1.5 is the only fully worked numeric example in the rulebook, and it is worth
reading before touching any of this:

> Troll posiada oznaczony żetonami parametr Miecza równy 6… Srebrną Strzałę…
> jego Miecz wynosi już 7… też Miecz (Przedmiot… **mający znaczenie tylko
> podczas walki**)… razem otrzymujemy **8 punktów Miecza podczas walki lub 7 w
> każdej innej sytuacji**… Przyjaciółmi Trolla są Pasterz i Krzyżowiec… W
> efekcie Troll posiada **parametr Miecza równy 8 (6+1+1), a podczas walki 11**.

| figure | what is in it | column |
| --- | --- | --- |
| **własne** | żetony only. 1.2: a Przedmiot's points are *never* marked with a token | `sword_own` |
| **parametr** | własne + always-on bonuses (Srebrna Strzała, Pierścień Mocy, Pasterz) | `sword_total` |
| **w walce** | parametr + fight-only (Miecz, Sztylet, Giermek, Krzyżowiec) | `sword_in_fight` |

All three are already computed and already on the wire. Nothing is missing from
the engine for the display work.

**Where each is read.** `w walce` is 17.4 and every `op: "walka"` on a Karta or
Obszar. `parametr` is read wherever the board sets an *obstacle* — see the
corrections at the end; this page originally claimed one place and there are
three. `własne` is 1.3's floor and what 1.4's trophies raise.

## What to build

**Say all three, explicitly, with no hover.** As 1.5 writes it:

```
11⚔  8 (6)
```

fight figure with a crossed-swords glyph, then parametr, then własne in
parentheses. Michał's call, and the reason is that the fight figure is currently
in a `title` — reachable only by pointing, absent on a phone, and invisible to
the person deciding whether to start a fight.

**In all three places that draw the figures**, saying the same thing the same
way:

- `token-rail.tsx` — `RailStat` (the rails beside the Karta) and `StatFigure`
- `seat-card.tsx:416` — the folded POSTAĆ summary
- `players.tsx:233` — the roster

The roster is the one that needs plumbing: `LobbySeat` in `table-layout.tsx:141`
carries `miecz` and `swordOwn` and **not** the fight figure, and `page.tsx:1785`
builds it from `seat.sword_total` / `seat.sword_own`. Add the third from
`seat.sword_in_fight`, which is already in the envelope.

**Only show what differs.** Four of sixteen point-giving cards are fight-only,
so for most characters parametr and w walce are the same number and the rail
should stay as quiet as it is today. `StatFigure` already drops the parenthesis
when własne equals the total; the fight figure wants the same treatment.

## Two badges on a card, and they are independent

A held card can be doing nothing for two unrelated reasons, and the seat card
should say which:

- **„gdy założony"** — slotowy only. `inEffect` drops anything `isWearable` that
  is not in a slot, so a Miecz in the Plecak lends nothing *anywhere*. In
  klasyczny there is no wearing and this badge never applies.
- **„tylko w walce"** — `tylkoWalka` on the card's `punkty` ability. A property
  of the card, true in both variants.

They compose and neither implies the other. An item may be wearable and always-on
(Pierścień Mocy), wearable and fight-only (Miecz), or unwearable and fight-only —
that last is fine and needs no special case. **If a card only has „gdy założony",
show only that.**

**Przyjaciele need the same treatment and have only the second.** A friend is
never worn — 6.3 puts no limit on them and they occupy no slot — so „gdy
założony" never applies, but `Giermek` and `Krzyżowiec` are both `tylkoWalka` and
should say so. They are the commonest reason a player's two figures differ
without any item being involved.

## Two engine corrections this display depends on

Both are data in `src/lib/engine/`, and the display is wrong without them.

**1. Three weapons are missing `tylkoWalka`, against their own printed text.**

| card | printed | registry |
| --- | --- | --- |
| MIECZ | „**podczas walki** dodaje… 1 punkt" | `tylkoWalka` ✓ |
| SZTYLET | „**podczas walki** dodaje… 1 punkt" | `tylkoWalka` ✓ |
| EXCALIBUR | „**użyty w walce** dodaje… 1 punkt Miecza" | **missing** |
| TOPÓR ŚWIATŁA I CIEMNOŚCI | „**Użyty w walce** dodaje… 1 punkt" | **missing** |
| MIECZ CHAOSU | „**Użyty w walce** dodaje… 2 punkty" | **missing** |

Every weapon in the box is fight-only by its own text. The three without the
flag currently raise the *parametr*, which means they help on the Kamienny Most
— the one place the parametr is read — and a plain Miecz does not. That
difference is not a rule; it is a slip in the registry, and it is what made the
whole thing look arbitrary.

**2. Excalibur's actual ability is not implemented**, and the two must land
together. Its text is „Po każdej zwyciężskiej walce Postać zyskuje także 1 punkt
Życia (zabierając ten punkt pokonanemu przeciwnikowi)", which is a MANUAL note in
`coverage.ts:48`. So the only thing the engine gives Excalibur today is a +1 that
should not be there. **Fix the flag alone and Excalibur becomes strictly worse
than a common Miecz** — same +1 in a fight, no bridge bonus, its distinguishing
clause still on the table's shoulders. Do the ability first, or both at once.

Sztylet was suspected of a guessed flag and is not: its text carries „podczas
walki" in as many words. Nothing to do there.

## Why the rule is worth keeping as printed

Michał challenged whether all three figures should collapse into one, on the
grounds that two numbers are messy. Worth recording why they should not, because
the argument nearly went the other way on a bad example.

The box draws its line between **what you are** and **what you swing**. Compare
the texts: SREBRNA STRZAŁA „dodaje właścicielowi 1 punkt Miecza i 1 punkt Magii"
— no „w walce", so it counts on the bridge. PIERŚCIEŃ MOCY the same. Every
weapon says „w walce" and none of them counts there. ZBROJA and HEŁM add no
points at all and are a die-roll against losing Życie.

So 14.5 tests what a character has *become*, not what they are holding — which is
a different question from the one every fight asks, and the reason the endgame
gate feels different from the rest of the board. Flatten the figures and the
bridge starts asking the same question as everything else, and turns on how much
loot somebody found.

The mess was never the rule. It was three cards behaving unlike three
near-identical cards for no stated reason.

## What was checked, and what did not survive it

Four claims on this page were wrong. Recorded because three of them were the
kind that a reader would have carried forward.

**The list of three missing `tylkoWalka` was five.** ARONDIGHT („Miecz Lancelota
**użyty w walce**") and ŚWIĘTA WŁÓCZNIA („**Użyta w walce**") were missed. The
audit is now a test — `excalibur.test.ts` compares every `punkty` ability's flag
against its own card text and fails on any disagreement — so a transcription
that says „w walce" and forgets the flag cannot slip through again. The page's
conclusion holds and is stronger than it stated: *every* weapon in the box is
fight-only by its own words, with no exceptions.

**`parametr` is read in three places, not one.** Beside the six Kamienny Most
ordeals (`bridge.ts:582`) it is the Trzęsawiska / Lodowy Las crossing
(`bridge.ts:508`, a Magia threshold, 11.x) and — see below — the two Obszary
that measure a character. So the line is not "the endgame gate is special", it
is **fights read `walka`, obstacles read `parametr`**, and obstacles happen all
game. The argument for keeping the figures apart is better than the version
written above.

**`prog` is used, and it read the wrong figure.** This page said no card uses
it. Two do — LABIRYNT („każdy, kto tu trafi **o Magii mniejszej niż 5**") and
SPALONA ZIEMIA („jeżeli **jego Miecz** jest mniejszy niż 5 punktów") — and
`effects.ts` evaluated them against `sword_own` / `magic_own`. Neither card says
„własnej", and 1.5 settles what a bare „Miecz" means for a character: „Troll
posiada parametr Miecza równy 8 (6+1+1)". So a character with Magia 3 and a
Pierścień Mocy had a parametr of 5 and still got lost in the Labirynt. Fixed,
and it was a **third** engine correction of exactly the class this page exists
to catch.

**„Four of sixteen" was four of fifteen, and is now nine of fifteen.** After the
weapons were corrected a *majority* of point-giving cards are fight-only, so the
two figures differ for most armed characters rather than few. "The rail should
stay as quiet as it is today" does not hold — which makes the compact notation
more necessary than this page argued, not less.

One more fact that fell out of the audit and is worth having: after the
correction, **PIERŚCIEŃ MOCY is the only item in the box that is both wearable
and always-on**. Every weapon says „w walce", and the other always-on cards
(SREBRNA STRZAŁA, ŚWIĘTY GRAAL) have no place on the body. Several tests used a
blade as their always-on example and had to move.

## The notation, as built

`src/lib/engine/figures.ts`, so the console and the browser cannot drift:

> **Parentheses always hold własne. A bare second number is the parametr. The
> crossed swords mark the fight figure. A figure you cannot see equals the one
> to its right.**

```
6           nothing lends anything
8 (6)       always-on only        — w walce = parametr
9⚔ (6)      fight-only only       — parametr = własne
11⚔ 8 (6)   both, which is 1.5's Troll
3⚔ (5)      a Rycerz standing in for you
```

The last line is why nothing assumes the numbers descend: `walczy-za-ciebie`
*replaces* the fight figure with the champion's rather than adding to it, so a
Barbarzyńca of Miecz 5 fights at the Rycerz's 3. The page did not mention this
and a display that sorted or assumed an order would have been wrong.

`figuresOf` hands the parts back for the browser; `figuresText` prints the line
for the console. Drawn by `StatFigure` (the rails and the folded POSTAĆ
heading) and by the roster, which needed `sword_in_fight` / `magic_in_fight`
plumbed into `LobbySeat` as this page said.

**Measured rather than guessed**, since the rails have no width of their own: at
13px tabular-nums, `6` is 8.3px, `8 (6)` 30.3px, `9⚔ (6)` 38.1px and
`11⚔ 8 (6)` 58.1px. A full żeton pile is three 16px columns with 2px gaps — 52px
— so only the all-three case widens a rail at all, by about six pixels.

## Excalibur

Both halves landed together, as this page required. `{ kind: "zabiera-zycie" }`
is read at the end of `resolveFight`: a win adds the point, and in a duel it is
really taken off the loser, who has already paid one for losing — so a lost duel
against Excalibur costs two, and that can be the second one's last. It goes
through `spendLife`, so 4.4 applies itself. Uncapped, because 4.6 makes a point
won a gain and 4.7's ceiling of four is about what a Uzdrowiciel restores. Not
on a raid: the Poszukiwacz fights on his own account and the blade is in your
pack, not his hand.
