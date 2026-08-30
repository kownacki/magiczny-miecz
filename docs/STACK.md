# The resolution stack

**Status: step 3's two cards proven live; law 4 waiting on Michał** (2026-08-31).
The Trójgłowy Smok is the `loop` frame's first occupant — three heads, one at a
time, regrown on anything but a win — and the CHOCHLIK is the `ask` frame's,
the first question in the box that belongs to no card script. Both MANUAL
entries are deleted, and nine of the acceptance test's eleven moments now run.
What each took, and the narrowings they settled, is below the steps table.
Law 4 is not started and should not be until the question in "Law 4 is blocked
on a question" is answered.

**Proven live on table PHK2P**, two devices and a spectator against a running
server, which is step 4's gate for the parts step 3 built:

- The Smok opened as `[field, loop, fight]` from `summon`, cut a head at a
  time, and paid out **exactly once** — no trophy after heads 1 and 2, one
  trophy after head 3, Życie untouched. Lost on the second head instead and the
  attempt ended with `fought: [trogglowy-smok]`, one point of Życie gone, no
  trophy, the loop frame away. The journal said it in its own words: *"przegrywa
  walkę z: TRÓGGŁOWY SMOK (głowa 2 z 3). Odcięte odrastają (1)."*
- `look` printed the loop through `frameLabel` — `Stack: the Obszar › TRÓGGŁOWY
  SMOK: głowa 1 z 3 › fight` — which was the one piece with no unit test.
- **The redaction holds over the wire.** The seat being asked received
  `refs: ["zaklecia#2", "wyposazenie-zaklecia#11"]`; another seat and a
  spectator both received `refs: [], count: 2`. On screen that is two named
  Karty with their text on one device and two face-down backs plus *"Ania
  wybiera jedno z 2 Zaklęć — zakryte dla reszty stołu (9.3)"* on the other.
- The button was pressed in a browser, not posted: the panel closed, the
  Zaklęcie arrived face down, and the Karta not chosen was back on top of the
  stos. Another seat pressing it is refused.

**Status: step 2 built** (2026-08-30). The walker suspends into `script` frames
with a cursor and resumes through `continueTopScript`; the all-or-nothing gate
is gone; every ordinary fight pushes over the field and `closeFightFrame` is
the one close; the stores chain a fight's close into the revealed card's
continuation; `answer` reaches a frame from the route and the console; the
browser renders a suspended frame's question. Proven live: Kurhan's face 6
suspended `[field, script, fight]` over the wire, the Duch was fought and
lost, and the mark landed on the field two commits after the suspension.
Steps 3–4 are still to come. The laws below were decided before any code.

The engine keeps one frame of turn state and forgets where it was whenever
something opens on top of it. This page is the specification for replacing
that frame with a stack, written before any code so the design cannot drift
while being built. The acceptance test is at the end; it is written as a test
before the first engine commit, and it is what "done" means.

## What is wrong today

`games.turn_state` is a single `TurnPhase` — `roll | move | field | fight |
bridge | end`. Card scripts are a tree of 27 ops (`po-kolei`, `wybor`, `rzut`,
`gdy` composing the rest) walked recursively by `effects.ts`. When a step opens
something that has to finish first, the engine handles it by **replacement**
plus two escape hatches:

- `Fight.resume` — one level deep, hard-coded to `{ phase: "roll" }`, used only
  by summoned creatures.
- `placeSeat` — a teleport overwrites the field frame with a fresh one at the
  destination.

And a decision is handled by **re-walking**: `wybor` returns the whole effect
as `pending`, the browser answers with a number, and the server re-runs the card
from the top with `choices` in hand. That is why `po-kolei` has an "all or
nothing" branch — the first step's point of Miecz cannot be written before the
second step's question, because nothing remembers *where in the card* the turn
is.

The evidence that this is a real limit and not a theoretical one: **the corpus
has zero scripts with a `walka` inside a `po-kolei`.** Not because no card does
that — Grota's faces 5 and 6, Sidh's 4 to 6 — but because a fight replaces the
frame and the rest of the sequence would be lost, so nobody authored one. Six of
the twenty MANUAL entries in `coverage.ts` are the same gap wearing different
cards.

## Why a stack and not a DAG

A DAG models partial order: several things pending at once, each waiting on
some subset of the others, more than one valid order to finish them in. This
game has none of that. All 677 card texts (165 base, 512 across the five
expansions in `../magiczny-miecz-dodatki`) and all five rulebooks were read
against the two things that would break a stack — two decisions owed to two
people at the same instant with no ordering rule, and an order that matters and
is nobody's to choose — and neither occurs. Nineteen cards touch several
players; every one reduces to one-at-a-time:

- **Everyone rolls** (Walka Dzikich, Burza Siedmiu Słońc, Zaklinacz Czasu) — N
  settled rolls, no decision, independent, so any order is correct.
- **Each arriving player chooses** (Okruch Raju, Ogrody Mroku) — sequential by
  arrival.
- **One seat decides inside other seats' turns** (Znak Labiryntu, Znak Trzech
  Kręgów, Sarin ②) — a frame owed to a non-active seat at a fixed point in
  somebody else's turn. Sequential, and the reason a frame carries a `seatId`.
- **Krypta IV.3, "Smok i Księżniczka"** — "kolejno", in the rule's own word.

Every open action waits on exactly the one opened above it. That is a chain
with one open end, which is a stack. A DAG here would be a stack whose
`dependsOn` always has one entry, with a scheduler that only ever finds one
runnable node — and it would make the real question ("what is on screen, and
whose answer is owed") a graph query instead of `top()`.

## The five laws

Each is a rule the stack enforces, with the printed rule it comes from. A
reader who follows the number should land on the sentence quoted.

**1. Cards go on in 15.1/15.2 order.** Fixtures first ("rozpatrywane są w
pierwszej kolejności"), then by numeral ("Karta o najniższym numerze
rozpatrywana jest jako pierwsza"). The field frame holds the drawn cards; each
is pushed as a `script` frame in that order, one at a time. A tie on numeral is
the player's to order — an `ask` for which next, then a push — still one open
thing.

**2. A teleport is a cut.** 15.2's own worked example: Obbol draws three on
Płaskowyż Mgieł, Zaklęta Ścieżka moves him, and the rulebook says outright he
will *not* fight the Niedźwiedź and will *not* take the gold — they stay face up
for the next character — and he continues "tak, jakby jego ruch zakończył się
na Równinie Traw". So `przenies` pops down to and including the `field` frame
and pushes a new one at the destination with `draw: 0`. What was above is
abandoned, not queued. No card in 677 wants the opposite ("go there, come back
and finish"); if one turns up it pushes a field frame instead of cutting, and it
is a different op.

**3. A fight is one comparison; a loop is N fights.** 17.4: one die each,
compared, "na tym walka się kończy". Trójgłowy Smok's three heads are three
`fight` frames pushed in turn by a `loop` frame that owns the head count and the
reset-on-loss rule. 16.4 says a Wróg cannot be walked past, which is why the
field frame will not pop while an unfought Wróg is in it.

**4. A cast is a push above the fight, before the dice.** 17.3: spells go
before the roll. 17.7: both duelists may. 9.6 and the "w dowolnej chwili" group
(18 spells) let a bystander speak into somebody else's fight. The `SpellFloor`
already serialises who may — one claimant, one deadline — and stays exactly as
it is. What changes is that the cast becomes a `cast` frame above the `fight`,
whose resolution may alter or stop the fight beneath it (Krąg Płomieni). Never
between the dice: the floor closes when the roll starts.

**5. A frame knows whose answer it is waiting for.** `seatId` on every frame
that can owe a decision. In the base game that is almost always the active
seat; 17.7's defender and Koszmar's "pierwsza Zła Postać" are not, and the
expansions' Znak cards owe a decision to a seat that is not even moving. Today
"whose turn to answer" is implicit and the browser guesses.

## The shape

```ts
type Frame =
  | { kind: "roll" }
  | { kind: "move"; roll; options }
  | { kind: "field"; fieldId; from; draw; drawn; resolved; fought }
  | { kind: "fight"; fight: Fight }
  | { kind: "bridge"; bridge }
  | { kind: "end" }
  // new
  | { kind: "script"; seatId; cardId; effect: Effect; cursor: number[]; reason }
  | { kind: "ask"; seatId; question: Effect; cardId? }
  | { kind: "cast"; seatId; spellId; target }
  | { kind: "loop"; seatId; of: Frame; times; done; onLoss: "reset" | "stop" };

turn_state = { stack: Frame[] }   // top is what is on screen
```

Three operations, all pure `Snapshot → Changeset`, all under the same CAS on
`games.revision`:

- **push** — `walka` pushes a fight above the script; `wybor` pushes an `ask`;
  a spell pushes a `cast`.
- **pop** — `endFight` pops and the frame beneath resumes at its `cursor`.
  `Fight.resume` and the all-or-nothing branch delete themselves.
- **cut** — `przenies` to a field: pop to the `field` frame inclusive, push a
  fresh one.

`Decisions` stays a list of numbers and targets **the top frame**, not the
card: the server still re-walks what it owns, but from the cursor rather than
the root.

Nothing else moves. Still one JSON column; still one `Changeset` per command;
still `RandomPort` as the only port; still one journal line per thing that
happened. The `Effect` tree and its 27 ops are untouched — the tree already is
the program, this adds the program counter.

**Deliberately not built:** a generic trigger/event bus. Standing rules stay
`status.ts` modifiers read at derive time. The Znak cards' "before every
player's move" is a status that pushes a frame at a known point, not a
subscription.

## Rulings taken

- Teleport is a cut (law 2). Michał, 2026-08-30, on the Obbol reading.
- A bystander's spell resolves before the dice, never between them (law 4).
- Live tables are disposable: `loadSnapshot` reads the old one-frame shape as a
  one-frame stack for one release and no converter is written. Nothing mid-turn
  in the database is worth keeping.

## The steps

| step | what | gate |
|---|---|---|
| **0** | this page; the acceptance test below written as a test | the test exists and is skipped |
| **1** | `turn_state = { stack }`; `top()`; every read goes through `top()`, every write through `only`/`replaceTop`/`push`/`pop`; `Fight.resume` deleted — a summoned fight **pushes** over the frame it interrupted and closing it pops | suite green; console `state` prints the stack when it is deeper than one |
| **2** | `script` frames with a cursor; `ask` replaces `pending` re-walk; `walka` inside a script pushes; `cast` above `fight` | acceptance test passes; `po-kolei`'s all-or-nothing branch is gone |
| **3** | cash in: Trójgłowy Smok (`loop`), CHOCHLIK (`ask` outside a script), Odmiana Losu by a bystander, the 18 anytime spells acting on the fight beneath | one commit per card; its MANUAL entry deleted; `coverage.ts` shrinks |
| **4** | browser: draw sheet and fight sheet render `top(stack)`; "waiting for X" drawn from the frame's `seatId` | the scenario clicked through on a real table |

**Order within each step: engine, then the console (terminal and browser
`>_`), then the GUI.** The console is the cheapest surface and the one that
prints the stack raw; if it cannot show a frame, the GUI has nothing to draw.

**Step 2's own narrowings, recorded here** (2026-08-30):

- **No standalone `ask` frame yet.** A `script` frame whose cursor stands on a
  decision *is* the ask — `seatId`, question and all — so the separate kind in
  the sketch above has no occupant until step 3's CHOCHLIK, whose question
  belongs to no card script. It arrives with him.
- **Guardian fights stay replacements.** The bridge and crossing guardians
  resolve into `endTurn()` and resume nothing beneath; pushing them would be
  depth with no reader.
- **The browser's batching stays.** An ordinary own-`wybor` still resolves in
  one commit with the choices batched in; frames appear only where the atomic
  walk genuinely cannot finish. The acceptance test's card moments (the Smok
  loop, bystander casts) close with step 3, which authors the cards; the
  mechanisms behind them are pinned by `scriptFrames.test.ts`.

**A narrowing taken in step 1, recorded here** (2026-08-30): ordinary fights
still *replace* the field frame at depth 1, exactly as before — `endFight`
keeps rebuilding the field from the Fight's own copies, and only the summoned
fight genuinely pushes. Moving fights to push-over-field is step 2's work,
where the frame beneath becomes the source of truth; doing it in step 1 would
have made "zero behaviour change" unprovable. The frame discriminant also
stays `phase` (not the doc's sketched `kind`) — one rename fewer, same union.

**Step 3's first card, and the narrowings it took** (2026-08-31). Michał gave
the go; the Trójgłowy Smok is built, engine → console → GUI, and his MANUAL
entry is gone.

- **`of` is a `Fight`, not a `Frame`.** Law 3 says outright that a loop is N
  fights, and nothing else in 677 cards loops, so the template is typed as the
  thing it is. Widening it is a small change the day an expansion needs one.
- **No `onLoss`.** The sketch had `"reset" | "stop"`, and `"stop"` has no
  occupant *and* no meaning: `done` lives on the frame and the frame does not
  outlive the turn, so "keep what you cut" is a promise nothing here can keep.
  A round lost ends the attempt with the heads regrown, which is the card's own
  sentence.
- **A draw ends it the same way** (17.10 costs nothing, 17.4 still ends the
  fight). The card only says what a *loss* regrows, so this is a reading rather
  than a quotation — the honest one available, for the reason above. **Worth
  Michał's word**; the alternative is somewhere durable to keep a half-cut Smok
  between turns, which is a different change.
- **A loop is never the top of the stack at rest.** It opens with its first
  round above it and either pushes the next or closes, in the same commit. So
  every path that closes a fight asks `settleExposedLoop` — the escape (19.1)
  and the test hatch both do.
- **A head pays out nothing.** No trophy (1.4), no Władca errand, no Excalibur
  point; only the last winning round is the kill. The point of Życie a loss
  costs is *not* on that list, because 17.4 charges it for losing a fight and a
  head is a fight.
- **The pack is refused, not flattened.** 17.5 sums Miecze and rolls once; the
  Smok asks for three comparisons. `beginFight` throws and the browser does not
  offer "walcz ze wszystkimi naraz" when one of them fights in rounds.
- **No new journal kind.** A round is still 17.4 and still a fight ending, so
  it is a `fight-end` line carrying which head it was — a new kind would have
  cost a migration for a sentence that already had a home.

**Step 3's second card: the CHOCHLIK and the standalone `ask`** (2026-08-31).
Step 2 recorded that the `ask` kind had no occupant until this card, "whose
question belongs to no card script". It does now, and it brought four
decisions with it:

- **`question` is its own union, not an `Effect`.** The sketch had
  `question: Effect`, and the first occupant cannot use it: "which of these two
  Zaklęcia" is about two refs off a pile, and writing it as an `Effect` would
  mean inventing an op no authored card contains. A `Question` union of one
  sits on the frame instead, shaped so a second member is a member and not a
  special case.
- **The Karty are lifted, not pointed at.** The two come off the pile when the
  question opens and wait on the frame. That is what makes the offer honest —
  nothing drawn in between can change what was offered — and it is the reason
  the frame needs redacting, which a "top two of the pile" pointer would not.
- **`envelopeFor` is now the third door the deck's secret could walk through**,
  after `deck` and `seed`. `asSeenBy` empties the refs for every device but the
  one seat's and sends `count` in their place: the table may see two cards held
  up (9.3), and no more. The browser draws backs from the count.
- **`suspended.opens` became a union.** A `zaklecie` step inside a `po-kolei`
  suspends the same way a `walka` does, and `framed` opens whichever kind was
  asked for — so the card carries on after the answer instead of losing its
  tail. Only for `count: 1`, which is every `zaklecie` in the box; the
  Nieznajomy's price is charged before the question, because the coin buys the
  draw and the draw has happened by the time anything is on screen.

**Go/no-go after step 2**, before anything in step 3 deletes a MANUAL entry.
Not "point of no return" — git reverts anything — but the **last cheap exit**,
and Michał called the overstatement out. Step 1 changed no behaviour, so
reverting it loses only the reshaping. Reverting step 2 gets dearer with
everything stacked on it: rows holding frame kinds the old code never heard of,
a wire the browser has learned, and every card step 3 authors against the
frames. After step 3 a revert is not a rollback to equivalence, it is removing
features.

**Freeze during step 1:** nobody but this session edits `turn.ts`,
`effects.ts`, `fight.ts`. It touches 235 sites and a concurrent change in any of
them is a merge nobody wants.

## The acceptance test

Four players. Ania (Barbarzyńca, Miecz 5) is active. Bartek (Mag) holds
Odmiana Losu and Krąg Płomieni, two fields away. Celina (Elf, Zła) and Darek
elsewhere. Every card is in the box.

| # | what happens | stack after (top last) | law |
|---|---|---|---|
| 1 | Ania rolls 4, moves to Płaskowyż Mgieł | `field(plaskowyz, draw 3)` | — |
| 2 | draws Zaklęta Ścieżka (I), Trójgłowy Smok (II), Grota (III) | `field{drawn:3}` | 1 |
| 3 | **Bartek** casts Odmiana Losu "natychmiast po wzięciu": discards Ścieżka, draws Koszmar | `field`, `cast(seat B)` → pops → `field{drawn: Smok, Koszmar, Grota}` — order re-derived after the pop | 4, 5 |
| 4 | Koszmar: Ania is Chaotyczna; the wish is not hers; card stays | `field{resolved: koszmar}` | 1 |
| 5 | Smok: 16.4, cannot be walked past. Loop of three heads, 2 Miecz each | `field`, `loop(smok, 3)`, `fight(head 1)` | 3 |
| 6 | head 1: 5+5 vs 2+3, win | `field`, `loop{done:1}`, `fight(head 2)` | 3 |
| 7 | before head 2's dice, **Bartek** claims the floor, casts Krąg Płomieni on Ania | `field`, `loop`, `fight(head 2)`, `cast(seat B)`, `ask(seat A: use Władca Zaklęć?)` — **four deep** | 4, 5 |
| 8 | Ania has no Władca; the Krąg holds; the fight beneath cannot proceed; loop stops, heads reset | `field{fought: smok}` | 3, 4 |
| 9 | Grota is III and unreachable behind the Smok; settles as a fixture | `field` → `end` | 1 |
| 10 | next turn Celina arrives, 15.1 draws zero, faces Koszmar; she is Zła; wish = "przeniesienie do dowolnego Obszaru w tym Kręgu" | `field(plaskowyz)`, `script(koszmar)`, `ask(seat C)` → **cut** → `field(chosen, draw 0)` | 2, 5 |

**Corrected 2026-08-31, by the test finally running it.** Row 3 said the order
after the swap was `Koszmar, Smok, Grota`. It is `Smok, Koszmar, Grota`: the
Koszmar is a **Nieznajomy**, and the classes are the numerals printed on the
cards — Spotkanie I, Wróg II, Nieznajomy IV (`CARD_CLASS`, checked against the
headers). So 15.2 puts him behind the Smok rather than in front of the Ścieżka
he replaced, and moment 4 is the Nieznajomy dealt with *after* the Wróg. This
is what a scenario written before the code is for, and what it costs to leave
one unexecuted for three steps.

Assertions worth stating outright:

- After 3, the field's cards are in 15.2 order *including the one Bartek drew*.
- After 7, `top().seatId` is Ania's, and the frame below it is Bartek's — two
  different seats owing things, both legible without inference.
- After 8, the Smok is `fought` this turn (17.4) and still on the field, with
  zero heads cut.
- After 10, the Smok Celina abandoned is still on Płaskowyż, unfought, with
  Grota beside it — the cut kept the field's cards and dropped only her frames.
- At no point are two `ask` frames on the stack at once.

Written as `src/lib/game/commands/stack.test.ts`. It ran as eleven `it.todo`s
under a `describe.skip` through steps 0–2; **nine of the eleven run now**, and
the two that do not name what they wait on — moment 7 wants the `cast` frame
(law 4), moment 10 wants a second turn in the harness. Moment 8 is checked for
what law 3 owes (the attempt ends, the heads regrow, 17.4 settles the Smok for
the turn) reached by the dice rather than by the Krąg, so nothing is asserted
about a mechanism nobody has written.

## Law 4 is blocked on a question, not on work

**Raised 2026-08-31, before writing any of it.** Law 4 says the cast becomes a
`cast` frame above the fight, and the acceptance test's moment 7 spells out the
stack it wants: `[field, loop, fight, cast(B), ask(A: use Władca Zaklęć?)]`.

That last frame contradicts a decision already taken and already in the code.
`Fight.caster`'s own note says why the floor is a claim rather than a poll:

> Nobody is polled and nobody is named in advance, which also keeps 9.3: a
> window that opened only for the people holding a castable spell announced who
> was holding one, every fight, before anyone had decided anything. Reaching for
> a card is a tell you make yourself.

An `ask(A: use Władca Zaklęć?)` is exactly the thing that reasoning rejects. Ask
it only when Ania holds one and the table learns she holds one; ask it of
everybody every time and it is the poll the floor was designed not to be. The
present machinery answers this differently and well: a spoken Zaklęcie waits in
the air on a clock as a `spoken` status, and *anyone* may answer it by casting,
which is how the Władca Zaklęć and the Zwierciadło already work.

So there are two readings of law 4 and they want different code:

1. **The frame replaces the status.** Faithful to the sketch. It reworks a
   subtle, tested subsystem — the floor, the clock, the reactive answers — and
   still needs an answer to the `ask(A)` problem above.
2. **The frame is not built; the vocabulary is.** Keep the `spoken` status as
   the in-the-air representation, and spend step 3 on what the cards actually
   need: a spell effect that reaches *down* the stack and alters or ends the
   fight beneath it. That is the cash-in law 4 was written for (Krąg Płomieni
   on a Wróg mid-fight), and it is the half no card can do today.

**Narrowed to reading 2** (Michał, 2026-08-31, on the recommendation above).
The cast stays the `spoken` status it already was; what step 3 built is the
vocabulary — `unattackableAfter` reads off a Zaklęcie whether it leaves its
victim impossible to attack, and `landSpell` ends the fight beneath when it
does. Moment 7's `ask(A)` frame is deliberately **not** built, for the reason
in this section, and moments 7 and 8 of the acceptance test now run as one.

The `cast` frame is therefore unoccupied and unbuilt. If a card ever needs a
cast that is genuinely *suspended* — something asked of the caster part-way
through their own spell — this is where it goes; nothing today does.

Still not built, and both for want of somewhere to put the state rather than
for want of a rule: the creature left burning on an Obszar after the Krąg
(`seat_effects.seat_id` is `not null`, so a Karta on the board carries no
status), and the Władca Gromu's paralysed Wrogowie, which is the same gap.

## Handoff

Written 2026-08-30 at a session restart, with steps 0–2 committed
(`1a44c95` … `a357761`) and every gate green: tsc 0, 2,356 tests + 11 todos,
production build, and the whole lifecycle proven live on table KAYZQ — Kurhan's
face 6 suspended `[field, script, fight]`, the Duch was fought and lost, the
chain finished the card, and `pole:Kurhan` resolved two commits after the
suspension began.

**The standing order, from Michał: every mechanism lands engine-first.**
(1) pure types and operations in `src/lib/engine/`, with tests; (2) the
command layer behind ports; (3) the console — terminal and the browser `>_` —
able to show and drive it; (4) the GUI. Do not start a layer before the one
beneath is green. Effectful code stays in commands; that is not a violation.

**Where the pieces live now:** frames and the four operations in
`engine/stack.ts` and `engine/turn.ts`; the cursor reader `nodeAt` in
`engine/resolve.ts`; the suspending walker, `framed`, `continueTopScript` and
`closeFightFrame` in `commands/effects.ts` / `commands/fight.ts`; the chaining
in `turnStore.ts`; the `answer` door in the turn route and the console; the
panel in `script-frame.tsx`. The lifecycle spec is `commands/
scriptFrames.test.ts`; the acceptance scenario is `commands/stack.test.ts`,
nine of eleven moments running since `50cbc08`. Step 3 added `engine/loop.ts`
and `engine/ask.ts` beside them, with `commands/ask.ts` for the one answering
door, `rounds.test.ts` and `peek.test.ts` for the two cards, and the panel in
`ask-frame.tsx`. `envelopeFor` is now the third place a deck secret could
escape — `asSeenBy` redacts the `ask` frame the way `withoutDeck` redacts the
pile.

**Step 3 has the go** (Michał, 2026-08-31) and three commits of it are in.
`6c9ee4d` is the `loop` frame and the Trójgłowy Smok; `3d4bef4` is the `ask`
frame and the CHOCHLIK; `50cbc08` runs nine of the acceptance test's eleven
moments and corrects row 3 of its own table. Both MANUAL entries are deleted
and `coverage.ts` is two cards shorter.

**What is left of step 3 is law 4, and it is blocked on a question** — see the
section above this one. Nothing has been written for it in either direction.
Behind that decision sit the 18 anytime spells and the Talizmany, and moment 7
of the acceptance test.

Each card is still one commit, engine → console → GUI, tests first, its MANUAL
entry deleted last.

**Open threads awaiting Michał's word, not code:** the ×25 Zaklęcie-stack
spacing complaint was never located ("not this window" — which window was
never answered); the beaten-minus-held subtraction is duplicated between
`trophy-shelf.ts` and `consoleStore.ts` and consolidating means touching the
console; KAYZQ carries test debris (a granted Cyklop, a stray PRZEWOŹNIK in
the drawn pile, Życie 3) and is disposable; the spent-trophy red cross has
never been seen rendered.

**Standing rulings, so nobody re-asks:** teleport is a cut; a bystander's
spell resolves before the dice, never between them; live tables are
disposable and the schema default deliberately stays the old shape behind
`asTurnState`; the frame discriminant stays `phase`; the other two sessions
were stopped for the freeze — check whether that still holds before sweeping
`turn.ts`, `effects.ts` or `fight.ts`. The tree also holds ~170 unpushed
commits; pushing is Michał's call.
