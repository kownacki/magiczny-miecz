# Tasks

Living checklist for the revival. Updated as work lands — this is the file to
watch for progress.

Scope for v1: **base game only** (Magiczny Miecz). The five expansions
(Gród, Jaskinia, Krypta Upiorów, Labirynt Magów, Magia) are out of scope and
their scans are deliberately untouched.

---

## Phase 0 — Foundation

- [x] Park the 2020 Lit/Firebase app on the `legacy-lit` branch
- [x] Strip the repo to `assets/` and rebuild as Next 16 + TS + Tailwind 4
- [x] Configs: `package.json`, `tsconfig`, `next.config`, `postcss`, `eslint`
- [x] `.env.example` documenting every credential
- [x] `npm install` (dev server not yet booted)
- [x] `db/schema.sql`, applied and smoke-tested; anon confirmed locked out
- [x] `CLAUDE.md`

## Phase 1 — Asset pipeline

Turning 689 MB of image-only PDFs into files the system can be built on.

- [x] Native-resolution image extraction from the scans (`scripts/lib/pdf-images.mjs`)
      — the scans are 2480×3508; rasterising the page instead gives 595×841
- [x] Dependency-free PNG encoder + cropper (`scripts/lib/png.mjs`)
- [x] Automatic grid detection and card slicing
- [x] Extract every base-game sheet to individual card images (267)
- [x] `assets/extracted/catalogue.json` — every source PDF, what it holds, how many
- [x] Verify counts against the rulebook — all six match exactly
- [x] Web-optimised card images into `public/` — 267 slices, 9.8 MB, committed

### Music

Might and Magic VI (1998, Paul Romero / Rob King / Steve Baca). Its redbook CD
tracks are long, quiet, loop cleanly, and were written for exactly this — a
party crossing terrain, one screen at a time. Base-game board has four ambient
zones plus the lobby, so five of the fifteen tracks are assigned and the other
ten are banked for the expansions' Gród and Jaskinia.

- [x] `src/data/music.json` — all 15 tracks, published timings, zone assignments
- [x] `scripts/export-music.mjs` (`npm run music`) — 96 kbps AAC, two-pass
      EBU R128 to -20 LUFS so crossing a ring never changes the volume.
      Verified end to end on synthetic sources: five files at -20.0 ±0.1 LUFS,
      `moov` ahead of `mdat`, misaligned input writes nothing and exits 1.
- [ ] Source audio: MM6's Music folder from a GOG copy into `assets/music/`
- [ ] `npm run music`, then commit `public/music` (~14 MB for the five)

Playback, built standalone in `src/lib/music/` and wired to nothing yet:

- [x] `director.ts` — pure. Which zone owns the speakers, and a hold so that
      turn order alternating between two rings does not crossfade every minute.
      Same zone in means the identical state object out, so the caller can drive
      it from every render without detecting changes itself.
- [x] `player.ts` — equal-power crossfade behind a `MusicPort`, tested headless.
      Linear would dip audibly at the midpoint; the curve keeps summed power at
      1 throughout, asserted in the tests.
- [x] `browserPort.ts` — Web Audio, not `audio.volume`: iOS ignores writes to
      that property, so a volume-based fade is a hard cut on every iPhone.
- [x] `useMusic.ts` — the connection point. Defaults to `enabled: false`; one
      device makes noise, and which one is the caller's decision.
- [x] `/music` — bench with the zone by hand and the hold on a slider, because
      how long a zone should keep the room can only be settled by listening.
- [ ] Pick a hold length at a real table, then connect: the active seat's field
      to its `region`, which is already the `MusicZone` shape.

## Phase 2 — Transcription

Every scan is image-only with no text layer, so all of this is read visually.

- [x] Rulebook read end to end (9 pages)
- [x] `docs/RULES.md` — the whole rulebook, verbatim, 109 numbered rules.
      Every one of the 72 rules the engine cites is present.
- [x] Dolny Krąg field instructions — all 14 transcribed and shown in the turn
      panel. Draw counts agree with the independently-read engine data.
- [x] Board fields: all 58 read off the scans and ordered. Each edge was read as
      ONE continuous strip so both corners fell in the same image, which forces
      the splice. Corroborated two ways: reading down the left edge reproduces
      Dolny Krąg indices 9-13 exactly, and the four twice-printed names land in
      symmetric positions. **Not yet checked against the physical board** —
      `RINGS_VERIFIED_AGAINST_PHYSICAL_BOARD` is false and rings.test.ts encodes
      every constraint the rulebook places on them.
<!-- superseded, kept for the record:
- [~] Board fields: 58 fields read off the scans. Names and ring membership are
      corroborated — all five rule cross-checks pass (Uroczysko/Las Błędnych
      Ogni, Przełęcz Wichrów/Dolina Czaszek, both bridge crossings, both bridge
      entrances). **Cyclic order is NOT verified** and is deliberately not wired
      into movement: the outer ring came out shorter than the middle ring, which
      is backwards for concentric rings. A second attempt from full-board views
      confirmed the bridge order exactly but could not splice the outer two
      rings — their edges mix fields from different rings, four names repeat
      symmetrically (Bagna, Ruchome Skały, Urwisko, Rozstajne Drogi), and the
      corners are ambiguous. **Fastest fix is to read the order off the physical
      board.**
-->
- [x] 165 event cards → typed data
- [x] 30 spells → typed data
- [x] 30 items → typed data (14 unnamed in the print files, named in overrides.json)
- [x] 27 characters → typed data
- [x] Rule 2.6 read at full resolution: 1->0 2->1 3->2 4->2 5->3 6+->3, capped at 3.
      The worked example beneath it is garbled in the scan; the table wins.

## Phase 3 — Engine

Pure TypeScript, no React and no Supabase, so it is unit-testable in isolation.

- [x] State and move types
- [x] Board topology — all four rings: Dolny (14), Środkowy (16), Górny (18),
      Kamienny Most (9)
- [x] Effects ports: `RandomPort`, `DeckPort`, `ChoicePort`
- [x] Derived stats: totals, spell capacity, carrying limit, nature gating
- [x] Legal-move computation (both directions round a ring, with the route walked)
- [x] Card resolution ordering (15.2, 16.4)
- [x] Combat and magic combat (17, 18) incl. the Beast (14.7)
- [x] The Beast and victory (14.7, 22) — two dice set the fight kind and its
      strength 10-15; losing costs two Życia, winning ends the game
- [x] Death (4.4), carrying limit (5.4), spell capacity (2.6, 9.2), trophies (1.4)
- [x] Player-versus-player combat (17.6) and escape (17.2, 19)
- [x] Nature changes (7.2) and Turned to Stone (20)
- [x] Bridge movement (10.3, 10.4) — one field per turn, die ignored, may turn back
- [x] Ring crossings (11.1-11.8) — the two the rules allow, and nothing else
- [x] Stepping onto the bridge from Górny Krąg (11.9-11.11) — only from Wymarłe
      Miasto or Ruiny Twierdzy, only with a Magiczny Miecz, guardian first
- [x] The whole route start-to-Beast is asserted end to end in playthrough.test.ts
- [x] Vitest coverage — 53 tests green; caught a real bug where healing
      drained a character who was above four Życie

## Phase 4 — Companion app

**Parked.** See `COMPANION_PARKED` in `src/lib/game/modes.ts`: no new table can
be opened in this mode. It was the primary mode and everything below still
works, but simulation is what is being built now, and keeping both honest cost
a second pass over every change against a mode nobody was playing. Nothing here
has been deleted; one boolean brings it back.

Physical board and cards, app as referee.

- [x] Game + seat model, join code, no accounts
- [x] Table view — responsive, so a phone gets the same page with only its own controls
- [x] Card identification by type-ahead on name, diacritics folded
- [x] Manual override on every tracked value, journalled as manual
- [x] Physical-die input alongside the app rolling, everywhere a die is needed
- [~] Sync — 2s polling; the Realtime revision ping drops into the same seam

## Card effects

- [x] Suggested actions: unconditional card text becomes a one-tap button,
      applied through the same journalled correction path as the manual +/-
- [x] Conditional text (Nature, die roll, choice, all-players) suggests nothing
      at all, deliberately — a plausible wrong button is worse than none
- [x] Roll-table cards and fields ("rzuć kostką: 1 - ...") — parsed into six
      outcomes with a die to roll against them. Commits only when all six faces
      are covered exactly once, so Czarci Młyn (two tables) and Osada (the 1993
      printing claims face 2 twice) are correctly refused and fall back to text.
- [ ] Nature-dependent cards — the seat's Nature is known, so these are
      resolvable once Kat's setup choice is handled

## Card display

Show the actual scanned card beside the turn, in both modes. In simulation it
is the only way to see what you drew; at a physical table it settles "what does
this one do again?" without passing the card round.

- [x] Export card slices to web-sized images keyed by slice reference
- [x] Side panel showing the drawn card, or the whole stack when a field draws
      several (Bezdroża draws 2, Płaskowyż Mgieł draws 3)
- [x] Fall back to text when a card has no image
- [x] A seat's hand listed on its card, with concealment applied server-side
- [x] The seat's character card as an image, with its abilities

## Card effect vocabulary — the next big piece

Every card's text is transcribed, but the app only *reads* it back. To resolve
cards without a human interpreting each one, they need a small set of typed
effects the engine can apply — and the vocabulary has to be derived from what
the 165 cards actually say, not invented up front.

The shape the cards suggest so far:

- **what happens**: adjust a stat, move the character, draw more cards, take or
  lose a card, lose a turn, change Nature, turn to stone, start a fight
- **on whom**: the drawer, every player, players of one Nature, players in one
  ring
- **under what condition**: a Nature, a die roll, a choice, holding some item
- **what becomes of the card afterwards** — this is its own axis and the deck
  leans on it heavily: discarded ("odłóż Kartę"), left lying on the field until
  someone deals with it ("Pozostanie tu, aż ktoś go pokona"), kept by the player,
  or moved to a named field ("Połóż tam Kartę")

Jednorożec is the worked example: it moves the character to any field in the
ring, then the card is discarded whether or not the offer was taken.

- [ ] Derive the vocabulary from the transcribed corpus rather than guessing
- [ ] Type it, with an exhaustive `Record` per behaviour so a new effect kind
      fails the build at every site that must handle it
- [ ] Encode cards against it, leaving unencoded cards falling back to today's
      "show the text and let a human apply it" — the progressive-enhancement
      rule stays
- [ ] Card disposition as a first-class field, since where a card ends up is
      what makes fields accumulate cards over a game

## Phase 5 — Full simulation

**The mode.** Companion is parked (Phase 4), so this is the only way a new table
can be opened — and it is simulation in earnest: nothing is entered by hand,
because the app rolls, moves and computes everything.

- [x] Virtual deck — 165 event cards and 30 spells, shuffled, dealt, recycled
      (9.5). Every printed copy is in the pile, so draw odds match the sheets.
- [x] Virtual dice everywhere a die is needed
- [x] Hidden information per player — concealment applied on the server, so a
      rival's spells never reach the device at all
- [x] Board rendering — a drawn map of all three rings and the bridge, one
      shape per field, a coloured dot per character, fanned when several share a
      field. Tapping a field shows its printed text. Serves simulation as the
      board and companion mode as the position check.
- [x] Middle and outer ring field text — 34 fields transcribed from the scan;
      `scripts/build-ring-fields.mjs` checks every draw count against the count
      the engine already carried from a separate pass. All 34 agree.
- [x] Verify the middle/outer ring order — done from the scan rather than the
      physical board. The whole board was read at once, which settled what three
      earlier tile-by-tile passes could not, and boardMap.test.ts now holds the
      two independent readings against each other.

---

## Open, found while playing

- [x] **The fields that trade now trade.** Nine establishments — the Osada's
      Płatnerz and Medyk, the Gród's Wróżbita and Lichwiarz, the Karczma, the
      Zamek's Medyk, the Pustelnik, the Magiczne Wrota, the Strażnik — are
      encoded in `fieldScript.ts` and bought from through `buyGoods`,
      `sellHolding` and `payHealer`. `shopStock` had been computed and sent to
      every device since 21.2 went in with nothing rendering it. The Twierdza is
      deliberately left as prose: its mission is an errand across the board, and
      six blank die faces would claim help that is not there.
- [x] **A defeated Wróg could be fought again, forever.** 17.4 ends the fight
      when the dice are compared; nothing wrote that down, so the same Smok
      could be ground until the dice went your way. Found by a bot playing whole
      games through the API, which is also how the shape of a turn got measured.
- [x] **The whole draw pile shipped to every client**, in order, on every poll.
- [x] **Position had no manual override** — the value most likely to drift, and
      the one everything else is computed from.
- [x] **No manual entry in simulation.** Typed rolls, edited totals, reported
      fight outcomes and the ± on every tracked value are gone from
      `simulation`; companion keeps all of them. See "Tryb symulacji" in
      COVERAGE.md.
- [x] **The app carries effects out.** A field's die table and a card's script
      are resolved on the server: one press, it rolls, reads the row and applies
      it, then says what happened. `isSettled` (`resolve.ts`) draws the line —
      automate everything that is not a decision — and what is left comes back
      as `pending` for the interface to ask about, which is exactly the set of
      choices the rules actually give a player.
- [x] **The Realtime ping had never fired.** `liveRevision.ts` says a device is
      told the moment the table changes, "sent from a trigger on
      `games.revision`". There was no such trigger. `broadcast_revision()` was
      live, correct and attached to nothing, so `stol:{kod}` had never carried a
      message and every table had been running on the two-second poll that was
      meant to be the backstop — which is exactly why nobody noticed.

      Found by `schema:check` on the first run after it learned to compare
      functions, and the fix goes one step further: it compares **triggers**
      too, because comparing functions alone called that schema clean. A
      function nothing calls is not a feature working badly; it is a feature
      that has never run.

      Attached with a `when (old.revision is distinct from new.revision)`
      clause rather than `after update of revision`, which fires on the column
      being *named* whether or not it moved. Safe inside the one transaction
      `apply_change` now runs: `realtime.send` swallows its own errors into a
      warning, so a broken channel cannot take a move down with it — checked in
      the catalog rather than assumed.

- [x] **A change lands whole, or not at all.** `commit` used to issue nineteen
      PostgREST statements in a row, each its own transaction, and the journal
      insert was the last of them. On 2026-09-03 a player took a Tarcza
      Tolimana off a Nieznajomy: the Tarcza moved, the turn advanced, and then
      the line saying so was refused by a `moves_kind_check` the database had
      never been migrated to. A change that happened with no record that it
      happened, which is the one failure the journal must not have.

      The compare-and-swap never covered this. It makes a *loser* write nothing
      at all — true, and what CLAUDE.md means — and says nothing about statement
      nine of nineteen failing on the winner.

      `commit` now folds a `Changeset` into an ordered list of `Statement`s
      (`src/lib/game/statements.ts`) and hands the list over in one call.
      `magiczny_miecz.apply_change` runs it inside one transaction; `fakeDb`
      runs the same list against a copy of its tables and swaps it in only if
      all of it worked. The SQL is **generic** on purpose — it knows nothing
      about the game — because `storeOver(handle)` is one implementation for
      both Postgres and the store `mm` and every save file run on, and a
      `commit_change` that understood a changeset could not be called by a
      `Map`. The decision stays in TypeScript; only its result crosses.

      The compare-and-swap goes over as `expect: 1` on the games update, so it
      is still written once, in `commit`, and both runners only enforce a number
      they were handed. Nineteen round trips became one, which was not the
      point but is not nothing.

- [x] **A drift guard between `db/schema.sql` and the live database.**
      `npm run schema:check`. The file is applied by hand and had already
      fallen behind it: `games.turn_state`, `games.deck` and three columns of
      `seats` were live and unmentioned, so rebuilding from the file would have
      thrown away the state of every turn. It also granted nothing, which makes
      a table invisible to PostgREST — a 401 that reads exactly like a missing
      one.

      Four things, both directions: tables, column names, grants, and RLS-on
      with zero policies. Deliberately **not** types, defaults or check
      expressions — parsing those loosely produces false alarms, and a guard
      nobody trusts is a guard nobody reads. The `not null default` axis is
      already held against the file from the other side by `fakeDb.test.ts`,
      which now shares this one's parser (`schemaFile.ts`) rather than keeping
      a second copy.

      Reads the live half through `magiczny_miecz.schema_shape()`, in
      db/schema.sql beside the tables it describes, because PostgREST does not
      expose `pg_catalog`. Read-only, `security invoker`, names this schema and
      no other. Exits 0 clean, 1 on drift, 2 when it could not look — so it can
      go in CI whenever there is one.

      Done earlier than this note planned. The reason to wait was that the
      schema was still moving; it moved three times in one session
      (`trophy_mode`, `trophy_points`, `trophy_beaten`), which is the argument
      for having it rather than against.

- [x] **Effects that reach other players.** This note was out of date and the
      truth was narrower than it said. `applyEffect` does *not* write one seat:
      all three ops that carry a `target` — `punkty`, `tura-stracona`, `strata`
      — loop over `seatsTargeted` and chain through `apply`. The Zaraza takes a
      Życie off everyone in the Krąg, and the Burza Siedmiu Słońc a turn off
      everyone, and both were already tested.

      One card really was stuck, for a different reason: **`isSettled` and
      `chooseLosses` each kept their own list of the losses that are not a
      choice, and disagreed about one value.** `chooseLosses` knew that
      „wszystkie" is everything of a kind and never a question;
      `resolve.ts` named `wszystkie-przedmioty`, `wszyscy-przyjaciele-oprocz`
      and `gold`, and left out `wszystkie-zaklecia`. So the Przesilenie was held
      at the gate as an unanswered choice and never reached the code that knew
      better — it announced nothing and took nothing, on every table, since it
      was written.

      Fixed by giving the question one owner: `takesEverything` in `losses.ts`,
      an exhaustive switch that will not compile if a new `co` is added without
      somebody saying which of the two it is. Both callers ask it.
- [x] **Prose die tables no longer roll in the browser.** `RollTable` used
      `Math.random` locally, so those rolls reached neither the server nor the
      journal and no replay could reproduce them.

      Worse than the note said, and on more of the board. It is the reader for
      an *Obszar's* printed text, not only for cards, and twelve fields' prose
      parses as a die table — ten of which have a scripted service as well
      (Karczma, Kurhan, Krąg Mocy, Studnia Wieczności, Gród, Twierdza, Wieża
      Przeznaczenia, Zamek, Krypta Upiorów, Wilczy Parów), with the Pułapka and
      Cerber handled as Kamienny Most ordeals. So a simulation offered two ways
      to roll the same Obszar, one of them a rumour. And the outcome buttons
      posted to `/adjust` — the manual override, journalled as a person
      overruling the referee — which is a way round "in simulation, nothing is
      entered by hand" on a third of the board.

      In simulation the table is now read-only: the six faces stay, because
      that is the Obszar's printed text and worth reading, and every button
      goes. Companion keeps all of it, where the die is real and the app is a
      lookup. `src/lib/view/fieldRollTable.test.ts` holds the invariant that
      makes it safe — every Obszar with a parseable table is one the server can
      roll for itself — so a thirteenth cannot arrive unnoticed.
- [x] **17.9's spoils.** The winner of a duel may take a Życie, a Przedmiot or a
      Sztuka Złota, and all three now happen. `resolveFight` takes a `Spoils`;
      the Przedmiot changes hands rather than being destroyed, so 21.2's stock
      holds, and it arrives through `slotOnArrival` like any other gear. Taking
      it or the Złoto skips the blow entirely — no osłona, no Giermek dying in
      anybody's place, no Excalibur.

      A won duel is the one fight that does not settle itself: `fight` says who
      won and `spoils` takes it. The console asks; the browser does not yet, and
      that is all that is left — the press exists (`fight-done`) and the route
      reads `spoils` / `spoilsHoldingId`, so it is a picker on a button that is
      already there.

- [ ] **Two decisions and three blockers**, written down here because they are
      what the remaining work is actually waiting on (2026-08-31).

      **A status has nowhere to sit on a Karta lying on an Obszar.**
      `seat_effects.seat_id` is `not null`. That one constraint stops the Krąg
      Płomieni's burning Wróg, the Władca Gromu's paralysed creatures, half of
      the Ocalony, and the Wampir's growing Życie. One migration, four cards —
      **on the database three other projects share, so it is Michał's to
      approve.**

      **Nothing records which Przedmioty are inside a container.** The Magiczna
      Sakwa and the Tragarz destroy what they carried and the app sheds the
      overflow onto the Obszar instead, which is wrong in the player's favour;
      the Tajemna Sakwa wants the same link. `carried_by` already does exactly
      this for a Krzyżowiec's Zaklęcie — but putting a Przedmiot *into* a Sakwa
      is something a player has to be able to do, so this is **a feature, and
      wants Michał's say on whether it earns its UI.**

      **Cross-obstacle adjacency is not on the board.** The Łódź and the
      Latarnia land you at the crossing's printed exit rather than "na Obszarze
      sąsiadującym", because the rings are 14, 16 and 18 fields and do not line
      up. Nobody's decision — just work nobody has done, and another session was
      measuring it as this was written.

- [ ] **The last 6 cards.** 132 of 138 distinct event cards have a script — 128
      `pelne` and 4 `czesciowe`, after the sweep of 2026-08-31 took the MANUAL
      list from twenty-two clauses to seven. The app says on screen which is
      which — see `coverage.ts`.

      The six with nothing at all, and what each of them actually wants:

      - **Sobowtór** — one line. His strength being his opponent's is already
        carried in `cards.ts` and tested; what he lacks is a `SCRIPTS` entry, so
        "Pozostanie tu, aż ktoś go pokona" is unencoded and `coverageOf` calls
        him `brak` — "aplikacja jej nie prowadzi" — about a card the app fights
        correctly. `sobowtor: STRAZUJE()` answers both.
      - **Kometa** — buildable today, no new model. "Giną wszyscy Nieznajomi"
        is a sweep of one class off the Kraina you are walking: the `stranger`
        rows in that ring go to the used pile.
      - **Turniej Rycerski** — assembly. A challenge, a teleport and an ordinary
        duel, all three of which exist.
      - **Diament Królów** — mostly assembly. Its second half, a lost duel that
        must be paid with the Diament rather than anything else, is
        `CardScript.przegrana` pointing the other way.
      - **Wampir** — blocked. His Życie grows as he wins, which is a number
        that has to live on the Karta lying on the Obszar. Same wall as the
        three Zaklęcia below.
      - **Tajemna Sakwa** — blocked. "W Sakwie możesz umieścić 1 Przedmiot" is
        the container link the Magiczna Sakwa and the Tragarz also want.

      So they are three afternoons and two blockers, not six puzzles.

      Three reasons listed here have since gone. A consumable spent at a moment
      of the holder's choosing is `uses.ts`; a friend that imposes an ongoing
      restriction rather than a bonus is a `Modifier` (the Południca's one field
      a turn, the Zły Duch barring new friends until the Pustelnia); and the
      Zwierciadło Zniszczenia is scripted.

      Eleven have come off the list. Five earlier: the Wędrowiec, Godzina
      Duchów, the Kryształ Magów, the Przybysz z Krainy Cieni and the Trójgłowy
      Smok. Six more while playing: Danina, Zaklinacz Czasu, Kuglarz, Mędrzec,
      Tajemnicza Szkatuła and the Alchemik — each of which needed the effect
      vocabulary to grow by exactly one thing, and each time because the card is
      shaped that way rather than to make one card fit. Targeting by Natura and
      by Krąg, which used to be listed here as a reason a card could not be
      encoded, is now `Target`.

      The blocker this bullet used to name — **a bonus that lasts one turn**,
      wanted by the Eliksir Siły, the Najemnik, the Kryształ Losu and both
      fruits — is built. It went where the note predicted, into one piece of
      vocabulary rather than five special cases: a `Modifier` with an `Ends`,
      kept in `seat_effects`. `{ kind: "turns", turns: 1 }` is exactly it.
- [x] **One-shot and fixture cards have a vocabulary** — `cardScript.ts`, with
      disposition as a field of its own (odłóż / zostaje na Obszarze / zostaje z
      pulą punktów / do pierwszej Postaci / po N turach / wraca do stosu). About
      thirty cards are encoded, covering every variant; the rest is data.
      Encoded cards take precedence over the prose reader in `cardEffects.ts`,
      which stays as the fallback for everything unencoded.

The rest came out of playing a real game through the browser. Each is a rule
the engine gets wrong or does not have, not a missing feature.

- [x] **The three guardians are fought, not adjudicated.** "Stocz walkę" runs a
      real fight through the combat engine: the bridge guardians roll for their
      own strength first (a die plus four, as the board prints it), the Rycerz
      brings his printed Miecz 10, and the outcome is routed to the doorway
      rather than back to the field — so a loss costs what 11.11 or 11.8 says it
      costs. Reporting an outcome by hand is still there for a table settling
      the fight itself.
- [x] **11.10: the bridge is entered in passing, not on arrival.** Now a third
      move option, offered only when the walk passes an entrance with a step
      still to spend, and never when the move ends on one.
- [x] **11.11: no retry next turn.** A failed or drawn attempt marks the seat
      and the option is withheld for exactly one round.
- [x] **A crossing can be retried.** The choice is offered before the roll as
      well as on arrival, which is what 11.4 describes.
- [x] **No card is drawn when stepping onto the Most** — the entrance field is
      no longer resolved at all, so the exemption holds by construction. The
      Trzęsawiska and Lodowy Las equivalents are stated in the crossing panel
      rather than enforced, because staying and drawing is a legal choice.
- [x] **Przeprawa charges its toll.** Pay 1 Sz. Z. and carry on, or the whole
      move is undone and the turn ends where it began.
- [x] **A Postać that started again could not play.** The last living
      character dies, `killSeat` hands the turn on, `nextSeat` looks round a
      table of one eliminated seat and comes back with nobody, so `active_seat`
      goes null — and 4.4's new Karta seats a character, deals its kit and
      leaves it null. Everything after that is refused for want of an active
      seat: „To nie twoja tura (10.1)" for picking a Przedmiot up, and no dice.
      Neither half was wrong; the state between them was nobody's. Both doors
      back into play now start the table when it had stopped, and only then.
      Found in the wild, in two of this project's own games.

      Two neighbours came with it. A death now clears the seat's effects — an
      effect is a row against the *seat*, and 4.4 puts a different Karta in that
      chair, so a Zaklęcie cast on the one who died went on taking its point off
      a Postać it had never been spoken over. And a table with nobody in it now
      says so and offers the pass: `permission.ts` has allowed anybody to send
      `end` in that state since it was written, and nothing in the interface
      could send it.
- [x] **SOBOWTÓR could not be fought.** The one Wróg in the box with no number
      printed on him, because his number is somebody else's: „Posiada zawsze
      tyle punktów Miecza, ile jego przeciwnik." `combatValueOf` had nothing to
      read and called him not-a-Wróg, and his own card kept him where he was —
      „Pozostanie tu, aż ktoś go pokona" — for the rest of the game. It now
      takes who is opposite; asked without them it still answers that he fights,
      which is what most callers want to know. His strength is asked for in four
      places and answered the same way each time — the fight, a wyprawa, the
      trophy banked at the win, and his Karta priced in a trade at its holder's
      own Miecz.

      Found by `npm run soak`, which is the second thing that script has caught
      that no test would have: a refusal in the tail that was not the rules.
- [x] **11.4/11.8's draw outcome.** The Lodowy Las is a fight and can be drawn,
      so it has three outcomes now. The Trzęsawiska cannot: the card is a
      threshold and "mniejszy lub równy" leaves no middle, so 11.4's mention of
      a draw reads as boilerplate carried over from 11.8. The card is followed
      and the discrepancy is recorded in `trzesawiskaOutcome` rather than
      silently resolved.


## Known corrections

- The number at the top of each card is a **Roman numeral for the card class**
  (I Spotkanie, II Wróg, V Przedmiot), used for resolution ordering in 15.2 —
  it is *not* a unique card id. Cards cannot be identified by number.


## Findings worth keeping

- **Ring-to-ring adjacency is not geometry, and `boardMap.ts` cannot answer it.**
  Somebody probed whether the field across the water from a given one could be
  derived by intersecting the schematic `CELLS` rectangles — Dolny against
  Środkowy, Środkowy against Górny. It cannot: 10 of 14 and 13 of 16 overlap
  either two neighbours or none, because the rings have different cell counts
  and nothing lines up.

  The probe was chasing a question the box does not ask. **Crossings are four
  named pairs, printed on the board** — Uroczysko ↔ Las Błędnych Ogni through
  the Trzęsawiska, Przełęcz Wichrów ↔ Dolina Czaszek through the Lodowy Las —
  and they live in `CROSSINGS` in `rings.ts` with the test each one demands.
  Movement otherwise runs *around* a ring (`ringFields` returns the whole ring,
  which is also the Poszukiwacz's range), and the only other links between rings
  are `BRIDGE_LINKS`, on and off the Kamienny Most.

  The reusable half: `src/lib/view/boardMap.ts` is a schematic for **drawing**
  the board and is not a source of truth about what neighbours what. It is in
  `view/` for that reason. Recorded so nobody runs the probe a second time.

- **A card never leaves the game.** Nineteen places in `commands/` delete a
  holding and every one of them pairs the delete with a return — `putOnPile`,
  `trophiesToPile`, or an insert onto the Obszar — because a deleted card has
  not been „odłożona na stos zużytych": it is out of the box, and 9.5 can never
  bring it back. The three that lift a card off the *board* are the same story.
  Audited card by card; `piles.test.ts` holds the two deliberate exceptions,
  which both live in `putOnPile` rather than at the call sites:

  - a **granted** card joins no pile, because the deck never gave it up and its
    own copy is still in the draw — returning one is how a table ends the
    evening holding two Cyklopy;
  - the **Wyposażenie** is a stock and not a deck (21.2), so a Hełm leaving a
    hand goes back on the shop's shelf by `stockLeft`'s arithmetic. Eleven of
    the twelve are *also* in the event deck, so pushing one onto the used pile
    would hand the deck a thirteenth Hełm and the shop its own back at once.

  Which settles what a death does with trofea: in „karty pokonanych" the hoarded
  Karty go to the stos zużytych like everything else, and in „punkty" nothing
  goes back because the Karta went back at the kill — only the points are lost.

- **Dolny Krąg was stored counter-clockwise.** The cycle was right, so every
  distance and adjacency was right, but `destination` reads a rising index as
  "zgodnie ze wskazówkami zegara" — so the app named the two directions the
  wrong way round on the lower ring. Harmless in simulation, wrong at a table
  where a hand moves the figure. The scan settles it: that ring's top edge reads
  Osada, Step, Mokradła left to right. All three rings are now stored clockwise
  and boardMap.test.ts holds them to it.
- **The two bridge entrances were crossed.** Ruiny Twierdzy sits on the outer
  ring's top edge and opens onto the top of the bridge; Wymarłe Miasto is on the
  bottom edge and opens onto the bottom. They were mapped to the opposite ends,
  which walked a character the length of the bridge past the wrong creatures.
- **Only one direction of each crossing is defended** (11.3, 11.7, and both
  fields' printed text). Going back down costs nothing and needs no roll; the
  app was charging a point of Życie for failing a test the rules do not set.
- **Rycerz Wiecznych Śniegów stands on Przełęcz Wichrów, not Dolina Czaszek** —
  Miecz 10, and he ignores anyone arriving from Dolina Czaszek.
- The board's own draw counts agree with the ring arrays on **all 34** middle
  and outer ring fields, which is two independent readings of the scan agreeing.

- The deck contains genuine **duplicates** (4x "1 SZTUKA ZŁOTA", 2x "UPIÓR",
  4x "MAGICZNY MIECZ"), so a card id is not unique. `sheet + index` is the key.
  These are **deliberate design, not a transcription artefact**: the assets are
  printed sheets the owner cuts up with scissors, and a card printed four times
  is four times as likely to be drawn. The simulated deck holds every printed
  copy, so draw odds match the physical game exactly. Asserted in deck.test.ts.
  The game is reproduced 1:1 from the assets and the rulebook; any deliberate
  deviation gets documented when it is made.
- **Kat** prints `natura: dowolna` and chooses at setup — the only character the
  three-value Nature enum cannot hold. Hence `StartingNature`.
- **Tragarz** is filed as a Przyjaciel, not a Przedmiot, so the rule 5.4
  carrying-limit check cannot key off item-ness.
- Fourteen cards shipped with the placeholder title **"NAZWA KARTY"** — the
  print files were never finished. Named from their body text in overrides.json.
- Event class split: przedmiot 63, wrog 32, spotkanie 20, przyjaciel 20,
  nieznajomy 17, miejsce 13 = 165.

- The resolution numerals printed on the cards are **I Spotkanie, II Wróg,
  IV Nieznajomy, V Przedmiot, V Przyjaciel, VI Miejsce** — verified against the
  card headers. Przedmiot and Przyjaciel share V, matching rule 16.6 which names
  them in one clause. III is unused by any base-game card. An earlier guess of
  III/IV for Nieznajomy/Przyjaciel resolved turns in the wrong order.

## Ekwipunek slotowy (wariant)

- [x] Slot taxonomy and the audit of what the box actually has (`slots.ts`)
- [x] `eq_mode` on the table, chosen when it is opened
- [x] Pack limit counts only unslotted Przedmioty in the variant
- [x] Equip / unequip / swap, and refusing a card the place cannot take
- [x] The slots drawn as a body beside the character card
- [x] Miecz and Magia bonuses only from worn cards (`inEffect`)
- [x] Card abilities only from worn cards
- [ ] Two weapons at once, for a character with the ability — none has one yet

See **Wariant: ekwipunek slotowy** in [COVERAGE.md](COVERAGE.md).

---

# Separating people from Postacie — landed

**Done.** The database was wiped and re-shaped and the app has followed it all
the way out to the screen: the engine, the commands, the three stores, the
routes, the console, the browser, and 1,737 tests. A game can be opened, joined,
left, come back to and played; a Postać can die, be barred, and be stood back
up.

`npx tsc --noEmit` was the work list and is clean. Eleven of the things these
passes turned up were invisible to it and five reached the database — every
write in `store.ts` goes through an untyped handle — so trust the prose here
over the compiler.

What is left is not migration, and is written at the bottom under **Still
open**.

## The model, in one paragraph

A **seat** is a place at the table and the Postać standing in it — six per
game, fixed, and seat order is turn order. A **user** is a person, unbounded,
with a four-character globally-unique id and a name that is unique per table.
A user drives at most one seat; a user with no seat is a **spectator**, which
is a thing to be rather than the absence of one. The rulebook already made this
split and the schema had flattened it: 2.1's "Każdy z grających *kieruje* jedną
Postacią" and 4.4's "Gracz, który *kierował* niefortunną Postacią".

Four states, on two independent axes:

|                    | no driver | driver                  |
| ------------------ | --------- | ----------------------- |
| **no character**   | free      | waiting (picking)       |
| **character**      | empty     | taken                   |

## Vocabulary — settled, do not relitigate

| command                    | acts on   | effect                                                    |
| -------------------------- | --------- | --------------------------------------------------------- |
| `who`                      | —         | the table: seats, Postacie, drivers, ids                   |
| `seat <player> 3`          | user      | sit down; refuses a seat somebody is actively driving      |
| `unseat [player]`          | user      | out of the chair, still watching; Postać untouched         |
| `kick <player>`            | user      | out of the table                                           |
| `leave` / `exit`           | me        | out by choice — same exit, different journal line           |
| `pick [MAGOG] [3]`         | seat      | a Postać in: drawn unless named, yours unless numbered      |
| `remove` / `erase 3\|MAGOG [hard]` | Postać | out of the game, Karty to the used piles            |
| `revive 3\|MAGOG`          | Postać    | back where it fell, own points, starting Życie, no items    |
| `rename <player> as Ola`   | user      | —                                                          |
| `host <player>`            | user      | —                                                          |

- **Confirm what no other command can undo**: `remove`, `kill`, and `kick` (the
  only one that is rude to somebody *else*). `unseat` and `leave` take nothing
  away. `needsConfirming` in `engine/console.ts` holds the rule.
- **soft `remove`** puts the Karta back in the pool; **`hard`** bars it for good.
  A **host** may remove a *living* Postać (the rulebook says nothing about
  withdrawing one, so nothing is being overruled). Only the **console** may
  remove a *dead* one — that is putting a Karta back that 4.4 explicitly set
  aside, and it is journalled `manual` like every other break.
- `kill` and `revive` are console-only. Both contradict 4.4 in words.

## Done

`c5189cc` schema · `aac3c70` console grammar · `27aa4f7` migration applied +
wipe · `89e4310` row types split · `eaf796d` `lobby.ts` · `01578f4` all eleven
API routes · **the console and every test** — `npx tsc --noEmit` is clean and
1,702 tests pass.

Six things the console pass turned up, worth knowing because none of them was
on the list and two of them typechecked all the way through:

- `listGames` was reading `player_name`, `no_device`, `is_host` and
  `abandoned_at` off **seat** rows. It compiled because `seatsInGames` hands
  back `Record<string, unknown>`, and it would have failed at the database.
  There is a `usersInGames` beside it now, and "abandoned" is a fact about the
  pair — a Postać with nobody behind it — rather than a column.
- `sayGoodbye` wrote `seats.left_at`, which is not a column any more. It is the
  *person's*, like `seen_at` beside it, so `/bye` no longer needs a seat and a
  spectator closing their tab is swept like anybody else.
- `chooseCharacter` had silently stopped un-readying you when you swap Postać —
  the comment saying it did outlived the code. It writes the driver's `ready`
  now, and has nobody to un-ready on a chair the host is choosing for.
- `dealCharacters` no longer skips a chair nobody is driving, and cannot: that
  is either the host's local player — whom `mayChooseFor` lets them choose for,
  so the deal has to fill it — or somebody the sweep is about to remove, and
  `no_device` was the flag that told those two apart.
- `nextHost` promised to skip somebody who had walked away and had lost the
  column that said so. It skips `left_at` now.
- `pickPlayer` learnt the four-character id and a null seat, which is the only
  handle a **spectator** has — nothing printed on the board names them.

Three more from the client pass, all on the critical path and none of them
visible to `tsc`:

- **`createGame` still wrote `seats.claim_token`, `is_host` and `player_name`.**
  Opening a table failed outright against the new schema — the first thing
  anybody does with this app. It inserts a bare chair and a host *user* now.
- **A kick had lost its permission check.** `removeSeat` enforced "Tylko
  gospodarz" and `leaveTable` replaced that function without replacing the
  refusal, so any seated player could post another player's id and clear them
  off the table. The rule is back in `leaveTable`, where the client's copy of it
  can be checked against something.
- **A freed chair was never reused.** `joinGame` skipped every seat row that
  *existed*, so each arrival cut a new one: six kicks and a table with one
  player at it could seat nobody. It now skips chairs that are driven or have a
  Postać standing on them, which is what "free" means.

And two from the 4.4 pass:

- **`commit` sent `granted: undefined` to a `not null` column.** The field-cards
  insert spread the row through where its sibling above it spells the default
  out, so the first card put down by something that did not set the flag — a
  coin, from a withdrawn Postać's purse — failed the statement half way through
  a commit. Found by running it, not by reading it.
- **`characters_out` was in the schema and nowhere in the code**: not on
  `GameRow`, not in `GAME_COLUMNS`, read and written by nothing. The column had
  been added with the migration and the code never caught up, so 4.4 was a
  comment in `db/schema.sql` describing a rule the app did not have.

## The client, and the three things that had to arrive with it

The envelope carries **`me`** and **`users`** now, and `me` is the whole of what
the browser could not ask before: a device driving no seat and a device the
table has never heard of both arrived as `mySeatIndex: null`, so *watching* a
table was drawn as having been thrown off one — the page forgot its token and
redirected home with a notice saying somebody had removed them. A seat carries
`driver_id` and nothing else about a person; `Seat` lost four columns that had
stopped arriving months of edits ago and were still declared, every one of them
reading `undefined` (`abandoned_at !== null` was true of every seat at the
table).

**`deviceId.ts`** is the localStorage half of the two-secret split argued for
below, and `resumeAs` is the rule it feeds: reopening a table offers *Wróć jako
Michał*, a second tab is told it is already somebody here and offered *Dołącz
jako ktoś inny*. Verified end to end against the live database, including the
token rotation that stops the old window acting as them.

**The four states** are `seatState` in `lobby-view.ts` — free, waiting, empty,
taken, on the two axes of the table above. The poczekalnia draws a `free` chair
as a free chair again: a seat row outlives its person now, so the chair of
somebody kicked or swept was being advertised as "Miejsce 2 · bez gracza", an
absence where the honest answer is an invitation. And people driving no chair
are listed under the seats, which is the first time a spectator has been drawn
anywhere at all.

## 4.4's list, and the two words that were waiting on it

`games.characters_out` is written now. **Death adds** — in `killSeat`, which is
the only place that still knows which card it was, since the seat's
`character_id` is overwritten the moment its player picks again. **`pick`,
`chooseCharacter` and the deal** all choose from what is neither seated nor
listed, and a card that is out says so ("wypadła już z gry") rather than
claiming somebody is holding it. And `commands/withdraw.ts` is the pair the
rulebook has no word for:

- **`remove`** empties the chair and spills the kit onto its Obszar under 12.1 —
  Przedmioty and Przyjaciele face up, the Złoto as one `1-sztuka-zlota` per
  coin, the Zaklęcia back to the pile because nobody ever saw them (9.3). Soft
  puts the Karta back in the pool; `hard` bars it. The permission is the settled
  one: a host may withdraw a *living* Postać, and only the console may take a
  **dead** one off the list.
- **`revive`** stands a dead Postać back up where it fell, on its own points and
  4.2's four Życia, and brings nothing back that was left on the field.

Both are journalled `override` with `manual: true`, because both contradict a
rulebook that removes a Postać exactly once and never puts one back.

## Tested end to end, and the six things it found

The restructure was driven through the real HTTP routes rather than reasoned
about — a table opened, joined, seated, started, played, killed, revived,
removed, kicked, left, reconnected and filled to seven people, 81 assertions
against what came back. Everything the model promises holds. Six things did not,
and every one of them lived in a gap between two layers that were each right on
their own:

- **A newcomer could not take an abandoned Postać.** The join route wanted a
  token from somebody who by definition has none, and `joinGame` refused any
  seat a user row still pointed at where `takeSeat` had always drawn the line at
  `isQuiet`. The gate offered "gracz się rozłączył" and the server answered "to
  miejsce ma już swojego gracza".
- **Nothing wrote the host's `device_id`.** `createGame` said it would be
  "written on the first poll"; no poll wrote it, and `joinGame` was the only
  writer in the app. The landing page sent no device on create *or* join. So the
  person likeliest to reload was the one the table could not recognise.
- **The console never asked.** `needsConfirming` was exported, tested, and
  called by nothing — `kill`, `remove` and `kick` all ran on Enter.
- **Every latecomer was filed as a 4.4 replacement.** A mid-game seat is created
  `eliminated`, so that flag cannot tell a death from an arrival; only a death
  leaves a Postać on the seat to be replaced.
- **The journal renamed its own history.** `describeTurnChange` built its
  sentence from the seat as it stands now, so a rename rewrote lines about turns
  taken hours earlier.
- **Two sentences counted to zero out loud** — "Wszystkie 0 postaci mają swoich
  graczy", "You drops to 0 Życia".

The harness is `sweep.py` in the session scratchpad. It is worth rewriting
rather than restoring: what it is *for* is asserting against the real routes,
and that is the part worth keeping.

## Still open

- [ ] **Split `drawn-card.tsx` at line 488.** 819 lines, the fourth-largest
      `.tsx` in the repo, and the seam is a single JSX element: the
      `<div className="mt-auto …">` that opens the button area runs 332 lines —
      40% of the file — and is a different responsibility from everything above
      it. Above is what the Karta *is* (`known`, `art`, `profile`, `label`, the
      header, `CardFacts`, the coverage notes); below is what you may *do* about
      it, in ten mutually exclusive `{canAct && …}` branches.

      The seam was checked rather than eyeballed. All six callbacks —
      `onResolve`, `onFight`, `onEscape`, `onTake`, `onLeave`, `onAsk` — and
      both pieces of state, `choices` and `going`, have no use above 488 except
      their own declarations and the effect that resets them, which move down
      too. So do the derivations that feed only the buttons: `asking`, `gate`,
      `inert`, `needs`, `chosen`, `said`, `offered`, `foe`, `keep`, `skippable`.
      The new component derives those itself rather than taking them as props,
      which keeps the surface to the card, the script, the label, the Natura,
      `busy`, `ring`, `occupied`, `mySword` and the callbacks. About 480 lines
      left and 350 moved.

      **Deliberately not done yet.** This is the hottest file in the repo and
      the other agent has been in it all session; at the time this was written
      its three uncommitted edits were all *inside* the block that would move.
      Moving 332 lines out from under somebody is the one merge nobody can do by
      hand. Do it when the file is clean, not before.


**Companion mode** (`COMPANION_PARKED`) is the only thing left, and this work
went through it. `no_device` is gone: a chair the host filled in by hand is now
simply one nobody is driving, which `mayChooseFor`, `dealCharacters` and the
`away` reading in `envelope.ts` all agree about.

One thing does *not* agree, and it is written down rather than fixed, because
building for a mode nobody runs is how you get two guesses instead of one:

- **The shared screen cannot act.** `mayAct` still grants `tableScreen` to a
  host in companion mode, and that is right — in companion every hidden thing
  is a physical card and the app holds nothing worth keeping from the room. But
  the host is a *user* now and may hold no seat at all, and the turn route
  refuses a seatless actor ("Nie prowadzisz żadnej Postaci") **before** `mayAct`
  is ever consulted. So a table screen that runs the game without playing —
  which the split made possible and which is the whole point of a companion
  table — is blocked one layer above the rule that allows it.

  When the boolean flips: the turn route's seatless guard has to ask `mayAct`
  first and let `tableScreen` through, and every command it then reaches needs a
  seat named in the body rather than taken from the actor. That is the shape of
  the work, and it is not small.

## Two decisions a fresh session would otherwise re-derive

Both are now built, and both are still worth reading before touching either.

- **`deviceId` goes in `localStorage`, and it does not contradict
  `seatToken.ts`.** That file argues for `sessionStorage` and is right — about a
  different question. `claim_token` is per *window* ("may this window drive that
  seat"); `device_id` is per *browser* ("who is this person") and has to survive
  the tab closing, which is the whole reconnect case. Reopening finds the quiet
  user with that `device_id` and offers *"Wróć jako Michał"*; a second tab finds
  that user *live* and offers *"Dołącz jako ktoś inny"*, so multi-tab testing
  becomes a deliberate choice rather than an accident.
- **Mid-game nothing is auto-unseated.** The sweep is the poczekalnia's only.
  A Postać is not free for the taking because somebody's phone slept; `AWAY_AFTER_MS`
  shows them away and the host has `unseat` for when it is really over.

## Przyjaciele, and what the browser still has to draw

The rulebook's chapter on friends (6.1–6.4) is about custody only — you gain
them, they lie face up, you may keep any number, a dead one goes to the used
pile. It says nothing about what a friend *does*, and that is why COVERAGE could
mark the chapter done while a Rycerz stood there being decorative. Everything a
friend does is printed on its own card.

The engine now carries it. **A GUI needs no new rules work for any of this** —
the browser reads derived figures off `seatView`, so the cards arrive through
`envelope.ts` on their own.

What the envelope already sends, per seat:

- `sword_total` / `magic_total` — 1.5's "parametr", the number on the card
- `sword_in_fight` / `magic_in_fight` — what it becomes when somebody swings;
  the Rycerz replacing it outright and the Bojowy Rumak folding Magia into
  Miecz both land here
- `fights_for_you` — the cardId of the Przyjaciel doing the fighting, or null.
  Worth drawing: the Rycerz's 3 and 3 *replace* the character's own, so for most
  Postacie the fight figure goes **down** when he joins, and unexplained that
  reads as a bug in the app rather than as the card doing what it says.
- `holdings`, each with its `kind` — so friends can be grouped away from gear.
  They are not gear: 6.3 makes them unlimited and they never count against 5.4's
  four, which the console got wrong for a while by listing a Rycerz inside a
  "Pack 2/4" he was not one of the two of.

One new action on the turn route:

- `raid` — the Poszukiwacz Przygód, sent at something up to three Obszary off.
  Takes `targetSeatId` **or** `raidFieldCardId` (a Wróg left lying by 16.8), and
  exactly one of them. Range is `fieldsApart`, which counts steps round one ring
  and returns null across rings — a Przeprawa is a turn's work that can fail,
  not a step. The friend fights with his own 3 points and dies instead of
  costing a Życie, so a lost raid takes nothing from the character at all.

### Done since: every Przyjaciel now does something

**14 pelne, 6 czesciowe, none at `brak`.** The three that were open are closed.

- **NAJEMNIK** sells `za-oplata`: 1 Sztuka Złota buys +3 Miecza for a turn, once
  per turn. The once-a-turn rule stores nothing — the effect lasts exactly the
  turn it was bought in, so one sitting on the seat *is* the record of paying.
- **KRZYŻOWIEC and GNOM** carry a Zaklęcie apiece. A spell belonging to a *card*
  had nowhere to live, so there is now a fifth holding kind, `carried`, and a
  `carried_by` column naming the friend. A fifth kind rather than a flag on
  `spell` is the whole design: every query asking for `'spell'` excludes it by
  default, which is right in almost all of them — 2.6 must not count it and a
  Pan Zaklęć must not take it. `ask` is the verb; `viaFriend` keeps the ordinary
  cast from reaching one, without which the Gnom's Sztuka Złota is optional.

Two bugs surfaced doing it. **Status point bonuses never reached a fight**:
`bonusFrom` was called in `envelope.ts` and nowhere else, so the Eliksir Siły's
"+2 Miecza na 1 turę" had been decorative since it was written — drawn on the
browser's screen and invisible to every rule. And a **carried card would have
been deleted outright on death**, appearing in neither the "goes to the spell
pile" nor the "lies on the Obszar" list, quietly taking a Zaklęcie out of play.

Four of those six are closed, and a fifth was never open. Two mechanisms did
the work, each given to the cards that share it: `cena-przyjecia`, **a friend
who charges to join** — the NAJEMNIK and TRAGARZ a Sztuka Złota, the CHOCHLIK a
point of Życie — which also carries what each does when you refuse, since 16.8
leaves the Najemnik waiting on the Obszar and the Tragarz's own text sends him
to the stos zużytych; and `uzdrowienie` + `oddaj-w`, **a friend who mends you at
one Obszar or is given up there for gold** (KSIĘŻNICZKA at the Zamek, WŁADCA at
the Twierdza). The healing half of that second pair had been declared in
`ABILITIES` and read by nothing — `payHealer` asks the Obszar and never the
hand — which made it the fifth dead ability after the four the sweep caught.

The ALCHEMIK is off the list without work: his note said the swap is
irreversible, which is what `sellHolding` already does, and the Lichwiarz makes
the identical trade with nothing written against him.

Two clauses are left, and each waits on something the app has not got. The
CHOCHLIK's look-at-two-and-choose needs a pending decision the player answers,
and the spell draw has no shape for one — `wybor` exists but belongs to card
scripts, and a Zaklęcie draw is not a card script. The TRAGARZ's "losing him
loses what he carried" needs to know *which* Przedmioty are his, and `udzwig`
only raises the limit by four; nothing records who carries what, so the app
would have to choose somebody's cards for them.

### The migration, now paid — both rounds

`moves_kind_check` has been altered on the live database and matches
`JOURNAL_KINDS` again. It was owed more than `died-for-you`: the constraint held
50 kinds against the list's 60, so `paid-friend`, `card-table`, both `beast-*`
and all six `bridge-*` were equally unwritable — a browser game would have
refused a Bestia draw and a bridge crossing as readily as a Giermek's death.
Terminal play writes save files and never noticed.

The two the constraint had and the list has not, `adjust` and `arrived`, are
gone with it; no row used either, so the new constraint validated against the
existing rows rather than being added `not valid`. It was generated out of
`journal.ts` by a script instead of retyped, which is what the comment above the
list in `db/schema.sql` asks for, and the statement named
`magiczny_miecz.moves` and nothing else.

A second round went in for the carried Zaklęcia: `carried` added to
`holdings_kind_check`, a `carried_by text` column on `holdings`, and
`carried-spell` in `moves_kind_check` — 61 kinds now, generated from
`JOURNAL_KINDS` the same way. Applied and read back, `magiczny_miecz` only. The
schema and the code are in step; nothing is owed.

## Zaklęcia, finished — engine, console, browser

All twenty-seven Zaklęcia in the box are now carried out rather than read
aloud: through `SpellScript.stosuje`, through `applies` for the two that take
cards out of play, or through `reactive` for the two that answer another
spell. Four are carried *in part*, and the part left says so in `MANUAL`
(`coverage.ts`) so it reads `czesciowe` and prints where a player reads the
card. The register is the answer to the danger the old notes named: a spell
that half works and does not say so.

Three pieces made the difference, and each of them is somewhere the model had
no shape at all before:

- **A spell can be pending.** `castSpell` used to decide and commit in one
  breath, which made WŁADCA ZAKLĘĆ („neguje działanie każdego innego (bez
  wyjątku) Zaklęcia, rzuconego bezpośrednio przed nim") and ZWIERCIADŁO
  („odbije… na tego, kto je rzucił") unbuildable: both need the spell they
  answer to be *in the air*. So a cast anybody could answer leaves a `spoken`
  status carrying the whole cast — the target, and anything the caster had
  already decided — and lands when the window closes or when somebody answers.
  Only when they could: with no reactive Karta in another hand there is nothing
  to wait for, which is almost every cast in almost every game.

- **A spell can ask a question.** WŁADCA ZDARZEŃ names a Karta *and* an
  Obszar. `applyEffect` hands back what it could not carry out, `landSpell`
  used to drop that, and the changeset committed with the card spent and the
  Karta where it was. Now the cast throws, which writes nothing — and
  `decided` travels on the `spoken` status so the answer survives the window.

- **A spell is aimed at what its Karta names.** The picker reads
  `SpellScript.target` rather than guessing: seats, „na siebie", the Karty
  lying face up, or the Obszary of the Krąg the caster is walking. Three of the
  eight targets had no picker at all before and were refused by the server for
  naming nothing.

Order was the same as everywhere here — engine, then the console, then the
browser. `cast X at Y to Z` and `endcast` are the console's whole vocabulary
for it; the browser adds the aim pickers and the box above the NowBox that
counts the window down, tells the one player holding an answer that they hold
one, and closes it when it lapses.

**What is deliberately not built.** The four partial ones need things that are
not about spells: a status that can sit on a Karta lying on an Obszar (KRĄG
PŁOMIENI, WŁADCA GROMU thrown at a Wróg), the *Magiczny* flag on the 63
Przedmiot cards, which is printed on them and was never transcribed (WOJNA
ŻYWIOŁÓW), and OCALONY's Przyjaciel and „remis" thirds. And the `spoken`
status is the resolution stack's `cast` frame wearing a different hat — see
docs/STACK.md law 4, which supersedes it when step 2 lands.

## Parked deliberately — the Obszar inventory's neighbours

These came out of the September 2026 pass over what lies on an Obszar (see
`src/lib/view/fieldGroups.ts`). Each was looked at properly and put down on
purpose so the card work could land on its own. None is blocked. The first has
since been built and is kept struck through rather than deleted, because a note
that said the opposite for a while is worth leaving where somebody can see it
changed.

### ~~Gold lying on an Obszar~~ — built

The question the note said to answer first was where gold on a field is
*stored*, and the answer is its own table: `field_gold`, one row per Obszar that
has any, so taking three of five is a patch rather than a read-modify-write two
commands might race. Not `field_cards` — a Sztuka Złota is not a Karta, and
minting `1-sztuka-zlota` rows would hand the deck copies it never gave up.

4.4 and 20.2 both leave a purse behind now; 12.1 takes any amount off it. The
Obszar window draws it as a pile of coins fitted to the Karta tile beside it,
above the loot the way 12.1 lists it, and the console has `place gold N`,
`take gold [N]` and `clear gold [N]` with help and Tab.

Four rules bugs came out of it, all of the same shape — one rule written twice
against the two places a Karta can be, because arriving lifts every
`field_cards` row into the turn's frame:

- 12.1a fired for a Przedmiot and not for gold, so coins could be taken over an
  unfought Wilk's head.
- 12.1b fired for gold and not for a drawn Przedmiot.
- Both skipped the money *Karta* entirely, that branch of `takeCard` returning
  before either guard.
- `offerOn` read only the board, so a TARGOWISKO was shut for the whole of the
  turn you land on it and open to anybody merely passing through — exactly
  inverted.

`refuseUnlessSettledHere` is the one guard now, and trade goes through it too.

### Class II and class III as two separate battles (17.5, 18.2)

The Demon getting its own class (`CARD_CLASS.demon`) made explicit something
the engine has never been asked about. 17.5:

> Więcej niż jeden przeciwnik. Jeżeli Postać jest atakowana przez więcej niż
> jedną istotę, **Miecze tych istot są sumowane**, a do uzyskanego rezultatu
> dodawany jest wynik rzutu kostką.

and 18.2 resolves magical combat "w identyczny sposób". So a Wilk and a
Wilkołak on one Obszar are **one** fight at Miecz 12, not two fights in some
order — and because Miecz and Magia cannot be added, an Obszar holding both
kinds gives exactly **two** fights: the summed II first, then the summed III.

What was NOT checked, and is the whole of the task: whether `fight.ts` sums a
pack at all, and whether it would now split one correctly along the class line.
`fought` already lists a pack's members and `trophiesFrom` walks them, so
something knows about packs; nobody has read it against 17.5 since the classes
were two.

### Handel między Postaciami — parked, and probably not in the game

Two Postacie standing on one Obszar cannot trade, and after a search of the
rulebook and all four card sets the honest reading is that **the base game
never gave them a way to.** Written down here because the absence looks like a
gap, was investigated as one, and is not.

**What the box actually says.** 13.3 is exhaustive about what a meeting is:
"Spotkanie z inną Postacią może przybrać jedną z dwóch form: Postać która
właśnie weszła na dany Obszar może zaatakować Postać, która już się tam
znajduje (17.6-10.) lub użyć w stosunku do niej swoich specjalnych zdolności."
Attack, or use your abilities. Not trade.

Every transfer between characters in the box is **involuntary** — 17.9's
spoils, ZŁOCZYŃCA robbing whoever he beats, SZALEŃSTWO taking a Zaklęcie,
ZWIERCIADŁO ZNISZCZENIA used against somebody. No Karta, Zaklęcie or
Charakterystyka grants a voluntary one.

**The one trace, and where it came from.** 3.4 has a parenthesis:

> Płatności za wszelkiego rodzju zakupy lub usługi odkładane są do zapasu
> nieużytych żetonów Sztuk Złota (zasada ta nie dotyczy, rzecz jasna, **handlu
> między Postaciami**).

"Obviously this does not apply to trade between Characters" — an aside about a
rule that is not in the book. Talisman, which chapter 3 is adapted from, states
it outright: characters in the same space may trade objects, gold and
followers. Magiczny Miecz carried the parenthesis across and dropped the
sentence it was parenthetical to. That is a printing history, not a rule.

**What is already legal and does most of the job.** 5.5 lets a Postać drop a
Przedmiot on its Obszar "w dowolnym momencie" and 6.4 the same for a
Przyjaciel, so anything except gold can change hands by being left for somebody
who ends their move there — slowly, publicly, and at the risk of a third player
taking it first. Gold has no such rule: 12.1 lets it be picked up and nothing
lets it be put down, which `takeFieldGold`'s doc already notes.

**If it is ever built** it is a table setting beside `eq_mode`, `trophy_mode`
and `endless_stock`, never a default — the manual is king unless a variant says
otherwise. What it would need, in the order the layers go:

- a `trade` command taking a partner seat, and what moves: gold, Przedmioty,
  Przyjaciele (Talisman's three), never Zaklęcia — 9.3 keeps a hand concealed
  and a trade would have to reveal one.
- both seats inside 12.1's window on the same Obszar, which is now one guard:
  `refuseUnlessSettledHere`. 13.1 already says nothing may happen on the square
  a turn starts from, and that applies to both sides of a trade, not just the
  active one.
- consent from the passive seat, which nothing in this app has ever needed:
  every command today is one seat's. That is the real cost of the feature and
  the reason it is not a small job.
- 5.3's Natura check on the receiving side, and 5.4's carrying limit, both of
  which `takeCard` already applies.

### SKALNE WROTA draws three more Karty in the middle of a queue

"Jeżeli chcesz przejść przez Skalne Wrota, **wyciągnij 3 nowe Karty Zdarzeń** i
odłóż Kartę Wrót. Jeśli nie chcesz ryzykować, Wrota będą czekać na tym Obszarze
na kogoś odważniejszego."

The one card in the box that adds to the Obszar's kolejka while the kolejka is
being worked through, and it wants a decision the rest of the design does not
force: do the three join the end of the queue that is already running, or open
a queue of their own on top of it? Appending is simpler and puts a Wróg drawn
this way behind a Przedmiot already waiting, which 15.2 would not; nesting is
right and is where the kolejka meets the resolution stack in docs/STACK.md.

**Settled by the community, September 2026 — nesting, and the card goes last.**
The card text is ambiguous on purpose or by accident, and
[the thread that argues it out](https://forum.magiaimiecz.eu/viewtopic.php?t=3660)
reaches one answer in two halves. Nemomon puts the first: „skoro instrukcja
Skalnych Wrót nakazuje Ci wyciągnięcie kolejnych kart Zdarzeń, to **cofasz się
do fazy badania obszaru** i badasz nowo wyciągnięte karty zgodnie z ich
numeracją. Co, jakbyś został teleportowany na inny obszar" — the three are a
fresh badanie, not an addition. Wiktor agrees and says what that rules out:
„To nie jest tak, że do kart które rozpatrujesz **dokładasz** nowe karty i tych
które nie są miejscami nie możesz rozpatrzyć, bo minęła ich kolej. Po prostu
dostajesz nowe karty które rozpatrujesz **niezależnie** od rozpatrzonych już
kart." Misiek, who started it, concedes that this is how he plays and holds
that the card does not say so — „*Wyciągnij Karty* to nie to samo co *zyskujesz
turę*, ani nigdzie nie ma zapisu *rozpatrz trzy nowe Karty*" — and Hellhound
splits it: „masz rację pod względem przestrzegania zasad, ale na 99% podmiot
lityczny miał na myśli rozwiązanie proponowane przez Nemo, i właśnie tak pewnie
gra większość z nas."

The second half is Misiek's, and it is the one that makes the first cheap:
„Jeśli wylosowałeś Skalne Wrota wraz z innymi Kartami Miejsc, to **rozpatrz je
jako ostatnie**." Wiktor turns it into an erratum for the card — „**Po
rozpatrzeniu wszystkich kart**, jeżeli chcesz możesz przejść przez Skalne Wrota
- wyciągnij 3 nowe Karty Zdarzeń i odłóż Kartę Wrót." Resolved last, there is
nothing left in the kolejka when the three arrive, and appending and nesting
produce the same play. The nesting question does not have to be answered; the
ordering question does.

**Built — appended, and the card ordered last.** The three join the kolejka
they were drawn into, which is what `wyciagnij` already did, and
`reopensTheDrawing` is the sort key that puts the Wrota behind its own class so
that appending *is* the fresh badanie. Not nested, and the reason is that a
`field` frame is per-Obszar and not per-badanie: 13.4's count, `resolved`,
`fought`, the 16.7 pools and `leaveCardsBehind` are all one-per-square, and two
frames naming one `fieldId` would split every one of them and overlap on
`cardId` besides. `kolejka.ts` says it outright — six Karty on Płaskowyż Mgieł
are one frame with six entries. The base game already had one card of this
shape appending by this route: ODMIANA LOSU, which takes one out of a running
`drawn` and draws its replacement into it.

The Wrota is a Miejsce (VI), the highest numeral, so 15.2 already put it behind
everything except another Miejsce drawn beside it; the key closes that case.
Ordering alone cannot *hold* it there, because a player may name any Karta in
`drawn`; `refuseWhileQueuedFor` does, and that is the second half. The Wrota is
`optional`, so it lives in 12.1's window rather than in the kolejka, and the
window opens „dopiero po rozpatrzeniu wszystkich Kart Zdarzeń znajdujących się
lub wyciągniętych na danym Obszarze". Taking out of that window already waited
(`refuseWhileQueued`, in `takeCard` since the window was built); resolving out
of it did not, so a Targowisko could be shopped at with a Wilkołak standing
over it, against 16.4. One gate now, asked of the cards `mayWalkPast` — never
of a Karta that *is* the kolejka, or resolving the Wilkołak would be refused
with „Najpierw WILKOŁAK".

One thing about this card is still unsettled. Its disposition is
**conditional** — `odloz` only if you go through, otherwise it stays — and it
is typed as a plain `odloz`. In practice that comes out right, because the card
is `optional` and declining it means never resolving it, so the `odloz` never
runs; it is right by accident rather than by saying so, and it is the only card
whose frame's answer decides whether the Karta leaves the Obszar.

~~One thing found while checking, which is not this card's: the three drawn
included a second SKALNE WROTA off the real pile, and `resolved` keys on
`cardId`, so the copy nobody had seen arrived already marked resolved.~~ Fixed.
Every Karta joining a `field` frame carries an `nth` — one more than the highest
already there, so it survives 15.2's re-sort and cannot be handed out twice —
and `resolved` holds `keyOf(card)`, which is `cardId#nth`. `listed` is the one
question every reader asks, and it answers to either form, which is what leaves
`fought` and `beaten` keyed by *name*: 17.5 sums every Wróg attacking at once,
so two WILKI are one fight and beating the pack beats both. A frame written
before this has no numbers and goes on behaving as it did, so nothing part-played
needed migrating.

Parked at the point the Obszar's kolejka was designed (September 2026), not
forgotten.

## Known gaps, left open on purpose

Two rules the app carries only halfway, both looked at and both deliberately
not finished. Written down so the next person meets them here rather than in a
game.

### 5.6 — done: an existing excess now stops the game

Taking a fifth Przedmiot is refused, so the limit is kept at the moment it
would be broken. What is missing is the other direction: **lose the transport
and nothing makes you drop back down.** "Postać, która zdobyła więcej niż 4
Przedmioty i nie dysponuje żadnym środkiem transportu (5.4.) musi natychmiast
odrzucić Przedmioty, których nie jest w stanie unieść." The Awanturnik takes a
Koń, and its owner keeps carrying six.

The difference from the 5.3 spill was the whole of the work: 5.4 leaves the
choice to the player — "Które z Przedmiotów Postać zachowa, które zaś zostaną
odrzucone, zależy wyłącznie od decyzji gracza" — so the app must not pick.

Settled without building a prompt. `refuseWhileOverCarried` stops the game and
says how many have to go; the player drops what they choose with the verb they
already have. Guarded at the two doors of a turn — `rollForMove` and
`finishTurn` — so you cannot begin a turn owing the rule and cannot hand one on,
which bounds an overflow that arises mid-turn to the turn it happened in. That
is as close to "natychmiast" as a turn-based referee honestly gets.

`passTurn` itself is deliberately not guarded: half the game passes the turn as
a consequence of something else — a death, a lost turn, a fall off the Most —
and none of those is a player walking away from a rule.

### One house rule journals itself, the other does not

`setEndlessStock` writes a line — "Zwykłego Wyposażenia nie będzie już
brakować (21.2)" — and `setEqMode` writes nothing at all. Both are the table's
own rules, both are the host's to move, and both stop being movable once the
game starts; only one of them leaves a trace of having been moved.

Either answer is defensible and they should match. The variant can only change
in the poczekalnia, where the Dziennik is already thin and a line about it
would read as noise; on the other hand a table that starts with a Plecak
nobody expected has nothing to point at. Left as it is because it is the peer's
command and the asymmetry is cosmetic, not because it is right.

### ~~The host cannot withdraw a Postać from the board~~ — built

`removeCharacter` had the command, the tests and the route, and nothing in the
interface called it. It does now: `WithdrawButton` in the roster, under any
seat holding a living Postać, offering both the plain withdrawal and the hard
one that bars the Karta from being picked again. Left written down because the
note said the opposite for a while and a stale gap is worse than no note.

Not the rulebook's, which says nothing about a player leaving. It is the
poczekalnia's other half: `leaveTable` puts the *person* out and leaves the
Postać standing, and this is the act that takes the Postać off the board. See
docs/LOBBY.md.
