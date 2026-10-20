-- Extends the existing catalog; preserves all legacy rows and R2 object keys.
alter table catalog.admin_members add column role text not null default 'moderator'
  check (role in ('super_admin','moderator'));

do $$
begin
  -- Fresh local databases have no administrator to promote. Existing databases
  -- must still satisfy the original designation guard below.
  if not exists (select 1 from auth.users)
     and not exists (select 1 from catalog.admin_members)
  then return;
  end if;
  if (select count(*) from auth.users) <> 1
     or (select count(*) from catalog.admin_members where active) <> 1
     or not exists (select 1 from catalog.admin_members m join auth.users u on u.id=m.user_id where m.active)
  then raise exception 'Verify the designated existing administrator before assigning Super Admin';
  end if;
  update catalog.admin_members set role='super_admin' where active;
end $$;

create table catalog.contributor_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table catalog.asset_collections (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references catalog.games(id) on delete restrict,
  role text not null check (role in ('header','capsule','hero','logo','icon','client_icon','store_image','in_game_image','promotional_artwork','trailer')),
  provenance text not null check (provenance in ('official','community')),
  credit_kind text not null check (credit_kind in ('official','platform','personal')),
  uploader_id uuid not null references auth.users(id) on delete restrict,
  public_author_id uuid references catalog.contributor_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(id,game_id),
  check ((credit_kind='personal' and public_author_id is not null and public_author_id=uploader_id)
      or (credit_kind in ('official','platform') and public_author_id is null)),
  check (credit_kind <> 'official' or provenance='official')
);

create table catalog.asset_versions (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null,
  game_id uuid not null,
  revision_number integer not null check (revision_number>0),
  created_at timestamptz not null default now(),
  uploader_id uuid not null references auth.users(id) on delete restrict,
  language_kind text not null check (language_kind in ('global','localized')),
  language_tags text[] not null default '{}',
  context_key text not null default 'base' check (context_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(context_key)<=100),
  valid_from timestamptz,
  valid_until timestamptz,
  extension text not null check (extension in ('png','jpg','ico','mp4','webm')),
  object_key text not null unique,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size>0),
  source_reference text not null check (length(source_reference) between 1 and 2000),
  rights_reference text not null check (length(trim(rights_reference)) between 1 and 2000),
  storage_verified_at timestamptz,
  moderation_status text not null default 'submitted' check (moderation_status in ('submitted','in_review','approved','rejected','withdrawn')),
  publication_status text not null default 'private' check (publication_status in ('private','published')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  changed_by uuid references auth.users(id) on delete restrict,
  change_reason text not null default 'Initial submission' check (length(trim(change_reason)) between 1 and 2000),
  foreign key(collection_id,game_id) references catalog.asset_collections(id,game_id) on delete restrict,
  unique(collection_id,revision_number),
  check (valid_until is null or valid_from is null or valid_until>valid_from),
  check ((language_kind='global' and cardinality(language_tags)=0)
      or (language_kind='localized' and cardinality(language_tags) between 1 and 8 and array_position(language_tags,null) is null)),
  check (moderation_status <> 'approved' or (reviewed_by is not null and reviewed_at is not null)),
  check (publication_status <> 'published' or (moderation_status='approved' and storage_verified_at is not null))
);

create table catalog.asset_version_events (
  id bigint generated always as identity primary key,
  version_id uuid not null references catalog.asset_versions(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('submitted','reviewed','published','withdrawn')),
  reason text not null check (length(trim(reason)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create function catalog.enforce_asset_collection() returns trigger
language plpgsql set search_path=pg_catalog,catalog as $$
begin
  if TG_OP <> 'INSERT' then
    raise exception 'Asset collection identity and credit are immutable; create a new collection';
  end if;
  if new.credit_kind in ('official','platform') and not exists (
    select 1 from catalog.admin_members where user_id=new.uploader_id and active and role='super_admin'
  ) then raise exception 'Super Admin permission is required for this publication identity';
  end if;
  return new;
end $$;
create trigger asset_collection_identity before insert or update or delete on catalog.asset_collections
for each row execute function catalog.enforce_asset_collection();

create function catalog.enforce_asset_version() returns trigger
language plpgsql set search_path=pg_catalog,catalog as $$
declare owner_row catalog.asset_collections; tag text; scope text; expected_key text;
begin
  if TG_OP='DELETE' then raise exception 'Preserved versions cannot be deleted'; end if;
  if TG_OP='UPDATE' then
    if new.changed_by is null or not exists (select 1 from catalog.admin_members where user_id=new.changed_by and active) then
      raise exception 'Active administrative actor required for version state changes';
    end if;
    if (to_jsonb(new)-array['moderation_status','publication_status','reviewed_by','reviewed_at','storage_verified_at','changed_by','change_reason'])
       is distinct from (to_jsonb(old)-array['moderation_status','publication_status','reviewed_by','reviewed_at','storage_verified_at','changed_by','change_reason'])
    then raise exception 'Original version metadata is immutable'; end if;
    return new;
  end if;
  select * into owner_row from catalog.asset_collections where id=new.collection_id for update;
  if not found or owner_row.game_id <> new.game_id then raise exception 'Version must belong to its canonical game'; end if;
  if owner_row.uploader_id <> new.uploader_id then raise exception 'Version uploader must own the collection'; end if;
  if owner_row.credit_kind in ('official','platform') and not exists (
    select 1 from catalog.admin_members where user_id=new.uploader_id and active and role='super_admin'
  ) then raise exception 'Super Admin permission is required for this publication identity'; end if;
  if (select count(distinct t) from unnest(new.language_tags) t) <> cardinality(new.language_tags)
    then raise exception 'Duplicate language tags'; end if;
  foreach tag in array new.language_tags loop
    if tag !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' or tag='und'
      then raise exception 'Canonical lowercase language tags required'; end if;
  end loop;
  if new.extension='ico' and owner_row.role <> 'client_icon' then raise exception 'ICO requires client_icon role'; end if;
  if (new.extension in ('mp4','webm')) <> (owner_row.role='trailer') then raise exception 'File extension and media role disagree'; end if;
  new.revision_number := (select coalesce(max(revision_number),0)+1 from catalog.asset_versions where collection_id=new.collection_id);
  scope := case when new.language_kind='global' then 'global' when cardinality(new.language_tags)=1 then new.language_tags[1] else 'multi' end;
  expected_key := 'games/'||new.game_id||'/'||owner_row.provenance||'/'||owner_row.role||'/'||scope||'/'||
    to_char(new.created_at at time zone 'UTC','YYYY/MM')||'/'||new.id||'/original.'||new.extension;
  if new.object_key is not null and new.object_key <> expected_key then raise exception 'Object key does not match canonical version identity'; end if;
  new.object_key := expected_key;
  return new;
end $$;
create trigger asset_version_identity before insert or update or delete on catalog.asset_versions
for each row execute function catalog.enforce_asset_version();

create function catalog.prevent_asset_event_changes() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception 'Asset history events are append-only'; end $$;
create trigger asset_events_append_only before update or delete on catalog.asset_version_events
for each row execute function catalog.prevent_asset_event_changes();

alter table catalog.contributor_profiles enable row level security;
alter table catalog.asset_collections enable row level security;
alter table catalog.asset_versions enable row level security;
alter table catalog.asset_version_events enable row level security;
revoke all on catalog.contributor_profiles,catalog.asset_collections,catalog.asset_versions,catalog.asset_version_events from anon,authenticated;
grant select,insert,update on catalog.contributor_profiles,catalog.asset_collections,catalog.asset_versions to service_role;
grant select,insert on catalog.asset_version_events to service_role;
grant usage,select on sequence catalog.asset_version_events_id_seq to service_role;
revoke all on function catalog.enforce_asset_collection(),catalog.enforce_asset_version(),catalog.prevent_asset_event_changes() from public,anon,authenticated;

create index asset_collections_game_role on catalog.asset_collections(game_id,role,provenance);
create index asset_versions_timeline on catalog.asset_versions(collection_id,created_at desc,id);
create index asset_versions_languages on catalog.asset_versions using gin(language_tags);
create index asset_versions_current on catalog.asset_versions(game_id,context_key,valid_from,valid_until) where publication_status='published' and moderation_status='approved';
create index asset_version_events_history on catalog.asset_version_events(version_id,created_at,id);

create function catalog.record_asset_version_event() returns trigger
language plpgsql set search_path=pg_catalog,catalog as $$
begin
  insert into catalog.asset_version_events(version_id,actor_id,action,reason)
  values(new.id,case when TG_OP='INSERT' then new.uploader_id else new.changed_by end,
    case when TG_OP='INSERT' then 'submitted'
      when new.publication_status='published' then 'published'
      when new.moderation_status='withdrawn' or (TG_OP='UPDATE' and old.publication_status='published' and new.publication_status='private') then 'withdrawn'
      else 'reviewed' end,
    new.change_reason);
  return new;
end $$;
create trigger asset_version_audit after insert or update on catalog.asset_versions
for each row execute function catalog.record_asset_version_event();
revoke all on function catalog.record_asset_version_event() from public,anon,authenticated;
notify pgrst,'reload schema';
