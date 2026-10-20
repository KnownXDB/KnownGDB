begin;

alter table catalog.assets add constraint legacy_assets_id_game_unique unique(id,game_id);
alter table catalog.asset_versions add constraint asset_versions_id_game_unique unique(id,game_id);
create table catalog.legacy_asset_imports (
  legacy_asset_id uuid primary key references catalog.assets(id) on delete restrict,
  version_id uuid not null unique references catalog.asset_versions(id) on delete restrict,
  game_id uuid not null references catalog.games(id) on delete restrict,
  imported_by uuid not null references auth.users(id) on delete restrict,
  imported_at timestamptz not null default clock_timestamp(),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot)='object'),
  upload_snapshot jsonb not null check (jsonb_typeof(upload_snapshot)='object'),
  copy_receipt jsonb not null check (jsonb_typeof(copy_receipt)='object'),
  copy_verified_at timestamptz not null,
  foreign key(legacy_asset_id,game_id) references catalog.assets(id,game_id) on delete restrict,
  foreign key(version_id,game_id) references catalog.asset_versions(id,game_id) on delete restrict
);
create index legacy_asset_imports_game_idx on catalog.legacy_asset_imports(game_id);
create index legacy_asset_imports_actor_idx on catalog.legacy_asset_imports(imported_by);
alter table catalog.legacy_asset_imports enable row level security;
revoke all on catalog.legacy_asset_imports from public,anon,authenticated;
grant select,insert on catalog.legacy_asset_imports to service_role;
create trigger legacy_asset_imports_immutable before update or delete on catalog.legacy_asset_imports
for each row execute function catalog.prevent_asset_event_changes();

-- The trusted storage executor supplies body verification receipts. SQL cannot
-- independently read R2; it checks the receipt against locked catalog evidence.
create function public.import_legacy_asset_batch(p_entries jsonb,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare item jsonb; source catalog.assets; expected_source catalog.assets;
  upload catalog.asset_uploads; expected_upload catalog.asset_uploads;
  inserted catalog.asset_versions; verified timestamptz; imported integer := 0;
begin
  if p_entries is null or jsonb_typeof(p_entries)<>'array'
    or jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception 'A nonempty bounded import batch is required';
  end if;
  if (select count(distinct value->>'legacyAssetId') from jsonb_array_elements(p_entries))
    <> jsonb_array_length(p_entries) then raise exception 'Duplicate import identity'; end if;

  for item in select value from jsonb_array_elements(p_entries) order by value->>'legacyAssetId' loop
    select * into source from catalog.assets where id=(item->>'legacyAssetId')::uuid for update;
    if not found then raise exception 'Legacy source is missing'; end if;
    select * into expected_source from jsonb_populate_record(null::catalog.assets,item->'sourceSnapshot');
    if to_jsonb(source) is distinct from to_jsonb(expected_source) then
      raise exception 'Legacy source changed after planning';
    end if;
    select * into upload from catalog.asset_uploads where object_key=source.object_key for update;
    if not found then raise exception 'Upload attribution is missing'; end if;
    select * into expected_upload from jsonb_populate_record(null::catalog.asset_uploads,item->'uploadSnapshot');
    if to_jsonb(upload) is distinct from to_jsonb(expected_upload)
      or upload.completed_at is null or upload.game_id<>source.game_id
      or upload.metadata->>'checksum_sha256' is distinct from source.checksum_sha256
      or (upload.metadata->>'byte_size')::bigint is distinct from source.byte_size::bigint then
      raise exception 'Completed upload attribution changed';
    end if;

    -- Consistent lock order prevents membership edits during this transaction.
    perform 1 from catalog.admin_members where user_id in (p_actor,upload.actor_id) order by user_id for share;
    if not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin')
      or not exists(select 1 from catalog.admin_members where user_id=upload.actor_id and active and role='super_admin') then
      raise exception 'Active Super Admin importer and original uploader required';
    end if;
    if source.provenance<>'official' or source.rendition<>'original'
      or source.moderation_status<>'approved' or source.publication_status<>'published'
      or source.reviewed_at is null or source.reviewed_by is null
      or coalesce(length(trim(source.rights_reference)),0)=0 then
      raise exception 'Legacy publication evidence is incomplete';
    end if;
    if exists(select 1 from catalog.asset_collections where id=source.id)
      or exists(select 1 from catalog.asset_versions where id=source.id)
      or exists(select 1 from catalog.legacy_asset_imports where legacy_asset_id=source.id) then
      raise exception 'Target identity already exists; explicit recovery review required';
    end if;
    verified := (item->>'verifiedAt')::timestamptz;
    if verified is null or verified<clock_timestamp()-interval '15 minutes'
      or verified>clock_timestamp()+interval '5 minutes'
      or item->'copy'->>'sourceKey' is distinct from source.object_key
      or item->'copy'->>'sha256' is distinct from source.checksum_sha256
      or (item->'copy'->>'byteSize')::bigint is distinct from source.byte_size::bigint
      or item->'copy'->>'mimeType' is distinct from source.mime_type
      or coalesce(length(item->'copy'->>'targetKey'),0)=0 then
      raise exception 'Fresh matching destination verification is required';
    end if;

    insert into catalog.asset_collections(id,game_id,role,provenance,credit_kind,uploader_id,created_at)
      values(source.id,source.game_id,source.role,'official','official',upload.actor_id,source.created_at);
    insert into catalog.asset_versions(id,collection_id,game_id,revision_number,created_at,uploader_id,
      language_kind,language_tags,context_key,valid_from,valid_until,extension,object_key,
      checksum_sha256,byte_size,source_reference,rights_reference,storage_verified_at,
      moderation_status,publication_status,reviewed_by,reviewed_at,change_reason)
    values(source.id,source.id,source.game_id,1,source.created_at,upload.actor_id,
      source.language_kind,source.language_tags,'base',source.valid_from,source.valid_until,
      case source.mime_type when 'image/png' then 'png' when 'image/jpeg' then 'jpg'
        when 'image/vnd.microsoft.icon' then 'ico' else null end,
      item->'copy'->>'targetKey',source.checksum_sha256,source.byte_size,
      source.source_reference,source.rights_reference,verified,'approved','private',
      source.reviewed_by,source.reviewed_at,'Import verified legacy original; preserve historical source evidence')
    returning * into inserted;
    insert into catalog.legacy_asset_imports(legacy_asset_id,version_id,game_id,imported_by,
      source_snapshot,upload_snapshot,copy_receipt,copy_verified_at)
    values(source.id,inserted.id,source.game_id,p_actor,to_jsonb(source),to_jsonb(upload),
      item->'copy',verified);
    imported := imported+1;
  end loop;
  return jsonb_build_object('imported',imported,'publicationStatus','private');
end $$;
revoke all on function public.import_legacy_asset_batch(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.import_legacy_asset_batch(jsonb,uuid) to service_role;
notify pgrst,'reload schema';
commit;
