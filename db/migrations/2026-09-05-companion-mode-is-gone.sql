-- Companion mode is deleted, not parked. Run this against magiczny_miecz.
--
-- The app refereed two kinds of table: a `simulation`, where it owns the deck
-- and the dice, and a `companion`, where the physical board is the truth and
-- the app only keeps the books. The second is given up — see docs/TASKS.md.
-- It was parked behind `COMPANION_PARKED` for a while on the promise that one
-- boolean would bring it back; the promise is withdrawn rather than quietly
-- left standing, and the code goes with these columns.
--
-- Safe on the data. Every remaining row was `mode = 'simulation'` and
-- `die_source = 'app'` when this was written — counted, not assumed — so
-- nothing is being thrown away with the columns. Neither is referenced by a
-- foreign key, an index, or a policy (RLS is on with none), so this is two
-- drops and the constraints that hang off them.
--
--   mode        'simulation' | 'companion'. Read in about twenty places, all
--               of them now deleted.
--
--   die_source  'app' | 'physical'. „Physical" meant a human typing what they
--               rolled, which is companion's whole idea of a die. It had
--               already stopped being read anywhere in `src` — it survived as
--               a column, a field on `GameRow`, and two test fixtures — so it
--               is dead twice over.

alter table magiczny_miecz.games
  drop column if exists mode;

alter table magiczny_miecz.games
  drop column if exists die_source;
