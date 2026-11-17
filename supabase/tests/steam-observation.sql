reset role;
insert into auth.sessions(id,user_id)
values('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare
  base uuid;
  result jsonb;
begin
  select id into base from catalog.games order by created_at limit 1;
  result:=public.admin_save_steam_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000031',
    base,
    '654321',
    'US',
    'en',
    'Fixture Steam Game',
    'https://store.steampowered.com/app/654321/?cc=us&l=en',
    now(),
    'Verified official Steam page and App ID.'
  );
  if result->>'status' <> 'verified' then raise exception 'Steam observation was not verified'; end if;
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='steam' and url like '%654321%')<>1 then
    raise exception 'Steam listing was not persisted';
  end if;
  if (select count(*) from catalog.external_identities where game_id=base and provider='steam' and value='654321')<>1 then
    raise exception 'Steam identity was not persisted';
  end if;
  perform public.admin_save_steam_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000031',
    base,
    '654321',
    'US',
    'en',
    'Fixture Steam Game Updated',
    'https://store.steampowered.com/app/654321/?cc=us&l=en',
    now(),
    'Revalidated official Steam page.'
  );
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='steam' and url like '%654321%')<>1
    or (select count(*) from catalog.external_identities where game_id=base and provider='steam' and value='654321')<>1 then
    raise exception 'Steam observation was not idempotent';
  end if;
  begin
    perform public.admin_save_steam_observation(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000031',
      base,
      '654321',
      'US',
      'en',
      'Fixture Steam Game',
      'https://example.invalid/not-steam',
      now(),
      'Invalid source.'
    );
    raise exception 'Untrusted Steam source was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
