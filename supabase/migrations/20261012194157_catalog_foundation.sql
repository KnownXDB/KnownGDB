begin;

create schema if not exists catalog;
revoke all on schema catalog from public, anon, authenticated;
grant usage on schema catalog to service_role;

create table catalog.games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'published', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table catalog.game_localizations (
  game_id uuid not null references catalog.games(id) on delete restrict,
  language text not null check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' and language <> 'und'),
  title text not null check (length(title) between 1 and 300),
  description text check (length(description) <= 20000),
  is_primary boolean not null default false,
  source_reference text not null check (length(source_reference) between 1 and 2000),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  moderation_status text not null default 'in_review'
    check (moderation_status in ('in_review', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  primary key (game_id, language),
  check (moderation_status <> 'approved' or (reviewed_at is not null and reviewed_by is not null))
);
create unique index one_primary_localization on catalog.game_localizations(game_id) where is_primary;

create table catalog.assets (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references catalog.games(id) on delete restrict,
  role text not null check (role in ('header', 'capsule', 'hero', 'logo', 'icon', 'client_icon')),
  language_kind text not null check (language_kind in ('global', 'localized')),
  language_tags text[] not null default '{}',
  object_key text not null unique check (length(object_key) between 1 and 1000),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  provenance text not null check (provenance in ('official', 'community')),
  source_reference text not null check (length(source_reference) between 1 and 2000),
  rights_reference text,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  rendition text not null default 'original' check (rendition in ('original', 'derivative')),
  moderation_status text not null default 'submitted'
    check (moderation_status in ('submitted', 'in_review', 'approved', 'rejected', 'withdrawn')),
  publication_status text not null default 'private' check (publication_status in ('private', 'published')),
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  check ((language_kind = 'global' and cardinality(language_tags) = 0)
    or (language_kind = 'localized' and cardinality(language_tags) between 1 and 8
      and array_position(language_tags, null) is null)),
  check (valid_until is null or valid_from is null or valid_until > valid_from),
  check (moderation_status <> 'approved' or (reviewed_at is not null and reviewed_by is not null)),
  check (publication_status <> 'published' or (moderation_status = 'approved'
    and rights_reference is not null and length(rights_reference) > 0))
);

create function catalog.validate_asset_languages() returns trigger
language plpgsql set search_path = pg_catalog as $$
declare tag text;
begin
  foreach tag in array new.language_tags loop
    if tag !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' or tag = 'und' then
      raise exception 'Invalid localized asset language';
    end if;
  end loop;
  return new;
end;
$$;
create trigger validate_asset_languages before insert or update on catalog.assets
for each row execute function catalog.validate_asset_languages();

alter table catalog.games enable row level security;
alter table catalog.game_localizations enable row level security;
alter table catalog.assets enable row level security;
revoke all on all tables in schema catalog from public, anon, authenticated;
grant select, insert, update on all tables in schema catalog to service_role;

create view public.published_games with (security_invoker = true) as
select g.id, l.title, l.language, l.description
from catalog.games g join catalog.game_localizations l on l.game_id = g.id
where g.status = 'published' and l.is_primary and l.moderation_status = 'approved';
revoke all on public.published_games from public, anon, authenticated;
grant select on public.published_games to service_role;

commit;
