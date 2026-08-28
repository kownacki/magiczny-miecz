# Trzy figury — własne, parametr, w walce

A page for whoever picks this up next. It is one display change and two engine
corrections, and the corrections matter more than they look: without them the
display would faithfully show a wrong number.

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
Obszar. `parametr` is read in exactly one place in the whole game — the six
Kamienny Most ordeals, `bridge.ts:582`, where 14.5 subtracts "wartość swojego
parametru Miecza" from 3d6 to decide how far you fall. There is a `prog`
threshold type in `cardScript.ts` and **no card uses it**, so there is no third
consumer. `własne` is 1.3's floor and what 1.4's trophies raise.

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
