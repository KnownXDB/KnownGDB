begin;
create function public.admin_review_external_identity(p_actor uuid,p_session uuid,p_identity uuid,p_expected text,p_action text,p_reason text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare target catalog.external_identities; stamp timestamptz:=clock_timestamp();
begin
  if not public.admin_check(p_actor,p_session) or not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then raise insufficient_privilege; end if;
  if p_expected is distinct from 'in_review' or (p_action is null or p_action not in ('verified','rejected')) or coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise invalid_parameter_value; end if;
  select * into target from catalog.external_identities where id=p_identity for update;
  if not found then raise no_data_found; end if;
  if target.provider <> 'gog' or target.namespace <> 'gog.product_id' or target.identifier_kind <> 'product_id' then raise invalid_parameter_value; end if;
  if target.evidence_status is distinct from p_expected then raise exception using errcode='40001',message='Identity review state changed'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gog.product_id:'||target.normalized_value,0));
  if p_action='verified' and exists(select 1 from catalog.external_identities where provider=target.provider and namespace=target.namespace and identifier_kind=target.identifier_kind and normalized_value=target.normalized_value and game_id<>target.game_id and evidence_status<>'rejected') then raise exception using errcode='23505',message='External identity conflict'; end if;
  update catalog.external_identities set evidence_status=p_action,last_verified_at=case when p_action='verified' then stamp else null end,confidence=case when p_action='verified' then 1 else confidence end where id=p_identity;
  insert into catalog.audit_events(actor_id,game_id,action,metadata) values(p_actor,target.game_id,'update',jsonb_build_object('operation','external_identity_reviewed','identityId',p_identity,'previousStatus',p_expected,'status',p_action,'reason',trim(p_reason)));
  return jsonb_build_object('id',p_identity,'status',p_action);
end $$;
revoke all on function public.admin_review_external_identity(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_review_external_identity(uuid,uuid,uuid,text,text,text) to service_role;
commit;
