reset role;
insert into auth.sessions(id,user_id)
values('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare
  base uuid;
  result jsonb;
begin
  select id into base from catalog.games order by created_at limit 1;
  result:=public.admin_save_xbox_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000032',
    base,
    '9NV0ZMV5GB11',
    'Fixture Xbox Game',
    'https://apps.microsoft.com/store/detail/9NV0ZMV5GB11',
    now(),
    'Verified official Microsoft Store page and Store ID.'
  );
  if result->>'status' <> 'verified' then raise exception 'Xbox observation was not verified'; end if;
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='xbox' and url like '%9NV0ZMV5GB11%')<>1 then
    raise exception 'Xbox listing was not persisted';
  end if;
  if (select count(*) from catalog.external_identities where game_id=base and provider='xbox' and value='9NV0ZMV5GB11')<>1 then
    raise exception 'Xbox identity was not persisted';
  end if;
  perform public.admin_save_xbox_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000032',
    base,
    '9NV0ZMV5GB11',
    'Fixture Xbox Game Updated',
    'https://apps.microsoft.com/store/detail/9NV0ZMV5GB11',
    now(),
    'Revalidated official Microsoft Store page.'
  );
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='xbox' and url like '%9NV0ZMV5GB11%')<>1
    or (select count(*) from catalog.external_identities where game_id=base and provider='xbox' and value='9NV0ZMV5GB11')<>1 then
    raise exception 'Xbox observation was not idempotent';
  end if;
  begin
    perform public.admin_save_xbox_observation(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000032',
      base,
      '9NV0ZMV5GB11',
      'Fixture Xbox Game',
      'https://example.invalid/not-microsoft',
      now(),
      'Invalid source.'
    );
    raise exception 'Untrusted Xbox source was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
