-- Magiczny Miecz — companion/referee schema.
--
-- Lives in its own `magiczny_miecz` schema inside the `biggerfish` Supabase
-- project (ref aqqdamoqwxiquhkzzcix). The free tier allows two projects and
-- calorie-tracker + biggerfish took both slots, so this is the fourth tenant of
-- that one database, alongside finalbid and wheatbid. Nothing here may touch
-- `public` — two of the other tenants take real payments.
--
-- The schema must be listed under Settings -> API -> Exposed schemas or every
-- request fails with PGRST106.
--
-- RLS is on with ZERO policies everywhere. That is deliberate and load-bearing:
-- each player holds spells and items that are secret from the other players
-- (rule 9.3), so no client may ever query these tables directly. Every read and
-- write goes through a Next route handler holding the service-role key, which
-- decides what that particular seat is allowed to see. The browser's anon key
-- is used only to subscribe to a Realtime channel carrying a bare change
-- counter — never any game content.

create schema if not exists magiczny_miecz;

-- ---------------------------------------------------------------------------

create table if not exists magiczny_miecz.games (
  id uuid primary key default gen_random_uuid(),
  -- Short human-typed code; players join by reading it off the table's screen.
  join_code text not null unique,
  -- 'simulation' means the app owns the deck and dice and the game can be
  -- played with nothing else; 'companion' is the opt-in for a table that has
  -- the physical board out and wants the app only as a referee.
  mode text not null default 'simulation' check (mode in ('companion', 'simulation')),
  -- Which equipment variant this table plays. Klasyczny is the rulebook: four
  -- Przedmioty, no distinction between worn and carried (5.4). Slotowy is a
  -- house variant — see "Wariant: ekwipunek slotowy" in docs/COVERAGE.md.
  --
  -- The column default is the printed rules, but nothing ever reaches it:
  -- `createGame` always writes the value, and what it writes when nobody says
  -- is 'slots', because that is how this table plays. Left as 'classic' so
  -- that a row inserted by hand gets the game as published.
  eq_mode text not null default 'classic' check (eq_mode in ('classic', 'slots')),
  -- Whether the Wyposażenie pile can run out (21.2).
  --
  -- The printed rule is that it can: "Jeżeli zabraknie Kart jakiegoś
  -- Przedmiotu, oznacza to, że Przedmiot ten jest w danej chwili
  -- nieosiągalny." It is a good rule for a Magiczny Miecz, which is meant to
  -- be scarce and fought over. It is a strange one for a Miecz, a Hełm or a
  -- Sztylet — common things, of which the box happens to hold five, three and
  -- four — and it bites hardest at setup, where five sword-starting characters
  -- can empty the supply before anybody has rolled.
  --
  -- True by default because that is how this app opens a table. The printed
  -- rule stays reachable rather than being removed: set false and the pile is
  -- finite again. Once a table is playing this only goes one way — see
  -- `setEndlessStock`, which is why there is no check constraint pinning it.
  endless_stock boolean not null default true,
  -- How a beaten Wróg is kept (1.4). See docs/TROFEA.md.
  --
  -- `punkty` is the variant and the default: the Karta goes straight to the
  -- used pile and the seat accrues points. `karty` is the printed rule — you
  -- hold the Karty and hand in the ones you choose.
  --
  -- Defaulting away from the book for the same reason `endless_stock` does. In
  -- 1993 the card *is* the counter, with its number printed on it; an app that
  -- tracks numbers perfectly keeps the ceremony after removing its reason. And
  -- a held trophy is a card out of circulation — 9.5 reshuffles only the used
  -- pile, so hoarding locks away an eighth of the deck's Karty Zdarzeń.
  trophy_mode text not null default 'points' check (trophy_mode in ('points', 'cards')),
  -- Where randomness comes from. 'physical' means a human types in what they
  -- rolled; this is the RandomPort's binding, stored so it survives a reload.
  die_source text not null default 'app' check (die_source in ('app', 'physical')),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  -- Whose turn it is, as a seat index. Null in the lobby.
  active_seat integer,
  -- The ROUND — the circuit of the table, not one seat's go. The box calls one
  -- character's go a "tura" (10.1, and Formuła Czasu's "3 kolejnych tur zamiast
  -- jednej") and coins no word for the circuit; the code counts one, so it uses
  -- the standard board-game term. `passTurn` advances this only when play comes
  -- back round to or past the first seat. A seat's own goes are counted
  -- separately, by `tickEffects`. See CONTEXT.md, "tura".
  round integer not null default 0,
  -- Where the active seat is in its turn: the phase and whatever that phase is
  -- carrying — the roll, the options, the cards drawn, the fight. Written as
  -- one value so a turn cannot be half-changed.
  -- Since the resolution stack (docs/STACK.md) the column holds
  -- {"stack": [TurnPhase, ...]}. The default deliberately stays the old
  -- one-frame shape: asTurnState() reads it as a one-frame stack, so no DDL and
  -- no migration — Michał ruled the live tables disposable. Move the default
  -- when the tolerant read is retired.
  turn_state jsonb not null default '{"phase": "roll"}'::jsonb,
  -- The three piles, in simulation: what is left to deal and what has been
  -- used. Null in companion mode, where the cards are on the table.
  deck jsonb,
  -- Bumped on every state change. Clients hold the last value they rendered and
  -- refetch when a Realtime ping carries a higher one.
  revision bigint not null default 0,
  -- Karty Postaci that have been in this game and are out of it: 4.4's
  -- "jej Kartę odłożyć do pozostałych nie biorących udziału w grze".
  --
  -- Needed as a list because nothing else remembers. A dead character's id used
  -- to be read off the seat that held it, which works exactly until that
  -- player picks again and the id is overwritten — so 4.4 survived until the
  -- first death and then quietly returned every dead character to the pool.
  --
  -- Death adds to it. `remove` takes off it, which is the console's one real
  -- rule-break and is journalled manual for that reason; `remove ... hard`
  -- adds to it instead. `pick` chooses from characters neither seated nor here.
  characters_out text[] not null default '{}',
  -- Where every shuffle in this game comes from.
  --
  -- A command is a pure function of its snapshot, its inputs and its
  -- randomness, which is what lets a game be replayed from its inputs — and
  -- replay is how the terminal build winds one back (docs/TERMINAL.md). Dice
  -- were always recoverable; the order a used pile came back in was not,
  -- because `decks.ts` bound its shuffle to Math.random at module load.
  --
  -- Every shuffle is now a function of this and the revision it happens at, so
  -- the same game replayed reaches the same order. Null on tables opened before
  -- the column existed, which fall back to Math.random and simply cannot be
  -- replayed — there is nothing to migrate, because their shuffles were never
  -- written down.
  seed text,
  -- The last line number this game's journal has handed out.
  --
  -- Here rather than worked out from max(seq) in `moves`, so that claiming the
  -- next line and winning the right to write at all are one statement: the
  -- update below is conditional on `revision`, and it takes the range with it.
  -- Counting off the journal instead meant two changes could hold the same
  -- number and one of them lost its line to the unique constraint.
  journal_seq bigint not null default 0,
  -- Touched on every change, so a list of tables can be ordered by what was
  -- actually being played rather than by when it was opened.
  last_played_at timestamptz not null default now(),
  -- When the lobby became a game. Null while it is still a lobby. Written by
  -- `startGame` and read by nobody yet — it is here so that "how long did that
  -- take" is answerable later, and because the column already existed in the
  -- database while this file did not admit it.
  started_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------

-- A place at the table, and the Postać standing in it.
--
-- A seat is NOT a player. The rulebook is explicit about this in the two places
-- it has occasion to be — 2.1's "Kazdy z grajacych KIERUJE jedna Postacia" and
-- 4.4's "Gracz, ktory KIEROWAL niefortunna Postacia" — and the big Karta Postaci
-- is laid in front of a player rather than owned by them. This table had the
-- two flattened into one row, so a person leaving and a character dying were
-- the same event to the schema. See `users` below for the other half.
--
-- Six of these per game, fixed, numbered from zero and shown from one. Seat
-- order is turn order, which is why a character that dies leaves its seat
-- standing empty rather than freeing it: the player picks another and keeps
-- their place in the round, exactly as they would at a table.
--
-- Four states, on two independent axes — whether a Postac is here, and whether
-- anyone is driving it:
--
--     character_id null, no user   -> free      nobody, nothing
--     character_id null, a user    -> waiting   sitting there, choosing
--     character_id set,  no user   -> empty     figure stands, nobody driving
--     character_id set,  a user    -> taken     normal play
create table if not exists magiczny_miecz.seats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references magiczny_miecz.games(id) on delete cascade,
  seat_index integer not null,

  character_id text,
  field_id text,

  -- Rules 1.2/2.2: only a character's OWN points are token-tracked, and they can
  -- never fall below what it started with (1.3, 2.3). Points from items and
  -- friends are derived at read time and deliberately not stored, so they cannot
  -- drift out of sync with the cards actually held.
  sword_own integer not null default 0,
  magic_own integer not null default 0,
  sword_floor integer not null default 0,
  magic_floor integer not null default 0,

  life integer not null default 4,
  gold integer not null default 1,
  -- Points from beaten Wrogowie, in `punkty` mode only (1.4).
  --
  -- The counter the Karty are in the printed rule. It dies with the character:
  -- 4.4 sends held trophies to the pile, and points that survived a death would
  -- make hoarding free — which is the one thing the variant must not change,
  -- since the run at the Bestia costs 2 Życia on a loss.
  -- **Vestigial.** Nothing increments it and nothing reads it; only 4.4's death
  -- zeroes it. It belongs to an earlier „Punkty" design where the mode was a
  -- pool of points and the Karta went away at once — `convertTrophies` records
  -- the reversal: "This used to cash every hoard in and bank the points,
  -- because „Punkty" was built as a pool and a Karta was the only place a
  -- trophy lived. It is not." Both modes keep the trophy as a holding now and
  -- differ only in where the cardboard goes. Kept rather than dropped because
  -- dropping a column on a live shared database is not worth doing for tidiness.
  trophy_points integer not null default 0,
  -- Everyone this Postać has beaten, for the shelf the seat card draws.
  --
  -- Display only: the arithmetic never reads it. 1.4's sevens come off the held
  -- Karty in *both* modes — see `tradeTrophies`, which filters holdings by kind
  -- and asks nothing about the mode. It exists because
  -- in `points` mode the Wróg is gone the instant he dies — Karta to the stos
  -- zużytych, his Miecz onto the score — and nothing else on the wire has ever
  -- named him again.
  --
  -- Append-only, and it does not shrink when points are spent: points are
  -- fungible and no particular corpse paid for a given Miecz, so there is no
  -- non-arbitrary portrait to remove. In `points` mode the art is a memorial
  -- rather than a wallet. It dies with the Postać, as the points do (4.4).
  trophy_beaten text[] not null default '{}',

  -- Nature can change mid-game (7.2), so it is seat state, not character data.
  nature text check (nature in ('good', 'evil', 'chaotic')),

  -- Turn bookkeeping for effects that suspend a character.
  turns_lost integer not null default 0,
  -- Turned to Stone lasts exactly three turns (20.1).
  stone_until_round integer,
  -- 11.11: failing or drawing against a bridge guardian bars another attempt
  -- next turn. A turn number rather than a counter, so skipped turns cannot
  -- make the block drift.
  bridge_blocked_until_round integer,
  -- 7.3: at most one Natura change per turn, so the turn it happened on is
  -- recorded rather than a flag that would need clearing.
  nature_changed_round integer,
  -- Dead (4.4). Kept on the seat and not on the character, because it is the
  -- seat that has to be skipped in turn order — and because the character is
  -- gone from here the moment it dies: `characters_out` on the games row is
  -- what remembers it, and this seat drops to `waiting` for its player to pick
  -- again. So this flag is only ever true for the instant between the two, and
  -- `remove` clears it along with everything else.
  eliminated boolean not null default false,

  created_at timestamptz not null default now(),

  unique (game_id, seat_index)
);

-- ---------------------------------------------------------------------------

-- Somebody at the table. Unbounded, unlike the seats.
--
-- A user drives at most one seat and a seat is driven by at most one user; a
-- user with no seat is a spectator, which is a first-class thing to be rather
-- than the absence of one. 4.4 says a player whose character died "moze wybrac
-- sobie nowa" — may, not must — so declining and watching is the rulebook's own
-- state and not an invention.
--
-- The host is a user, not a seat. Which means the host need not be playing: a
-- table screen can run the game without holding a Postac.
create table if not exists magiczny_miecz.users (
  -- Four characters, globally unique, from an alphabet with no 0/O and no 1/l:
  -- short enough to read off a roster and type into `kick`, and unique across
  -- the whole schema so a person can be talked about without naming their
  -- table. See `makeUserId`.
  id text primary key check (id ~ '^[a-hjkmnp-z2-9]{4}$'),
  game_id uuid not null references magiczny_miecz.games(id) on delete cascade,
  -- Unique per table, and enforced here rather than in code, because it is what
  -- makes `kick Michal` unambiguous.
  name text not null,
  -- What this browser calls itself, kept in localStorage rather than in the
  -- per-window sessionStorage the claim uses. The two answer different
  -- questions — "who is this person" and "may this window drive that seat" —
  -- and only the first has to survive the tab closing. Without it, reopening a
  -- crashed tab makes a stranger who cannot even reclaim their own name.
  device_id text,
  -- Opaque secret held by one window. Possession of it is what authorises
  -- seeing the hidden cards of whatever seat this user is driving (9.3).
  claim_token text not null,
  is_host boolean not null default false,
  -- Said they are ready to start. Not a host power: 3.1 has everybody choose.
  ready boolean not null default false,
  -- Which seat they drive; null is a spectator. No foreign key, deliberately:
  -- the natural one is composite on (game_id, seat_index), and every action it
  -- could take on a deleted seat is wrong — cascading would delete the person
  -- because a chair went, and setting null cannot, since `game_id` is part of
  -- the key and not nullable. Seats are fixed at six per game and never deleted
  -- on their own, so the case does not arise; the uniqueness below is the part
  -- that has to be true.
  seat_index integer,
  -- Last heard from. The browser checks in every couple of seconds; a user who
  -- stops is shown as away rather than gone (see AWAY_AFTER_MS).
  seen_at timestamptz,
  -- Set by a beacon as the page unloads: "my tab is going away". Not a
  -- departure — a reload fires the same event — so it starts a short countdown
  -- that the next poll cancels. See `sayGoodbye` and `GOODBYE_GRACE_MS`.
  left_at timestamptz,
  -- Join order, which is how host migration picks a successor: whoever has been
  -- at the table longest.
  created_at timestamptz not null default now(),

  unique (game_id, name),
  -- One driver per seat. Postgres lets a unique index hold any number of nulls,
  -- so this bounds the seated and leaves the spectators unbounded.
  unique (game_id, seat_index)
);

create index if not exists users_game_idx on magiczny_miecz.users(game_id);
create index if not exists users_device_idx on magiczny_miecz.users(device_id);

-- ---------------------------------------------------------------------------

-- Cards a seat is holding. `face` records whether the other players may see it:
-- spells are held hidden (9.3) while items and friends are laid out openly
-- (5.2, 6.2), and trophies are kept to trade for Miecz points later (1.4).
create table if not exists magiczny_miecz.holdings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references magiczny_miecz.games(id) on delete cascade,
  seat_id uuid not null references magiczny_miecz.seats(id) on delete cascade,
  card_id text not null,
  -- `carried` is a card held by another CARD rather than by the character: the
  -- Zaklęcie the Krzyżowiec and the Gnom each walk around with, "weź Kartę
  -- Zaklęcia i połóż ją z Kartą Krzyżowca". A fifth kind rather than a flag on
  -- `spell`, because the whole point is that it is NOT in the character's hand:
  -- it does not count against 2.6, it is not part of what a Pan Zaklęć takes,
  -- and it leaves when its friend leaves. Every query that asks for 'spell'
  -- therefore excludes it by default, which is the right answer in almost all
  -- of them.
  kind text not null check (kind in ('spell', 'item', 'friend', 'trophy', 'carried')),
  face text not null default 'open' check (face in ('open', 'hidden')),
  -- Where it is worn, in the slotted variant only; null means the pack, which
  -- is the only place anything is in classic play.
  -- Three of these are not gear. Two are the Magiczny Miecz and the Tarcza
  -- Tolimana, which only have to be found (p3) — see RELICS in slots.ts.
  --
  -- The third is not on the body at all: 'tajemna-sakwa' is the *inside* of the
  -- Karta of that name. "W Sakwie możesz umieścić 1 Przedmiot", and a place is
  -- what that sentence needs — one card in it, and what is in it out of reach
  -- of everything but Pan Bogactwa. It is the one value here that means
  -- something at a klasyczny table too, because the place is made by a Karta
  -- rather than by the slotted variant. See `carriedCount`, where the exclusion
  -- for it sits above the eq_mode test for that reason.
  slot text check (slot in ('head', 'amulet', 'body', 'main-hand',
    'off-hand', 'gloves', 'ring', 'mount', 'pouch',
    'magiczny-miecz', 'tarcza-tolimana', 'tajemna-sakwa')),
  -- Where the card sits in its owner's pack, when they have said.
  --
  -- Nullable on purpose: null is "no opinion", which is what every card starts
  -- with and what most of them keep. Ordering is `ordinal nulls last,
  -- created_at`, so a pack nobody has arranged reads exactly as it did before
  -- this column existed, and a card picked up after an arrangement lands at the
  -- end rather than jumping to the front.
  ordinal integer,
  -- Conjured by the test shortcut rather than drawn, bought or found.
  --
  -- A granted card is not a card from the box, and the box must never learn
  -- about it: the deck keeps its own copy (so it can still deal it), and this
  -- one never joins a used pile when it leaves. Without the flag the two are
  -- indistinguishable, and a granted Cyklop discarded after the real one was
  -- drawn puts a second Cyklop into the deck for good.
  --
  -- Default false is the right answer for every row that already exists: they
  -- are all cards that arrived by playing.
  granted boolean not null default false,
  -- Whose card this one lies with, for `kind = 'carried'` and null otherwise.
  --
  -- The Przyjaciel's card_id rather than his row id, and deliberately: a
  -- Changeset mints both rows at once and an insert cannot reference the id of
  -- another insert, which the database only assigns at commit. The card is
  -- identification enough — there is one Krzyżowiec and one Gnom in the box,
  -- and a character holding both is told apart by which of the two it is.
  carried_by text,
  created_at timestamptz not null default now()
);

create index if not exists holdings_seat_idx on magiczny_miecz.holdings(seat_id);

-- Things that are true of a character for a while, and what makes them stop
-- being true. The shapes of `modifier` and `ends` are `status.ts`'s — see the
-- Ends union there for why a countdown is one case among four and not the frame
-- everything else has to be bent into.
--
-- Deliberately not a replacement for turns_lost / stone_until_round /
-- bridge_blocked_until_round / nature_changed_round. Those four are read by the
-- turn engine itself when it works out whose turn is next, and moving them
-- would be a rewrite of turn order to gain nothing. They are projected into the
-- same list at read time instead, so a player sees one set of effects whichever
-- half of the model an effect happens to live in.
create table if not exists magiczny_miecz.seat_effects (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references magiczny_miecz.games(id) on delete cascade,
  seat_id uuid not null references magiczny_miecz.seats(id) on delete cascade,
  -- The card that put it there, for the journal and the hover.
  source text not null,
  -- What a player is shown, in the language the cards use.
  label text not null,
  modifier jsonb not null,
  ends jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists seat_effects_seat_idx on magiczny_miecz.seat_effects(seat_id);
create index if not exists seat_effects_game_idx on magiczny_miecz.seat_effects(game_id);

-- Cards left lying face-up on a board field (16.8), which the next character to
-- stop there must deal with.
create table if not exists magiczny_miecz.field_cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references magiczny_miecz.games(id) on delete cascade,
  field_id text not null,
  card_id text not null,
  -- Travels with the card. A granted Miecz dropped on a field and picked up by
  -- somebody else would otherwise re-enter the game as a real one, and reach a
  -- pile the next time it was discarded. See holdings.granted.
  granted boolean not null default false,
  -- What is left of a Miejsce's pool, and null for everything else.
  --
  -- 16.7's three wells: Drzewo Życia lays out 4 punkty Życia, Jezioro Magiczne
  -- 4 Miecza, Zaklęte Źródło 4 Magii, and each says the same thing — "Każdy,
  -- kto tu trafi, będzie mógł [...] zmniejszając tym samym liczbę punktów przy
  -- Drzewie [...] Po wykorzystaniu 4 punktów, Drzewo usycha".
  --
  -- On the row and not in `seat_effects`, which is where every other running
  -- count lives, because that table's `seat_id` is `not null` and this count
  -- belongs to nobody: it is the Karta's, it outlives every visitor, and the
  -- next character to stop here inherits whatever the last one left. A Karta
  -- lying on an Obszar having nowhere to carry state is the same gap that
  -- keeps KRĄG PŁOMIENI and WŁADCA GROMU at `czesciowe` in coverage.ts; this
  -- column closes it for the one shape that needs only a number.
  pool int,
  created_at timestamptz not null default now()
);

create index if not exists field_cards_game_idx on magiczny_miecz.field_cards(game_id, field_id);

-- Loose Sztuki Złota lying on an Obszar (12.1, 20.2, and 4.4 by the reading in
-- docs/TASKS.md).
--
-- Not a `field_cards` row, because coins are not Karty. 3.5 keeps them out of
-- the Przedmiot limit and 3.4 draws them from a supply of żetony rather than
-- from a deck, so a Sztuka Złota on the ground has no card and no back. Leaving
-- them as `1-sztuka-zlota` rows — which is what `turnToStone` did — minted
-- copies the deck never gave up: picking one up sent a Karta to the used pile
-- that had never been dealt, and 21.2's `copiesInPlay` counted it.
--
-- One row per Obszar that has any, so taking three of five is a patch on a row
-- rather than a read-modify-write of a column two commands might both touch.
-- The engine treats the żetony as unlimited (there is no supply to draw down),
-- which is the one part of 3.4 this deliberately does not model.
create table if not exists magiczny_miecz.field_gold (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references magiczny_miecz.games(id) on delete cascade,
  field_id text not null,
  gold int not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, field_id)
);

create index if not exists field_gold_game_idx on magiczny_miecz.field_gold(game_id, field_id);

-- ---------------------------------------------------------------------------

-- Append-only journal of everything that happened. This is what makes the
-- referee trustworthy at a physical table: when the app and the board disagree,
-- you can see what it thought happened and correct it. `manual` marks an entry
-- as a human override rather than an engine-derived result.
create table if not exists magiczny_miecz.moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references magiczny_miecz.games(id) on delete cascade,
  seq bigint not null,
  seat_id uuid references magiczny_miecz.seats(id) on delete set null,
  -- Who was driving that seat when this happened, and what they were called at
  -- the time.
  --
  -- The name is a copy on purpose. The reader used to build every sentence from
  -- the seat as it is *now*, so a takeover, a rename, or a player picking a new
  -- Postac after a death re-rendered the whole history under today's names —
  -- "Ola (GOBLIN) ginie" would become "Michal (WIEDZMA) ginie" three turns
  -- later, and the log stopped being evidence. A journal is what you open when
  -- the table disagrees; it may not change its mind.
  --
  -- The id is kept alongside for the cases that want to point at a person
  -- rather than print one, and goes null with them without taking the name.
  user_id text references magiczny_miecz.users(id) on delete set null,
  actor_name text,
  -- The round the line was written in. See games.round.
  round integer not null default 0,
  -- The closed list `JournalKind` holds, spelled out so the database knows it
  -- too. A kind the reader does not recognise is dropped rather than rendered
  -- blank — the journal is opened to settle arguments and a line with no
  -- sentence settles none — so without this a typo'd kind is a line that
  -- silently never appears. It is worth the migration a new kind now needs:
  -- generated from JOURNAL_KINDS, which stays the source of truth.
  kind text not null check (kind in (
    'beast-draw', 'beast-loss', 'bought', 'bridge-attempt',
    'bridge-cerberus', 'bridge-death-game', 'bridge-entry', 'bridge-failed',
    'bridge-guardian', 'bridge-trap', 'card', 'card-table', 'carried-spell', 'crossing',
    'crossing-failed', 'death', 'died-for-you', 'discarded', 'duel', 'effect', 'escape',
    'escape-failed', 'ferry', 'ferry-refused', 'field-table', 'fight-end',
    'fight-roll', 'fight-start', 'guardian-end', 'guardian-start',
    'gold-taken', 'guardian-strength', 'healed', 'healing', 'joined', 'joined-table',
    'left-behind', 'left-seat', 'left-table', 'new-host',
    'lost-card', 'move', 'moved-by-card', 'moved-by-hand', 'nature-change', 'new-character',
    'no-effect', 'override', 'paid-friend', 'placed', 'points', 'reshuffle', 'roll', 'shielded', 'sold', 'spell',
    'start', 'starting-kit', 'stone', 'taken', 'test-card',
    'table-opened', 'test-card-field', 'test-deal', 'test-fight-end', 'test-gold-field',
    'test-stack',
    'took-seat',
    'trophies-traded', 'turn-end',
    'turn-lost', 'used', 'victory'
  )),
  payload jsonb not null default '{}'::jsonb,
  manual boolean not null default false,
  created_at timestamptz not null default now(),
  unique (game_id, seq)
);

create index if not exists moves_game_idx on magiczny_miecz.moves(game_id, seq desc);

-- ---------------------------------------------------------------------------

alter table magiczny_miecz.games enable row level security;
alter table magiczny_miecz.seats enable row level security;
alter table magiczny_miecz.users enable row level security;
alter table magiczny_miecz.holdings enable row level security;
alter table magiczny_miecz.seat_effects enable row level security;
alter table magiczny_miecz.field_cards enable row level security;
alter table magiczny_miecz.field_gold enable row level security;
alter table magiczny_miecz.moves enable row level security;

-- ---------------------------------------------------------------------------
-- Who may reach the tables at all.
--
-- PostgREST connects as `anon` or `authenticated` and the service key as
-- `service_role`, and a table with no grant is a table those roles cannot see —
-- which is a 401 that looks exactly like a missing table. Supabase grants these
-- automatically to anything created through its dashboard; a schema applied
-- from a file has to say so itself, and this one did not, so the tables it made
-- were invisible until somebody clicked something.
--
-- It is not the security boundary. RLS above is, and it has no policies: `anon`
-- may hold every privilege here and still read nothing. Every read and write
-- goes through a route handler with the service key, which decides what a
-- particular seat is allowed to see (9.3).
grant usage on schema magiczny_miecz to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema magiczny_miecz
  to anon, authenticated;
grant all on all tables in schema magiczny_miecz to service_role;

-- ---------------------------------------------------------------------------
-- The Realtime ping, as the database actually has it.
--
-- Recorded here because it is live and this file had never mentioned it — the
-- first thing `schema:check` found once it learned to compare functions. It was
-- made through the dashboard rather than from this file, which is exactly the
-- drift the check exists for.
--
-- **Nothing fires it.** `liveRevision.ts` says the broadcast is "sent from a
-- trigger on `games.revision`" and there is no such trigger: every trigger on
-- this schema is an internal foreign-key one. So the channel has been silent
-- since it was written and every table has been running on the two-second poll
-- that was meant to be the backstop, which is why nobody noticed.
--
-- Left disconnected rather than wired up in passing. Attaching it is a change to
-- how a live table behaves, and it is no longer free: since `apply_change` every
-- write is one transaction, so a `realtime.send` from a trigger would run inside
-- it and a failure there would take the whole move down with it. That is a
-- decision to make deliberately, with `after update` and a `when` clause, not a
-- line added while doing something else.
create or replace function magiczny_miecz.broadcast_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revision is distinct from old.revision then
    -- Private: this project has public Realtime access off, and a public
    -- broadcast is accepted and then dropped. Reading is allowed to anon by a
    -- policy on realtime.messages scoped to 'stol:%' topics.
    perform realtime.send(
      jsonb_build_object('revision', new.revision),
      'zmiana',
      'stol:' || new.join_code,
      true
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- One change to one game, applied whole or not at all.
--
-- # What was wrong
--
-- `commit` used to issue nineteen PostgREST statements in a row: the `games`
-- compare-and-swap, then seats, users, holdings, field cards, field gold,
-- effects, and the journal last. Each is its own transaction, so any of them
-- could fail after the ones before it had landed.
--
-- It did, on 2026-09-03. A player took a Tarcza Tolimana off a Nieznajomy, the
-- Tarcza moved, the turn advanced, and then the journal insert was refused by a
-- `moves_kind_check` this database had never been migrated to. The state had
-- happened and the record of it had not — which is the one failure a journal
-- must not have, and it arrived from the direction nothing was watching.
--
-- The compare-and-swap does not close this. It makes a *loser* write nothing at
-- all, which is true and is what CLAUDE.md means. It says nothing about
-- statement nine of nineteen failing on the winner.
--
-- # Why this function does not know what a Karta is
--
-- The obvious fix is a `commit_change(game_id, base, changeset)` that
-- understands the game. It is also forbidden here. `storeOver(handle)` is *one*
-- implementation serving both this database and the in-memory store that `mm`
-- and every save file run on, and "every implementation keeps the
-- compare-and-swap" is a non-negotiable — a function written in SQL cannot be
-- called by a `Map`, so the game would grow a second commit path, and the
-- divergence would surface as a save file that replays differently rather than
-- as a failing test.
--
-- So the decision stays in TypeScript and only its *result* crosses. `commit`
-- folds a changeset into a list of statements — see src/lib/game/statements.ts,
-- which is the whole of the vocabulary — and hands the list here. `fakeDb`
-- answers the same call by running the same list against a copy of its tables.
-- Neither runner has an opinion about the game.
--
-- # The compare-and-swap, enforced rather than decided
--
-- `expect` is a claim about how many rows a statement must match, and only the
-- `games` update carries one. Not meeting it raises MM001, which is caught
-- below: the block rolls back everything it did and the function answers false,
-- and `commit` turns that into a `Conflict` for the caller to re-decide against.
-- The CAS itself — which row, which revision — is written once, in `commit`.
--
-- Taking the games row first also gives every writer at a table the same lock
-- in the same order, which is the ordinary way to have no deadlocks.
--
-- `security invoker`: the caller is already `service_role`, so this needs no
-- privileges of its own, and a definer function here would be a way for anyone
-- who ever gained execute on it to write past RLS. Every table name is checked
-- against the eight this game owns before any SQL is built — the same Postgres
-- instance holds finalbid and wheatbid, and the service key reaches both.
create or replace function magiczny_miecz.apply_change(statements jsonb)
returns boolean
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  stmt    jsonb;
  one     jsonb;
  op      text;
  tbl     text;
  at      integer := 0;
  cols    text;
  vals    text;
  sets    text;
  conds   text;
  touched integer;
  expect  integer;
begin
  -- A block of its own, so that its exception handler can undo everything it
  -- did. That is the whole mechanism: entering a plpgsql handler rolls back the
  -- block's changes to the database, which is what makes MM001 below a refusal
  -- rather than a half-written game.
  begin
    for stmt in select value from jsonb_array_elements(statements) loop
      at := at + 1;
      op := stmt ->> 'op';
      tbl := stmt ->> 'table';
      touched := 0;

      -- The eight tables of `magiczny_miecz`, and nothing else reachable by
      -- this key. Checked before a name is ever interpolated, so a typo is a
      -- refusal rather than another tenant's table.
      if tbl is null or tbl not in (
        'games', 'seats', 'users', 'holdings',
        'seat_effects', 'field_cards', 'field_gold', 'moves'
      ) then
        raise exception 'not a table of this game: %', coalesce(tbl, '(null)');
      end if;

      if op = 'insert' then
        -- A row at a time, and only the columns it actually names. Populating a
        -- whole record from the JSON instead would write NULL into every column
        -- the caller left out, which is not the same as leaving it out: most of
        -- these columns have defaults and that is what a changeset is relying
        -- on when it omits one.
        for one in select value from jsonb_array_elements(stmt -> 'rows') loop
          select string_agg(format('%I', key), ', ' order by key),
                 string_agg(format('x.%I', key), ', ' order by key)
            into cols, vals
            from jsonb_each(one);
          if cols is null then
            raise exception 'an insert into % names no columns', tbl;
          end if;
          execute format(
            'insert into magiczny_miecz.%I (%s) '
            'select %s from jsonb_populate_record(null::magiczny_miecz.%I, $1) x',
            tbl, cols, vals, tbl
          ) using one;
          touched := touched + 1;
        end loop;

      elsif op = 'update' then
        -- `jsonb_populate_record` is doing the typing for both halves: the patch
        -- and the filter arrive as JSON text and come out as the column's own
        -- type, so nothing here has to know that `revision` is an integer and
        -- `turn_state` is jsonb. Naming only the patch's own keys in `set` is
        -- what keeps an update from touching anything it did not mention.
        select string_agg(format('%I = x.%I', key, key), ', ') into sets
          from jsonb_each(stmt -> 'patch');
        select string_agg(format('t.%I = w.%I', key, key), ' and ') into conds
          from jsonb_each(stmt -> 'eq');
        if sets is null or conds is null then
          raise exception 'an update of % names no columns, or no rows', tbl;
        end if;
        execute format(
          'update magiczny_miecz.%I t set %s '
          'from jsonb_populate_record(null::magiczny_miecz.%I, $1) x, '
          '     jsonb_populate_record(null::magiczny_miecz.%I, $2) w '
          'where %s',
          tbl, sets, tbl, tbl, conds
        ) using stmt -> 'patch', stmt -> 'eq';
        get diagnostics touched = row_count;

      elsif op = 'delete' then
        select string_agg(format('t.%I = w.%I', key, key), ' and ') into conds
          from jsonb_each(stmt -> 'eq');
        if conds is null then
          raise exception 'a delete from % names no rows', tbl;
        end if;
        -- `anyOf` is the only filter here that is not equality, and every caller
        -- uses it the same way: a list of ids, narrowed by the `game_id` beside
        -- it. Compared as text because that is what the ids arrive as and every
        -- id column in this schema casts to it.
        if stmt -> 'anyOf' is not null then
          execute format(
            'delete from magiczny_miecz.%I t '
            'using jsonb_populate_record(null::magiczny_miecz.%I, $1) w '
            'where %s and t.%I::text = any ($2)',
            tbl, tbl, conds, stmt -> 'anyOf' ->> 'column'
          ) using stmt -> 'eq',
                  array(select jsonb_array_elements_text(stmt -> 'anyOf' -> 'values'));
        else
          execute format(
            'delete from magiczny_miecz.%I t '
            'using jsonb_populate_record(null::magiczny_miecz.%I, $1) w '
            'where %s',
            tbl, tbl, conds
          ) using stmt -> 'eq';
        end if;
        get diagnostics touched = row_count;

      else
        raise exception 'not an operation: %', coalesce(op, '(null)');
      end if;

      expect := (stmt ->> 'expect')::integer;
      if expect is not null and touched <> expect then
        raise exception 'matched % rows, expected %', touched, expect
          using errcode = 'MM001';
      end if;
    end loop;
  exception
    when sqlstate 'MM001' then
      -- Somebody else changed this game while the caller was deciding what to
      -- do to it. Everything above is undone by the act of getting here.
      return false;
    when others then
      -- Which statement, so that a refusal says as much as the nineteen
      -- separately-labelled ones used to. The original SQLSTATE is kept: the
      -- app reads it (23505 is how a duplicate journal number announces itself)
      -- and losing it would turn a known failure into an unknown one.
      raise exception 'apply_change: statement % (% %): %', at, op, tbl, sqlerrm
        using errcode = sqlstate;
  end;
  return true;
end;
$$;

grant execute on function magiczny_miecz.apply_change(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- What the database says it is, so this file can be checked against it.
--
-- This file is applied by hand and had already fallen behind: `games.turn_state`,
-- `games.deck` and three columns of `seats` were live and unmentioned, so
-- rebuilding from the file would have thrown away the state of every turn. The
-- grants below were missing for a while too, which makes a table invisible to
-- PostgREST rather than forbidden. `npm run schema:check` compares the two and
-- fails out loud; this is the half it reads.
--
-- A function because PostgREST does not expose `pg_catalog`, and the check
-- reaches the database the way the app does. Read-only, `security invoker`, and
-- it names this schema and no other — the same Postgres instance also holds
-- finalbid and wheatbid, and nothing here may look at them.
create or replace function magiczny_miecz.schema_shape()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    -- Every table, with the columns it has. Names only: types and defaults are
    -- deliberately not compared — see the note in scripts/check-schema.ts.
    'tables', (
      select coalesce(jsonb_object_agg(c.relname, cols.names), '{}'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral (
        select coalesce(jsonb_agg(a.attname order by a.attname), '[]'::jsonb) as names
        from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      ) cols
      where n.nspname = 'magiczny_miecz' and c.relkind = 'r'
    ),
    -- The security model is RLS on with zero policies. Both halves are checked,
    -- because either one alone lets the anon key read a game.
    'rls_off', (
      select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'magiczny_miecz' and c.relkind = 'r' and not c.relrowsecurity
    ),
    'policies', (
      select coalesce(jsonb_agg(p.polname order by p.polname), '[]'::jsonb)
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'magiczny_miecz'
    ),
    -- The one check expression worth comparing, because it is not an expression
    -- anybody wrote by hand: `moves.kind` is a closed list generated from
    -- JOURNAL_KINDS, so it can be read back value for value rather than parsed.
    --
    -- It is here because it has already cost a game. The file gained
    -- `no-effect` and `placed` and the database was never migrated, so every
    -- journal write carrying one was refused — and a turn's lines are inserted
    -- as one statement, so that took the whole turn's journal down with it. The
    -- schema file and the code agreed the entire time; only the database did
    -- not, which is the one pair `check-schema.ts` was not comparing.
    'move_kinds', (
      select coalesce(jsonb_agg(m[1] order by m[1]), '[]'::jsonb)
      from pg_constraint con
      cross join lateral regexp_matches(
        pg_get_constraintdef(con.oid), '''([a-z0-9-]+)''::text', 'g'
      ) as m
      where con.conrelid = 'magiczny_miecz.moves'::regclass
        and con.conname = 'moves_kind_check'
    ),
    -- Every function this schema owns.
    --
    -- Here for the same reason `move_kinds` is: the file is applied by hand, and
    -- a function it grew that the database never did is not a wrong answer but a
    -- missing one. `apply_change` is what every write in the game goes through,
    -- so an unapplied one is not a corner case failing — it is the whole app
    -- failing, on the first thing anybody does.
    'functions', (
      select coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'magiczny_miecz'
    ),
    -- A table one of the three roles cannot select from is invisible to
    -- PostgREST, which answers 401 and reads exactly like a missing table.
    'ungranted', (
      select coalesce(jsonb_agg(distinct c.relname order by c.relname), '[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array['anon', 'authenticated', 'service_role']) as role(name)
      where n.nspname = 'magiczny_miecz' and c.relkind = 'r'
        and not has_table_privilege(role.name, c.oid, 'SELECT')
    )
  );
$$;

grant execute on function magiczny_miecz.schema_shape() to service_role;
