-- The Realtime ping starts firing. Run this against magiczny_miecz.
--
-- `broadcast_revision()` was live for months and attached to nothing, so the
-- `stol:{kod}` channel every device at a table waits on had never carried a
-- single message. Nobody noticed, because the two-second poll that was meant to
-- be the backstop was quietly doing the whole job — which is the reason this
-- migration also teaches `schema_shape()` to read *triggers*. Comparing
-- functions alone called that schema clean; a function nothing calls is not a
-- feature working badly, it is a feature that has never run.
--
-- Safe to attach even though `apply_change` made every write one transaction:
-- the trigger fires inside it, but `realtime.send` wraps its own body in
-- `exception when others then raise warning`, so the worst a broken channel can
-- do is log. Checked in the catalog, not assumed.
--
-- `when (old.revision is distinct from new.revision)` rather than `after update
-- of revision`: the `of` form fires on the column being named in the SET list
-- whether or not the value moved, and every commit names it.

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

create trigger broadcast_revision
after update on magiczny_miecz.games
for each row
when (old.revision is distinct from new.revision)
execute function magiczny_miecz.broadcast_revision();

-- The reader, taught to notice a trigger that was never attached.

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
    -- Every trigger anybody wrote, which is a different question from which
    -- functions exist.
    --
    -- `broadcast_revision()` was live for months with nothing calling it, so the
    -- Realtime ping every table depends on had never fired once. Comparing
    -- functions alone would have said the schema was fine. Internal ones are
    -- excluded — `tgisinternal` is every foreign key's own machinery, forty-odd
    -- of them, none of which anybody wrote or could get wrong.
    'triggers', (
      select coalesce(jsonb_agg(t.tgname order by t.tgname), '[]'::jsonb)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'magiczny_miecz' and not t.tgisinternal
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
