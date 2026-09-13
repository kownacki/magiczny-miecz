-- Renames the `Modifier["kind"]` values wave 2 gave English names, wherever
-- they are sitting in `seat_effects.modifier` right now. Run this against
-- magiczny_miecz. Written by the wave-2 rename; not applied by it — the main
-- session applies migrations on Michał's word (docs/WHERE.md, recipe 10).
--
-- `Ability`, `SpellTiming`, `SpellTarget`, `Use` and `Coverage` are not
-- persisted anywhere: they live only in code and in the corpus JSON, so this
-- migration is `Modifier` alone. `Modifier.points`'s own `miecz`/`magia`/
-- `tylkoWalka` fields are untouched — this wave left that kind's parameters
-- as they were, matching status.ts.
--
-- Ten kinds change name; `crossing` (was `przeprawa`) also renames its own
-- `przez` field to `over` in the same row, since a row with the new kind and
-- the old field name would satisfy neither the old reader nor the new one.

update magiczny_miecz.seat_effects
  set modifier = jsonb_set(modifier, '{kind}', to_jsonb('no-spell-limit'::text))
  where modifier->>'kind' = 'bez-limitu-zaklec';

update magiczny_miecz.seat_effects
  set modifier = jsonb_set(modifier, '{kind}', to_jsonb('magic-as-sword'::text))
  where modifier->>'kind' = 'magia-as-miecz';

update magiczny_miecz.seat_effects
  set modifier = jsonb_set(modifier, '{kind}', to_jsonb('magic-x2'::text))
  where modifier->>'kind' = 'magia-x2';

update magiczny_miecz.seat_effects
  set modifier = jsonb_set(modifier, '{kind}', to_jsonb('rescue'::text))
  where modifier->>'kind' = 'ocalenie';

update magiczny_miecz.seat_effects
  set modifier = jsonb_set(modifier, '{kind}', to_jsonb('shield'::text))
  where modifier->>'kind' = 'oslona';

update magiczny_miecz.seat_effects
  set modifier = (jsonb_set(modifier, '{kind}', to_jsonb('crossing'::text)) - 'przez')
    || jsonb_build_object('over', modifier->'przez')
  where modifier->>'kind' = 'przeprawa';

update magiczny_miecz.seat_effects
  set modifier = jsonb_set(modifier, '{kind}', to_jsonb('crossing-dice'::text))
  where modifier->>'kind' = 'przeprawa-kostki';

update magiczny_miecz.seat_effects
  set modifier = jsonb_set(modifier, '{kind}', to_jsonb('capacity'::text))
  where modifier->>'kind' = 'udzwig';

update magiczny_miecz.seat_effects
  set modifier = jsonb_set(modifier, '{kind}', to_jsonb('immobilised'::text))
  where modifier->>'kind' = 'unieruchomiony';

update magiczny_miecz.seat_effects
  set modifier = jsonb_set(modifier, '{kind}', to_jsonb('again'::text))
  where modifier->>'kind' = 'znowu';
