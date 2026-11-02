reset role;
insert into auth.sessions(id,user_id)
values('00000000-0000-4000-8000-000000000035','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare
  base uuid;
  result jsonb;
begin
  select id into base from catalog.games order by created_at limit 1;
  result:=public.admin_save_ubisoft_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000035',
    base,
    'far-cry-6',
    'US',
    'en_US',
    'fixture.product',
    'fixture.sku',
    'Fixture Ubisoft Game',
    'https://store.ubisoft.com/us/far-cry-6?lang=en_US',
    now(),
    'Verified official Ubisoft Store page and identifiers.'
  );
  if result->>'status' <> 'verified' then raise exception 'Ubisoft observation was not verified'; end if;
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='ubisoft' and url like '%far-cry-6%')<>1 then
    raise exception 'Ubisoft listing was not persisted';
  end if;
  if (select count(*) from catalog.external_identities where game_id=base and provider='ubisoft' and value in ('far-cry-6','fixture.product','fixture.sku'))<>3 then
    raise exception 'Ubisoft identities were not persisted';
  end if;
  perform public.admin_save_ubisoft_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000035',
    base,
    'far-cry-6',
    'US',
    'en_US',
    'fixture.product',
    'fixture.sku',
    'Fixture Ubisoft Game Updated',
    'https://store.ubisoft.com/us/far-cry-6?lang=en_US',
    now(),
    'Revalidated official Ubisoft Store page.'
  );
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='ubisoft' and url like '%far-cry-6%')<>1 then
    raise exception 'Ubisoft observation was not idempotent';
  end if;
  begin
    perform public.admin_save_ubisoft_observation(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000035',
      base,
      'far-cry-6',
      'US',
      'en_US',
      null,
      null,
      'Fixture Ubisoft Game',
      'https://example.invalid/not-ubisoft',
      now(),
      'Invalid source.'
    );
    raise exception 'Untrusted Ubisoft source was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
