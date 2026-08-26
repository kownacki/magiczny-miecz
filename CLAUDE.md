# Magiczny Miecz

A referee for the 1993 Polish board game *Magiczny Miecz* (Sfera, Adrian
Markowski) — a Talisman derivative. **Private project, not published.**

Two modes behind one engine. **Simulation** runs the whole game in the browser —
board, deck, dice, arithmetic — and is the only one currently open.
**Companion** — you play on the physical board with the physical cards and the
app owns everything tedious — is **parked**: see `COMPANION_PARKED` in
`src/lib/game/modes.ts`. No new table can be opened in it, nothing about it has
been deleted, and one boolean brings it back. Assume simulation when working on
anything.

## Read these first

- **[CONTEXT.md](CONTEXT.md)** — the referee's own vocabulary: Snapshot, Changeset, Command
- **[docs/TASKS.md](docs/TASKS.md)** — the live checklist; what is done and what is next
- **[docs/COVERAGE.md](docs/COVERAGE.md)** — every numbered rule, and whether the app carries it
- **[docs/LOBBY.md](docs/LOBBY.md)** — host, players, presence: the part that is not Magiczny Miecz
- **[docs/RULES.md](docs/RULES.md)** — the rulebook transcribed
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
- ~~**Companion mode before simulation.**~~ Reversed. It was chosen because it
  attacks the actual complaint about this game (downtime and bookkeeping) and
  needs almost no card art. What settled it the other way is that keeping both
  honest costs a second pass over every change, against a mode nobody is
  playing yet. Simulation first; companion comes back when it is worth the
  second pass. Nothing has been deleted — see `COMPANION_PARKED`.
- **In simulation, nothing is entered by hand.** No typed die results, no
  edited totals, no reported fight outcomes, no ± on a tracked value. The app
  rolls, moves and computes; a player who could overwrite that is not playing
  the game but editing its record of itself. Those controls exist and are
  correct — they are companion mode's, and they are gated on the mode, not
  deleted.
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
`node scripts/export-tokens.mjs` cuts the thirteen Żetony Pomocnicze — Miecz,
Magia and Życie in denominations of 1 to 4, and the Sztuka Złota — off `MM -
Żetony.pdf` into `public/tokens/`, which is committed.
`node scripts/generate-ids.mjs` regenerates `src/data/ids.ts` — the literal
id types — and must be re-run after anything that renames a card or a
character. Then `node scripts/export-card-images.mjs` writes the
web-sized JPEGs into `public/cards/` — those *are* committed, so a fresh
checkout has the pictures without needing the scans.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
