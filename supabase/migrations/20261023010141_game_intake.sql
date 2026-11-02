begin;
create function public.submission_game_check(p_actor uuid,p_game uuid) returns boolean
language sql security invoker set search_path=pg_catalog as $$
  select exists(select 1 from catalog.games where id=p_game and (status='published' or (status='draft' and exists(select 1 from catalog.admin_members where user_id=p_actor and active))));
$$;
revoke all on function public.submission_game_check(uuid,uuid) from public,anon,authenticated;
grant execute on function public.submission_game_check(uuid,uuid) to service_role;

create or replace function public.reserve_asset_submission(p_actor uuid,p_session uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare identity uuid:=gen_random_uuid(); stamp timestamptz:=clock_timestamp(); scope text; object_path text; owner catalog.asset_collections; tag text;
begin
  if not public.submission_check(p_actor,p_session) then
    raise exception using errcode='42501',message='Confirmed account, contributor profile and active session required';
  end if;
  -- Serialize per-account quotas, including concurrent reservations.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  if (select count(*) from catalog.asset_submissions where uploader_id=p_actor and created_at>stamp-interval '1 day')>=20 then
    raise exception using errcode='54000',message='Daily submission limit reached';
  end if;
  if coalesce(p_data->>'role','') not in ('header','capsule','hero','logo','icon','client_icon','store_image','in_game_image','promotional_artwork')
    or coalesce(p_data->>'credit_kind','') not in ('official','platform','personal')
    or coalesce(p_data->>'extension','') not in ('png','jpg','ico')
    or coalesce(p_data->>'language_kind','') not in ('global','localized')
    or coalesce(p_data->>'checksum_sha256','') !~ '^[0-9a-f]{64}$'
    or coalesce((p_data->>'byte_size')::bigint,0) not between 1 and 4194304
    or coalesce(length(trim(p_data->>'source_reference')),0) not between 1 and 2000
    or coalesce(length(trim(p_data->>'rights_reference')),0) not between 1 and 2000
    or coalesce(p_data->>'context_key','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(p_data->>'context_key')>100
    or jsonb_typeof(p_data->'language_tags') is distinct from 'array' then
    raise exception using errcode='22023',message='Invalid submission metadata';
  end if;
  if p_data->>'credit_kind'<>'personal' and not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then
    raise exception using errcode='42501',message='Super Admin credit permission required';
  end if;
  if p_data->>'extension'='ico' and p_data->>'role'<>'client_icon' then raise exception using errcode='22023',message='ICO requires client icon'; end if;
  if not exists(select 1 from catalog.games where id=(p_data->>'game_id')::uuid and (status='published' or (status='draft' and exists(select 1 from catalog.admin_members where user_id=p_actor and active)))) then
    raise exception using errcode='22023',message='Published game or administrative draft required';
  end if;
  if p_data->>'collection_id' is not null then
    select * into owner from catalog.asset_collections where id=(p_data->>'collection_id')::uuid for share;
    if not found or owner.uploader_id<>p_actor or owner.game_id<>(p_data->>'game_id')::uuid
      or owner.role<>p_data->>'role' or owner.credit_kind<>p_data->>'credit_kind' then
      raise exception using errcode='42501',message='Collection ownership and identity required';
    end if;
  end if;
  if (p_data->>'valid_until')::timestamptz <= (p_data->>'valid_from')::timestamptz then raise exception using errcode='22023',message='Invalid validity interval'; end if;
  if p_data->>'language_kind'='global' then
    if jsonb_array_length(p_data->'language_tags')<>0 then raise exception using errcode='22023',message='Global assets have no language tags'; end if;
    scope:='global';
  else
    if jsonb_array_length(p_data->'language_tags') not between 1 and 8 then raise exception using errcode='22023',message='Languages required'; end if;
    for tag in select jsonb_array_elements_text(p_data->'language_tags') loop
      if tag !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' or tag='und' then raise exception using errcode='22023',message='Canonical languages required'; end if;
    end loop;
    if (select count(distinct x) from jsonb_array_elements_text(p_data->'language_tags') x)<>jsonb_array_length(p_data->'language_tags') then raise exception using errcode='22023',message='Duplicate languages'; end if;
    scope:=case when jsonb_array_length(p_data->'language_tags')=1 then p_data->'language_tags'->>0 else 'multi' end;
  end if;
  object_path:='games/'||(p_data->>'game_id')::uuid||'/'||case when p_data->>'credit_kind'='official' then 'official' else 'community' end||'/'||(p_data->>'role')||'/'||scope||'/'||to_char(stamp at time zone 'UTC','YYYY/MM')||'/'||identity||'/original.'||(p_data->>'extension');
  insert into catalog.asset_submissions(id,uploader_id,created_at,metadata,object_key) values(identity,p_actor,stamp,p_data,object_path);
  return jsonb_build_object('id',identity);
end $$;

create function public.create_game_draft(p_actor uuid,p_session uuid,p_data jsonb) returns uuid
language plpgsql security invoker set search_path=pg_catalog as $$
declare target uuid; draft_title text:=trim(p_data->>'title');
begin
  if not public.admin_check(p_actor,p_session) then raise exception using errcode='42501',message='Administrative session required'; end if;
  if draft_title is null or length(draft_title) not between 1 and 300 or coalesce(length(trim(p_data->>'source_reference')),0) not between 1 and 2000
    or coalesce(p_data->>'language','') !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' or p_data->>'language'='und'
    or coalesce(length(p_data->>'description'),0)>1500 then
    raise exception using errcode='22023',message='Title, language and source reference required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(draft_title),1));
  if exists(select 1 from catalog.game_localizations where lower(trim(game_localizations.title))=lower(draft_title) and language=p_data->>'language') then
    raise exception using errcode='23505',message='Check the existing title before creating another canonical game';
  end if;
  target:=public.admin_save_game(p_actor,p_session,null,null,jsonb_build_object(
    'title',draft_title,'language',p_data->>'language','source_reference',trim(p_data->>'source_reference'),
    'description',p_data->>'description','status','draft','approved',false,'confidence',0,'is_primary',true));
  return target;
end $$;
revoke all on function public.create_game_draft(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_game_draft(uuid,uuid,jsonb) to service_role;
create or replace function public.complete_asset_submission(p_id uuid,p_actor uuid,p_session uuid,p_hash text,p_size bigint) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare intent catalog.asset_submissions; d jsonb; collection uuid;
begin
  if not public.submission_check(p_actor,p_session) then raise exception using errcode='42501',message='Active contributor session required'; end if;
  select * into intent from catalog.asset_submissions where id=p_id and uploader_id=p_actor for update;
  if not found then raise exception using errcode='P0002',message='Submission not found'; end if;
  if intent.version_id is not null then return jsonb_build_object('versionId',intent.version_id); end if;
  if intent.expires_at<=clock_timestamp() then raise exception using errcode='40001',message='Submission expired'; end if;
  d:=intent.metadata;
  if not public.submission_game_check(p_actor,(d->>'game_id')::uuid) then raise exception using errcode='42501',message='Game submission permission required'; end if;
  if p_hash is distinct from d->>'checksum_sha256' or p_size is distinct from (d->>'byte_size')::bigint then raise exception using errcode='23514',message='Verified original does not match submission'; end if;
  collection:=(d->>'collection_id')::uuid;
  if collection is null then
    insert into catalog.asset_collections(game_id,role,provenance,credit_kind,uploader_id,public_author_id)
    values((d->>'game_id')::uuid,d->>'role',case when d->>'credit_kind'='official' then 'official' else 'community' end,d->>'credit_kind',p_actor,case when d->>'credit_kind'='personal' then p_actor else null end) returning id into collection;
  end if;
  insert into catalog.asset_versions(id,collection_id,game_id,revision_number,created_at,uploader_id,language_kind,language_tags,context_key,valid_from,valid_until,extension,object_key,checksum_sha256,byte_size,source_reference,rights_reference,storage_verified_at)
  values(p_id,collection,(d->>'game_id')::uuid,1,intent.created_at,p_actor,d->>'language_kind',array(select jsonb_array_elements_text(d->'language_tags')),d->>'context_key',(d->>'valid_from')::timestamptz,(d->>'valid_until')::timestamptz,d->>'extension',intent.object_key,p_hash,p_size,d->>'source_reference',d->>'rights_reference',clock_timestamp());
  update catalog.asset_submissions set version_id=p_id where id=p_id;
  return jsonb_build_object('versionId',p_id);
end $$;

notify pgrst,'reload schema';
commit;
