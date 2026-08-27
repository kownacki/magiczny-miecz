# The terminal-first engine

**Status: steps 1 and 2 are built, and the seed with them.** `GameStore`,
`MemoryStore`, `FileStore`, saves and deterministic shuffling exist and are
tested; the grammar, `mm` and rewind are not.
The decisions under "Settled" are taken; the rest is the shape of the work.

## Settled

- **Command names are open.** This is a redesign, not an extension — an existing
  verb may be renamed or replaced where a better name exists.
- **`move` / `go` is the lawful move. `teleport` is the cheat.** The old `go`
  meaning "put this figure anywhere" moves out of the way.
- **Verbs are English, output is Polish.** The commands are engine controls and
  stay English, as the console's are today; everything a player *reads* — the
  journal above all — stays Polish, exactly as CLAUDE.md's "Polish only" rule
  intends. Controls are not UI text.
- **`testmode` keeps its name.** It is already the word on screen ("tryb
  testowy"); a synonym would cost more than it buys.
- **Hot seat is real, and not enforced.** Six players share one terminal and one
  scrollback. Hidden information (9.3) is not hidden from somebody who scrolls
  up, and that is accepted: this is one person's machine, not a tournament. The
  handover is a confirmation between turns — "Ola's turn" — so changing seats is
  a deliberate act rather than a surprise. No screen clearing.
- **Offline first; online is a later store.** `mm` opens a save file. Online
  arrives as a fourth `GameStore` (`HttpStore`) over the routes that already
  exist, plus a "something changed" loop in the runner — both additive. Step 1
  does not anticipate them beyond keeping the compare-and-swap.
- **The record ships from day one.** See "The journal is not the record". A save
  written without it can never be rewound, which makes this the one genuinely
  irreversible decision here.

The goal in one sentence: a whole game of Magiczny Miecz played at a terminal
prompt, offline, from a save file — with the browser demoted to a *renderer* over
the same engine rather than the only way in.

Three things fall out of that, and they are the actual reasons to do it:

- The engine becomes testable without a browser, a dev server, or Postgres.
- An AI (or a script) can play a full game, which is the only honest way to find
  out whether the rules hold up over ninety turns.
- Whatever the terminal can do, the browser console can do, because they are the
  same vocabulary. Today the browser console can only *break* rules; it cannot
  play.

## What already holds — do not rebuild it

Most of the hard part is done, and it is worth being precise about that so the
work does not turn into a rewrite of things that are already right.

- **The engine is pure.** `src/lib/engine/` and the sixteen files in
  `src/lib/game/commands/` import nothing but JSON data, their own types, and
  each other. No React, no Supabase, no `node:fs`, no `Math.random`. A command is
  already `(Snapshot, Command, Ports) → Outcome<Changeset, T>`.
- **The console grammar is pure.** `src/lib/engine/console.ts` parses a line into
  a `Command` union with no I/O at all, and `confirmationFor` already guards the
  destructive ones.
- **The commit is already correct under concurrency.** `change.ts` does
  load → decide → write, with the write taking the games row on a
  compare-and-swap against `revision`. A loser writes nothing rather than half of
  something.
- **An in-memory database already exists.** `src/lib/game/fakeDb.ts` is 154 lines
  of "enough PostgREST to commit against", written so `commit`'s CAS could be
  tested without a server. `commit.test.ts` swaps it in with `vi.mock`. It is a
  test-time seam that wants to become a runtime one.

## The one seam that is missing

Everything funnels through `change()`:

```
change(gameId, handler, command, ports)
  → loadSnapshot(gameId)        ← Supabase
  → handler(snapshot, cmd, ports)   ← already pure, already portable
  → commit(snapshot, writes)    ← Supabase, CAS on games.revision
```

Load and commit are the only coupled parts, and they reach a module-level
singleton `db` imported by exactly three files (`store.ts`, `change.ts`,
`tables.ts` — the grep invariant in CLAUDE.md is what keeps that true).

So: **extract a `GameStore` port** with `load(gameId)` and
`commit(snapshot, writes)`, and give it three implementations.

| Implementation | Holds | For |
| --- | --- | --- |
| `SupabaseStore` | Postgres | the browser today, unchanged |
| `MemoryStore` | a `Tables` object | tests, and the base of the next one |
| `FileStore` | `MemoryStore` + JSON on disk | offline play |

Later, a fourth — `HttpStore`, talking to the routes that already exist — makes
`mm --join K7DQM` work with no new server code. That is the payoff for doing the
seam properly rather than special-casing "offline".

### The rule that keeps this from costing double

**Offline keeps the compare-and-swap.** It still bumps `revision`, still claims
journal ranges in the same statement, still refuses a stale write. Not because
one terminal has concurrent writers, but because the moment the offline store
gets its own simpler rules there are two games to keep honest — which is the
exact reason companion mode is parked (see `COMPANION_PARKED` and the note in
docs/TASKS.md). One conformance suite runs against every implementation.

## Save files

The format is already designed: `fakeDb`'s `Tables` **is** a saved game —
`{ games, seats, users, holdings, seat_effects, field_cards, moves }`. Those rows
are the whole of what a game is.

- One file per save, under `~/.magiczny-miecz/saves/`.
- Written at the end of every `commit`, so "auto-save on every change" needs no
  scheduling and no separate code path.
- List / load / delete mirror the table list the browser already has.
- Because commit is a CAS, a half-written file is detectable rather than silently
  wrong: write to a temp file and rename.

## One vocabulary, two capability sets

Today the browser console mixes lawful and rule-breaking verbs, and that is
*correct for what it is*: the console only opens in test mode, so everything in
it is already a break. A terminal is not always in test mode, so the two have to
be told apart — without becoming two grammars that can disagree.

The move: the `VERBS` table in `console.ts` already carries
`{ name, aliases, usage, summary }`. Add one field:

```ts
needs: "play" | "testmode"
```

and a pure `permits(command, { testmode: boolean })` that returns allowed, or
refused with a reason. **Both the CLI runner and the browser's debug route call
that one function.** The engine owns the classification, so the two surfaces
cannot drift.

Parsing stays unconditional: `help` still *lists* the testmode verbs and marks
them locked, because a command you cannot discover is a command that does not
exist.

Turning testmode on is itself journalled, the same way every override is marked
`manual`. A save file where somebody switched cheats on halfway through should
say so.

## The vocabulary

The play verbs mostly **do not exist yet**. The game is currently driven by HTTP
actions — 22 on the turn route, 16 on holdings — and the console only has debug
shortcuts. Promoting those into the grammar is the substantial part of this work,
and it is what makes the browser console useful for more than cheating.

### Play — the turn
**Built:** `roll` · `move <pole>` · `draw` · `endturn` · `look` · `me`
**Left:** `bridge` · `cross`

### Play — encounters
`fight [kto]` · `attack <gracz>` · `escape` · `beast` · `guardian` · `ferry`

### Play — what you carry
`take <karta>` · `drop <karta>` · `equip <karta> [slot]` · `use <karta>` ·
`cast <zaklęcie>` · `buy <karta>` · `sell <karta>` · `trade` · `order` · `heal`

### Setup and table
`new` · `load [save]` · `saves` · `character <nazwa>` · `ready` · `start` ·
`who` · `join` · `leave`

### Looking — always allowed, never journalled
`look` (the field and what is on it) · `me` · `eq [gracz]` · `board` ·
`players` · `journal [n]` · `piles` · `card <nazwa>` · `history [n]`

### Testmode only
Everything the console has today: `kill` · `revive` · `remove` · `give` ·
`place` · `winfight` · `wingame` · `endfight` · `stone` · `effect` · `nature` ·
`gold`/`miecz`/`magia` · `turn` · `spell` · `pick` · `seat` · `unseat` · `kick` ·
`host` · `rename`

**Settled:** `go` is now `teleport` and has lost its `move` alias; `place` has
lost `drop`. Both freed words belong to the lawful vocabulary, and neither can
also mean its testmode namesake.

**Still open, found while building:** `me` prints a character's *own* Miecz and
Magia. Rules 1.2–1.5 and 2.2–2.6 say points from items and friends are computed
at read time and never stored, so a player reading `me` is not seeing what they
would fight with. `commands/seat.ts` already derives `parametr` and `walka`;
`me` should use them.

## The journal is not the record

The new idea — a full history that can be wound back — needs one distinction
made up front, because conflating the two is the way this goes wrong.

- **The journal** is prose for people: *"Ola (WIEDŹMA) ginie na polu Step I."* It
  is deliberately lossy. Some things are left out on purpose (9.3 hides spells;
  shuffling your own pack is nobody's business). It already exists, it already
  freezes the actor's name, and the terminal should render exactly what the
  browser renders.
- **The record** is data for the machine: every input that produced the state.
  It does not exist yet.

They are different artefacts with different rules, and the record is what makes
time travel possible.

### What the record has to contain

A command is a pure function of its snapshot, its inputs, and its randomness. So
to reconstruct any point in a game you need those inputs and nothing else:

1. **The command** — which verb, with which arguments.
2. **The decisions** — already numeric and already designed for this. `Decisions`
   is `{ choices?: number[], destination?: FieldId }`, because "the client never
   sends an effect — it sends which option it picked".
3. **The randomness** — see below, this is the part that needs work.

Given those, replay from the start reproduces the state exactly, and *that* is
the undo: to go back to move 40, replay 1–40 into a fresh store. No inverse
patches, no undo stack.

**It ships from the first save, and stays dumb until it needs not to be.** An
append-only `log` array beside the other tables — `{ seq, actor, verb, args,
decisions }` and a state checksum per move — written from step 2. Rewind itself
is step 5. The reason not to defer the *data* is that a save written without it
can never be wound back, and the reason to keep it dumb is that a record is also
the best bug report there is: hand over the save, replay it, watch it break.

**Why replay rather than inverse patches.** Inverting a `Changeset` means
inverting a shuffle, a reshuffle, a deal from a pile — and getting one of them
subtly wrong yields a state that looks fine and is not. Replay cannot be subtly
wrong: it either reproduces the state or it does not, and a checksum per move
says which. The codebase is already shaped for it, because commands are pure and
`scriptedRandom(results)` — the thing that makes replay possible — already exists
in `ports.ts` for the tests. Cost is O(n) per rewind, which for a board game with
a few hundred moves is nothing.

### Randomness enters through three doors, and only one is captured

This is the finding that decides how much work the record is:

| Door | Where | Captured today? |
| --- | --- | --- |
| Dice | `RandomPort`, via `ports.random.rollD6` | **Yes** — `attempt()` in `change.ts` already collects rolls into an array so a retry throws the same dice |
| Shuffles | `decks.ts`: `export const shuffle = shuffleWith(Math.random)` | **No** |
| Ids | `makeJoinCode`, `makeUserId`, `makeClaimToken` | No, but they are stored in the rows, so replay does not need to reproduce them |

So the shuffle is the gap. Two options:

- **Seed the game.** Store a seed on the games row, bind `shuffle` to a PRNG from
  that seed, and every shuffle becomes reproducible. Smallest record, but every
  shuffle must then be consumed in a deterministic order — which it is today, but
  nothing enforces it.
- **Record the permutation.** Log the resulting order alongside the command.
  Bigger record, but it cannot drift no matter what order anything happens in.

**Done — seeded.** `games.seed` is minted when the table is opened, and every
shuffle is `shuffleFor(game)` = a stream keyed on `(seed, revision)`. `seed.test.ts`
deals the same game twice and gets the same table.

The revision is in the key for a reason: without it every reshuffle in one game
would deal the same order. And the stream's first three values are pinned in a
test, because a change to the generator would silently invalidate every save that
could previously be replayed.

Nothing about the bargain in `commands/draw.ts` changed — the rule still decides
*whether* the pile is turned over, the edge still decides what order it comes
back in. What changed is that the edge can now be asked twice. The one new shape
is that `change()` accepts a command *or* a function of the snapshot (`Asked<C>`),
because the shuffle depends on a revision the caller cannot know before the read.

Games opened before the column cannot be migrated: `seed` is null, they fall back
to `Math.random`, and their shuffles were never written down.

Superseded recommendation, kept for the reasoning: **seed**, with a per-move
state checksum in the record so a divergence is caught immediately. `shuffleWith`
already takes its RNG as a parameter, so this is a binding change at the edge and
not an engine change at all. The seed lives on the games row, which means
`decks.ts`'s module-level `export const shuffle = shuffleWith(Math.random)` has
to become per-game and be handed in at the edge — the same way `turnStore`
already hands `shuffle` to `drawCard`.

**One trap in that.** `attempt()` retries a losing commit by re-running the
handler, and it already replays the *dice* so the retry throws the same numbers
(that is what the `rolls` array is for). A seeded shuffle stream needs the same
treatment, or a retry advances the PRNG a second time and the replay of that game
diverges from what was played. Whatever wraps the dice has to wrap the shuffle.

### Notation

Chess-like notation is a *rendering* of the record, not the record itself. Design
the data first; the notation is then a formatting function and can change freely.
Something like:

```
41. ola  roll 4 → karczma
42. ola  draw ×1 → WILKOŁAK
43. ola  fight 3+2=8 vs 6  win
44. ola  take MAGICZNY MIECZ
45. ola  end
```

## Build order

Four steps, each independently testable, in this order:

1. ~~**`GameStore` port.**~~ **Done.** `gameStore.ts`; `gameStore.test.ts` plays
   a real turn against memory with nothing mocked.
2. ~~**`FileStore` and saves.**~~ **Done.** `saves.ts`; a whole game is opened,
   played, written to disk and reopened in `saves.test.ts`. Saves live under
   `~/.magiczny-miecz/saves/<KOD>.json`, overridable with `MM_HOME`. Written
   temp-then-rename, because the file is rewritten after *every* change and the
   window is most of the program's life.
3. **The grammar split.** *Half done.* `needs` is on every verb, `permits()` is
   the one function both surfaces ask, and `help` lists locked commands rather
   than hiding them. The turn loop is playable — `roll`, `move`, `draw`,
   `endturn`, with `look` and `me` to see by. What is left is the rest of the
   vocabulary: encounters (`fight`, `attack`, `escape`, `beast`, `guardian`,
   `ferry`) and what you carry (`take`, `drop`, `equip`, `use`, `cast`, `buy`,
   `sell`, `trade`, `heal`), plus setup (`new`, `load`, `saves`, `character`,
   `ready`, `start`).
4. **`mm`.** Pick or start a save, hot-seat prompt, render board + seat + journal.

Rewind is a fifth step and deliberately last: it wants the grammar settled first,
because the record is a log of commands and the commands are what step 3 defines.
The *record itself* is written from step 2 — only replaying it waits.

The seed comes forward into step 2 with it, for the same reason: a log of
commands means nothing without deterministic randomness behind it.

**Step 3 is not a fixed-size job.** Playing whole turns through the console will
be the first time anything outside the tests does that end to end, and it will
find rules the engine does not carry yet. That is a feature — but it is not
schedulable.

## What building it turned up

Three things, all of them the sort that only appear when something real runs:

- **The in-memory database was not a database.** `tables.ts` says out loud that
  most columns have defaults and a row type cannot see them — which means a fake
  that stores exactly what it is handed returns a game with no `status`, no
  `revision`, and seats with no Życie. `createGame` inserts three columns and
  Postgres hands back fifteen. `fakeDb` now carries a `DEFAULTS` table mirroring
  db/schema.sql by hand, and a default that drifts will show up as a game that
  behaves differently offline — exactly what the port exists to prevent.
- **It also could not hand back what it had just written.** `createGame` does
  `.insert(...).select(...).single()` because that is where the id comes from;
  the fake answered `null`. Both gaps were invisible while it was only ever used
  to test `commit`.
- **`byId` means two different things.** `takeNewCharacter(gameId, seatId,
  characterId, byId)` wants the *seat* asking (`mayChooseFor` compares it to
  `seatId`), while `removeCharacter(gameId, seatId, hard, byId)` wants the
  *user*. Same name, same file family, no way to tell them apart at a call site
  — the shape `requests.ts` was written to stop, one layer further in. Worth
  settling when step 3 redesigns the vocabulary.

## Stack

No new language. `mm` is a Node process importing the same TypeScript modules the
Next.js routes import — the engine has no browser dependency, so there is nothing
to port and nothing to keep in sync.

- Node 22 can strip types natively but will not resolve the `@/` path alias, so
  development runs under `tsx`; shipping bundles to one file with esbuild.
- A `bin` entry in package.json plus `npm link` puts `mm` on the PATH.
- Plain `readline`, not a TUI. The prompt dumps what you asked for and gives you
  the prompt back. No full-screen interface, no widget layer — the point is that
  it behaves like any other terminal program.
- Debug dumps go to a file rather than the screen, so a session stays readable
  and a bug report is a path.
