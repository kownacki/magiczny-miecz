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
  -- Where randomness comes from. 'physical' means a human types in what they
  -- rolled; this is the RandomPort's binding, stored so it survives a reload.
  die_source text not null default 'app' check (die_source in ('app', 'physical')),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  -- Whose turn it is, as a seat index. Null in the lobby.
  active_seat integer,
  turn integer not null default 0,
  -- Where the active seat is in its turn: the phase and whatever that phase is
  -- carrying — the roll, the options, the cards drawn, the fight. Written as
  -- one value so a turn cannot be half-changed.
  turn_state jsonb not null default '{"phase": "roll"}'::jsonb,
  -- The three piles, in simulation: what is left to deal and what has been
  -- used. Null in companion mode, where the cards are on the table.
  deck jsonb,
  -- Bumped on every state change. Clients hold the last value they rendered and
  -- refetch when a Realtime ping carries a higher one.
  revision bigint not null default 0,
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

create table if not exists magiczny_miecz.seats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references magiczny_miecz.games(id) on delete cascade,
  seat_index integer not null,
  player_name text,
  -- Opaque secret handed to one device when it claims the seat. Possession of
  -- it is what authorises seeing that seat's hidden cards.
  claim_token text not null,
  is_host boolean not null default false,

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

  -- Nature can change mid-game (7.2), so it is seat state, not character data.
  nature text check (nature in ('good', 'evil', 'chaotic')),

  -- Turn bookkeeping for effects that suspend a character.
  turns_lost integer not null default 0,
  -- Turned to Stone lasts exactly three turns (20.1).
  stone_until_turn integer,
  -- 11.11: failing or drawing against a bridge guardian bars another attempt
  -- next turn. A turn number rather than a counter, so skipped turns cannot
  -- make the block drift.
  bridge_blocked_until_turn integer,
  -- 7.3: at most one Natura change per turn, so the turn it happened on is
  -- recorded rather than a flag that would need clearing.
  nature_changed_turn integer,
  -- A player walking away is not a character dying (4.4): the seat, its
  -- character and everything it carries stay put and only the claim is
  -- released, so somebody else — or the same person on a new device — can pick
  -- it up. Null means somebody is behind it.
  abandoned_at timestamptz,
  -- Last heard from. The browser checks in every couple of seconds; a seat that
  -- stops is shown as away rather than gone (see AWAY_AFTER_MS).
  seen_at timestamptz,
  -- Said they are ready to start. Not a host power: 3.1 has everybody choose.
  ready boolean not null default false,
  -- A seat the host is playing on somebody else's behalf, who has no device of
  -- their own at the table. See docs/LOBBY.md.
  no_device boolean not null default false,
  eliminated boolean not null default false,

  -- Join order. `seat_index` used to stand in for it, but places freed in the
  -- middle are refilled by the next arrival, so a low index now means "sat in a
  -- gap" rather than "got here first" — and host migration hands the table to
  -- whoever has been at it longest.
  created_at timestamptz not null default now(),
  -- Set by a beacon as the page unloads: "my tab is going away". Not a
  -- departure — a reload fires the same event — so it starts a short countdown
  -- that the next poll cancels. See `sayGoodbye` and `GOODBYE_GRACE_MS`.
  left_at timestamptz,

  unique (game_id, seat_index)
);

-- ---------------------------------------------------------------------------

-- Cards a seat is holding. `face` records whether the other players may see it:
-- spells are held hidden (9.3) while items and friends are laid out openly
-- (5.2, 6.2), and trophies are kept to trade for Miecz points later (1.4).
create table if not exists magiczny_miecz.holdings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references magiczny_miecz.games(id) on delete cascade,
  seat_id uuid not null references magiczny_miecz.seats(id) on delete cascade,
  card_id text not null,
  kind text not null check (kind in ('spell', 'item', 'friend', 'trophy')),
  face text not null default 'open' check (face in ('open', 'hidden')),
  -- Where it is worn, in the slotted variant only; null means the pack, which
  -- is the only place anything is in classic play.
  -- The last two are not gear: they are the Magiczny Miecz and the Tarcza
  -- Tolimana, which only have to be found (p3). See RELICS in slots.ts.
  slot text check (slot in ('head', 'amulet', 'body', 'main-hand',
    'off-hand', 'gloves', 'ring', 'mount', 'pouch',
    'magiczny-miecz', 'tarcza-tolimana')),
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
  created_at timestamptz not null default now()
);

create index if not exists holdings_seat_idx on magiczny_miecz.holdings(seat_id);

-- Things that are true of a character for a while, and what makes them stop
-- being true. The shapes of `modifier` and `ends` are `status.ts`'s — see the
-- Ends union there for why a countdown is one case among four and not the frame
-- everything else has to be bent into.
--
-- Deliberately not a replacement for turns_lost / stone_until_turn /
-- bridge_blocked_until_turn / nature_changed_turn. Those four are read by the
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
  created_at timestamptz not null default now()
);

create index if not exists field_cards_game_idx on magiczny_miecz.field_cards(game_id, field_id);

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
  turn integer not null default 0,
  -- The closed list `JournalKind` holds, spelled out so the database knows it
  -- too. A kind the reader does not recognise is dropped rather than rendered
  -- blank — the journal is opened to settle arguments and a line with no
  -- sentence settles none — so without this a typo'd kind is a line that
  -- silently never appears. It is worth the migration a new kind now needs:
  -- generated from JOURNAL_KINDS, which stays the source of truth.
  kind text not null check (kind in (
    'beast-draw', 'beast-loss', 'bought', 'bridge-attempt',
    'bridge-cerberus', 'bridge-death-game', 'bridge-entry', 'bridge-failed',
    'bridge-guardian', 'bridge-trap', 'card', 'card-table', 'crossing',
    'crossing-failed', 'death', 'discarded', 'duel', 'effect', 'escape',
    'escape-failed', 'ferry', 'ferry-refused', 'field-table', 'fight-end',
    'fight-roll', 'fight-start', 'guardian-end', 'guardian-start',
    'guardian-strength', 'healed', 'healing', 'joined', 'left-behind',
    'lost-card', 'move', 'moved-by-hand', 'nature-change', 'new-character',
    'override', 'points', 'reshuffle', 'roll', 'shielded', 'sold', 'spell',
    'start', 'starting-kit', 'stone', 'taken', 'test-card',
    'test-card-field', 'test-fight-end', 'trophies-traded', 'turn-end',
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
alter table magiczny_miecz.holdings enable row level security;
alter table magiczny_miecz.seat_effects enable row level security;
alter table magiczny_miecz.field_cards enable row level security;
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
