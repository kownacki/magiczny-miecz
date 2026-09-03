-- Two journal kinds, brought live. Run this against magiczny_miecz.
--
-- `moves.kind` carries a CHECK naming every kind, because the reader drops one
-- it does not recognise rather than rendering a blank line — so a kind the
-- database has not been told about is a row that fails to insert, which is the
-- right end of the process to fail at. Adding one therefore needs a migration;
-- `journalKinds.test.ts` is what makes that visible at the moment it is
-- incurred rather than at the table.
--
--   placed     15.1's own placement — „Karty, które zgodnie z ich instrukcją
--              powinny zostać położone na konkretnym Obszarze". The Upiór and
--              the Eremita walking off to a named Obszar. It used to be written
--              as `left-behind`, whose renderer reads a different payload, so
--              the row went in and never appeared: the Upiór moved in silence.
--   no-effect  A Karta resolved with nothing to show for it, which is what a
--              WRÓŻKA met by a Zła Postać does. The turn moved on and the
--              journal said nothing had happened by saying nothing at all.

alter table magiczny_miecz.moves
  drop constraint if exists moves_kind_check;

alter table magiczny_miecz.moves
  add constraint moves_kind_check check (kind in (
    'beast-draw', 'beast-loss', 'bought', 'bridge-attempt', 'bridge-cerberus',
    'bridge-death-game', 'bridge-entry', 'bridge-failed', 'bridge-guardian',
    'bridge-trap', 'card', 'card-table', 'carried-spell', 'crossing',
    'crossing-failed', 'death', 'died-for-you', 'discarded', 'duel', 'effect',
    'escape', 'escape-failed', 'ferry', 'ferry-refused', 'field-table',
    'fight-end', 'fight-roll', 'fight-start', 'guardian-end', 'guardian-start',
    'gold-taken', 'guardian-strength', 'healed', 'healing', 'joined',
    'joined-table', 'left-behind', 'left-seat', 'left-table', 'new-host',
    'lost-card', 'move', 'moved-by-card', 'moved-by-hand', 'nature-change',
    'new-character', 'no-effect', 'override', 'paid-friend', 'placed', 'points',
    'reshuffle', 'roll', 'shielded', 'sold', 'spell', 'start', 'starting-kit',
    'stone', 'taken', 'test-card', 'table-opened', 'test-card-field',
    'test-deal', 'test-fight-end', 'test-gold-field', 'test-stack', 'took-seat',
    'trophies-traded', 'turn-end', 'turn-lost', 'used', 'victory'
  ));
