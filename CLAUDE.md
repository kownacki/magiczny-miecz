# Magiczny Miecz

A referee for the 1993 Polish board game *Magiczny Miecz* (Sfera, Adrian
Markowski) — a Talisman derivative. **Private project, not published.**

**One mode.** The app runs the whole game in the browser — board, deck, dice,
arithmetic. There is nothing else to assume and no `mode` to branch on.

There was a second, **companion**: you played on the physical board with the
physical cards and the app owned everything tedious. It was parked behind a
boolean for a while and **deleted on 2026-09-05** — 95 files, and the two
columns it needed dropped from the database. If you find prose describing it,
that prose is stale; if you find yourself reaching for "what happens in
companion mode", the answer is that there is no such thing.

## The tooling below is new and unproven — say how it went

**Temporary, added 2026-09-06.** Most of what this file points at for *working*
rather than for *rules* was built in a single session, on one session's
friction, and no fresh session has used any of it yet: `docs/WHERE.md`,
`docs/BRIEFING.md`, `npm run ask` (including `ask where`), the `mm` transcripts,
and the instruction to check mechanics by playing rather than in a browser.

Some of it will be exactly right and some will be noise nobody reads. There is
a cautionary example in the repo already: `mm` was built months ago, documented,
genuinely the fastest way to check anything — and ignored, including by the
session that then wrote this paragraph, because it was not in the path anybody
walked.

**So report back, in your closing summary, without being asked:**

- which of these you actually reached for, and which you forgot existed;
- anything you looked for and could not find, or found by grepping instead;
- anywhere a doc told you something that was not true.

That last one matters most: this repo now has tests that check its own numbers
(`docCounts.test.ts`) and its own reachability (`reachable.test.ts`) because
prose here has gone stale twice in a week.

**Delete this section** once a few sessions have reported and the tooling has
settled — it is scaffolding, and it costs tokens on every load.

## Read these first

- **[docs/WHERE.md](docs/WHERE.md)** — to add an action, a Command, a console verb,
  a card script, a Status, a wire field, a journal kind, an id or a column — or to
  park or delete one: which files, in what order, and what fails if you skip one.
  Start here when writing code
- **[docs/BRIEFING.md](docs/BRIEFING.md)** — the standing rules for a delegated
  task, so a brief can link to them instead of restating them. Read it if you
  are the agent; link it if you are writing the brief
- **[CONTEXT.md](CONTEXT.md)** — the referee's own vocabulary: Snapshot, Changeset, Command
- **[docs/TASKS.md](docs/TASKS.md)** — what is open, and what is settled and must not be
  re-derived. Short on purpose; read it every session
- **[docs/LANDED.md](docs/LANDED.md)** — what has been built and why, in order. The
  history half of TASKS.md; read it when a decision needs its reasoning
- **[docs/COVERAGE.md](docs/COVERAGE.md)** — every numbered rule, and whether the app carries it
- **[docs/TERMINAL.md](docs/TERMINAL.md)** — the terminal-first engine: the
  store port, save files, and the one console vocabulary both surfaces share
- **[docs/LOBBY.md](docs/LOBBY.md)** — host, players, presence: the part that is not Magiczny Miecz
- **[docs/STACK.md](docs/STACK.md)** — the resolution stack: why one frame of turn
  state is not enough, the five laws, and the plan. Read before touching
  `turn.ts`, `effects.ts` or `fight.ts`
- **[docs/RULES.md](docs/RULES.md)** — the rulebook transcribed
- **[docs/EXPANSIONS.md](docs/EXPANSIONS.md)** — what is in the five boxes that
  are out of scope, and which parts of the model they would break
- **[db/schema.sql](db/schema.sql)** — the data model and why RLS has no policies

## Non-negotiables

- **An id is never a `string`.** Fields, characters, cards and spells each have a
  literal-union type, and the compiler checks every name written against them.
  `FieldId` is derived from the four ring arrays in `board.ts`/`rings.ts`, so
  there is one list and it cannot drift; `CharacterId`, `EventId`, `ItemId` and
  `SpellId` are generated into `src/data/ids.ts` by
  `node scripts/generate-ids.mjs`, and `src/data/ids.test.ts` fails the build if
  that file has gone stale.

  A `string` from outside — a request body, a database column, a name slugified
  off a card — becomes an id only by passing a guard: `asFieldId` /
  `requireFieldId`, `asCharacterId` / `asSeatCharacter`, `isCardId` and friends.
  Narrow **once at the boundary**, not at each use: `seatsFor` is where a stored
  `field_id` and `character_id` become typed, and everything downstream inherits
  it. This exists because six characters shipped starting on a field called
  `"step"` — slugified from the name printed on their card, while the board's two
  Steps are `step-1` and `step-2`. Nothing could tell it was nonsense, because
  every real id was a string too.

- **The engine in `src/lib/engine/` is pure.** No React, no Supabase, no I/O, no
  `Math.random`. Nothing about how the game *looks* either — asset paths, SVG
  geometry and which żeton to draw are `src/lib/view/`'s, because a directory
  that holds `SEAT_COLOURS` cannot claim to be only the rules. Everything effectful arrives through a port. This is what makes
  the rules testable, and it is the only reason one engine can serve both a
  physical table and a browser simulation.
- **A write to the game goes through a Command.** A rule reads a `Snapshot`,
  returns a `Changeset` naming the rows to write, and `commit` writes them under
  a compare-and-swap on `games.revision` — the games row is taken first and acts
  as the lock, so a loser writes nothing at all rather than half of something.
  The sixteen files in `src/lib/game/commands/` are 5,600 lines of that one
  shape, and `turnStore.ts` is the thin dispatcher over them. Do not add a
  database call or a hand-rolled journal write back into it. The invariant to
  check is `grep -rl 'from "@/lib/supabase"' src`, which must answer with exactly
  five files and no sixth: `store.ts` (rows and reads), `change.ts` (the load and
  the commit), `tables.ts` (the typed doors, which need the default handle),
  `gameStore.ts` (which is where the default is *chosen*) and `handle.ts` (which
  is where the reads outside a change find it). It said four for a while and was
  wrong from the moment `handle.ts` was split out of `gameStore.ts`, which is
  the way a number in prose goes stale — so read the list, not the count.
  Grepping for `db.from`
  looks equivalent and is not, because the handle and the call can sit on
  separate lines, which is exactly how the last two escapees stayed hidden. Two traps worth
  knowing before you write one: `merge` resolves two writes to the same column
  as *later wins*, never a sum, so anything that reads a column and writes it
  back — above all `game.deck` through `putOnPile` — must chain through
  `apply(snapshot, soFar)`; and a command is a pure function of its snapshot and
  its ports, which is the only reason every one of them has tests and none of
  them needs a database. `store.ts` is now rows and reads only, and the
  three files above it — `turnStore.ts` for the game, `lobbyStore.ts` for the
  poczekalnia, `consoleStore.ts` for the test console — are the thin edges that
  mint the tokens, hand in the shuffles and run the commands. The one
  read-modify-write left in the app is `bumpRevision`, for `joinGame`, which
  inserts a seat row and hands its token back: a `Changeset` can do neither.
- **Where a game is kept is a port too.** `change()` used to reach the Supabase
  singleton on both sides of the decision, which made the rules pure and yet
  impossible to run anywhere else. `GameStore` in `src/lib/game/gameStore.ts` is
  the seam: `load` and `commit`, one interface, and Postgres or a `Map` or a file
  behind it. Two rules keep it from costing anything. Every implementation is
  `storeOver(handle)` — the commit logic is the same code, so there is no second
  CAS to get subtly wrong — and **every implementation keeps the
  compare-and-swap**, offline included, because the moment an in-memory game
  gets cheaper rules there are two games to keep honest. See docs/TERMINAL.md.

- **Randomness is a port, not a branch.** `RandomPort` is bound to a human
  typing what they rolled, to an RNG, or to `scriptedRandom` in a test, and
  rules code must never learn which. It is the only port left: `DeckPort` and
  `ChoicePort` were deleted as furniture — see the note at the top of
  `src/lib/engine/ports.ts`. Which card comes up is settled by handing a command
  the shuffled pile, and a human choice arrives as `Decisions`, a list of
  numbers the server re-walks the card against, so a card cannot be talked into
  doing something it does not say.
- **No client ever queries Supabase for game state.** Each player holds spells
  hidden from the others (9.3). RLS is on with zero policies; every read and
  write goes through a route handler that decides what that seat may see. The
  browser's anon key subscribes to a Realtime channel carrying a bare revision
  counter and nothing else.
- **Every tracked value needs a manual override.** The physical board is the
  source of truth and the app *will* desync when someone moves a figure wrong.
  A referee you cannot correct is worse than no referee.
- **Own points and derived points are different things.** Rules 1.2–1.5 and
  2.2–2.6: only a character's own Miecz/Magia is tracked and it can never fall
  below its starting value; points from items and friends are computed at read
  time. Never store a total.
- **Every write goes through `src/lib/game/tables.ts`.** `db` is an untyped
  `SupabaseClient`, so `.from("seats").insert({...})` takes anything — a column
  dropped last week typechecks, builds, and fails at the database on the first
  request that runs it. That is not hypothetical: the seats/users split moved
  eight columns with `tsc` clean the whole way while five writes still named the
  old ones, and three of those broke opening a table. `tables.ts` is the same
  discipline as "an id is never a `string`", carried the last few feet. Reads
  still go through `db` directly — they are narrowed by their own column lists.
- **Every request body goes through `src/lib/game/requests.ts`.** The same rule
  as `tables.ts`, one layer out: a route reads `body.userId` off parsed JSON and
  a browser writes `{ seatId }` into one, and nothing compared the two. That
  cost the same bug four times — twice in the roster, twice in the lobby — and
  every one of them *ran*, because `leave` and `host` fall back to the caller
  when nobody is named, so the host pressing "usuń gracza" on somebody else
  kicked themselves. Field names live in `Requests`; the client sends through
  `post` and the route reads through `bodyOf`. It is a shared vocabulary, not
  validation — every route still checks what it got.

  The two routes whose body names an action — `turn` and `holdings` — go one
  step further: the action names are lists in `requests.ts`, and each route is
  a table in `src/lib/game/actions/` keyed on its list, one entry per action
  with how it reads the body and what it runs. A name on the list with no
  entry, an entry the list does not name, or a button posting an action nobody
  runs is a compile error. Adding an action is one name and one entry; the
  route itself is one line, `actions(route, table, gate)`, and the gate is the
  Permission the whole route stands behind.

  The other direction is `src/lib/game/wire.ts`: the Envelope's types, declared
  once with no logic, imported by `envelopeFor` on the way out and by
  `useTable` on the way in. Ids are narrowed there — a holding's `card_id` and
  a field card's `field_id` come out of the store as strings and become a
  `CardId` and a `FieldId` before they travel, or the row is refused as a
  Failure. The browser declares no wire type of its own; `Seat`, `Held`,
  `Game`, `Person` are aliases of the Envelope's.
  Replies are typed the same way: `Reply<R, A>` in `requests.ts` is read off
  each action's `run` (`RepliesOf` in `actions/shape.ts`), so `post("turn",
  { action: "friend-heal" })` comes back as `{ healed: number }` and a `run`
  that changes shape fails the build at the reader, not at the table.
- **A rule number is a promise you can keep, so only write one you checked.**
  `(5.3)` is not decoration: `WithRules` turns every one of them into a link
  into the Instrukcja, and a reader who follows one and lands on a rule about
  something else trusts the next one less. Two were already wrong when this was
  written — `paid-friend` cited 6.1, which is about *acquiring* a friend, and the
  Wyprawa heading cited 6.2, which is about their Karty lying face up. Chapter 6
  has nothing to say about hiring anybody or sending them out, because that is
  printed on the Karta and 8.2 puts a Charakterystyka above the general rules.

  **Where they go.** A refusal that enforces a printed rule names it, in the
  message: "To nie twoja tura (10.1)." Journal lines do *not* say it in the
  sentence — `RULE_FOR` in `journalRules.ts` keys it off the line's kind, so a
  new kind cannot be added without the compiler asking which rule it is, and one
  table serves every line at once. The app's own explanatory copy names it where
  a player might argue.

  **Where they do not.** Printed text: no card, spell, Postać or Obszar in the
  box carries a rule number, and wrapping their text implies otherwise. Plumbing
  refusals — "Nieznane miejsce", "Nie masz tej karty" — because a number there is
  noise, and noise is what makes the real ones stop being read. Button labels,
  since a link inside a button is a button inside a button. `title` attributes,
  which cannot hold one. And anywhere the honest answer is `null`: things that
  happen to the *table* rather than in the game — joining, leaving, an override,
  anything the console conjured — are not covered by the rulebook, and saying so
  is worth more than a plausible guess.

  The check is `src/lib/engine/journalRules.test.ts`, which fails on a citation
  the Instrukcja does not have; `17.11` typechecks and links to nothing.

- **The database is biggerfish's, shared four ways.** This is a `magiczny_miecz`
  schema in project `aqqdamoqwxiquhkzzcix`, alongside finalbid and wheatbid, and
  the service-role key grants all of them. Two of those take real payments.
  Schema-qualify every hand-written query.

- **To check mechanics and logic, play the game — `npm run mm`.** It is the
  whole of Magiczny Miecz at a prompt: offline, no database, no server, and it
  reads piped input, so seeing a rules change actually happen is one command and
  about ten seconds:

  ```
  printf 'table new Ala, Ola\npick MAGOG\nready\npick TROLL\nready\nstart\nlook\nroll\nquit\n' \
    | npx tsx src/cli/mm.ts
  ```

  `help` lists the vocabulary, `testmode on` unlocks the commands that overrule
  the rules, `look`/`me`/`who` say where things stand. This is the default way
  to answer "does it work" for anything that is not pixels. It is faster than
  the browser, needs nothing running, and asks a better question — whether the
  *game* does the right thing rather than whether a screen drew.

- **Do not open a browser to confirm a foregone conclusion.** A number in a
  Tailwind class does what the number says, and driving Chrome to watch it costs
  minutes to learn nothing. The browser is for pixels — new layout, drag and
  drop, hover and focus — and for nothing else; anything about rules, state or
  the deck belongs in `mm` above. Prefer Playwright against a real table over
  clicking by hand: a measured `getBoundingClientRect` read back out of the DOM
  is better evidence than a picture, and it can be pasted into a commit
  message.

- **Commit your own work, and do not wait to be asked.** Finished work sitting
  in the working tree is work nobody else can see, build on, or revert — and
  this repo has a particular reason to care: **another agent works in it at the
  same time as you.** Twice in one session it committed uncommitted changes of
  mine inside its own commits, so the raid UI is filed under a message about
  rule links. Nothing was lost, but the history now says the wrong thing about
  who did what and why.

  So: verify, then commit, in coherent pieces, as you finish them.

  **Never `git add -A`, never `git commit -a`, never `git stash`.** The dirty
  tree is not yours alone. Stage the files you actually changed, by name, and
  read `git diff` on each one first — a file you edited may have picked up
  somebody else's edit since. `git stash` is the worst of them: it reverts the
  other agent's uncommitted work with no warning that it was there.

  The message is a sentence in the present tense saying what is now true, with
  no full stop and no `feat:` prefix — "Every journal line says which rule it
  happened under", "Only klasyczny puts the forbidden card down; slotowy reddens
  it". The body carries the why at length, because that is what the log is for
  here; several of them are the best documentation the decision has.

## Settled — don't reopen

- **Content the app cannot run yet is *parked*, never half-built.** The list is
  `src/lib/engine/disabled.ts`: `PARKED_CARDS` for a whole Karta,
  `LIVE_ABILITIES` for the printed clauses of a Karta Postaci that the app does
  carry, and a feature boolean beside them: `PVP_PARKED` for Postać przeciw
  Postaci and `CHARACTER_POWERS_PARKED` for a Postać's own powers.

  **Clauses are stated as what is live, and the inverse is parked.** A clause
  nobody has listed is dimmed by default, so one the app learns to run must be
  *added* to appear live. That direction is deliberate: the failure mode is a
  Karta that under-promises, which a player can check against the paper,
  rather than one that over-promises, which they discover mid-fight.

  **A whole subsystem parks at its one door, not at its readers.**
  `abilitiesOfCharacter` returning nothing switches off all sixteen encoded
  character abilities without a guard in any of the seven readers that ask —
  the same way `attackSeat` and `sendRaider` are the only two doors into a
  duel. Find the door before writing a guard. A parked card is **gone**: `freshDecks` never
  shuffles it in, and every console door that could conjure one
  (`placeCard`, `grantCard`, `stackForDraw`, `stageCards`) refuses through
  `refuseIfParked`. It keeps its entry in the Księga Tolimana, dimmed and
  struck through, and its popup says one red word — „Niedostępne" — and
  nothing else. **No commentary, ever**: the reason lives in that file and in
  docs/TASKS.md, where somebody choosing what to build next reads it, not in
  front of a player mid-game.

  This is **not** `coverage.ts`'s `MANUAL`, and the two must not grow into each
  other. `MANUAL` means the Karta is in the deck, will be drawn, and has one
  clause the table applies itself. Parked means the Karta is not in the box
  this game. A card is in one list or the other, never both.

  Nothing is deleted, and one boolean brings it back: a feature that comes back
  is not a feature you rewrite.

  **But parking is not a promise, and it expires.** Companion mode was parked
  under exactly this convention and deleted the next day, because keeping the
  option open was costing more than the option was worth. Park a thing to stop
  it half-working, not to avoid deciding about it — and when a parked thing has
  been parked long enough that nobody misses it, delete it and say so.

- **Base game only.** The five expansions are out of scope; their scans are
  deliberately untouched. Surveyed once, in docs/EXPANSIONS.md, so that a
  decision taken now is taken knowing what is coming — four of them add a board
  that is not three rings, two of them are standalone games rather than modules,
  and one prints two different cards with the same name on one sheet.
- ~~**Companion mode.**~~ **Given up, 2026-09-05.** It was chosen first,
  because it attacks the actual complaint about this game — downtime and
  bookkeeping — and needs almost no card art. It lost to the cost of keeping
  two modes honest: a second pass over every change, for a mode nobody was
  playing. It was parked for a day and then deleted, which is the honest end of
  a promise nobody intended to keep. Do not propose it again without saying
  what has changed about that arithmetic.
- **Nothing is entered by hand.** No typed die results, no edited totals, no
  reported fight outcomes, no ± on a tracked value. The app rolls, moves and
  computes; a player who could overwrite that is not playing the game but
  editing its record of itself. Those controls existed for companion mode and
  went with it, `supplied()` and the typed-value parameters included — so the
  RandomPort now binds to an RNG or to a test's script and to nothing else.
  The console is the one door that still conjures state, and it says so: every
  row it writes is marked `manual`.
- **Card data is a progressive enhancement, not a prerequisite.** The referee is
  useful with zero transcribed cards — you tell it what happened. Each card
  transcribed upgrades one interaction from "tell me" to "I'll handle it".
  Nothing is ever blocked on finishing the transcription.
- **Cards cannot be identified by number.** The numeral at the top of a card is
  a Roman numeral for its resolution *class* (I Spotkanie, II Wróg, V
  Przedmiot), used for ordering in 15.2 — not a unique id. Identification is
  type-ahead on the name.
- **Polish only.** All source material is Polish; an i18n layer would be pure
  overhead.

## Assets

689 MB of scans, gitignored, turned into the committed pictures in `public/`.
The pipeline, its scripts and every trap in it — the two Karty Postaci the
slicer cannot cut, the card backs that were not in the Drive, the four rules
that find a parchment scrap, the fourteen cards the box printed as NAZWA KARTY
— are in **[docs/ASSETS.md](docs/ASSETS.md)**. Read it if you are touching the
pipeline; you do not need it to work on the game.

**`node scripts/generate-ids.mjs` is the exception** and belongs here: it
regenerates `src/data/ids.ts`, the literal id types *and* the guards
(`isCardId`, `requireCardId`), and must be re-run after anything that renames
or adds a card or a character. `src/data/ids.test.ts` fails the build if that
file has gone stale.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
