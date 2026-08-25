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
  -- is slotowy, because that is how this table plays. Left as 'klasyczny' so
  -- that a row inserted by hand gets the game as published.
  eq_mode text not null default 'klasyczny' check (eq_mode in ('klasyczny', 'slotowy')),
  -- Where randomness comes from. 'physical' means a human types in what they
  -- rolled; this is the RandomPort's binding, stored so it survives a reload.
  die_source text not null default 'app' check (die_source in ('app', 'physical')),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  -- Whose turn it is, as a seat index. Null in the lobby.
  active_seat integer,
  turn integer not null default 0,
  -- Bumped on every state change. Clients hold the last value they rendered and
  -- refetch when a Realtime ping carries a higher one.
  revision bigint not null default 0,
  -- Touched on every change, so a list of tables can be ordered by what was
  -- actually being played rather than by when it was opened.
  last_played_at timestamptz not null default now(),
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
  miecz_own integer not null default 0,
  magia_own integer not null default 0,
  miecz_floor integer not null default 0,
  magia_floor integer not null default 0,

  zycie integer not null default 4,
  zloto integer not null default 1,

  -- Nature can change mid-game (7.2), so it is seat state, not character data.
  nature text check (nature in ('dobra', 'zla', 'chaotyczna')),

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
  -- is the only place anything is in klasyczny play.
  slot text check (slot in ('glowa', 'amulet', 'tulow', 'reka-glowna',
    'reka-pomocnicza', 'rekawice', 'pierscien', 'wierzchowiec', 'sakwa')),
  created_at timestamptz not null default now()
);

create index if not exists holdings_seat_idx on magiczny_miecz.holdings(seat_id);

-- Cards left lying face-up on a board field (16.8), which the next character to
-- stop there must deal with.
create table if not exists magiczny_miecz.field_cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references magiczny_miecz.games(id) on delete cascade,
  field_id text not null,
  card_id text not null,
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
  kind text not null,
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
alter table magiczny_miecz.field_cards enable row level security;
alter table magiczny_miecz.moves enable row level security;
