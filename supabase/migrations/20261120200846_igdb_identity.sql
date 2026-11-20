begin;
create function public.admin_record_igdb_game_identity(p_actor uuid, p_session uuid, p_game uuid, p_igdb_id text, p_source text, p_reason text) returns jsonb
language plpgsql security invoker set search_path = pg_catalog as $$
declare identity_id uuid;
begin
  if not public.admin_check(p_actor,p_session) or not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then raise insufficient_privilege; end if;
  if p_igdb_id is null or p_igdb_id !~ '^[1-9][0-9]{0,9}$' or coalesce(length(trim(p_reason)),0) not between 1 and 2000 or coalesce(length(trim(p_source)),0) not between 1 and 2000 or p_source !~ '^https://[^/@[:space:]]+(/[^[:space:]]*)?$' then raise invalid_parameter_value; end if;
  if not exists(select 1 from catalog.games where id=p_game) then raise no_data_found; end if;
  perform pg_advisory_xact_lock(hashtextextended('igdb.game_id:'||p_igdb_id, 0));
  if exists(select 1 from catalog.external_identities where provider='igdb' and namespace='igdb.game_id' and identifier_kind='game_id' and normalized_value=lower(p_igdb_id) and game_id<>p_game and evidence_status<>'rejected') then raise exception using errcode='23505', message='External identity conflict'; end if;
  select id into identity_id from catalog.external_identities where game_id=p_game and provider='igdb' and namespace='igdb.game_id' and identifier_kind='game_id' and normalized_value=lower(p_igdb_id) and region='GLOBAL' and locale is null;
  if identity_id is not null then return jsonb_build_object('id',identity_id,'status','existing'); end if;
  insert into catalog.external_identities(game_id,provider,namespace,identifier_kind,value,scope,source_kind,source_reference,evidence_status,confidence)
  values(p_game,'igdb','igdb.game_id','game_id',p_igdb_id,'catalog_item','manual_official_review',trim(p_source),'in_review',0)
  returning id into identity_id;
  insert into catalog.audit_events(actor_id,game_id,action,metadata) values(p_actor,p_game,'update',jsonb_build_object('operation','external_identity_submitted','identityId',identity_id,'reason',trim(p_reason)));
  return jsonb_build_object('id',identity_id,'status','in_review');
end $$;
revoke all on function public.admin_record_igdb_game_identity(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_record_igdb_game_identity(uuid,uuid,uuid,text,text,text) to service_role;
commit;

begin;
create or replace function public.admin_review_external_identity(p_actor uuid,p_session uuid,p_identity uuid,p_expected text,p_action text,p_reason text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare target catalog.external_identities; stamp timestamptz:=clock_timestamp();
begin
  if not public.admin_check(p_actor,p_session) or not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then raise insufficient_privilege; end if;
  if p_expected is distinct from 'in_review' or (p_action is null or p_action not in ('verified','rejected')) or coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise invalid_parameter_value; end if;
  select * into target from catalog.external_identities where id=p_identity for update;
  if not found then raise no_data_found; end if;
  if not ((target.provider='gog' and target.namespace='gog.product_id' and target.identifier_kind='product_id') or (target.provider='igdb' and target.namespace='igdb.game_id' and target.identifier_kind='game_id')) then raise invalid_parameter_value; end if;
  if target.evidence_status is distinct from p_expected then raise exception using errcode='40001',message='Identity review state changed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target.namespace||':'||target.normalized_value,0));
  if p_action='verified' and exists(select 1 from catalog.external_identities where provider=target.provider and namespace=target.namespace and identifier_kind=target.identifier_kind and normalized_value=target.normalized_value and game_id<>target.game_id and evidence_status<>'rejected') then raise exception using errcode='23505',message='External identity conflict'; end if;
  update catalog.external_identities set evidence_status=p_action,last_verified_at=case when p_action='verified' then stamp else null end,confidence=case when p_action='verified' then 1 else confidence end where id=p_identity;
  insert into catalog.audit_events(actor_id,game_id,action,metadata) values(p_actor,target.game_id,'update',jsonb_build_object('operation','external_identity_reviewed','identityId',p_identity,'previousStatus',p_expected,'status',p_action,'reason',trim(p_reason)));
  return jsonb_build_object('id',p_identity,'status',p_action);
end $$;
revoke all on function public.admin_review_external_identity(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_review_external_identity(uuid,uuid,uuid,text,text,text) to service_role;
commit;
