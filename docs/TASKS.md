# Tasks

What is open, and what is settled and must not be re-derived. Everything that
has landed, with the reasoning it landed on, is in [LANDED.md](LANDED.md) — the
same text, moved there so that this file stays the one to read at the start of
a session.

Scope for v1: **base game only** (Magiczny Miecz). The five expansions
(Gród, Jaskinia, Krypta Upiorów, Labirynt Magów, Magia) are out of scope and
their scans are deliberately untouched.

---

## Open

### Rules the app carries only halfway

- [ ] **Two decisions and three blockers**, written down here because they are
      what the remaining work is actually waiting on (2026-08-31).

      **A status on a Karta lying on an Obszar — decided 2026-09-04: one
      table, two holders.** `seat_effects.seat_id` is nullable and
      `field_card_id` stands beside it under a check that exactly one is set.
      The model landed (`cardStatuses`, the Envelope's `effects` on a field
      card, `addCardEffect`); the migration is written in `db/migrations/`
      and applied to the shared database on 2026-09-04, read back from the
      catalog: `seat_id` nullable, `field_card_id` with its cascade, the
      `seat_effects_one_holder` check. All five cards are wired (LANDED.md);
      what stays manual is one clause each of the Krąg and the Ocalony, said
      in `coverage.ts`. Follow-up: the browser's sheet reads a lying Wróg's
      printed figure and does not yet show a Wampir's growth or a doubled
      Demon.

      **What is inside a container — decided 2026-09-04: no storage UI.**
      Losing the Magiczna Sakwa or the Tragarz opens the overflow frame with
      `because: container-lost`; the way under for the surplus is `zniszcz`,
      to the used pile through `putOnPile`, and the player still picks which.
      Built — see LANDED.md. The Tajemna Sakwa keeps its storage place, which
      was already built.

      **Cross-obstacle adjacency is not on the board.** The Łódź and the
      Latarnia land you at the crossing's printed exit rather than "na Obszarze
      sąsiadującym", because the rings are 14, 16 and 18 fields and do not line
      up. Nobody's decision — just work nobody has done, and another session was
      measuring it as this was written.

- [ ] **One card left, and it is blocked.** 132 of the 138 distinct event cards
      are `pelne`, 4 `czesciowe`, 2 `brak` — `coverage.ts` is the truth and
      `docCounts.test.ts` keeps COVERAGE.md agreeing with it. The Sobowtór, the
      Kometa and the Wampir were built on 2026-09-04 and the Turniej Rycerski
      is parked with duels; all four are in LANDED.md.

      What is left is the **Tajemna Sakwa**: „W Sakwie możesz umieścić 1
      Przedmiot" wants the container link the Magiczna Sakwa and the Tragarz
      also want, and putting a Przedmiot *into* something is a feature rather
      than a fix. Each `czesciowe` card names the half it misses in `MANUAL`.


- [ ] **Nature-dependent cards** — the seat's Nature is known, so these are
      resolvable once Kat's setup choice is handled.
- [ ] **Two weapons at once**, for a character with the ability in the slotowy
      variant — none has one yet. See **Wariant: ekwipunek slotowy** in
      [COVERAGE.md](COVERAGE.md).


### Close every „rozpatrzcie sami" — a MANUAL note is a gap, not a getaway

**Decided 2026-09-06.** `coverage.ts`'s `MANUAL` was built as an honest device:
the app carries part of a card and names the rest, so a table is never left
guessing whether the referee is watching. That stays true of the *mechanism* —
saying nothing would be worse — but the **list is a backlog, not a design**.
Every entry is a rule this app has not implemented yet, and the aim at this
stage is to empty it.

Six entries, and they are four problems:

- **ŁÓDŹ, LATARNIA** — „na Obszarze graniczącym z tym, z którego wyruszyłeś".
  Blocked on the same thing: cross-obstacle adjacency is not on the board,
  because the rings are 14, 16 and 18 fields and do not line up. This is the
  one real board gap left; see the note under "two decisions and three
  blockers".
- **WIERZCHOWIEC** — „twoi Przyjaciele muszą poruszać się w zwykły sposób".
  Needs a Przyjaciel to have a position of its own, which nothing in the model
  gives it: chapter 6 is custody only.
- **DOBRE BÓSTWO** — cannot convict, because neither half of its trigger is
  reachable: `attackSeat` is parked and nothing sets `how: "zdolnosc"` yet.
  Closes when duels come back, or when 13.3's ability branch is built.
- **KRĄG PŁOMIENI, OCALONY** — clauses that reach a Karta rather than a seat:
  lifting a Krąg off a card, an Ocalony saving a Przyjaciel, and „rezultat
  starcia pozostanie nierozstrzygnięty", which wants a card that can rewrite a
  settled fight.

**Also a gap, and not in the list**: 18.1's „rozpatrzcie osobno" — a mixed pack
of ordinary and magical Wrogowie must be fought as two battles — is refused
correctly by `beginFight`, but the console has no door to it, because `fight`
takes exactly one Wróg and asks which when several wait. Found by trying to
write a transcript for it. The rule is carried; the surface is not.

**How to read the list from now on:** an entry is work waiting, and an empty
`MANUAL` is the goal. Do not add one to make a card "honest" without also
writing down what would close it — a note that explains a gap forever is how a
gap stops looking like one.

### One house rule journals itself, the other does not

`setEndlessStock` writes a line — "Zwykłego Wyposażenia nie będzie już
brakować (21.2)" — and `setEqMode` writes nothing at all. Both are the table's
own rules, both are the host's to move, and both stop being movable once the
game starts; only one of them leaves a trace of having been moved.

Either answer is defensible and they should match. The variant can only change
in the poczekalnia, where the Dziennik is already thin and a line about it
would read as noise; on the other hand a table that starts with a Plecak
nobody expected has nothing to point at. Left as it is because it is the peer's
command and the asymmetry is cosmetic, not because it is right.

### ~~Card vocabularies~~ — done, 2026-09-04/05

All three decisions are carried out and the reasoning is in LANDED.md
("The architecture pass", "The Status fold is finished"). In one paragraph, so
nobody re-derives it:

Six ways of saying what a card does. Three are different things and stay apart
— an **Effect** is a happening, a **FieldScript** is a menu of them, and what a
holder is *under* is a **Status** (CONTEXT.md). The prose reader is deleted
(`cardEffects.ts`), all 27 Zaklęcia carry a script, and the Status fold moved
every reader onto one list. Its step three — retiring the `Ability` kinds — was
**dropped after tracing what it costs**: `ABILITIES` is the printed-card data
table, `describeAbility` renders it on the seat card, and `BONUS_BY_ID` is
*built from* it rather than replacing it, so even `punkty` still needs its kind.
The duplication was always in the readers, and folding those fixed it. An
`Ability` is what a card prints; a `Status` is what is true of a holder now;
`HELD_TWIN` is the exhaustive bridge. **Do not reopen.**


### Music

Might and Magic VI's redbook tracks, exported and wired to nothing yet — see
LANDED.md for what is built (`src/lib/music/`, `/music`).

- [ ] Source audio: MM6's Music folder from a GOG copy into `assets/music/`
- [ ] `npm run music`, then commit `public/music` (~14 MB for the five)
- [ ] Pick a hold length at a real table, then connect: the active seat's field
      to its `region`, which is already the `MusicZone` shape.

### The table screen

`page.tsx` is fed from `TheTable` (LANDED.md). One seam left:

- [ ] `sweep.py`, the end-to-end harness against the real routes, is worth
      rewriting rather than restoring — what it is *for* is asserting against
      the routes, and that is the part worth keeping.


## Parked

### A Postać's own powers — parked 2026-09-05 (`CHARACTER_POWERS_PARKED`)

**Every printed clause except the starting kit.** `abilitiesOfCharacter` returns
`[]` while it stands, which switches off all sixteen encoded abilities without a
guard in any of the seven readers that ask. Nothing is deleted.

**Why all of them:** 89 clauses are printed across the 27 Kartas Postaci and the
app ran 34 of them — 18 starting kits and 16 encoded abilities, the latter
across only 10 characters. A Karta that keeps sixteen promises and breaks
fifty-five is harder to play with than one that keeps none and says so, because
a player cannot tell which sixteen. The line is sayable in a sentence: **the app
deals your kit, everything else on the card is yours.**

**`LIVE_ABILITIES` names what is carried, not what is parked**, so an unlisted
clause is dimmed by default and one the app learns to run must be *added* to
appear. The failure mode is a card that under-promises, which can be checked
against the paper. `disabled.test.ts` pins every live index by words only that
clause contains.

Postacie still differ by printed Miecz and Magia, starting gear, where they
begin, and Natura. Known partial: the Książę's gear clause also promises he may
replace what he loses, and that half is not carried — the clause stays live
because striking it would deny the kit it does deal.


### Postać przeciw Postaci — parked 2026-09-05 (`PVP_PARKED`)

**Coming, not built.** One `const true` in `src/lib/engine/disabled.ts`;
flipping it restores everything with no other change. Why each piece went the
way it did is in LANDED.md.

**Off:** 17.6-10, 18.1b, and 19.1-2's escape *from* a Postać. **Two doors, and
the second is easy to miss** — `attackSeat`, and `sendRaider` when it is aimed
at a seat, because the POSZUKIWACZ PRZYGÓD raiding a Postać is a duel by proxy.

**Untouched:** 13.3's other branch (meeting a Postać to use an ability on her)
and every Zaklęcie aimed at another player, hostile ones included — POWIEW
ŚMIERCI says „nie trzeba toczyć walki" outright.

**Went with it:** TURNIEJ RYCERSKI, out of the deck entirely. The DOBRE BÓSTWO
stayed but can no longer convict, and says so in `MANUAL`: both halves of its
trigger are unreachable, since nothing sets `how: "zdolnosc"` either.

**When it returns:** the Turniej needs a dynamic choice — „wyzwać każdą Postać"
is a choice among however many Postacie are at the table, and `wybor` is a fixed
list re-walked by index. And 17.9's spoils need a browser picker; the press and
the route already exist.


### Handel między Postaciami — parked, and probably not in the game

Two Postacie standing on one Obszar cannot trade, and after a search of the
rulebook and all four card sets the honest reading is that **the base game
never gave them a way to.** Written down here because the absence looks like a
gap, was investigated as one, and is not.

**What the box actually says.** 13.3 is exhaustive about what a meeting is:
"Spotkanie z inną Postacią może przybrać jedną z dwóch form: Postać która
właśnie weszła na dany Obszar może zaatakować Postać, która już się tam
znajduje (17.6-10.) lub użyć w stosunku do niej swoich specjalnych zdolności."
Attack, or use your abilities. Not trade.

Every transfer between characters in the box is **involuntary** — 17.9's
spoils, ZŁOCZYŃCA robbing whoever he beats, SZALEŃSTWO taking a Zaklęcie,
ZWIERCIADŁO ZNISZCZENIA used against somebody. No Karta, Zaklęcie or
Charakterystyka grants a voluntary one.

**The one trace, and where it came from.** 3.4 has a parenthesis:

> Płatności za wszelkiego rodzju zakupy lub usługi odkładane są do zapasu
> nieużytych żetonów Sztuk Złota (zasada ta nie dotyczy, rzecz jasna, **handlu
> między Postaciami**).

"Obviously this does not apply to trade between Characters" — an aside about a
rule that is not in the book. Talisman, which chapter 3 is adapted from, states
it outright: characters in the same space may trade objects, gold and
followers. Magiczny Miecz carried the parenthesis across and dropped the
sentence it was parenthetical to. That is a printing history, not a rule.

**What is already legal and does most of the job.** 5.5 lets a Postać drop a
Przedmiot on its Obszar "w dowolnym momencie" and 6.4 the same for a
Przyjaciel, so anything except gold can change hands by being left for somebody
who ends their move there — slowly, publicly, and at the risk of a third player
taking it first. Gold has no such rule: 12.1 lets it be picked up and nothing
lets it be put down, which `takeFieldGold`'s doc already notes.

**If it is ever built** it is a table setting beside `eq_mode`, `trophy_mode`
and `endless_stock`, never a default — the manual is king unless a variant says
otherwise. What it would need, in the order the layers go:

- a `trade` command taking a partner seat, and what moves: gold, Przedmioty,
  Przyjaciele (Talisman's three), never Zaklęcia — 9.3 keeps a hand concealed
  and a trade would have to reveal one.
- both seats inside 12.1's window on the same Obszar, which is now one guard:
  `refuseUnlessSettledHere`. 13.1 already says nothing may happen on the square
  a turn starts from, and that applies to both sides of a trade, not just the
  active one.
- consent from the passive seat, which nothing in this app has ever needed:
  every command today is one seat's. That is the real cost of the feature and
  the reason it is not a small job.
- 5.3's Natura check on the receiving side, and 5.4's carrying limit, both of
  which `takeCard` already applies.

## Settled — do not re-derive

### Two decisions a fresh session would otherwise re-derive

Both are now built, and both are still worth reading before touching either.

- **`deviceId` goes in `localStorage`, and it does not contradict
  `seatToken.ts`.** That file argues for `sessionStorage` and is right — about a
  different question. `claim_token` is per *window* ("may this window drive that
  seat"); `device_id` is per *browser* ("who is this person") and has to survive
  the tab closing, which is the whole reconnect case. Reopening finds the quiet
  user with that `device_id` and offers *"Wróć jako Michał"*; a second tab finds
  that user *live* and offers *"Dołącz jako ktoś inny"*, so multi-tab testing
  becomes a deliberate choice rather than an accident.
- **Mid-game nothing is auto-unseated.** The sweep is the poczekalnia's only.
  A Postać is not free for the taking because somebody's phone slept; `AWAY_AFTER_MS`
  shows them away and the host has `unseat` for when it is really over.

### Vocabulary — settled, do not relitigate

| command                    | acts on   | effect                                                    |
| -------------------------- | --------- | --------------------------------------------------------- |
| `who`                      | —         | the table: seats, Postacie, drivers, ids                   |
| `seat <player> 3`          | user      | sit down; refuses a seat somebody is actively driving      |
| `unseat [player]`          | user      | out of the chair, still watching; Postać untouched         |
| `kick <player>`            | user      | out of the table                                           |
| `leave` / `exit`           | me        | out by choice — same exit, different journal line           |
| `pick [MAGOG] [3]`         | seat      | a Postać in: drawn unless named, yours unless numbered      |
| `remove` / `erase 3\|MAGOG [hard]` | Postać | out of the game, Karty to the used piles            |
| `revive 3\|MAGOG`          | Postać    | back where it fell, own points, starting Życie, no items    |
| `rename <player> as Ola`   | user      | —                                                          |
| `host <player>`            | user      | —                                                          |

- **Confirm what no other command can undo**: `remove`, `kill`, and `kick` (the
  only one that is rude to somebody *else*). `unseat` and `leave` take nothing
  away. `needsConfirming` in `engine/console.ts` holds the rule.
- **soft `remove`** puts the Karta back in the pool; **`hard`** bars it for good.
  A **host** may remove a *living* Postać (the rulebook says nothing about
  withdrawing one, so nothing is being overruled). Only the **console** may
  remove a *dead* one — that is putting a Karta back that 4.4 explicitly set
  aside, and it is journalled `manual` like every other break.
- `kill` and `revive` are console-only. Both contradict 4.4 in words.

### Known corrections

- The number at the top of each card is a **Roman numeral for the card class**
  (I Spotkanie, II Wróg, V Przedmiot), used for resolution ordering in 15.2 —
  it is *not* a unique card id. Cards cannot be identified by number.

### `turnStore.ts`'s wrappers stay — measured 2026-09-05

A handoff proposed folding "the 43 thin `turnStore` wrappers" into the action
tables' `run`, with the console calling the same table, so that adding an
action would be one entry. Counted rather than eyeballed, the file is:

| | |
| --- | --- |
| exported functions | 76 |
| pure `change(gameId, cmdOn, …)` pass-throughs | **27**, not 43 |
| — of those, shared by both surfaces | 13 |
| — single-surface (5 route-only, 9 console-only) | 14 |
| doing real work: shuffles, reads, orchestration | 49 |

The 49 cannot be folded. The 13 could be, and that is the part that should not
be: the console calls them with arguments of its own after resolving a name —
`moveTo(gameId, offered.fieldId, true)` once it has worked out the bridge offer
— so folding them makes the console adopt `from`'s body-shaped arguments and
import the HTTP action table. Two front-ends converging on one function is what
a seam looks like, not duplication. CLAUDE.md already gives this layer the job:
`turnStore.ts` is one of "the thin edges that mint the tokens, hand in the
shuffles and run the commands".

And the premise was wrong anyway. Adding an action touches four files because
there are four concerns — the body's shape, the command call, the table entry,
the client's call — and no arrangement makes that one. What a reader needs is
to know *which* four and in what order, which is [WHERE.md](WHERE.md)'s recipe
1. That is the answer to this complaint, and it cost an hour rather than a
refactor.

Inlining just the 14 single-surface pass-throughs was considered and declined:
it saves one file for five actions and cuts against CLAUDE.md's line about
where commands are run.

### Findings worth keeping

- **Ring-to-ring adjacency is not geometry, and `boardMap.ts` cannot answer it.**
  Somebody probed whether the field across the water from a given one could be
  derived by intersecting the schematic `CELLS` rectangles — Dolny against
  Środkowy, Środkowy against Górny. It cannot: 10 of 14 and 13 of 16 overlap
  either two neighbours or none, because the rings have different cell counts
  and nothing lines up.

  The probe was chasing a question the box does not ask. **Crossings are four
  named pairs, printed on the board** — Uroczysko ↔ Las Błędnych Ogni through
  the Trzęsawiska, Przełęcz Wichrów ↔ Dolina Czaszek through the Lodowy Las —
  and they live in `CROSSINGS` in `rings.ts` with the test each one demands.
  Movement otherwise runs *around* a ring (`ringFields` returns the whole ring,
  which is also the Poszukiwacz's range), and the only other links between rings
  are `BRIDGE_LINKS`, on and off the Kamienny Most.

  The reusable half: `src/lib/view/boardMap.ts` is a schematic for **drawing**
  the board and is not a source of truth about what neighbours what. It is in
  `view/` for that reason. Recorded so nobody runs the probe a second time.

- **A card never leaves the game.** Nineteen places in `commands/` delete a
  holding and every one of them pairs the delete with a return — `putOnPile`,
  `trophiesToPile`, or an insert onto the Obszar — because a deleted card has
  not been „odłożona na stos zużytych": it is out of the box, and 9.5 can never
  bring it back. The three that lift a card off the *board* are the same story.
  Audited card by card; `piles.test.ts` holds the two deliberate exceptions,
  which both live in `putOnPile` rather than at the call sites:

  - a **granted** card joins no pile, because the deck never gave it up and its
    own copy is still in the draw — returning one is how a table ends the
    evening holding two Cyklopy;
  - the **Wyposażenie** is a stock and not a deck (21.2), so a Hełm leaving a
    hand goes back on the shop's shelf by `stockLeft`'s arithmetic. Eleven of
    the twelve are *also* in the event deck, so pushing one onto the used pile
    would hand the deck a thirteenth Hełm and the shop its own back at once.

  Which settles what a death does with trofea: in „karty pokonanych" the hoarded
  Karty go to the stos zużytych like everything else, and in „punkty" nothing
  goes back because the Karta went back at the kill — only the points are lost.

- **Dolny Krąg was stored counter-clockwise.** The cycle was right, so every
  distance and adjacency was right, but `destination` reads a rising index as
  "zgodnie ze wskazówkami zegara" — so the app named the two directions the
  wrong way round on the lower ring. Harmless in simulation, wrong at a table
  where a hand moves the figure. The scan settles it: that ring's top edge reads
  Osada, Step, Mokradła left to right. All three rings are now stored clockwise
  and boardMap.test.ts holds them to it.
- **The two bridge entrances were crossed.** Ruiny Twierdzy sits on the outer
  ring's top edge and opens onto the top of the bridge; Wymarłe Miasto is on the
  bottom edge and opens onto the bottom. They were mapped to the opposite ends,
  which walked a character the length of the bridge past the wrong creatures.
- **Only one direction of each crossing is defended** (11.3, 11.7, and both
  fields' printed text). Going back down costs nothing and needs no roll; the
  app was charging a point of Życie for failing a test the rules do not set.
- **Rycerz Wiecznych Śniegów stands on Przełęcz Wichrów, not Dolina Czaszek** —
  Miecz 10, and he ignores anyone arriving from Dolina Czaszek.
- The board's own draw counts agree with the ring arrays on **all 34** middle
  and outer ring fields, which is two independent readings of the scan agreeing.

- The deck contains genuine **duplicates** (4x "1 SZTUKA ZŁOTA", 2x "UPIÓR",
  4x "MAGICZNY MIECZ"), so a card id is not unique. `sheet + index` is the key.
  These are **deliberate design, not a transcription artefact**: the assets are
  printed sheets the owner cuts up with scissors, and a card printed four times
  is four times as likely to be drawn. The simulated deck holds every printed
  copy, so draw odds match the physical game exactly. Asserted in deck.test.ts.
  The game is reproduced 1:1 from the assets and the rulebook; any deliberate
  deviation gets documented when it is made.
- **Kat** prints `natura: dowolna` and chooses at setup — the only character the
  three-value Nature enum cannot hold. Hence `StartingNature`.
- **Tragarz** is filed as a Przyjaciel, not a Przedmiot, so the rule 5.4
  carrying-limit check cannot key off item-ness.
- Fourteen cards shipped with the placeholder title **"NAZWA KARTY"** — the
  print files were never finished. Named from their body text in overrides.json.
- Event class split: przedmiot 63, wrog 32, spotkanie 20, przyjaciel 20,
  nieznajomy 17, miejsce 13 = 165.

- The resolution numerals printed on the cards are **I Spotkanie, II Wróg,
  IV Nieznajomy, V Przedmiot, V Przyjaciel, VI Miejsce** — verified against the
  card headers. Przedmiot and Przyjaciel share V, matching rule 16.6 which names
  them in one clause. III is unused by any base-game card. An earlier guess of
  III/IV for Nieznajomy/Przyjaciel resolved turns in the wrong order.

