-- A status gets a second holder, brought live. Run this against magiczny_miecz.
--
-- `seat_effects.seat_id` has been `not null` since the table was created, so
-- anything the rules put on a Karta lying on an Obszar rather than on a
-- character had nowhere to be written down. That is why the Krąg Płomieni's
-- burning Wróg, the Władca Gromu's paralysed creatures, the Ocalony's saved
-- creature, the Wampir's growing Życie and the Układ Planet's doubled Demons
-- are all `czesciowe` in coverage.ts: five different cards hitting the same
-- missing column.
--
-- The fix is one table with two holders rather than a second table, because a
-- status is the same shape either way — a source, a label, a modifier, an end
-- — and `allStatuses`/`cardStatuses` only need to know which column to filter
-- on. `seat_id` goes nullable, `field_card_id` arrives beside it, and the check
-- constraint is what keeps a row from claiming both holders or neither.
--
-- This migration is the model only. Nothing yet writes a `field_card_id` row
-- outside a test — see the brief that wires KRĄG PŁOMIENI and the rest to it.

alter table magiczny_miecz.seat_effects alter column seat_id drop not null;

alter table magiczny_miecz.seat_effects
  add column field_card_id uuid null references magiczny_miecz.field_cards(id) on delete cascade;

alter table magiczny_miecz.seat_effects
  add constraint seat_effects_one_holder check ((seat_id is null) <> (field_card_id is null));

create index if not exists seat_effects_field_card_idx on magiczny_miecz.seat_effects(field_card_id);
