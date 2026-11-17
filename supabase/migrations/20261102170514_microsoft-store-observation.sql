begin;

create function public.admin_save_xbox_observation(
  p_actor uuid,
  p_session uuid,
  p_game uuid,
  p_store_id text,
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
  listing_role text;
begin
  if not public.admin_check(p_actor,p_session)
    or not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then
    raise insufficient_privilege;
  end if;
  if p_store_id is null or p_store_id !~ '^[A-Z0-9]{12}$'
    or p_observed_at is null or p_observed_at > clock_timestamp() + interval '5 minutes'
    or coalesce(length(trim(p_reason)),0) not between 1 and 2000
    or (p_title is not null and length(trim(p_title)) not between 1 and 300) then
    raise invalid_parameter_value;
  end if;
  select * into item from catalog.games where id=p_game for share;
  if not found then raise no_data_found; end if;
  expected_url:='https://apps.microsoft.com/store/detail/'||p_store_id;
  if p_source_reference is distinct from expected_url then
    raise invalid_parameter_value;
  end if;
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
    game_id,store_provider,listing_role,url,display_title,status,
    source_kind,source_reference,evidence_status,confidence,observed_at,
    first_seen_at,last_verified_at
  ) values (
    p_game,'xbox',listing_role,expected_url,nullif(trim(p_title),''),'active',
    'official_store_page',expected_url,'verified',1,p_observed_at,p_observed_at,p_observed_at
  ) on conflict (game_id,store_provider,url,region,locale) do update set listing_role=excluded.listing_role,
    display_title=excluded.display_title,status='active',source_kind=excluded.source_kind,
    source_reference=excluded.source_reference,evidence_status='verified',confidence=excluded.confidence,
    observed_at=excluded.observed_at,last_verified_at=excluded.last_verified_at,
    valid_until=null
  returning id into listing_id;
  insert into catalog.external_identities(
    game_id,store_listing_id,provider,namespace,identifier_kind,value,scope,
    source_kind,source_reference,evidence_status,confidence,
    observed_at,first_seen_at,last_verified_at
  ) values (
    p_game,listing_id,'xbox','xbox.store_id','store_id',p_store_id,'store_listing',
    'official_store_page',expected_url,'verified',1,p_observed_at,p_observed_at,p_observed_at
  ) on conflict (game_id,provider,namespace,identifier_kind,normalized_value,region,locale) do update set store_listing_id=excluded.store_listing_id,
    value=excluded.value,scope=excluded.scope,source_kind=excluded.source_kind,
    source_reference=excluded.source_reference,evidence_status='verified',confidence=excluded.confidence,
    observed_at=excluded.observed_at,last_verified_at=excluded.last_verified_at,
    valid_until=null
  returning id into identity_id;
  insert into catalog.audit_events(actor_id,game_id,action,metadata)
  values(p_actor,p_game,'update',jsonb_build_object(
    'operation','xbox_observation_verified','listingId',listing_id,
    'identityId',identity_id,'storeId',p_store_id,'reason',trim(p_reason)));
  return jsonb_build_object('listingId',listing_id,'identityId',identity_id,'status','verified');
end;
$$;

revoke all on function public.admin_save_xbox_observation(uuid,uuid,uuid,text,text,text,timestamptz,text)
from public, anon, authenticated;
grant execute on function public.admin_save_xbox_observation(uuid,uuid,uuid,text,text,text,timestamptz,text)
to service_role;

commit;
reset role;
