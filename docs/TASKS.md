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

- [ ] **The last 5 cards.** 133 of 138 distinct event cards have a script — 128
      `pelne` and 5 `czesciowe`, after the sweep of 2026-08-31 took the MANUAL
      list from twenty-two clauses to seven. The app says on screen which is
      which — see `coverage.ts`.

      The Diament Królów has come off this list. The Mgła was never on it and
      should have been: it had a script, so it counted as `pelne`, and the
      script was `{ op: "nic" }` with a two-turn countdown — the app telling a
      table that the storm which halves everybody's walk does nothing. It is a
      `move-max` of 1 on every seat now. Its twin the **Układ Planet** is the
      fifth `czesciowe`: „podwojona zostaje Magia wszystkich Demonów" is the
      same wall as the Wampir below, so it keeps the clock and names the half
      it does not do.

      The five with nothing at all, and what each of them actually wants:

      - ~~**Sobowtór**~~ — built 2026-09-04: `sobowtor: STRAZUJE()`.
      - ~~**Kometa**~~ — built 2026-09-04: `katastrofa` (a class swept off the
        acting seat's Krąg — every `field_cards` row that matches, and
        whatever the turn already lifted into its own `drawn` and had not yet
        resolved — to the used pile through `putOnPile`, chained through
        `apply`; a `granted` card is only deleted) and a new journal kind,
        `card-destroyed`, cited to nothing: it is the Karta's own text, the
        way `lost-card` already is, and reads „giną" rather than „traci"
        because nothing here was ever held.
      - ~~**Turniej Rycerski**~~ — **parked 2026-09-05 with the rest of Postać
        przeciw Postaci**, so the dynamic-choice design it was waiting on is
        not needed yet. It is out of the deck entirely; see "Postać przeciw
        Postaci" below. When duels come back, the design problem comes back
        with them: „wyzwać każdą Postać" is a choice among however many
        Postacie are at the table now, and `wybor` is a fixed list re-walked
        by index — `Target` has `inna-postac`, but `seatsTargeted` answers
        null for it and every op punts it to manual.
      - ~~**Wampir**~~ — built 2026-09-04 on the card holder: his growth is a
        `points` status on his own row, read before the dice.
      - **Tajemna Sakwa** — blocked. "W Sakwie możesz umieścić 1 Przedmiot" is
        the container link the Magiczna Sakwa and the Tragarz also want.

      So they are three afternoons and two blockers, not five puzzles.

      Three reasons listed here have since gone. A consumable spent at a moment
      of the holder's choosing is `uses.ts`; a friend that imposes an ongoing
      restriction rather than a bonus is a `Modifier` (the Południca's one field
      a turn, the Zły Duch barring new friends until the Pustelnia); and the
      Zwierciadło Zniszczenia is scripted.

      Eleven have come off the list. Five earlier: the Wędrowiec, Godzina
      Duchów, the Kryształ Magów, the Przybysz z Krainy Cieni and the Trójgłowy
      Smok. Six more while playing: Danina, Zaklinacz Czasu, Kuglarz, Mędrzec,
      Tajemnicza Szkatuła and the Alchemik — each of which needed the effect
      vocabulary to grow by exactly one thing, and each time because the card is
      shaped that way rather than to make one card fit. Targeting by Natura and
      by Krąg, which used to be listed here as a reason a card could not be
      encoded, is now `Target`.

      The blocker this bullet used to name — **a bonus that lasts one turn**,
      wanted by the Eliksir Siły, the Najemnik, the Kryształ Losu and both
      fruits — is built. It went where the note predicted, into one piece of
      vocabulary rather than five special cases: a `Modifier` with an `Ends`,
      kept in `seat_effects`. `{ kind: "turns", turns: 1 }` is exactly it.
- [ ] ~~**17.9's spoils, in the browser.**~~ **Parked 2026-09-05 with duels**
      (`PVP_PARKED`), because a won *duel* is the only fight that does not
      settle itself — beating a Wróg settles on its own and always did. The
      engine and the console still take them; when duels come back this is
      what is left, and it is small: the press exists (`fight-done`) and the
      route reads `spoils` / `spoilsHoldingId`, so it is a picker on a button
      that is already there.
- [ ] **Nature-dependent cards** — the seat's Nature is known, so these are
      resolvable once Kat's setup choice is handled.
- [ ] **Two weapons at once**, for a character with the ability in the slotowy
      variant — none has one yet. See **Wariant: ekwipunek slotowy** in
      [COVERAGE.md](COVERAGE.md).

### ~~Class II and class III as two separate battles (17.5, 18.2)~~ — checked 2026-09-05, already carried

This section said the whole of the task was "whether `fight.ts` sums a pack at
all, and whether it would now split one correctly along the class line", and
that nobody had read it against 17.5 since the classes became two. Read now,
and both halves were already there:

- **It sums.** `beginFight` builds `foes` from every named card and
  `attackAsOne` returns one opponent with the totals combined — „Miecze tych
  istot są sumowane" — with one roll against the sum. `foeBonusAt` is added
  once per creature rather than once to the sum, because the Kamienny Las says
  „każdy Wróg".
- **It splits.** `attackAsOne` returns null the moment two `CombatKind`s are in
  the pack, and `beginFight` refuses with „Zwykli i magiczni Wrogowie nie
  atakują razem — rozpatrzcie osobno (18.1)". So a mixed Obszar is two fights,
  by refusal rather than by silently flattening or auto-splitting.
- **In the right order.** `resolutionOrder` sorts the drawn stack by
  `CARD_CLASS`, and `afterDraw` re-runs it every time a card joins, so class II
  is resolved before class III without anyone having to remember 15.2.

Pinned already, in three places: `fight.test.ts` for the refusal,
`combat.test.ts` for `attackAsOne`, and `resolutionOrder` in six test files.
Nothing to build; the section was open only because nobody had gone and looked.

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

### Card vocabularies — decided 2026-09-04

Six ways of saying what a card does, surveyed in the architecture pass (see
LANDED.md). Three are different things and stay apart: an **Effect** is a
happening, a **FieldScript** is a menu of them, and what a holder is *under*
is a **Status** (CONTEXT.md). The other three decisions, and the order:

- [x] **The prose reader goes.** `cardEffects.ts` (`suggestActions`) and the
      `RollTable` component it fed are deleted; the Obszar window renders its
      die table from `fieldScript`'s typed `rzut` `Effect` only, through
      `OfferList`/`FieldService`. Companion's read-only table survives from
      that same typed source — `field-services.tsx`'s `ScriptedRoll` already
      covered both simulation (server rolls) and companion (pick the die face
      your own die showed) before this landed, so nothing needed re-feeding.
      `rollTable.ts`'s `parseRollTable` stays, narrowed to a detector for
      `fieldRollTable.test.ts`'s coverage check — every Obszar whose prose
      reads as a table now needs a typed `FieldOffer` or a Kamienny Most
      ordeal, not a live reader of its own.
- [ ] **One Status vocabulary, two sources.** Staged, one reader at a time,
      so every step keeps the suite green:
      1. ~~`Ends` gains `{ kind: "held" }`; `heldStatuses(holdings, eqMode,
         nature)` projects a held card's abilities into `Status` rows at read
         time.~~ Built 2026-09-04: `HELD_TWIN` is an exhaustive table over
         `Ability["kind"]` — two twins (`punkty`→`points` with `tylkoWalka`,
         `bez-zaklec`→`no-spells`) and a stated reason for every null — and
         `seatView.standing` is applied plus held. No reader has moved yet.
      2. Readers move one at a time, each with tests: ~~points~~ (done
         2026-09-04: `seatView`'s `parametr` and `walka` are
         `bonusFrom(standing, as)`; the held projection reads `lentBy` per
         card so a printed corner counts too, and honours the two
         suspensions; the spell cap stays on the held half alone;
         `bonusFromHoldings` survives for `fight.ts`'s single-card
         correction, reading the same map), ~~spell limits~~ (done: `whyNoSpells`
         reads `standing`; `zaklecia-ponad-limit` stays in `spellAllowance`),
         ~~osłona~~ (done 2026-09-04: Hełm/Tarcza/Zbroja's `oslona` is a
         `points`-shaped twin, `shieldUpTo` takes the widest; `shieldSaves`
         reads `standing`; `bestShield` deleted once nothing called it),
         ~~carrying~~ (done 2026-09-04: Koń/Muł/Zaprzęg/Magiczna
         Sakwa/Tragarz's `udzwig` is a standing twin, `carryBonus` sums and
         goes `Infinity` for the Zaprzęg; `derive.carryLimit` builds
         `heldStatuses` itself so its four callers stay unchanged, and a
         Tragarz — which `inPlayAt` alone never puts anywhere in slotowy —
         now carries there too, matching every other Przyjaciel's bonus;
         `abilities.ts`'s own `carryLimit` deleted with it), ~~crossings~~
         (settled 2026-09-04 — **on a wrong fact, corrected 2026-09-05**. The
         reason given was that `przeprawa-kostki` is printed on Rusałka, a
         Postać, so nothing held could produce it. Rusałka is a **Przyjaciel**,
         a `friend` card in `events.json`, and `heldStatuses` walks friends —
         so the twin would fire and this reader *can* be folded like the
         others. What survives of the original reasoning is the narrower
         half: `przeprawa` is a *granted* crossing and `przeprawa-kostki` is
         how many dice, so there is no second spelling to retire and no bug —
         only a reader that has not moved. What did move is `grantedCrossing`,
         from the stored half to the whole `standing` list. **Open again**, as
         a small fold nobody has done), ~~`ocalenie`~~ (done
         2026-09-04, and it was a duplicated projection rather than a
         reader: `spendLife` mapped `snapshot.effects` by hand into what
         `storedStatuses` already returns. It stays on the **stored** half
         on purpose — an Ocalony is spent by deleting its row, and a held
         status has no row to delete — and the three friends who die in
         your place stay on `diesForYou`, being scoped to a defeat and
         costing a Karta rather than being any loss at all), the rest.
      3. ~~`Ability` kinds whose reader has moved become `Modifier` kinds.~~
         **Dropped 2026-09-04, after tracing what it costs.** It was the
         wrong shape and the plan was wrong to name it. `ABILITIES` is one
         table saying what every card and Charakterystyka prints;
         `describeAbility` renders it on the seat card; and `BONUS_BY_ID` —
         the very lookup this step cited as the pattern to copy — is *built
         from* `ABILITIES` rather than replacing it, so even `punkty`, whose
         reader moved first, still needs its kind. Retiring the kinds would
         scatter card data into ad-hoc per-fact tables and lose the printed
         line the seat card shows, to remove a duplication that was never in
         the data. The duplication was in the **readers**, and steps one and
         two are what fixed it.

         What stands instead, in CONTEXT.md: an `Ability` is what a card
         *prints*, a `Status` is what is *true of a holder now*, and
         `HELD_TWIN` is the exhaustive bridge, so a new Ability kind cannot
         be added without somebody saying whether it stands. Three dead
         readers were deleted on the way past (`bestShield`,
         `cannotUseSpells`, `abilities.ts`'s own `carryLimit`), which is all
         the cleanup this step really had in it.

         This also answers the question crossings deferred: a Postać's
         printed abilities stay abilities. There was never a second spelling
         of them to retire.
- [x] **A Zaklęcie's script is its truth.** Done — verified 2026-09-05 by
      counting rather than by memory: all 27 entries in `SPELLS` carry a
      `stosuje`, `applies` or `reactive`, and the regex reader of card prose
      (`cardEffects.ts`) is deleted. Two are partial and say which half in
      `MANUAL` — KRĄG PŁOMIENI's dispel and OCALONY's two thirds. This box
      stayed unticked after the work landed, which is its own small lesson:
      a checklist item is only as good as somebody closing it.

### Music

Might and Magic VI's redbook tracks, exported and wired to nothing yet — see
LANDED.md for what is built (`src/lib/music/`, `/music`).

- [ ] Source audio: MM6's Music folder from a GOG copy into `assets/music/`
- [ ] `npm run music`, then commit `public/music` (~14 MB for the five)
- [ ] Pick a hold length at a real table, then connect: the active seat's field
      to its `region`, which is already the `MusicZone` shape.

### The table screen

`page.tsx` is fed from `TheTable` now (LANDED.md). Two seams left, each its own:

- [x] The sheet and the five questions asked on it are `sheet/` — nine files
      whose one door from outside is `overlays.tsx` importing `DrawModal`.
      `card-facts`, `crossing-controls` and `die-mark` stay out because the
      field side reads them too; the boundary was measured off the import
      graph, not guessed.
- [x] `sheet/drawn-actions.tsx` 1,050 → 756: its decisions are
      `drawn-decisions.ts`, a pure function with tests, the way `turn-view.ts`
      is for the screen; the die table, the Obszar dropdown and the pack tile
      are leaves of their own. The three renders diff byte-identical apart
      from the die table becoming a component.
- [ ] `sweep.py`, the end-to-end harness against the real routes, is worth
      rewriting rather than restoring — what it is *for* is asserting against
      the routes, and that is the part worth keeping.

## Parked

### Postacie' own powers — parked 2026-09-05 (`CHARACTER_POWERS_PARKED`)

**Every printed clause on a Karta Postaci except the starting kit.** Same
shape and same promise as the two parkings below: nothing deleted, one flip
brings them back. `abilitiesOfCharacter` is the single door a character's
typed abilities come through, so returning nothing from it switches off all
sixteen — six field safeties, three escapes, three roll modifiers,
`bez-oplaty`, `magia-do-miecza`, `zakazane`, `natura-dowolna` — without a
guard in any of the seven readers that ask.

**Why all of them rather than only the unbuilt ones.** 89 clauses are printed
across the 27 Kartas Postaci and the app ran 34 of them: 18 starting kits and
16 encoded abilities, the latter across only 10 characters. A Karta that keeps
sixteen of its promises and breaks fifty-five is harder to play with than one
that keeps none and says so, because a player cannot tell which sixteen. The
line is drawn where it can be said in a sentence: **the app deals your kit,
and everything else on the card is yours to apply.**

**What is left, and it is not nothing.** Postacie still differ by their
printed Miecz and Magia, by their starting gear and spells, by where they
begin, and by their Natura. That is the character-selection decision mostly
intact; what goes is the per-Obszar exception, which is also the part nobody
could keep track of at a table anyway.

**Stated as a live list, not a parked one.** `LIVE_ABILITIES` names the clauses
the app carries — one per Postać, two for the Książę — and `parkedAbility`
returns the inverse, so anything nobody has listed is dimmed **by default**.
That direction is the point: a clause the app learns to run must be *added* to
show live, so the failure mode is a Karta that under-promises and can be
checked against the paper, rather than one that over-promises and is
discovered mid-fight. `disabled.test.ts` pins every live index by words only
that clause contains, and cross-checks the list against `STARTING_KIT`.

**Known partial:** the Książę's gear clause also promises he may always replace
what he loses, and that half is not carried. The clause stays live anyway,
since striking it through would deny the kit it does deal.

**What it costs to bring one back:** the reader already exists for all sixteen.
Flipping the boolean restores them all at once; carrying a single clause
instead means adding its index to `LIVE_ABILITIES` and gating the rest.

### Postać przeciw Postaci — parked 2026-09-05 (`PVP_PARKED`)

**The feature is coming; it is not built.** `PVP_PARKED` in
`src/lib/engine/disabled.ts` is a `const true` in the same shape as
`COMPANION_PARKED`: nothing is deleted, and flipping it to false brings duels
back with no other change.

**What is off.** 17.6-10 (resolving a fight between Postacie, the escape into
it, the spoils, the draw), 18.1b (a Charakterystyka's magical attack on
another Postać), and 19.1-2's escape *from* a Postać.

**Two doors, not one.** `attackSeat` is the obvious one and refuses first,
before any more specific refusal can fire. `sendRaider` is the other and was
missed on the first pass: the POSZUKIWACZ PRZYGÓD is sent „by zaatakował
Postać **lub** Wroga", so a raid aimed at a seat is a duel by proxy — he goes
instead of you, but the Życie is another player's all the same. Raiding a Wróg
is untouched, and is most of what he is for.

**What is untouched**, because 13.3 has two branches and only the first is a
fight. Meeting a Postać to use an ability on her is unaffected — the Wiedźma's
urok, the Spryciarz's shilling, the Awanturnik's and Quark's „zamiast
atakować", the Błędny Rycerz taking a Krzyżowiec — though "unaffected" is a
low bar here, since none of those five is wired as a command yet either; they
are the table's before and after this. So does every Zaklęcie
spoken at another player, hostile ones included: the Krąg Płomieni, Szaleństwo,
Władca Czarów, Siedem Wichrów, Powiew Śmierci — which says outright „nie
trzeba toczyć walki".

**What went with it.**

- One Karta, out of the deck entirely: **TURNIEJ RYCERSKI**, whose whole text
  is „możesz wyzwać na pojedynek każdą Postać".
- Nine printed clauses on seven Kartas Postaci, dimmed rather than hidden —
  Barbarzyńca, Demon, Kat (two), Łotr (two), Olbrzym, Rycerz Ciemności,
  Zdobywca. All 27 Postacie stay pickable; the Kat and the Łotr lose two of
  their four and nobody loses everything. The Rycerz Ciemności keeps
  „atakując możesz wybrać formę walki", which is 18.1b's own permission and is
  how he attacks a *Wróg* with Magia.
- The **DOBRE BÓSTWO** stays in the deck but stops being able to convict, and
  now says so in `MANUAL`. Its trigger has two halves and the app can reach
  neither: `attackSeat` wrote `how: "atak"` and is parked, and while
  `how: "zdolnosc"` is modelled and rendered, **no command sets it** — none of
  the five Charakterystyki that meet a Postać without fighting her is wired as
  a command yet. Left alone it would have acquitted everybody silently, which
  is the app deciding a judgement rather than handing it back. Worth knowing
  before flipping `PVP_PARKED`: that note comes off the moment either half
  becomes reachable.

**The convention this established**, and the reason it is written down here
rather than only in the card's own note: a card that the app cannot run is
*parked*, not half-carried. It is absent from every pile, refused at every
console door that could conjure it, and shown in the Księga Tolimana dimmed
and struck through with one red word — „Niedostępne" — and no explanation. The
reason lives in the code and in this file, never on screen. That is a
different thing from `coverage.ts`'s `MANUAL`, which is for a card that **is**
in the deck and will be drawn, with one clause the table applies itself. Two
lists, two meanings, and neither should grow into the other.

**Companion mode** (`COMPANION_PARKED`) is the only thing left, and this work
went through it. `no_device` is gone: a chair the host filled in by hand is now
simply one nobody is driving, which `mayChooseFor`, `dealCharacters` and the
`away` reading in `envelope.ts` all agree about.

One thing does *not* agree, and it is written down rather than fixed, because
building for a mode nobody runs is how you get two guesses instead of one:

- **The shared screen cannot act.** `mayAct` still grants `tableScreen` to a
  host in companion mode, and that is right — in companion every hidden thing
  is a physical card and the app holds nothing worth keeping from the room. But
  the host is a *user* now and may hold no seat at all, and the turn route
  refuses a seatless actor ("Nie prowadzisz żadnej Postaci") **before** `mayAct`
  is ever consulted. So a table screen that runs the game without playing —
  which the split made possible and which is the whole point of a companion
  table — is blocked one layer above the rule that allows it.

  When the boolean flips: the turn route's seatless guard has to ask `mayAct`
  first and let `tableScreen` through, and every command it then reaches needs a
  seat named in the body rather than taken from the actor. That is the shape of
  the work, and it is not small.

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

