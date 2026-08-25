# Magiczny Miecz

A referee for the 1993 Polish board game *Magiczny Miecz* (Sfera, Adrian
Markowski) — a Talisman derivative. **Private project, not published.**

The primary mode is a **companion**: you play on the physical board with the
physical cards, and the app owns everything tedious — state, dice, arithmetic,
card resolution order, legal moves. Full in-browser simulation is a secondary
mode behind the same engine.

## Read these first

- **[docs/TASKS.md](docs/TASKS.md)** — the live checklist; what is done and what is next
- **[docs/COVERAGE.md](docs/COVERAGE.md)** — every numbered rule, and whether the app carries it
- **[docs/LOBBY.md](docs/LOBBY.md)** — host, players, presence: the part that is not Magiczny Miecz
- **[docs/RULES.md](docs/RULES.md)** — the rulebook transcribed
- **[db/schema.sql](db/schema.sql)** — the data model and why RLS has no policies

## Non-negotiables

- **The engine in `src/lib/engine/` is pure.** No React, no Supabase, no I/O, no
  `Math.random`. Everything effectful arrives through a port. This is what makes
  the rules testable, and it is the only reason one engine can serve both a
  physical table and a browser simulation.
- **Randomness and card identity are ports, not branches.** `RandomPort` is
  bound to a human typing what they rolled, or to an RNG; `DeckPort` to a human
  naming the card they drew, or to a shuffled virtual deck. Rules code must
  never learn which. Mode is configuration.
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
- **The database is biggerfish's, shared four ways.** This is a `magiczny_miecz`
  schema in project `aqqdamoqwxiquhkzzcix`, alongside finalbid and wheatbid, and
  the service-role key grants all of them. Two of those take real payments.
  Schema-qualify every hand-written query.

## Settled — don't reopen

- **Base game only.** The five expansions are out of scope; their scans are
  deliberately untouched.
- **Companion mode before simulation.** It is the mode that attacks the actual
  complaint about this game (downtime and bookkeeping), and it needs almost no
  card art to be useful.
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

`assets/raw/` holds 689 MB of scans mirrored from Drive and is gitignored. Every
scan is image-only with **no text layer**, so all transcription is done by
reading images. `node scripts/extract-assets.mjs` rebuilds `assets/extracted/`
(also gitignored) at native resolution — 2480x3508 per sheet, sliced into cards
by detecting the printed cut lines. That slicer cannot handle either Karta
Postaci — the small ones sit in teal gutters it cuts only roughly, and the big
ones butt together with the same teal printed *on* them — so
`node scripts/build-character-cards.mjs` re-cuts both sets to one size each.
`node scripts/export-card-art.mjs` cuts the framed illustration out of every
card — the same rectangle on all of them, 10%–90% across and 14.5%–56.5% down —
for use as an icon where a whole card would be a grey smear.
Then `node scripts/export-card-images.mjs` writes the
web-sized JPEGs into `public/cards/` — those *are* committed, so a fresh
checkout has the pictures without needing the scans.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
