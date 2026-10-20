begin;
create index asset_versions_game_page on catalog.asset_versions(game_id,created_at desc,id desc);
create index asset_versions_admin_page on catalog.asset_versions(created_at desc,id desc);

create function public.set_asset_version_publication(
  p_version uuid,p_actor uuid,p_session uuid,p_expected text,p_status text,p_reason text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare version catalog.asset_versions; member_role text; game_status text;
begin
  if p_expected is null or p_expected not in ('private','published')
    or p_status is null or p_status not in ('private','published')
    or p_reason is null or length(trim(p_reason)) not between 1 and 2000 then
    raise exception using errcode='22023',message='Valid publication states and a reason are required';
  end if;
  select role into member_role from catalog.admin_members where user_id=p_actor and active for share;
  if member_role is distinct from 'super_admin' then
    raise exception using errcode='42501',message='Super Admin permission required';
  end if;
  if not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor
    and (not_after is null or not_after>clock_timestamp())) then
    raise exception using errcode='28000',message='Active administrative session required';
  end if;
  select * into version from catalog.asset_versions where id=p_version for update;
  if not found then raise exception using errcode='P0002',message='Version not found'; end if;
  if version.publication_status<>p_expected or version.publication_status=p_status then
    raise exception using errcode='40001',message='Publication changed; reload the version';
  end if;
  select status into game_status from catalog.games where id=version.game_id for share;
  if p_status='published' and (game_status is distinct from 'published'
    or version.moderation_status<>'approved' or version.storage_verified_at is null
    or coalesce(length(trim(version.rights_reference)),0)=0
    or version.reviewed_at is null or version.reviewed_by is null
    or version.created_at>clock_timestamp()) then
    raise exception using errcode='23514',message='Version is not eligible for publication';
  end if;
  update catalog.asset_versions set publication_status=p_status,changed_by=p_actor,
    change_reason=trim(p_reason) where id=p_version;
  return jsonb_build_object('versionId',p_version,'publicationStatus',p_status);
end $$;
revoke all on function public.set_asset_version_publication(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.set_asset_version_publication(uuid,uuid,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
