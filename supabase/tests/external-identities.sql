set local role service_role;
do $$
declare
  base uuid;
  listing uuid;
  identity uuid;
begin
  select id into base from catalog.games order by created_at limit 1;
  listing:=gen_random_uuid();
  insert into catalog.store_listings(
    id,game_id,store_provider,listing_role,url,region,locale,display_title,
    status,source_kind,source_reference,evidence_status,confidence,last_verified_at
  ) values (
    listing,base,'steam','primary','https://store.steampowered.com/app/123456/Fixture/','US','en-US',
    'Fixture Game','active','official_store_page','https://store.steampowered.com/app/123456/Fixture/',
    'verified',1,now()
  );
  identity:=gen_random_uuid();
  insert into catalog.external_identities(
    id,game_id,store_listing_id,provider,namespace,identifier_kind,value,scope,
    region,locale,source_kind,source_reference,evidence_status,confidence,last_verified_at
  ) values (
    identity,base,listing,'steam','steam.app_id','app_id','123456','store_listing',
    'US','en-US','official_store_page','https://store.steampowered.com/app/123456/Fixture/',
    'verified',1,now()
  );
  if (select normalized_value from catalog.external_identities where id=identity)<>'123456' then
    raise exception 'External identifier normalization failed';
  end if;
  begin
    insert into catalog.external_identities(
      game_id,store_listing_id,provider,namespace,identifier_kind,value,scope,
      region,locale,source_kind,source_reference,confidence
    ) values (
      base,listing,'steam','steam.app_id','app_id','123456','store_listing',
      'US','en-US','official_store_page','https://example.invalid/duplicate',1
    );
    raise exception 'Duplicate external identifier accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into catalog.external_identities(
      game_id,provider,namespace,identifier_kind,value,scope,source_kind,source_reference,confidence
    ) values (
      base,'xbox','xbox.title_id','title_id','0x1234','store_listing',
      'official_api','https://example.invalid/xbox',1
    );
    raise exception 'Store-scoped identity without listing accepted';
  exception when check_violation then null;
  end;
  begin
    insert into catalog.store_listings(
      game_id,store_provider,listing_role,url,region,source_kind,source_reference,confidence
    ) values (
      base,'steam','primary','http://example.invalid/insecure','US',
      'official_store_page','http://example.invalid/insecure',1
    );
    raise exception 'Non-HTTPS store listing accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;
