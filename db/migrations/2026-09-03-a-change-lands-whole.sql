-- A change lands whole, or not at all. Run this against magiczny_miecz.
--
-- `commit` used to issue nineteen PostgREST statements in a row, each its own
-- transaction. On 2026-09-03 a player took a Tarcza Tolimana off a Nieznajomy,
-- the Tarcza moved, the turn advanced, and then the journal insert was refused
-- by a `moves_kind_check` this database had never been migrated to. The state
-- had happened and the record of it had not.
--
-- `apply_change` runs the whole list inside one transaction. It is generic on
-- purpose — the decision stays in TypeScript, where `storeOver(handle)` is one
-- implementation for both this database and the in-memory store, and only the
-- result crosses. See src/lib/game/statements.ts.
--
-- `schema_shape()` gains `functions`, so a database that never had this applied
-- is caught by `npm run schema:check` rather than by the first move somebody
-- makes. Its first run found `broadcast_revision()` live and unrecorded — see
-- db/schema.sql, which now carries it.

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

-- The reader, taught to notice a function that never arrived.

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
