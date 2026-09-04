-- One journal kind, brought live. Run this against magiczny_miecz.
--
-- `moves.kind` carries a CHECK naming every kind, because the reader drops one
-- it does not recognise rather than rendering a blank line — so a kind the
-- database has not been told about is a row that fails to insert, which is the
-- right end of the process to fail at. Adding one therefore needs a migration;
-- `journalKinds.test.ts` is what makes that visible at the moment it is
-- incurred rather than at the table.
--
--   card-destroyed  A Karta destroyed by another Karta's own text — Kometa:
--                   "W katastrofie giną wszyscy Nieznajomi - należy odłożyć
--                   ich Karty." Not `lost-card`, which is a Karta taken off a
--                   character who was holding it (5.6, the Awanturnik, the
--                   Łotr) — this reaches for Karty nobody has picked up,
--                   lying on the board or still waiting mid-kolejka, and
--                   sends them to the used pile without anybody having met
--                   them.

alter table magiczny_miecz.moves
  drop constraint if exists moves_kind_check;

alter table magiczny_miecz.moves
  add constraint moves_kind_check check (kind in (
    'beast-draw', 'beast-loss', 'bought', 'bridge-attempt', 'bridge-cerberus',
    'bridge-death-game', 'bridge-entry', 'bridge-failed', 'bridge-guardian',
    'bridge-trap', 'card', 'card-destroyed', 'card-table', 'carried-spell',
    'crossing', 'crossing-failed', 'death', 'died-for-you', 'discarded', 'duel',
    'effect', 'escape', 'escape-failed', 'ferry', 'ferry-refused', 'field-table',
    'fight-end', 'fight-roll', 'fight-start', 'guardian-end', 'guardian-start',
    'guardian-strength', 'healed', 'healing', 'joined', 'joined-table',
    'table-opened', 'took-seat', 'left-seat', 'new-host', 'left-table',
    'left-behind', 'placed', 'no-effect', 'lost-card', 'move', 'moved-by-card',
    'moved-by-hand', 'nature-change', 'new-character', 'override', 'paid-friend',
    'points', 'reshuffle', 'roll', 'shielded', 'sold', 'spell', 'start',
    'starting-kit', 'stone', 'taken', 'gold-taken', 'test-card',
    'test-card-field', 'test-deal', 'test-gold-field', 'test-stack',
    'test-fight-end', 'trophies-traded', 'turn-end', 'turn-lost', 'used',
    'victory'
  ));
