begin;
alter table catalog.assets
  add column byte_size integer check(byte_size between 1 and 16777216),
  add column mime_type text check(mime_type in ('image/png','image/jpeg')),
  add column width integer check(width between 1 and 8192),
  add column height integer check(height between 1 and 8192);
create unique index asset_exact_duplicate on catalog.assets(game_id,role,language_kind,language_tags,checksum_sha256);
create table catalog.asset_uploads (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  game_id uuid not null references catalog.games(id) on delete restrict,
  object_key text not null unique,
  metadata jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '15 minutes',
  completed_at timestamptz
);
create index asset_uploads_actor_idx on catalog.asset_uploads(actor_id,created_at desc);
alter table catalog.asset_uploads enable row level security;
revoke all on catalog.asset_uploads from public,anon,authenticated;
grant select,insert,update on catalog.asset_uploads to service_role;
alter table catalog.audit_events add column asset_id uuid references catalog.assets(id) on delete restrict;
alter table catalog.audit_events drop constraint audit_events_action_check;
alter table catalog.audit_events add constraint audit_events_action_check
  check(action in ('create','update','asset_upload','asset_review'));
create index audit_events_actor_idx on catalog.audit_events(actor_id);
create index audit_events_asset_idx on catalog.audit_events(asset_id);

create function public.admin_asset_prepare(p_actor uuid,p_session uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare upload_id uuid:=gen_random_uuid(); file_key text; game uuid; total bigint;
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  game:=(p_data->>'game_id')::uuid;
  if not exists(select 1 from catalog.games where id=game) then raise exception 'game_not_found'; end if;
  if coalesce(p_data->>'role','') not in ('header','capsule','hero','logo','icon','client_icon') or
    coalesce(p_data->>'mime_type','') not in ('image/png','image/jpeg') or
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
  file_key:='originals/'||game::text||'/'||upload_id::text||case when p_data->>'mime_type'='image/png' then '.png' else '.jpg' end;
  insert into catalog.asset_uploads(id,actor_id,game_id,object_key,metadata) values(upload_id,p_actor,game,file_key,p_data);
  return jsonb_build_object('id',upload_id,'object_key',file_key,'metadata',p_data);
end;
$$;
create function public.admin_asset_upload(p_actor uuid,p_session uuid,p_upload uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare result jsonb;
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  select to_jsonb(u) into result from catalog.asset_uploads u where id=p_upload and actor_id=p_actor
    and (completed_at is not null or expires_at>now());
  if result is null then raise exception 'upload_not_found'; end if;
  return result;
end;
$$;
create function public.admin_asset_complete(p_actor uuid,p_session uuid,p_upload uuid,p_validation jsonb) returns uuid
language plpgsql security invoker set search_path=pg_catalog as $$
declare upload catalog.asset_uploads; data jsonb;
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  select * into upload from catalog.asset_uploads where id=p_upload and actor_id=p_actor for update;
  if not found then raise exception 'upload_not_found'; end if;
  if upload.completed_at is not null then return upload.id; end if;
  if upload.expires_at<=now() then raise exception 'upload_not_found'; end if;
  data:=upload.metadata;
  if p_validation->>'checksum_sha256'<>data->>'checksum_sha256' or
    p_validation->>'mime_type'<>data->>'mime_type' or
    (p_validation->>'byte_size')::integer<>(data->>'byte_size')::integer then raise exception 'invalid_asset'; end if;
  insert into catalog.assets(id,game_id,role,language_kind,language_tags,object_key,checksum_sha256,provenance,
    source_reference,confidence,rendition,moderation_status,byte_size,mime_type,width,height)
  values(upload.id,upload.game_id,data->>'role',data->>'language_kind',array(select jsonb_array_elements_text(data->'language_tags')),
    upload.object_key,data->>'checksum_sha256',data->>'provenance',data->>'source_reference',(data->>'confidence')::numeric,
    'original','in_review',(data->>'byte_size')::integer,data->>'mime_type',
    (p_validation->>'width')::integer,(p_validation->>'height')::integer);
  update catalog.asset_uploads set completed_at=now() where id=upload.id;
  insert into catalog.audit_events(actor_id,game_id,asset_id,action,metadata)
    values(p_actor,upload.game_id,upload.id,'asset_upload',jsonb_build_object('checksum_sha256',data->>'checksum_sha256'));
  return upload.id;
end;
$$;
create function public.admin_assets(p_actor uuid,p_session uuid,p_game uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare result jsonb;
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) into result from (
    select * from catalog.assets where game_id=p_game order by created_at desc,id limit 100
  ) a; return result;
end;
$$;
create function public.admin_asset_review(p_actor uuid,p_session uuid,p_asset uuid,p_decision text,
  p_publish boolean,p_rights text,p_reason text,p_from timestamptz,p_until timestamptz) returns uuid
language plpgsql security invoker set search_path=pg_catalog as $$
declare target uuid;
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  if coalesce(p_decision,'') not in ('approved','rejected','withdrawn') or coalesce(length(btrim(p_reason)),0) not between 1 and 2000
    or (p_publish and (p_decision<>'approved' or coalesce(length(btrim(p_rights)),0) not between 1 and 4000))
    or length(p_rights)>4000 or (p_from is not null and p_until is not null and p_until<=p_from)
    then raise exception 'invalid_request'; end if;
  select game_id into target from catalog.assets where id=p_asset for update;
  if not found then raise exception 'asset_not_found'; end if;
  update catalog.assets set moderation_status=p_decision,publication_status=case when p_publish then 'published' else 'private' end,
    rights_reference=nullif(btrim(p_rights),''),reviewed_at=now(),reviewed_by=p_actor,valid_from=p_from,valid_until=p_until where id=p_asset;
  insert into catalog.audit_events(actor_id,game_id,asset_id,action,metadata) values(p_actor,target,p_asset,'asset_review',
    jsonb_build_object('decision',p_decision,'published',p_publish,'reason',p_reason));return p_asset;
end;
$$;
create view public.published_assets with(security_invoker=true) as
  select a.id,a.game_id,a.role,a.language_kind,a.language_tags,a.checksum_sha256,a.provenance,
    a.source_reference,a.rendition,a.byte_size,a.mime_type,a.width,a.height,a.valid_from,a.valid_until
  from catalog.assets a join catalog.games g on g.id=a.game_id
  where g.status='published' and a.moderation_status='approved' and a.publication_status='published'
    and length(a.rights_reference)>0 and a.byte_size is not null
    and (a.valid_from is null or a.valid_from<=now()) and (a.valid_until is null or a.valid_until>now());
revoke all on public.published_assets from public,anon,authenticated;
grant select on public.published_assets to service_role;
revoke all on function public.admin_asset_prepare(uuid,uuid,jsonb),public.admin_asset_upload(uuid,uuid,uuid),
  public.admin_asset_complete(uuid,uuid,uuid,jsonb),public.admin_assets(uuid,uuid,uuid),
  public.admin_asset_review(uuid,uuid,uuid,text,boolean,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_asset_prepare(uuid,uuid,jsonb),public.admin_asset_upload(uuid,uuid,uuid),
  public.admin_asset_complete(uuid,uuid,uuid,jsonb),public.admin_assets(uuid,uuid,uuid),
  public.admin_asset_review(uuid,uuid,uuid,text,boolean,text,text,timestamptz,timestamptz) to service_role;
commit;
