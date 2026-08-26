# Magiczny Miecz

The referee's own vocabulary — the words for how a change to a table is made,
as distinct from the words the game itself uses. The game's language is Polish
and comes from the rulebook (`docs/RULES.md`); the words below are this app's,
and they exist because the store had none and grew 4 000 lines without them.

## Language

### Making a change

**Snapshot**:
The whole table as it stood at one instant — the game row, its seats, holdings,
field cards, effects, and where the journal had got to.
_Avoid_: state, context, world

**Changeset**:
Everything one change writes, as data rather than as calls.
_Avoid_: patch, diff, mutations, ops

**Command**:
A pure function from a **Snapshot** and an instruction to a **Changeset**.
_Avoid_: action, handler (the TypeScript type is `Handler`; the concept is a
command), service method, use case

**Commit**:
Writing a **Changeset**, taking the game row first and conditionally so that the
whole of it lands or none of it does.
_Avoid_: save, persist, flush

**Conflict**:
Somebody else changed the game between reading the **Snapshot** and committing.
_Avoid_: race, collision, stale write

**Seat view**:
Everything a rule asks about one character, worked out once from a **Snapshot** —
totals, limits, abilities, what it is under. Never stored; only own points are.
_Avoid_: player, profile, stats

**Apply**:
Folding a **Changeset** into a **Snapshot** in memory, so a later step sees an
earlier one's work without reading the table again.
_Avoid_: reduce, project, simulate

### Being told about a change

**Envelope**:
What one device is sent about the table, worked out from a **Snapshot** for one
seat: the read-model counterpart to a **Changeset**. Two devices at the same
table get two different Envelopes off the same Snapshot, because a spell hand
is concealed (9.3).
_Avoid_: payload, DTO, response, state (the browser's copy is an Envelope, not
a Snapshot — it never sees the deck, and never sees another seat's hidden
cards)

**Permission**:
Whether a seat may take a named action right now, and why — a pure question
about a **Snapshot**, not about a session. Refusing one is 409: the seat is
known and the moment is wrong.
_Avoid_: auth, authorization, guard, policy (the seat is already identified by
the time a Permission is asked for; a 403 has happened or not happened
already)

### Where the effects come from

**Port**:
The named seam a rule reaches effects through, so the same rule serves a
physical table and a browser simulation.
_Avoid_: adapter (an adapter is a thing that *satisfies* a port), provider,
strategy

**Binding**:
One concrete answer to a port — `appRandom` throws the dice, `supplied` takes
what a player typed.
_Avoid_: implementation, driver, mode

The ports a **Command** runs against are `random` (one six-sided die, the only
randomiser the base game uses) and `now` (the wall clock, for the handful of
rules measured in seconds rather than turns). A command that reads either
directly cannot be asked what it would do with a given roll or at a given
moment, which is the whole reason they are ports.

## Relationships

- A **Command** reads exactly one **Snapshot** and returns exactly one **Changeset**
- A **Command** that cascades calls another with `apply(snapshot, soFar)`
- `change()` is the only thing that both reads a **Snapshot** and performs a **Commit**
- A **Commit** either advances the game's `revision` by one or raises a **Conflict**
- A **Port** has one **Binding** per mode, plus a scripted one for tests
- Commands live one per cluster under `src/lib/game/commands/`; two files above
  them are the edges — `turnStore.ts` for the game, `lobbyStore.ts` for the
  poczekalnia — and they exist to do the three things a **Command** may not:
  read, mint (a claim token, a shuffle), and write the one row a **Changeset**
  cannot name, which is the game itself
- `store.ts` is rows and reads. Nothing decides anything in it
- An **Envelope** and a **Changeset** are the two things a **Snapshot** turns
  into: what one seat is told, and what the table becomes
- A route handler does the I/O and nothing else — find the game, prove the
  seat, ask for a **Permission**, run a **Command** or build an **Envelope**

## Example dialogue

> **Dev:** "Death drops the gear on the Obszar and then hands the turn on. Are
> those two changes?"
>
> **Referee:** "One. If the pass is a second **Commit** it decides against a
> table that does not know the character is out, and can hand the turn back to
> them. `killSeat` returns one **Changeset** with both, and the pass reads the
> snapshot with `apply` so it already sees them eliminated."
>
> **Dev:** "And if two people press something at once?"
>
> **Referee:** "One **Commit** wins and the other raises a **Conflict**. Nothing
> of the loser's was written, so `change()` reads a fresh **Snapshot** and runs
> the **Command** again — with the same dice, because a throw nobody saw must
> not change on a retry."

## Flagged ambiguities

- "state" meant the whole table, the `turn_state` column, and React's `useState`
  in three neighbouring files — resolved: the table is a **Snapshot**,
  `turn_state` keeps its column name and is a `TurnPhase`, and React's is React's.
- "port" was claimed for `DeckPort`, `ChoicePort` and `EnginePorts`, none of
  which ever had a **Binding** or a caller — resolved: they are gone. The die is
  the only effect a rule cannot work out for itself. Which card comes up is
  settled by handing a **Command** the shuffled pile, and a human choice arrives
  as `Decisions` — a list of numbers the server re-walks the card against, so a
  card cannot be talked into doing something it does not say. Both are better
  than the ports they replace, and neither is one.
- "notice" and "journal line" render the same events and are NOT the same thing
  — resolved: the journal is third-person past and gender-neutral because a
  typed name cannot be declined (`journalText.ts`); the notice is second-person
  and immediate, which is why it can quote the dice (`noticeText.ts`). Two
  registers, deliberately.
- **Own points** and derived points are never the same number, and neither is
  ever called "total" in storage — only `sword_own` / `magic_own` are stored, and
  the sum is computed at read time. See the non-negotiable in `CLAUDE.md`.
