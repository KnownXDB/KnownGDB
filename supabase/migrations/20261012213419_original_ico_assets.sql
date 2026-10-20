begin;
alter table catalog.assets drop constraint assets_mime_type_check;
alter table catalog.assets add constraint assets_mime_type_check check(mime_type in ('image/png','image/jpeg','image/vnd.microsoft.icon'));
alter table catalog.assets add constraint assets_ico_role_check check(mime_type<>'image/vnd.microsoft.icon' or role='client_icon');
create or replace function public.admin_asset_prepare(p_actor uuid,p_session uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare upload_id uuid:=gen_random_uuid(); file_key text; game uuid; total bigint;
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  game:=(p_data->>'game_id')::uuid;
  if not exists(select 1 from catalog.games where id=game) then raise exception 'game_not_found'; end if;
  if coalesce(p_data->>'role','') not in ('header','capsule','hero','logo','icon','client_icon') or
    coalesce(p_data->>'mime_type','') not in ('image/png','image/jpeg','image/vnd.microsoft.icon') or
    (p_data->>'mime_type'='image/vnd.microsoft.icon' and p_data->>'role'<>'client_icon') or
    coalesce((p_data->>'byte_size')::integer,0) not between 1 and 16777216 or
    coalesce(p_data->>'checksum_sha256','') !~ '^[a-f0-9]{64}$'
    then raise exception 'invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('asset-upload-budget',0));
  select coalesce(sum((metadata->>'byte_size')::bigint),0) into total from catalog.asset_uploads;
  if total+(p_data->>'byte_size')::bigint>1073741824 then raise exception 'storage_budget_reached'; end if;
  if (select count(*) from catalog.asset_uploads where actor_id=p_actor and created_at>now()-interval '1 day')>=60
    then raise exception 'rate_limited'; end if;
  if exists(select 1 from catalog.assets where game_id=game and role=p_data->>'role'
    and checksum_sha256=p_data->>'checksum_sha256' and language_kind=p_data->>'language_kind'
    and language_tags=array(select jsonb_array_elements_text(p_data->'language_tags')))
    then raise exception 'duplicate_asset'; end if;
  file_key:='originals/'||game::text||'/'||upload_id::text||case when p_data->>'mime_type'='image/png' then '.png' when p_data->>'mime_type'='image/vnd.microsoft.icon' then '.ico' else '.jpg' end;
  insert into catalog.asset_uploads(id,actor_id,game_id,object_key,metadata) values(upload_id,p_actor,game,file_key,p_data);
  return jsonb_build_object('id',upload_id,'object_key',file_key,'metadata',p_data);
end;
$$;
commit;
