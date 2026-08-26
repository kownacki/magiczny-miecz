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

**Apply**:
Folding a **Changeset** into a **Snapshot** in memory, so a later step sees an
earlier one's work without reading the table again.
_Avoid_: reduce, project, simulate

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
- Commands live one per cluster under `src/lib/game/commands/`; `turnStore.ts`
  keeps the old name as a one-line entry point until everything has crossed

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
  which have a **Binding** or a caller — unresolved: they are interfaces
  describing a layering the code does not have yet, and either get one or go.
- "notice" and "journal line" render the same events and are NOT the same thing
  — resolved: the journal is third-person past and gender-neutral because a
  typed name cannot be declined (`journalText.ts`); the notice is second-person
  and immediate, which is why it can quote the dice (`noticeText.ts`). Two
  registers, deliberately.
- **Own points** and derived points are never the same number, and neither is
  ever called "total" in storage — only `miecz_own` / `magia_own` are stored, and
  the sum is computed at read time. See the non-negotiable in `CLAUDE.md`.
