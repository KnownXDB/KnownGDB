reset role;
insert into auth.sessions(id,user_id)
values('00000000-0000-4000-8000-000000000033','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare
  base uuid;
  result jsonb;
begin
  select id into base from catalog.games order by created_at limit 1;
  result:=public.admin_save_epic_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000033',
    base,
    'fixture-game',
    'en-US',
    'fixture.namespace',
    'fixture.catalog-item',
    'fixture.offer',
    'Fixture Epic Game',
    'https://store.epicgames.com/en-US/p/fixture-game',
    now(),
    'Verified official Epic Games Store page and identifiers.'
  );
  if result->>'status' <> 'verified' then raise exception 'Epic observation was not verified'; end if;
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='epic' and url like '%fixture-game%')<>1 then
    raise exception 'Epic listing was not persisted';
  end if;
  if (select count(*) from catalog.external_identities where game_id=base and provider='epic' and value in ('fixture-game','fixture.namespace','fixture.catalog-item','fixture.offer'))<>4 then
    raise exception 'Epic identities were not persisted';
  end if;
  perform public.admin_save_epic_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000033',
    base,
    'fixture-game',
    'en-US',
    'fixture.namespace',
    'fixture.catalog-item',
    'fixture.offer',
    'Fixture Epic Game Updated',
    'https://store.epicgames.com/en-US/p/fixture-game',
    now(),
    'Revalidated official Epic Games Store page.'
  );
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='epic' and url like '%fixture-game%')<>1
    or (select count(*) from catalog.external_identities where game_id=base and provider='epic' and value='fixture.offer')<>1 then
    raise exception 'Epic observation was not idempotent';
  end if;
  begin
    perform public.admin_save_epic_observation(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000033',
      base,
      'fixture-game',
      'en-US',
      null,
      null,
      null,
      'Fixture Epic Game',
      'https://example.invalid/not-epic',
      now(),
      'Invalid source.'
    );
    raise exception 'Untrusted Epic source was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
