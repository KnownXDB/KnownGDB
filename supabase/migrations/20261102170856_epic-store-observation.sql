begin;

create function public.admin_save_epic_observation(
  p_actor uuid,
  p_session uuid,
  p_game uuid,
  p_slug text,
  p_locale text,
  p_namespace text,
  p_catalog_item_id text,
  p_offer_id text,
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
  store_region text;
  listing_role text;
begin
  if not public.admin_check(p_actor,p_session)
    or not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then
    raise insufficient_privilege;
  end if;
  if p_slug is null or p_slug !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,119}$'
    or p_locale is null or p_locale !~ '^[a-z]{2,3}-[A-Z]{2}$'
    or (p_namespace is not null and p_namespace !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$')
    or (p_catalog_item_id is not null and p_catalog_item_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$')
    or (p_offer_id is not null and p_offer_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$')
    or p_observed_at is null or p_observed_at > clock_timestamp() + interval '5 minutes'
    or coalesce(length(trim(p_reason)),0) not between 1 and 2000
    or (p_title is not null and length(trim(p_title)) not between 1 and 300) then
    raise invalid_parameter_value;
  end if;
  select * into item from catalog.games where id=p_game for share;
  if not found then raise no_data_found; end if;
  expected_url:='https://store.epicgames.com/'||p_locale||'/p/'||p_slug;
  if p_source_reference is distinct from expected_url then
    raise invalid_parameter_value;
  end if;
  store_region:=split_part(p_locale,'-',2);
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
    p_game,'epic',listing_role,expected_url,store_region,p_locale,nullif(trim(p_title),''),'active',
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
    p_game,listing_id,'epic','epic.storefront','slug',p_slug,'store_listing',
    store_region,p_locale,'official_store_page',expected_url,'verified',1,p_observed_at,p_observed_at,p_observed_at
  ) on conflict (game_id,provider,namespace,identifier_kind,normalized_value,region,locale) do update set store_listing_id=excluded.store_listing_id,
    value=excluded.value,scope=excluded.scope,source_kind=excluded.source_kind,
    source_reference=excluded.source_reference,evidence_status='verified',confidence=excluded.confidence,
    observed_at=excluded.observed_at,last_verified_at=excluded.last_verified_at,
    valid_until=null
  returning id into identity_id;
  if p_namespace is not null then
    insert into catalog.external_identities(
      game_id,store_listing_id,provider,namespace,identifier_kind,value,scope,
      region,locale,source_kind,source_reference,evidence_status,confidence,
      observed_at,first_seen_at,last_verified_at
    ) values (
      p_game,listing_id,'epic','epic.catalog','namespace',p_namespace,'catalog_item',
      store_region,p_locale,'official_store_page',expected_url,'verified',1,p_observed_at,p_observed_at,p_observed_at
    ) on conflict (game_id,provider,namespace,identifier_kind,normalized_value,region,locale) do update set store_listing_id=excluded.store_listing_id,
      value=excluded.value,scope=excluded.scope,source_kind=excluded.source_kind,
      source_reference=excluded.source_reference,evidence_status='verified',confidence=excluded.confidence,
      observed_at=excluded.observed_at,last_verified_at=excluded.last_verified_at,valid_until=null;
  end if;
  if p_catalog_item_id is not null then
    insert into catalog.external_identities(
      game_id,store_listing_id,provider,namespace,identifier_kind,value,scope,
      region,locale,source_kind,source_reference,evidence_status,confidence,
      observed_at,first_seen_at,last_verified_at
    ) values (
      p_game,listing_id,'epic','epic.catalog','catalog_item_id',p_catalog_item_id,'catalog_item',
      store_region,p_locale,'official_store_page',expected_url,'verified',1,p_observed_at,p_observed_at,p_observed_at
    ) on conflict (game_id,provider,namespace,identifier_kind,normalized_value,region,locale) do update set store_listing_id=excluded.store_listing_id,
      value=excluded.value,scope=excluded.scope,source_kind=excluded.source_kind,
      source_reference=excluded.source_reference,evidence_status='verified',confidence=excluded.confidence,
      observed_at=excluded.observed_at,last_verified_at=excluded.last_verified_at,valid_until=null;
  end if;
  if p_offer_id is not null then
    insert into catalog.external_identities(
      game_id,store_listing_id,provider,namespace,identifier_kind,value,scope,
      region,locale,source_kind,source_reference,evidence_status,confidence,
      observed_at,first_seen_at,last_verified_at
    ) values (
      p_game,listing_id,'epic','epic.catalog','offer_id',p_offer_id,'offer',
      store_region,p_locale,'official_store_page',expected_url,'verified',1,p_observed_at,p_observed_at,p_observed_at
    ) on conflict (game_id,provider,namespace,identifier_kind,normalized_value,region,locale) do update set store_listing_id=excluded.store_listing_id,
      value=excluded.value,scope=excluded.scope,source_kind=excluded.source_kind,
      source_reference=excluded.source_reference,evidence_status='verified',confidence=excluded.confidence,
      observed_at=excluded.observed_at,last_verified_at=excluded.last_verified_at,valid_until=null;
  end if;
  insert into catalog.audit_events(actor_id,game_id,action,metadata)
  values(p_actor,p_game,'update',jsonb_build_object(
    'operation','epic_observation_verified','listingId',listing_id,
    'identityId',identity_id,'slug',p_slug,'locale',p_locale,
    'namespace',p_namespace,'catalogItemId',p_catalog_item_id,
    'offerId',p_offer_id,'reason',trim(p_reason)));
  return jsonb_build_object('listingId',listing_id,'identityId',identity_id,'status','verified');
end;
$$;

revoke all on function public.admin_save_epic_observation(uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz,text)
from public, anon, authenticated;
grant execute on function public.admin_save_epic_observation(uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz,text)
to service_role;

commit;
reset role;
