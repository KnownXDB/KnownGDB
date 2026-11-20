begin;
create function public.admin_record_gog_product_identity(p_actor uuid, p_session uuid, p_game uuid, p_product_id text, p_source text, p_reason text) returns jsonb
language plpgsql security invoker set search_path = pg_catalog as $$
declare identity_id uuid;
begin
  if not public.admin_check(p_actor,p_session) or not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then raise insufficient_privilege; end if;
  if p_product_id is null or p_product_id !~ '^[0-9]{1,20}$' or coalesce(length(trim(p_reason)),0) not between 1 and 2000 or coalesce(length(trim(p_source)),0) not between 1 and 2000 or p_source !~ '^https://[^/@[:space:]]+(/[^[:space:]]*)?$' then raise invalid_parameter_value; end if;
  if not exists(select 1 from catalog.games where id=p_game) then raise no_data_found; end if;
  perform pg_advisory_xact_lock(hashtextextended('gog.product_id:'||p_product_id, 0));
  if exists(select 1 from catalog.external_identities where provider='gog' and namespace='gog.product_id' and identifier_kind='product_id' and normalized_value=lower(p_product_id) and game_id<>p_game and evidence_status<>'rejected') then raise exception using errcode='23505', message='External identity conflict'; end if;
  select id into identity_id from catalog.external_identities where game_id=p_game and provider='gog' and namespace='gog.product_id' and identifier_kind='product_id' and normalized_value=lower(p_product_id) and region='GLOBAL' and locale is null;
  if identity_id is not null then return jsonb_build_object('id',identity_id,'status','existing'); end if;
  insert into catalog.external_identities(game_id,provider,namespace,identifier_kind,value,scope,source_kind,source_reference,evidence_status,confidence)
  values(p_game,'gog','gog.product_id','product_id',p_product_id,'catalog_item','manual_official_review',trim(p_source),'in_review',0)
  returning id into identity_id;
  insert into catalog.audit_events(actor_id,game_id,action,metadata) values(p_actor,p_game,'update',jsonb_build_object('operation','external_identity_submitted','identityId',identity_id,'reason',trim(p_reason)));
  return jsonb_build_object('id',identity_id,'status','in_review');
end $$;
revoke all on function public.admin_record_gog_product_identity(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_record_gog_product_identity(uuid,uuid,uuid,text,text,text) to service_role;
commit;
