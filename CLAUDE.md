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

- **Do not open a browser to confirm a foregone conclusion.** A number in a
  Tailwind class does what the number says, and driving Chrome to watch it costs
  minutes to learn nothing. Reach for the browser when the outcome is genuinely
  in doubt — new layout, drag and drop, hover and focus — and prefer Playwright
  against a real table over clicking by hand: a measured
  `getBoundingClientRect` read back out of the DOM is better evidence than a
  picture, and it can be pasted into a commit message.

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

- **Base game only.** The five expansions are out of scope; their scans are
  deliberately untouched. Surveyed once, in docs/EXPANSIONS.md, so that a
  decision taken now is taken knowing what is coming — four of them add a board
  that is not three rings, two of them are standalone games rather than modules,
  and one prints two different cards with the same name on one sheet.
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
`node scripts/export-card-back.mjs` cuts one back per pile into
`public/cards/back-*.jpg`, committed. The ZDARZENIE back was in the scans all
along, filed where nobody would look — the five of them share sheet 9's reverse
with the Zamieniony w Kamień cards, the Dobry/Zły markers and the standees,
which is why there is no "Karty Zdarzeń (tyły)" file to go looking for. The
ZAKLĘCIE and WYPOSAŻENIE backs were **not** in the Drive at all: they came from
the community archive `oficjalne.rar` (linked from the *MAGICZNY MIECZ DO
DRUKU* thread on forum.magiaimiecz.eu), which carries a `rewersy/` folder the
Drive copy does not, at the same 2480x3508 as everything else. Those two are
mirrored into `assets/raw/MM - Magiczny Miecz/Rewersy/` under the archive's own
spelling. macOS `bsdtar` reads RAR; `unar` is not needed.
`node scripts/export-nature-card.mjs` builds 7.2's Karta Zmiany Natury, one
per Natura, into `public/cards/natura-*.jpg`, committed. **There is no third
face and no scan of one**: not in the box and not in any of the five
expansions, checked on the Gród, Labirynt Magów and Krypta Upiorów piony
sheets and their reverses. Chaotyczna is the Natura the card is *absent* for,
which works at a table because the Karta Postaci is lying there saying what
the character started as, and does not work for a referee that has to name the
current Natura outright.

None of the printed lettering is used. `Zły` is a calligraphic italic in title
case and `DOBRY` is Roman capitals on the reverse — two thirds of one object
that read as two objects, which a third in either hand makes worse rather than
better. So all three words are **set here**, one face at one size, in Bodoni:
the Didone nearest the sheet, and nearer than the Times `make-random-card.py`
uses, which is that card's because it imitates a Karta Postaci title band.

The frame is the box's, and it comes in **pieces**. A card here is a white
field with a quarter-circle bitten out of each corner and nothing else — the
straight edges carry no printing — so `buildCard` cuts the four corners off
sheet 9's `Zły` and stands them on a white field of any shape with the teal
painted round it. That is what lets this card lie **on its side**
(`NATURE_CARD_RATIO`) so `CHAOTYCZNY` fits at the same size as `ZŁY` with
nothing squashed — turned, not reshaped: it keeps the printed card's own 398 by
705, which the script re-measures and warns about on every run. Corners scale off the shorter side, because a
bitten corner is a fixed thing a blade did. If an expansion card turns out to
have a rule down its edges, a fifth and sixth piece go in there.

macOS-only (`sips`, and the system's own Bodoni) like the rest of the pipeline.
`node scripts/generate-ids.mjs` regenerates `src/data/ids.ts` — the literal
id types — and must be re-run after anything that renames a card or a
character. Then `node scripts/export-card-images.mjs` writes the
web-sized JPEGs into `public/cards/` — those *are* committed, so a fresh
checkout has the pictures without needing the scans.

`python3 scripts/set-missing-card-titles.py` runs **after** that one and
overwrites fourteen of its files. The box went to print with the template's
own words in the title band of ten cards on the *Wyposażenie i Zaklęcia*
sheet and four on the *Wyposażenie* one — **NAZWA KARTY**, corner labels
still reading "Wyposażenie / Wyposażenie" — so the scans say it and
`src/data/raw/` records it verbatim, because a transcription that quietly
corrected the paper is one you cannot check against the paper. Thirteen of
the fourteen never surfaced: every other Wyposażenie card is also in the
event deck under the same id and `cardImages.ts` walks that deck first. The
Tarcza Tolimana is the exception, its twin being filed as TARCZA BOGA
TOLIMANA, so it was the one card in the game whose picture said NAZWA KARTY.
The name is *set* rather than lifted off the event card, which would carry
that other title across; Times New Roman condensed to the measured 0.92,
scaled by cap height and placed on the printed baseline. Needs Pillow, like
`make-random-card.py` and for the same reason.

**The board is a painting with 57 torn parchment scraps printed over it**, one
per Obszar, and three scripts share `scripts/lib/parchment.mjs`, which draws the
line between the two. It does **not** find the scraps by brightness: the paper
is pure white and unsaturated, and so are the snow, the cloud, the slabs of the
Kamienny Most and every highlight — 23% of the board passes a threshold tight
enough to throw away a third of the real paper, and the first attempt called
53.7% of the board parchment. Four rules do it instead, and each is there
because the one before it was not enough. Seed only on paper that is
unmistakably paper (238, against the 200–225 of the pale artwork beside it);
seed only *beside lettering*, which keeps out the snowfield by Urwisko and the
cliff by Ruiny Twierdzy — as white as the paper, touching it, and with nothing
printed on them; keep only fills the field's words are printed **on**, which
keeps out the snow directly above Ruiny Twierdzy's top line; and bound every
fill to the field's own square, without which one scrap's fill reaches the next,
takes its box, takes its lettering and grows again.

So `src/data/field-text-boxes.json` is load-bearing twice over — it says where
each description is, and it is the only record of a point that is certainly
paper — and `src/data/field-cells.json` is what keeps each field inside its own
square. `fieldScraps` returns them one per field rather than as one mask,
because two neighbouring tears very nearly touch and growing both out to their
contours merges them: Strażnik Magicznych Wrót, Magiczne Wrota and Wieża
Przeznaczenia all measured the same blob before they were kept apart.

`node scripts/export-field-text.mjs` cuts the 57 descriptions out, de-rotated
and on a transparent ground, into `assets/extracted/field-text/`, and keeps the
masks in `assets/extracted/field-masks/`. Both are gitignored, and deliberately:
nothing renders them yet and the boxes regenerate them in seconds.
`node scripts/export-field-art.mjs` measures the complement — the largest
rectangle of each cell with no parchment in it — into the committed
`src/data/field-art-windows.json`, worst-first, with the crops in
`assets/extracted/field-art/`. Median 58.9% of the cell, worst 18.8%. Each crop
is **turned upright** by the quarter turn nearest its field's reading angle: the
board is painted to be read from all four sides of a table, so a window cut
straight off the scan comes out on its side or upside down. The number to act on
is still the *shape* rather than the area — some windows are usable art in an
awkward frame, and a few are letterboxes no crop rescues.

The growth out to the drawn contour goes through **anything**, for a fixed
number of pixels, and that is deliberate. It used to be allowed onto paper-ish
or dark pixels only, and those two tests do not meet: a pixel at luminance 141,
or a bright but saturated one, passes neither, and that is exactly the fringe
where the printed line blends into coloured artwork. The growth died on that
band where it was there and sailed through to the line where it was not, so the
boundary stopped at different distances a few pixels apart — a stepped
silhouette — and where the band lay on the line, the line came out chopped in
half. A fixed number of steps nothing can halt gives a boundary the same
distance from the core everywhere. It costs a two or three pixel rim of painting
where the outline is thinner than that, which against the picture it was cut
from reads as part of the scan; `export-parchment.mjs` takes that rim off its
own pieces, because on an eighty-pixel corner composited onto a parchment we
made it would read as a halo.

`node scripts/export-parchment.mjs` harvests the torn edge itself into
`public/parchment/`, which **is** committed, on the same reasoning as
`public/cards`. The point is to set the transcription we already have inside a
scrap we assemble, rather than ship 57 pictures of printed text that cannot
resize. It works because the edges are not a repeated stamp — every blob was
drawn separately, same hand and same idiom, no two sequences alike — so there is
no canonical corner to look for and no pattern an assembled edge could be caught
deviating from. The one constraint that makes the pieces a *library*: every one
is cut where its contour crosses the baseline **on the way out**, so any end
butts against any other without a step. `fieldBoards.test.ts` pins that every
run shares one height, which is what puts every baseline on the same row.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
