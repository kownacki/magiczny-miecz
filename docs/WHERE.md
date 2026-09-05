# Where does it go

Ten recipes: to add one of the things this app is made of, which files to touch,
in which order, and what fails if a step is skipped.

This page exists because every brief written for this repo opened by listing
those files by hand, and got them slightly different each time. It is a lookup
table, not an argument — the reasoning lives in [CLAUDE.md](../CLAUDE.md) for
the rules, [CONTEXT.md](../CONTEXT.md) for the vocabulary, and
[LANDED.md](LANDED.md) for why any of it is shaped this way. Read those when a
recipe surprises you. Read this when you just need to start.

## The trick the whole repo plays

Most of what follows is pinned by the compiler rather than by a test, and always
the same way: **one exhaustive `Record` keyed on a union**, so a name added to
the union with no entry in the table — or an entry the union does not name — is
a build failure at the table, not a bug at the table.

| The union | The table over it | In |
| --- | --- | --- |
| `TURN_ACTIONS` / `HOLDINGS_ACTIONS` | `TURN` / `HOLDINGS` (via `satisfies`) | `actions/turn.ts`, `actions/holdings.ts` |
| `Command["kind"]` | `SPECS` (grammar, help) and `VERBS` (what runs) | `consoleSpec.ts`, `consoleVerbs.ts` |
| `Ability["kind"]` | `HELD_TWIN` (the Status a held card produces) | `status.ts` |
| `JournalKind` | `RULE_FOR` (which rule the line happened under) | `journalRules.ts` |

So the honest answer to "did I forget a file?" is usually `npx tsc --noEmit`.
Where that is *not* true, each recipe says so — those are the steps worth
double-checking, because nothing but a reader will catch them.

---

## 1. An action on the `turn` or `holdings` route

1. `src/lib/game/requests.ts` — add the name to `TURN_ACTIONS` or
   `HOLDINGS_ACTIONS`, and any new body fields to that route's entry in the
   `Requests` interface.
2. `src/lib/game/turnStore.ts` — export the thin wrapper that calls
   `change(gameId, theCommandOn, args)`, or reuse one that exists.
3. `src/lib/game/actions/turn.ts` or `actions/holdings.ts` — one entry in the
   table: `from` reads the body, `run` calls the wrapper.
4. The client — `post("turn", { action: "…", … })` from the component with the
   button.

The route file is not touched. It is one line — `actions("turn", TURN, mayAct)`
— and the gate is the Permission the whole route stands behind.

**What catches a missed step.** Steps 1 and 3 are a compile error in both
directions (`satisfies Actions<…>`), and `actions/turn.test.ts` asserts the
table's keys equal the list besides. A body field read in `from` but not
declared in `Requests` is a compile error at `body.x`. **Step 4 is caught by
nothing** — an action with no caller compiles, tests green, and is simply
unreachable.

The reply needs no declaration: `RepliesOf` in `actions/shape.ts` reads it off
what `run` returns, so `post` is retyped at every call site the moment `run`
changes shape. A `run` returning `void` answers `{ ok: true }`.

Ground truth: `9a56c6b` made the table, `88441a1` typed the replies off it.

## 2. A Command

A command is `(snapshot, args, ports?) => Outcome<T>`, where `Outcome` is
`{ writes: Changeset; result: T }`. No database, no `Math.random`, no React.

1. `src/lib/game/commands/<area>.ts` — write it. Sixteen files; pick by subject,
   not by size.
2. `src/lib/game/commands/<area>.test.ts` — call it directly with a hand-built
   `Snapshot` and assert on `writes` and `result`. Every command has one, and
   none of them needs a database; that is the whole point of the shape.
3. `src/lib/game/turnStore.ts` — re-export it wrapped in `change`, usually
   renamed (`moveTo as moveToOn`, then `export async function moveTo`).
4. Recipe 1, to give it a way in from a button, or recipe 4 for the console.

**The `apply` trap.** `merge` resolves two writes to the same column as *later
wins*, never a sum. So a command that composes two sub-operations both touching
one read-then-write column — above all `game.deck` through `putOnPile` — must
chain: take `apply(snapshot, firstWrites)` and hand *that* snapshot to the
second call before merging. Disjoint columns are safe. See `draw.ts:104`,
`bridge.ts:233`, `fight.ts:344` for the pattern.

## 3. A field in a request body, or in a reply

Body: declared once in `Requests` (`requests.ts`), sent by the client through
`post`, read by the route through the action's `from`.

- Read but not declared → compile error at `body.x`.
- Sent but not declared → compile error at the `post` call.
- **Declared but never read → nothing catches it.** The field is ignored.

Reply: not declared anywhere. Change what `run` returns and every caller is
retyped; a client destructuring a field that is gone is a compile error at the
destructuring. Compiler-only, end to end — no test covers this path.

## 4. A console verb

1. `src/lib/engine/consoleSpec.ts` — a member of the `Command` union, then its
   one entry in `SPECS`: name, aliases, usage, summary, `needs`, `parse`, and
   optionally `complete`. That single entry is the grammar, the help, the
   Tab-completion and the catalogue; `COMMANDS` and `BY_WORD` derive from it.
2. `src/lib/game/consoleVerbs.ts` — its entry in `VERBS`, calling a command from
   `commands/*.ts`. Never inline a write here.
3. `consoleCatalogue.ts` and `consoleLines.ts` — only if the verb needs a new
   shared name-pool or a new way to say its answer.

`consoleParse.ts` and `consoleStore.ts` are **not** touched: both dispatch
generically off the tables.

**What catches a missed step.** Steps 1 and 2 are compile errors (exhaustive
`Record` over `Command["kind"]`). `console.test.ts` types every printed usage
line back in and requires a usage and a summary of every spec.
`consoleStore.test.ts` runs the verb end to end against a fake table.

Example: `4ad9ede` (place gold / take gold / clear), which also needed a journal
kind — see recipe 6. `b3846ab` is what collapsed five hand-written tables into
one entry per verb.

## 5. A field on the wire Envelope

1. `src/lib/game/wire.ts` — declare it. Types only, no logic; that is the file's
   whole job.
2. `src/lib/game/envelope.ts` — fill it in `envelopeFor`. **Narrow ids here**:
   `cardIdOf` / `cardIdOrNull` and `requireFieldId` turn a stored string into a
   `CardId` or `FieldId`, and a row that fails throws a `Failure` — which the
   GET route does not catch, so it surfaces as a 500 rather than a refusal.
3. `src/app/g/[code]/use-table.ts` — read it off `data` into the `Table`.

The browser declares no wire type of its own: `Seat`, `Held`, `Game`, `Person`
are aliases of the Envelope's. Do not add a parallel shape.

**What catches a missed step.** Declared and never filled, or read under the
wrong name, is a compile error — both sides import the same types.
`envelope.test.ts` pins the shape and the concealment rules (9.3). There is no
`wire.test.ts` and there does not need to be.

## 6. A journal line kind

1. `src/lib/engine/journal.ts` — add the string to `JOURNAL_KINDS`, alphabetical.
2. `db/schema.sql` — add it to the `CHECK (kind in (…))` on
   `magiczny_miecz.moves.kind`, **and write a migration** (recipe 10). The
   database holds the list too because the reader drops a kind it does not know,
   and a mistyped kind that inserts happily is a row nobody ever sees again.
3. `src/lib/engine/journalRules.ts` — its entry in `RULE_FOR`: a rule number, or
   `null` when the honest answer is `null` (anything that happens to the *table*
   rather than in the game).
4. `src/lib/engine/journalText.ts` — a `case` in the switch, with the Polish
   sentence. The sentence does **not** name the rule; `RULE_FOR` does that.

**What catches a missed step.** Step 3 is a compile error (exhaustive `Record`),
and `journalRules.test.ts` additionally fails on a citation the Instrukcja does
not have — `17.11` typechecks and links to nothing. Step 2 is caught by
`journalKinds.test.ts`, which parses the constraint out of `schema.sql` and
requires it to equal `JOURNAL_KINDS` exactly. **Step 4 is caught by nothing** —
the switch ends in `default: return null`, so a kind with no sentence renders no
line, silently. Write the test that asserts your sentence.

## 7. A card, and a card's script

1. `src/data/raw/*.json` — the transcription, verbatim, typos included.
   `overrides.json` is where the fourteen NAZWA KARTY cards are patched.
2. `node scripts/generate-ids.mjs` — after anything that adds, removes or
   renames a card. `src/data/ids.test.ts` fails if `ids.ts` has gone stale.
3. `src/lib/engine/scripts/{spotkania,wrogowie,przedmioty,miejsca,nieznajomi}.ts`
   — one entry keyed by `CardId`, in the `CardScript` shape. Those five tables
   are spread into `SCRIPTS` in `cardScript.ts`.
4. `src/lib/engine/coverage.ts` — nothing, if the script is complete;
   `coverageOf` reports `pelne` off the tables. A card the script only half
   carries gets a `MANUAL` entry saying which clause a table still applies by
   hand, which downgrades it to `czesciowe`.

**Do not run `npm run data` to add a card.** It rebuilds the generated JSON from
`src/data/raw/` and drops hand-patches made to the generated files. Patch the
generated JSON directly.

**What catches a missed step.** `cardScript.test.ts` fails on a key that is not
a real card, a script sending a character to a `FieldId` that does not exist, a
`rzut` table missing a face, or a disposition it cannot describe.
`coverage.test.ts` fails on a `MANUAL` entry for a card nothing implements, or a
`czesciowe` card with no note.

Example: `30a7f77`, one `SCRIPTS` entry and nothing else.

## 8. A Status kind

The fold in progress: one list of `Status` rows, held cards and applied effects
alike, so a fact has one spelling. Three steps, one commit each — that is the
established rhythm (`f0ddb6e` → `d916b9c` → `60ce1c4` → `2a69f11`).

1. **Declare** — `src/lib/engine/status.ts`: a variant of `Modifier` (what is
   true) or of `Ends` (what makes it stop being true).
2. **Produce** — the `HELD_TWIN` entry in the same file, which projects a held
   card's printed `Ability` into a `Status` with `ends: { kind: "held" }`.
   Exhaustive over `Ability["kind"]`, so this step is a compile error if missed.
3. **Move the reader** — the one call site that used to sum held abilities and
   applied modifiers separately now reads the combined list. One reader per
   commit; `status.test.ts` and `statusRows.test.ts` pin the list, and the
   reader's own test pins the move.

Step three is what retires the second vocabulary. Until every reader of an
`Ability` kind has moved, the kind stays.

## 9. A new id

An id is never a `string`. Where each one comes from:

- **`FieldId` is derived**, not generated — the union of `id` literals off the
  four ring arrays in `board.ts` and `rings.ts`. Add a field to a ring array and
  the type follows. One list, cannot drift.
- **`CharacterId`, `EventId`, `ItemId`, `SpellId` are generated** into
  `src/data/ids.ts` by `node scripts/generate-ids.mjs`, off the transcribed
  JSON. `ids.test.ts` fails the build when that file is stale.

A string from outside becomes an id only through a guard: `asFieldId` /
`requireFieldId`, `asCharacterId` / `asSeatCharacter`, `isCardId` /
`requireCardId` — the `require` pair throw where carrying on is impossible, the
others answer null where "not one" is an ordinary answer. `requireCardId` and
the `isX` guards live in the **generated** `src/data/ids.ts`, so a change to
them belongs in `scripts/generate-ids.mjs` or the next run overwrites it.

**Since 2026-09-06 the engine's own signatures are typed**, so this is enforced
rather than merely intended: about fifty functions take `CardId`,
`CharacterId` or `FieldId` and will not accept a bare string. That also means
you cannot hand a Postać to a card function, which is worth knowing because
`czarodziej` and `demon` each name a Postać *and* a Karta. Narrow
**once, at the boundary** — for anything read out of the database that boundary
is `seatsFor` in `store.ts`, and everything downstream inherits the narrowing.
Do not re-guard at each use, and do not add a second boundary beside it.

## 10. A schema change

1. `db/schema.sql` — edit the canonical shape. RLS stays on with zero policies.
2. `db/migrations/YYYY-MM-DD-what-is-now-true.sql` — the actual SQL, dated.
3. **Apply it.** The convention, and it is a convention rather than a check:
   only the main session applies a migration, only on Michał's explicit word,
   through the Supabase MCP, then reads the catalog back. The database is
   biggerfish's, shared four ways, and two of the tenants take real payments.
4. `src/lib/game/tables.ts` — the typed write doors and column lists, so a stale
   column name is a compile error at the call site.
5. `src/lib/game/store.ts` — the row interface and any read that names the
   column.
6. `npm run schema:check` — connects live and fails on a table or column in the
   file but not the database (migration not applied) or the reverse, a missing
   grant (which otherwise reads as a false 401), or RLS having gained a policy.
   It does not check types, defaults or check-expressions; `fakeDb.test.ts`
   cross-checks those.

---

## Before you commit

```
npx tsc --noEmit
npx eslint          # silent, or it failed
npx vitest run
npm run build
npm run schema:check # only if the database changed
```

Then stage **by name** — never `git add -A`, never `git commit -a`, never
`git stash`. Another agent works in this tree at the same time as you, and the
uncommitted file beside yours is probably theirs. Read `git diff` on each file
you are about to stage; it may have picked up somebody else's edit since you
last looked.

The message is a sentence in the present tense saying what is now true — no full
stop, no `feat:` prefix. The body carries the why at length, because several of
these commits are the best documentation their decision has.
