reset role;
insert into auth.sessions(id,user_id)
values('00000000-0000-4000-8000-000000000036','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare
  base uuid;
  result jsonb;
begin
  select id into base from catalog.games order by created_at limit 1;
  result:=public.admin_save_playstation_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000036',
    base,
    'concept',
    '10000333',
    'en-us',
    'Fixture PlayStation Game',
    'https://store.playstation.com/en-us/concept/10000333',
    now(),
    'Verified official PlayStation Store concept page.'
  );
  if result->>'status' <> 'verified' then raise exception 'PlayStation concept observation was not verified'; end if;
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='playstation' and url like '%concept/10000333%')<>1 then
    raise exception 'PlayStation concept listing was not persisted';
  end if;
  if (select count(*) from catalog.external_identities where game_id=base and provider='playstation' and value='10000333' and identifier_kind='concept_id')<>1 then
    raise exception 'PlayStation concept identity was not persisted';
  end if;
  result:=public.admin_save_playstation_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000036',
    base,
    'product',
    'UP0891-CUSA19113_00-RATACONCEPTDESTR',
    'en-us',
    'Fixture PlayStation Product',
    'https://store.playstation.com/en-us/product/UP0891-CUSA19113_00-RATACONCEPTDESTR',
    now(),
    'Verified official PlayStation Store product page.'
  );
  if result->>'status' <> 'verified' then raise exception 'PlayStation product observation was not verified'; end if;
  if (select count(*) from catalog.external_identities where game_id=base and provider='playstation' and value='UP0891-CUSA19113_00-RATACONCEPTDESTR' and identifier_kind='product_id')<>1 then
    raise exception 'PlayStation product identity was not persisted';
  end if;
  perform public.admin_save_playstation_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000036',
    base,
    'concept',
    '10000333',
    'en-us',
    'Fixture PlayStation Game Updated',
    'https://store.playstation.com/en-us/concept/10000333',
    now(),
    'Revalidated official PlayStation concept page.'
  );
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='playstation' and url like '%concept/10000333%')<>1 then
    raise exception 'PlayStation concept observation was not idempotent';
  end if;
  begin
    perform public.admin_save_playstation_observation(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000036',
      base,
      'product',
      'UP0891-CUSA19113_00-RATACONCEPTDESTR',
      'en-us',
      'Fixture PlayStation Product',
      'https://example.invalid/not-playstation',
      now(),
      'Invalid source.'
    );
    raise exception 'Untrusted PlayStation source was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
