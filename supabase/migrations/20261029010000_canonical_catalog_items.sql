begin;

-- A catalog item keeps its own immutable UUID even when it is related to another
-- item. The existing games.id values remain unchanged and default to a base game.
alter table catalog.games add column item_type text not null default 'game';
alter table catalog.games add constraint games_item_type_check check (item_type in (
  'game', 'demo', 'playtest', 'dlc', 'expansion', 'standalone_expansion',
  'remake', 'remaster', 'compilation', 'edition', 'bundle', 'season_pass',
  'soundtrack'
));
create index games_item_type_idx on catalog.games(item_type);
comment on column catalog.games.id is 'Immutable KnownGDB canonical catalog item ID.';
comment on column catalog.games.item_type is 'Canonical product kind; related items never replace this identity.';

create function catalog.prevent_game_item_type_change() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  if old.item_type is distinct from new.item_type then
    raise exception using errcode='23514', message='Catalog item type is immutable; use an identity decision';
  end if;
  return new;
end;
$$;
create trigger game_item_type_immutable
before update of item_type on catalog.games
for each row execute function catalog.prevent_game_item_type_change();

create table catalog.game_relations (
  id uuid primary key default gen_random_uuid(),
  parent_game_id uuid not null references catalog.games(id) on delete restrict,
  child_game_id uuid not null references catalog.games(id) on delete restrict,
  relation_type text not null check (relation_type in (
    'has_demo', 'has_playtest', 'has_dlc', 'has_expansion',
    'has_standalone_expansion', 'has_remake', 'has_remaster', 'has_edition',
    'has_compilation_member', 'has_bundle_member', 'has_season_pass',
    'has_soundtrack'
  )),
  source_reference text not null check (length(trim(source_reference)) between 1 and 2000),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  moderation_status text not null default 'in_review'
    check (moderation_status in ('in_review', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (parent_game_id, child_game_id, relation_type),
  check (parent_game_id <> child_game_id),
  check (moderation_status <> 'approved' or (reviewed_at is not null and reviewed_by is not null))
);
create index game_relations_parent_idx on catalog.game_relations(parent_game_id, relation_type);
create index game_relations_child_idx on catalog.game_relations(child_game_id, relation_type);

create function catalog.validate_game_relation() returns trigger
language plpgsql set search_path = pg_catalog as $$
declare child_type text;
begin
  select item_type into child_type from catalog.games where id = new.child_game_id;
  if child_type is null then
    raise exception using errcode='23503', message='Related catalog item not found';
  end if;
  if (new.relation_type = 'has_demo' and child_type <> 'demo')
    or (new.relation_type = 'has_playtest' and child_type <> 'playtest')
    or (new.relation_type = 'has_dlc' and child_type not in ('dlc', 'expansion'))
    or (new.relation_type = 'has_expansion' and child_type <> 'expansion')
    or (new.relation_type = 'has_standalone_expansion' and child_type <> 'standalone_expansion')
    or (new.relation_type = 'has_remake' and child_type <> 'remake')
    or (new.relation_type = 'has_remaster' and child_type <> 'remaster')
    or (new.relation_type = 'has_edition' and child_type <> 'edition')
    or (new.relation_type = 'has_season_pass' and child_type <> 'season_pass')
    or (new.relation_type = 'has_soundtrack' and child_type <> 'soundtrack') then
    raise exception using errcode='23514', message='Relation type does not match child catalog item type';
  end if;
  return new;
end;
$$;
create trigger validate_game_relation
before insert or update on catalog.game_relations
for each row execute function catalog.validate_game_relation();

alter table catalog.game_relations enable row level security;
revoke all on catalog.game_relations from public, anon, authenticated;
grant select, insert, update on catalog.game_relations to service_role;

-- Preserve the existing RPC surface while exposing the new item type to the
-- administration client and allowing new canonical related products to be created.
create or replace function public.admin_catalog(p_actor uuid,p_session uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare result jsonb;
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  select coalesce(jsonb_agg(row_data),'[]'::jsonb) into result from (
    select jsonb_build_object('id',g.id,'status',g.status,'item_type',g.item_type,'updated_at',g.updated_at,
      'localizations',coalesce((select jsonb_agg(to_jsonb(l) order by l.language)
        from catalog.game_localizations l where l.game_id=g.id),'[]'::jsonb)) as row_data
    from catalog.games g order by g.created_at desc,g.id limit 100
  ) rows;
  return result;
end;
$$;

create or replace function public.admin_save_game(p_actor uuid,p_session uuid,p_game uuid,
  p_expected timestamptz,p_data jsonb) returns uuid
language plpgsql security invoker set search_path=pg_catalog as $$
declare target uuid; previous_time timestamptz; approval boolean;
  item_kind text:=coalesce(p_data->>'item_type','game'); current_kind text;
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  if jsonb_typeof(p_data)<>'object' or coalesce(length(p_data->>'title'),0) not between 1 and 300
    or coalesce(length(p_data->>'source_reference'),0) not between 1 and 2000
    or coalesce(p_data->>'language','') !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
    or p_data->>'language'='und'
    or coalesce(p_data->>'status','') not in ('draft','published','withdrawn')
    or item_kind not in ('game','demo','playtest','dlc','expansion','standalone_expansion','remake','remaster','compilation','edition','bundle','season_pass','soundtrack')
    then raise exception 'invalid_request'; end if;
  approval:=coalesce((p_data->>'approved')::boolean,false);
  if p_game is null then
    insert into catalog.games(item_type) values(item_kind) returning id into target;
  else
    select updated_at,item_type into previous_time,current_kind from catalog.games where id=p_game for update;
    if not found then raise exception 'game_not_found'; end if;
    if p_expected is null or previous_time<>p_expected then raise exception 'edit_conflict'; end if;
    if p_data ? 'item_type' and current_kind<>item_kind then raise exception 'item_type_immutable'; end if;
    target:=p_game;
  end if;
  if coalesce((p_data->>'is_primary')::boolean,false) then
    update catalog.game_localizations set is_primary=false where game_id=target and is_primary;
  end if;
  insert into catalog.game_localizations(game_id,language,title,description,is_primary,
    source_reference,confidence,moderation_status,reviewed_at,reviewed_by)
  values(target,p_data->>'language',p_data->>'title',p_data->>'description',
    coalesce((p_data->>'is_primary')::boolean,false),p_data->>'source_reference',
    (p_data->>'confidence')::numeric,case when approval then 'approved' else 'in_review' end,
    case when approval then now() end,case when approval then p_actor end)
  on conflict(game_id,language) do update set title=excluded.title,description=excluded.description,
    is_primary=excluded.is_primary,source_reference=excluded.source_reference,
    confidence=excluded.confidence,moderation_status=excluded.moderation_status,
    reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by;
  if p_data->>'status'='published' and not exists (
    select 1 from catalog.game_localizations where game_id=target and is_primary and moderation_status='approved'
  ) then raise exception 'publication_requires_review'; end if;
  update catalog.games set status=p_data->>'status',updated_at=clock_timestamp() where id=target;
  insert into catalog.audit_events(actor_id,game_id,action,metadata)
  values(p_actor,target,case when p_game is null then 'create' else 'update' end,
    jsonb_build_object('language',p_data->>'language','status',p_data->>'status','approved',approval,'item_type',item_kind));
  return target;
end;
$$;

revoke all on function public.admin_catalog(uuid,uuid),public.admin_save_game(uuid,uuid,uuid,timestamptz,jsonb)
from public,anon,authenticated;
grant execute on function public.admin_catalog(uuid,uuid),public.admin_save_game(uuid,uuid,uuid,timestamptz,jsonb) to service_role;

commit;
