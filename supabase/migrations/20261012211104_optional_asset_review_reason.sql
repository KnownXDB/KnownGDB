begin;
create or replace function public.admin_asset_review(p_actor uuid,p_session uuid,p_asset uuid,p_decision text,
  p_publish boolean,p_rights text,p_reason text,p_from timestamptz,p_until timestamptz) returns uuid
language plpgsql security invoker set search_path=pg_catalog as $$
declare target uuid;
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  if coalesce(p_decision,'') not in ('approved','rejected','withdrawn') or length(p_reason)>2000
    or (p_publish and (p_decision<>'approved' or coalesce(length(btrim(p_rights)),0) not between 1 and 4000))
    or length(p_rights)>4000 or (p_from is not null and p_until is not null and p_until<=p_from)
    then raise exception 'invalid_request'; end if;
  select game_id into target from catalog.assets where id=p_asset for update;
  if not found then raise exception 'asset_not_found'; end if;
  update catalog.assets set moderation_status=p_decision,publication_status=case when p_publish then 'published' else 'private' end,
    rights_reference=nullif(btrim(p_rights),''),reviewed_at=now(),reviewed_by=p_actor,valid_from=p_from,valid_until=p_until where id=p_asset;
  insert into catalog.audit_events(actor_id,game_id,asset_id,action,metadata) values(p_actor,target,p_asset,'asset_review',
    jsonb_build_object('decision',p_decision,'published',p_publish,'reason',nullif(btrim(p_reason),'')));return p_asset;
end;
$$;
commit;
