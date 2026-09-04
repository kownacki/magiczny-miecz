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

      **A status has nowhere to sit on a Karta lying on an Obszar.**
      `seat_effects.seat_id` is `not null`. That one constraint stops the Krąg
      Płomieni's burning Wróg, the Władca Gromu's paralysed creatures, half of
      the Ocalony, and the Wampir's growing Życie. One migration, four cards —
      **on the database three other projects share, so it is Michał's to
      approve.**

      **Nothing records which Przedmioty are inside a container.** The Magiczna
      Sakwa and the Tragarz destroy what they carried and the app sheds the
      overflow onto the Obszar instead, which is wrong in the player's favour;
      the Tajemna Sakwa wants the same link. `carried_by` already does exactly
      this for a Krzyżowiec's Zaklęcie — but putting a Przedmiot *into* a Sakwa
      is something a player has to be able to do, so this is **a feature, and
      wants Michał's say on whether it earns its UI.**

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

      - **Sobowtór** — one line. His strength being his opponent's is already
        carried in `cards.ts` and tested; what he lacks is a `SCRIPTS` entry, so
        "Pozostanie tu, aż ktoś go pokona" is unencoded and `coverageOf` calls
        him `brak` — "aplikacja jej nie prowadzi" — about a card the app fights
        correctly. `sobowtor: STRAZUJE()` answers both.
      - **Kometa** — buildable today, no new model. "Giną wszyscy Nieznajomi"
        is a sweep of one class off the Kraina you are walking: the `stranger`
        rows in that ring go to the used pile.
      - **Turniej Rycerski** — assembly. A challenge, a teleport and an ordinary
        duel, all three of which exist.
      - **Wampir** — blocked. His Życie grows as he wins, which is a number
        that has to live on the Karta lying on the Obszar. Same wall as the
        three partial Zaklęcia (LANDED.md).
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
- [ ] **17.9's spoils, in the browser.** The engine and the console take them
      — see LANDED.md. A won duel is the one fight that does not settle itself:
      `fight` says who won and `spoils` takes it. The console asks; the browser
      does not yet, and that is all that is left — the press exists
      (`fight-done`) and the route reads `spoils` / `spoilsHoldingId`, so it is
      a picker on a button that is already there.
- [ ] **Nature-dependent cards** — the seat's Nature is known, so these are
      resolvable once Kat's setup choice is handled.
- [ ] **Two weapons at once**, for a character with the ability in the slotowy
      variant — none has one yet. See **Wariant: ekwipunek slotowy** in
      [COVERAGE.md](COVERAGE.md).

### Class II and class III as two separate battles (17.5, 18.2)

The Demon getting its own class (`CARD_CLASS.demon`) made explicit something
the engine has never been asked about. 17.5:

> Więcej niż jeden przeciwnik. Jeżeli Postać jest atakowana przez więcej niż
> jedną istotę, **Miecze tych istot są sumowane**, a do uzyskanego rezultatu
> dodawany jest wynik rzutu kostką.

and 18.2 resolves magical combat "w identyczny sposób". So a Wilk and a
Wilkołak on one Obszar are **one** fight at Miecz 12, not two fights in some
order — and because Miecz and Magia cannot be added, an Obszar holding both
kinds gives exactly **two** fights: the summed II first, then the summed III.

What was NOT checked, and is the whole of the task: whether `fight.ts` sums a
pack at all, and whether it would now split one correctly along the class line.
`fought` already lists a pack's members and `trophiesFrom` walks them, so
something knows about packs; nobody has read it against 17.5 since the classes
were two.

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

