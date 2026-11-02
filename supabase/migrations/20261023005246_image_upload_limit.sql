begin;
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
    or coalesce((p_data->>'byte_size')::bigint,0) not between 1 and 5242880
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
  if not exists(select 1 from catalog.games where id=(p_data->>'game_id')::uuid and status='published') then
    raise exception using errcode='22023',message='Published canonical game required';
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

notify pgrst,'reload schema';
commit;
