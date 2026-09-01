-- Gold lying on an Obszar, brought live. Run this against magiczny_miecz.
--
-- `db/schema.sql` is applied by hand and this is the part of it the database
-- had not caught up with. Both statements are additive and scoped to this
-- schema; nothing here touches `public`, finalbid or wheatbid.
--
-- Neither was caught by `npm run schema:check`, and for two different reasons
-- worth knowing:
--
--   1. The grants in schema.sql are `on all tables in schema`, which only
--      reaches tables that exist when it runs. `field_gold` was created after,
--      so PostgREST answers 401 for it — an error that reads exactly like a
--      missing table. This one the check *does* catch, and did.
--   2. The check deliberately does not compare check expressions ("a guard
--      nobody trusts is a guard nobody reads"), so a new journal kind is a
--      migration nothing reminds you to run. It surfaces as
--      `moves_kind_check` refusing a commit — the whole write, since the
--      journal row goes in with it.
--
-- The kind list below is generated from `JOURNAL_KINDS`, which stays the source
-- of truth; `journalKinds.test.ts` holds schema.sql to it.

-- 1. Grants for a table created after the last "on all tables" run.
grant select, insert, update, delete on magiczny_miecz.field_gold to anon, authenticated;
grant all on magiczny_miecz.field_gold to service_role;

-- 2. The two journal kinds gold brought with it.
alter table magiczny_miecz.moves drop constraint moves_kind_check;
alter table magiczny_miecz.moves add constraint moves_kind_check check (kind in (
  'beast-draw', 'beast-loss', 'bought', 'bridge-attempt', 'bridge-cerberus',
  'bridge-death-game', 'bridge-entry', 'bridge-failed', 'bridge-guardian',
  'bridge-trap', 'card', 'card-table', 'carried-spell', 'crossing',
  'crossing-failed', 'death', 'died-for-you', 'discarded', 'duel', 'effect',
  'escape', 'escape-failed', 'ferry', 'ferry-refused', 'field-table',
  'fight-end', 'fight-roll', 'fight-start', 'gold-taken', 'guardian-end',
  'guardian-start', 'guardian-strength', 'healed', 'healing', 'joined',
  'joined-table', 'left-behind', 'left-seat', 'left-table', 'lost-card',
  'move', 'moved-by-card', 'moved-by-hand', 'nature-change', 'new-character',
  'new-host', 'override', 'paid-friend', 'points', 'reshuffle', 'roll',
  'shielded', 'sold', 'spell', 'start', 'starting-kit', 'stone',
  'table-opened', 'taken', 'test-card', 'test-card-field', 'test-deal',
  'test-fight-end', 'test-gold-field', 'test-stack', 'took-seat',
  'trophies-traded', 'turn-end', 'turn-lost', 'used', 'victory'
));
