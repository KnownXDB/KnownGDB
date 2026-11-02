begin;

create function public.admin_save_ubisoft_observation(
  p_actor uuid,
  p_session uuid,
  p_game uuid,
  p_store_slug text,
  p_region text,
  p_locale text,
  p_product_id text,
  p_sku text,
  p_title text,
  p_source_reference text,
  p_observed_at timestamptz,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  item catalog.games;
  listing_id uuid;
  identity_id uuid;
  expected_url text;
  normalized_locale text;
  listing_role text;
begin
  if not public.admin_check(p_actor,p_session)
    or not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then
    raise insufficient_privilege;
  end if;
  if p_store_slug is null or p_store_slug !~ '^[a-z0-9][a-z0-9-]{0,119}$'
    or p_region is null or p_region !~ '^[A-Z]{2}$'
    or (p_locale is not null and p_locale !~ '^[a-z]{2,3}_[A-Z]{2}$')
    or (p_product_id is not null and p_product_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$')
    or (p_sku is not null and p_sku !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$')
    or p_observed_at is null or p_observed_at > clock_timestamp() + interval '5 minutes'
    or coalesce(length(trim(p_reason)),0) not between 1 and 2000
    or (p_title is not null and length(trim(p_title)) not between 1 and 300) then
    raise invalid_parameter_value;
  end if;
  select * into item from catalog.games where id=p_game for share;
  if not found then raise no_data_found; end if;
  expected_url:='https://store.ubisoft.com/'||lower(p_region)||'/'||p_store_slug
    ||case when p_locale is null then '' else '?lang='||p_locale end;
  if p_source_reference is distinct from expected_url then
    raise invalid_parameter_value;
  end if;
  normalized_locale:=case when p_locale is null then null else replace(p_locale,'_','-') end;
  listing_role:=case item.item_type
    when 'demo' then 'demo'
    when 'playtest' then 'playtest'
    when 'dlc' then 'dlc'
    when 'expansion' then 'expansion'
    when 'standalone_expansion' then 'expansion'
    when 'edition' then 'edition'
    when 'bundle' then 'bundle'
    when 'season_pass' then 'season_pass'
    when 'soundtrack' then 'soundtrack'
    else 'primary'
  end;
  insert into catalog.store_listings(
    game_id,store_provider,listing_role,url,region,locale,display_title,status,
    source_kind,source_reference,evidence_status,confidence,observed_at,
    first_seen_at,last_verified_at
  ) values (
    p_game,'ubisoft',listing_role,expected_url,p_region,normalized_locale,nullif(trim(p_title),''),'active',
    'official_store_page',expected_url,'verified',1,p_observed_at,p_observed_at,p_observed_at
  ) on conflict (game_id,store_provider,url,region,locale) do update set listing_role=excluded.listing_role,
    display_title=excluded.display_title,status='active',source_kind=excluded.source_kind,
    source_reference=excluded.source_reference,evidence_status='verified',confidence=excluded.confidence,
    observed_at=excluded.observed_at,last_verified_at=excluded.last_verified_at,
    valid_until=null
  returning id into listing_id;
  insert into catalog.external_identities(
    game_id,store_listing_id,provider,namespace,identifier_kind,value,scope,
    region,locale,source_kind,source_reference,evidence_status,confidence,
    observed_at,first_seen_at,last_verified_at
  ) values (
    p_game,listing_id,'ubisoft','ubisoft.storefront','store_slug',p_store_slug,'store_listing',
    p_region,normalized_locale,'official_store_page',expected_url,'verified',1,p_observed_at,p_observed_at,p_observed_at
  ) on conflict (game_id,provider,namespace,identifier_kind,normalized_value,region,locale) do update set store_listing_id=excluded.store_listing_id,
    value=excluded.value,scope=excluded.scope,source_kind=excluded.source_kind,
    source_reference=excluded.source_reference,evidence_status='verified',confidence=excluded.confidence,
    observed_at=excluded.observed_at,last_verified_at=excluded.last_verified_at,valid_until=null
  returning id into identity_id;
  if p_product_id is not null then
    insert into catalog.external_identities(
      game_id,store_listing_id,provider,namespace,identifier_kind,value,scope,
      region,locale,source_kind,source_reference,evidence_status,confidence,
      observed_at,first_seen_at,last_verified_at
    ) values (
      p_game,listing_id,'ubisoft','ubisoft.catalog','product_id',p_product_id,'catalog_item',
      p_region,normalized_locale,'official_store_page',expected_url,'verified',1,p_observed_at,p_observed_at,p_observed_at
    ) on conflict (game_id,provider,namespace,identifier_kind,normalized_value,region,locale) do update set store_listing_id=excluded.store_listing_id,
      value=excluded.value,scope=excluded.scope,source_kind=excluded.source_kind,
      source_reference=excluded.source_reference,evidence_status='verified',confidence=excluded.confidence,
      observed_at=excluded.observed_at,last_verified_at=excluded.last_verified_at,valid_until=null;
  end if;
  if p_sku is not null then
    insert into catalog.external_identities(
      game_id,store_listing_id,provider,namespace,identifier_kind,value,scope,
      region,locale,source_kind,source_reference,evidence_status,confidence,
      observed_at,first_seen_at,last_verified_at
    ) values (
      p_game,listing_id,'ubisoft','ubisoft.catalog','sku',p_sku,'sku',
      p_region,normalized_locale,'official_store_page',expected_url,'verified',1,p_observed_at,p_observed_at,p_observed_at
    ) on conflict (game_id,provider,namespace,identifier_kind,normalized_value,region,locale) do update set store_listing_id=excluded.store_listing_id,
      value=excluded.value,scope=excluded.scope,source_kind=excluded.source_kind,
      source_reference=excluded.source_reference,evidence_status='verified',confidence=excluded.confidence,
      observed_at=excluded.observed_at,last_verified_at=excluded.last_verified_at,valid_until=null;
  end if;
  insert into catalog.audit_events(actor_id,game_id,action,metadata)
  values(p_actor,p_game,'update',jsonb_build_object(
    'operation','ubisoft_observation_verified','listingId',listing_id,
    'identityId',identity_id,'storeSlug',p_store_slug,'region',p_region,
    'locale',p_locale,'productId',p_product_id,'sku',p_sku,
    'reason',trim(p_reason)));
  return jsonb_build_object('listingId',listing_id,'identityId',identity_id,'status','verified');
end;
$$;

revoke all on function public.admin_save_ubisoft_observation(uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz,text)
from public, anon, authenticated;
grant execute on function public.admin_save_ubisoft_observation(uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz,text)
to service_role;

commit;
reset role;
