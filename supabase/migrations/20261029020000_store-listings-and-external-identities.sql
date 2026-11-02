begin;

create table catalog.store_listings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references catalog.games(id) on delete restrict,
  store_provider text not null check (store_provider ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  listing_role text not null check (listing_role in (
    'primary', 'demo', 'playtest', 'dlc', 'expansion', 'edition', 'bundle',
    'season_pass', 'soundtrack', 'other'
  )),
  url text not null check (length(url) between 1 and 2000 and url ~ '^https://[^[:space:]]+$'),
  region text not null default 'GLOBAL' check (region ~ '^[A-Z0-9]{2,8}([_-][A-Z0-9]{2,8})*$'),
  locale text check (locale is null or (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' and locale <> 'und')),
  display_title text check (display_title is null or length(trim(display_title)) between 1 and 300),
  status text not null default 'unknown' check (status in ('active', 'delisted', 'unavailable', 'unknown')),
  source_kind text not null check (source_kind in (
    'official_store_page', 'official_api', 'publisher_page',
    'partner_export', 'manual_official_review'
  )),
  source_reference text not null check (length(trim(source_reference)) between 1 and 2000),
  evidence_status text not null default 'in_review' check (evidence_status in (
    'observed', 'in_review', 'verified', 'rejected', 'stale', 'conflicted'
  )),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  observed_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  unique (id, game_id),
  unique nulls not distinct (game_id, store_provider, url, region, locale),
  check (valid_until is null or (valid_from is not null and valid_until > valid_from)),
  check (evidence_status <> 'verified' or last_verified_at is not null)
);
create index store_listings_game_idx on catalog.store_listings(game_id, store_provider, region);
create index store_listings_status_idx on catalog.store_listings(store_provider, status, last_verified_at);

create table catalog.external_identities (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references catalog.games(id) on delete restrict,
  store_listing_id uuid,
  provider text not null check (provider ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  namespace text not null check (namespace ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  identifier_kind text not null check (identifier_kind ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  value text not null check (length(trim(value)) between 1 and 500),
  normalized_value text generated always as (lower(btrim(value))) stored,
  scope text not null default 'catalog_item' check (scope in (
    'catalog_item', 'store_listing', 'release', 'edition', 'offer', 'sku', 'title'
  )),
  region text not null default 'GLOBAL' check (region ~ '^[A-Z0-9]{2,8}([_-][A-Z0-9]{2,8})*$'),
  locale text check (locale is null or (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' and locale <> 'und')),
  source_kind text not null check (source_kind in (
    'official_store_page', 'official_api', 'publisher_page',
    'partner_export', 'manual_official_review'
  )),
  source_reference text not null check (length(trim(source_reference)) between 1 and 2000),
  evidence_status text not null default 'in_review' check (evidence_status in (
    'observed', 'in_review', 'verified', 'rejected', 'stale', 'conflicted'
  )),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  observed_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  foreign key (store_listing_id, game_id)
    references catalog.store_listings(id, game_id) on delete restrict,
  unique nulls not distinct (
    game_id, provider, namespace, identifier_kind, normalized_value, region, locale
  ),
  check (scope <> 'store_listing' or store_listing_id is not null),
  check (valid_until is null or (valid_from is not null and valid_until > valid_from)),
  check (evidence_status <> 'verified' or last_verified_at is not null)
);
create index external_identities_game_idx on catalog.external_identities(game_id, provider, namespace);
create index external_identities_lookup_idx on catalog.external_identities(provider, namespace, normalized_value, region);

alter table catalog.store_listings enable row level security;
alter table catalog.external_identities enable row level security;
revoke all on catalog.store_listings, catalog.external_identities from public, anon, authenticated;
grant select, insert, update on catalog.store_listings, catalog.external_identities to service_role;

comment on table catalog.store_listings is 'Official or reviewed storefront listings attached to a KnownGDB catalog item.';
comment on table catalog.external_identities is 'Provider identifiers that never replace the KnownGDB catalog item UUID.';
comment on column catalog.external_identities.value is 'Original provider value; normalized_value is only for matching and uniqueness.';

commit;
