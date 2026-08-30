# The resolution stack

**Status: step 0 — the laws and the plan. No code yet.** Decided 2026-08-30.

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
| **1** | `turn_state = { stack }`; `top()`; the ~235 `turn_state.phase` reads become `top(stack).kind`; `endFight` pops; `placeSeat` cuts; `Fight.resume` deleted | every existing test passes unchanged; console `state` prints the stack |
| **2** | `script` frames with a cursor; `ask` replaces `pending` re-walk; `walka` inside a script pushes; `cast` above `fight` | acceptance test passes; `po-kolei`'s all-or-nothing branch is gone |
| **3** | cash in: Trójgłowy Smok (`loop`), CHOCHLIK (`ask` outside a script), Odmiana Losu by a bystander, the 18 anytime spells acting on the fight beneath | one commit per card; its MANUAL entry deleted; `coverage.ts` shrinks |
| **4** | browser: draw sheet and fight sheet render `top(stack)`; "waiting for X" drawn from the frame's `seatId` | the scenario clicked through on a real table |

**Order within each step: engine, then the console (terminal and browser
`>_`), then the GUI.** The console is the cheapest surface and the one that
prints the stack raw; if it cannot show a frame, the GUI has nothing to draw.

**Go/no-go after step 2**, before anything in step 3 deletes a MANUAL entry.
Step 1 is reversible; step 2 is the point of no return.

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
| 3 | **Bartek** casts Odmiana Losu "natychmiast po wzięciu": discards Ścieżka, draws Koszmar | `field`, `cast(seat B)` → pops → `field{drawn: Koszmar, Smok, Grota}` — order re-derived after the pop | 4, 5 |
| 4 | Koszmar: Ania is Chaotyczna; the wish is not hers; card stays | `field{resolved: koszmar}` | 1 |
| 5 | Smok: 16.4, cannot be walked past. Loop of three heads, 2 Miecz each | `field`, `loop(smok, 3)`, `fight(head 1)` | 3 |
| 6 | head 1: 5+5 vs 2+3, win | `field`, `loop{done:1}`, `fight(head 2)` | 3 |
| 7 | before head 2's dice, **Bartek** claims the floor, casts Krąg Płomieni on Ania | `field`, `loop`, `fight(head 2)`, `cast(seat B)`, `ask(seat A: use Władca Zaklęć?)` — **four deep** | 4, 5 |
| 8 | Ania has no Władca; the Krąg holds; the fight beneath cannot proceed; loop stops, heads reset | `field{fought: smok}` | 3, 4 |
| 9 | Grota is III and unreachable behind the Smok; settles as a fixture | `field` → `end` | 1 |
| 10 | next turn Celina arrives, 15.1 draws zero, faces Koszmar; she is Zła; wish = "przeniesienie do dowolnego Obszaru w tym Kręgu" | `field(plaskowyz)`, `script(koszmar)`, `ask(seat C)` → **cut** → `field(chosen, draw 0)` | 2, 5 |

Assertions worth stating outright:

- After 3, the field's cards are in 15.2 order *including the one Bartek drew*.
- After 7, `top().seatId` is Ania's, and the frame below it is Bartek's — two
  different seats owing things, both legible without inference.
- After 8, the Smok is `fought` this turn (17.4) and still on the field, with
  zero heads cut.
- After 10, the Smok Celina abandoned is still on Płaskowyż, unfought, with
  Grota beside it — the cut kept the field's cards and dropped only her frames.
- At no point are two `ask` frames on the stack at once.

Written as `src/lib/game/commands/stack.test.ts`, `describe.skip` until step 2.

## Handoff

All of it — engine, console, GUI — is this session's (Michał, 2026-08-30).
The other two sessions keep off the three files above for the length of step 1.
