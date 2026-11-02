reset role;
insert into auth.sessions(id,user_id)
values('00000000-0000-4000-8000-000000000034','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare
  base uuid;
  result jsonb;
begin
  select id into base from catalog.games order by created_at limit 1;
  result:=public.admin_save_ea_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000034',
    base,
    'ea-sports-fc',
    'fc-27',
    'Fixture EA Game',
    'https://www.ea.com/games/ea-sports-fc/fc-27/buy',
    now(),
    'Verified official EA publisher page and slugs.'
  );
  if result->>'status' <> 'verified' then raise exception 'EA observation was not verified'; end if;
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='ea' and url like '%fc-27%')<>1 then
    raise exception 'EA listing was not persisted';
  end if;
  if (select count(*) from catalog.external_identities where game_id=base and provider='ea' and value in ('fc-27','ea-sports-fc'))<>2 then
    raise exception 'EA identities were not persisted';
  end if;
  perform public.admin_save_ea_observation(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000034',
    base,
    'ea-sports-fc',
    'fc-27',
    'Fixture EA Game Updated',
    'https://www.ea.com/games/ea-sports-fc/fc-27/buy',
    now(),
    'Revalidated official EA publisher page.'
  );
  if (select count(*) from catalog.store_listings where game_id=base and store_provider='ea' and url like '%fc-27%')<>1 then
    raise exception 'EA observation was not idempotent';
  end if;
  begin
    perform public.admin_save_ea_observation(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000034',
      base,
      'ea-sports-fc',
      'fc-27',
      'Fixture EA Game',
      'https://example.invalid/not-ea',
      now(),
      'Invalid source.'
    );
    raise exception 'Untrusted EA source was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
