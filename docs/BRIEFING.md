# Briefing an agent

Work in this repo is often delegated: the main session plans, reviews and
commits, and agents do the implementation. Every brief was opening with the
same hundred and fifty words of house rules, slightly differently each time.
This is that preamble, once. **Link to it from a brief instead of restating
it**, then spend the brief's words on the part that is actually specific.

## The standing rules, which apply to every task

- **Never commit.** No `git add`, no `git commit`, no `git stash`, and above
  all never `git add -A`. The main session reviews the diff and commits it by
  name. Another agent — and sometimes a second human session — works in this
  tree at the same time, and `git stash` reverts their uncommitted work with no
  warning that it was there.
- **Run all three checks before reporting**, and say the numbers:

  ```
  npx tsc --noEmit
  npx eslint
  npx vitest run
  ```

- **The test counts are an invariant, not a statistic.** A brief states the
  count at HEAD — currently **3205 passed / 31 skipped**. For a refactor or a
  type change both numbers must be unchanged; for a feature the pass count
  rises and the skip count does not. A moved skip count means a parked test was
  disturbed, and that is worth stopping for. If a number moves and you cannot
  say why, that is the finding, not a detail.
- **A test that needs a cast or a `skip` to compile is telling you something.**
  Look at what it means before you change it.
- **Report what you were unsure about.** The most useful line in any report
  this repo has had was an agent saying which of its own conclusions it had not
  proved. A wrong claim stated confidently costs more than the task saves —
  several have had to be caught by hand, including "4.4's rebirth carries gear
  forward", which it does not.
- **Do not widen the task.** If the change starts to sprawl into a refactor
  nobody asked for, stop and report where the edge was.

## Where to look before asking

- **[WHERE.md](WHERE.md)** — to add an action, a Command, a console verb, a
  card script, a Status, a wire field, a journal kind, an id or a column:
  which files, in what order, and what fails if you skip one. Start here.
- **[CLAUDE.md](../CLAUDE.md)** — the non-negotiables. An id is never a
  `string`; the engine is pure; a write goes through a Command; every rule
  number is a promise you can keep.
- **[CONTEXT.md](../CONTEXT.md)** — Snapshot, Changeset, Command, Status. Use
  the repo's words in code and in your report.
- **`node scripts/ask.mjs`** — ask the box a question rather than grepping the
  data. *Is `rusalka` a card or a character? Which ids does `czarodziej` claim?
  What does the Pustelnik print, and which of his clauses are live?* Grepping
  `abilities.ts` for a name once produced the answer "Rusałka is a Postać",
  which is false and cost a whole design decision.

## House style, briefly

- Comments say **why**, not what. The commit log is where the reasoning lives,
  at length; several commits are the best documentation their decision has.
- A rule number `(5.3)` is a promise — only write one you have checked in
  `docs/RULES.md`. Printed card text carries no rule number, and neither does
  a plumbing refusal.
- Quote Polish verbatim from `src/data/`, one card's own sentence, in `„…"`.
  Never stitch two cards' text together and never invent an ending.
- Never name a helper `useX` unless it is a React hook — the lint rule counts
  it as one, even in the pure engine.

## What a good report looks like

Under the word limit the brief sets. What you changed, file by file where it
matters; the checks and their numbers; **what you were unsure about**; and
anything you were tempted to do and did not. If you deleted something, say
what and why it was safe. If you went past the brief's letter, say so plainly —
that is much cheaper to review than to discover.
