-- Additive metadata revisions. No existing catalog rows or asset objects change.
begin;
create table catalog.metadata_terms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('organization','platform','genre','theme','perspective','mode')),
  name text not null check (length(trim(name)) between 1 and 160),
  source text not null check (length(trim(source)) between 1 and 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(id,kind)
);
create unique index metadata_terms_name on catalog.metadata_terms(kind,lower(trim(name)));
create table catalog.game_metadata_revisions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references catalog.games(id) on delete restrict,
  sequence integer not null check (sequence>0),
  primary_language text not null,
  original_title text not null check (length(original_title)<=300),
  game_type text not null check (game_type in ('game','dlc','expansion','standalone_expansion','remake','remaster','compilation','edition')),
  source text not null check (length(trim(source)) between 1 and 2000),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  reason text not null check (length(trim(reason)) between 1 and 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  unique(game_id,sequence),
  check ((status='pending' and reviewed_by is null and reviewed_at is null) or (status='approved' and reviewed_by is not null and reviewed_at is not null))
);
create table catalog.metadata_localizations (
  revision_id uuid not null references catalog.game_metadata_revisions(id) on delete restrict,
  language text not null check (language ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' and language<>'und'),
  title text not null check (length(trim(title)) between 1 and 300),
  summary text not null check (length(summary)<=500),
  description text not null check (length(description)<=20000),
  primary key(revision_id,language)
);
create table catalog.metadata_aliases (
  revision_id uuid not null,
  language text not null,
  title text not null check (length(trim(title)) between 1 and 300),
  foreign key(revision_id,language) references catalog.metadata_localizations(revision_id,language) on delete restrict,
  primary key(revision_id,language,title)
);
create function catalog.valid_partial_date(value text) returns boolean
language plpgsql immutable security invoker set search_path=pg_catalog as $$
begin
  if value='' then return true; end if;
  if value !~ '^[1-9][0-9]{3}(-[0-9]{2})?(-[0-9]{2})?$' then return false; end if;
  if length(value)=4 then return true; end if;
  if substring(value,6,2)::integer not between 1 and 12 then return false; end if;
  if length(value)=7 then return true; end if;
  return to_char(value::date,'YYYY-MM-DD')=value;
exception when others then return false;
end $$;
create table catalog.metadata_releases (
  revision_id uuid not null references catalog.game_metadata_revisions(id) on delete restrict,
  id uuid not null,
  platform_id uuid not null,
  platform_kind text not null default 'platform' check (platform_kind='platform'),
  edition text not null check (length(edition)<=160),
  region text not null check (region ~ '^[A-Z]{2}$'),
  announced_date text not null check (catalog.valid_partial_date(announced_date)),
  release_date text not null check (catalog.valid_partial_date(release_date)),
  status text not null check (status in ('announced','early_access','released','cancelled')),
  availability text not null check (availability in ('unknown','available','delisted','service_ended')),
  store_url text not null check (length(store_url)<=2000 and (store_url='' or store_url ~ '^https://[^[:space:]]+$')),
  primary key(revision_id,id),
  foreign key(platform_id,platform_kind) references catalog.metadata_terms(id,kind) on delete restrict
);
create table catalog.metadata_credits (
  id bigint generated always as identity primary key,
  revision_id uuid not null references catalog.game_metadata_revisions(id) on delete restrict,
  organization_id uuid not null,
  organization_kind text not null default 'organization' check (organization_kind='organization'),
  role text not null check (role in ('developer','publisher','support','porting','distributor')),
  release_id uuid,
  region text check (region ~ '^[A-Z]{2}$'),
  foreign key(organization_id,organization_kind) references catalog.metadata_terms(id,kind) on delete restrict,
  foreign key(revision_id,release_id) references catalog.metadata_releases(revision_id,id) on delete restrict,
  unique nulls not distinct(revision_id,organization_id,role,release_id,region)
);
create table catalog.metadata_languages (
  id bigint generated always as identity primary key,
  revision_id uuid not null references catalog.game_metadata_revisions(id) on delete restrict,
  language text not null check (language ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' and language<>'und'),
  release_id uuid,
  interface boolean,
  subtitles boolean,
  audio boolean,
  foreign key(revision_id,release_id) references catalog.metadata_releases(revision_id,id) on delete restrict,
  unique nulls not distinct(revision_id,language,release_id)
);
create table catalog.metadata_classifications (
  revision_id uuid not null references catalog.game_metadata_revisions(id) on delete restrict,
  term_id uuid not null,
  kind text not null check (kind in ('genre','theme','perspective','mode')),
  primary key(revision_id,term_id),
  foreign key(term_id,kind) references catalog.metadata_terms(id,kind) on delete restrict
);

-- RPCs own writes. Direct service reads are available for diagnostics only.
do $$ declare t text; begin
  foreach t in array array['metadata_terms','game_metadata_revisions','metadata_localizations','metadata_aliases','metadata_releases','metadata_credits','metadata_languages','metadata_classifications'] loop
    execute format('alter table catalog.%I enable row level security',t);
    execute format('revoke all on catalog.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on catalog.%I to service_role',t);
  end loop;
end $$;

create function catalog.metadata_document(target uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
select jsonb_build_object('primaryLanguage',r.primary_language,'originalTitle',r.original_title,'gameType',r.game_type,
  'localizations',coalesce((select jsonb_agg(jsonb_build_object('language',l.language,'title',l.title,'summary',l.summary,'description',l.description,'aliases',coalesce((select jsonb_agg(a.title order by a.title) from catalog.metadata_aliases a where a.revision_id=l.revision_id and a.language=l.language),'[]'::jsonb)) order by l.language) from catalog.metadata_localizations l where l.revision_id=r.id),'[]'::jsonb),
  'releases',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'platformId',v.platform_id,'edition',v.edition,'region',v.region,'announcedDate',v.announced_date,'releaseDate',v.release_date,'status',v.status,'availability',v.availability,'storeUrl',v.store_url) order by v.id) from catalog.metadata_releases v where v.revision_id=r.id),'[]'::jsonb),
  'credits',coalesce((select jsonb_agg(jsonb_build_object('organizationId',c.organization_id,'role',c.role,'releaseId',c.release_id,'region',c.region) order by c.id) from catalog.metadata_credits c where c.revision_id=r.id),'[]'::jsonb),
  'languages',coalesce((select jsonb_agg(jsonb_build_object('language',l.language,'releaseId',l.release_id,'interface',l.interface,'subtitles',l.subtitles,'audio',l.audio) order by l.id) from catalog.metadata_languages l where l.revision_id=r.id),'[]'::jsonb),
  'classifications',coalesce((select jsonb_agg(c.term_id order by c.term_id) from catalog.metadata_classifications c where c.revision_id=r.id),'[]'::jsonb))
from catalog.game_metadata_revisions r where r.id=target;
$$;

create function public.admin_metadata_terms(p_actor uuid,p_session uuid,p_kind text default null,p_name text default null,p_source text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare target uuid; begin
  if not public.admin_check(p_actor,p_session) then raise insufficient_privilege; end if;
  if p_name is not null then
    insert into catalog.metadata_terms(kind,name,source,created_by) values(p_kind,trim(p_name),trim(p_source),p_actor) returning id into target;
    return jsonb_build_object('id',target,'kind',p_kind,'name',trim(p_name));
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'name',name) order by kind,name) from catalog.metadata_terms),'[]'::jsonb);
end $$;

create function public.admin_game_metadata(p_actor uuid,p_session uuid,p_game uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare r catalog.game_metadata_revisions; approved uuid; baseline jsonb; begin
  if not public.admin_check(p_actor,p_session) then raise insufficient_privilege; end if;
  if not exists(select 1 from catalog.games where id=p_game) then raise no_data_found; end if;
  select * into r from catalog.game_metadata_revisions where game_id=p_game order by sequence desc limit 1;
  select id into approved from catalog.game_metadata_revisions where game_id=p_game and status='approved' order by sequence desc limit 1;
  select jsonb_build_object('title',title,'language',language,'description',coalesce(description,''),'source',source_reference,
    'localizations',(select jsonb_agg(jsonb_build_object('language',l.language,'title',l.title,'summary','','description',coalesce(l.description,''),'aliases','[]'::jsonb) order by l.language) from catalog.game_localizations l where l.game_id=p_game)) into baseline from catalog.game_localizations where game_id=p_game and is_primary;
  return jsonb_build_object('revision',case when r.id is null then null else jsonb_build_object('id',r.id,'sequence',r.sequence,'status',r.status,'createdAt',r.created_at,'source',r.source,'confidence',r.confidence,'reason',r.reason,'data',catalog.metadata_document(r.id)) end,'approvedRevisionId',approved,'baseline',baseline);
end $$;

create function public.save_game_metadata(p_actor uuid,p_session uuid,p_game uuid,p_expected uuid,p_data jsonb,p_source text,p_confidence numeric,p_reason text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare previous catalog.game_metadata_revisions; target uuid; item jsonb; alias jsonb; term_kind text;
begin
  if not public.admin_check(p_actor,p_session) then raise insufficient_privilege; end if;
  perform 1 from catalog.games where id=p_game for update;
  if not found then raise no_data_found; end if;
  select * into previous from catalog.game_metadata_revisions where game_id=p_game order by sequence desc limit 1;
  if previous.id is distinct from p_expected then raise serialization_failure; end if;
  if jsonb_typeof(p_data)<>'object' or jsonb_typeof(p_data->'localizations')<>'array' or jsonb_array_length(p_data->'localizations') not between 1 and 8
    or jsonb_typeof(p_data->'releases')<>'array' or jsonb_array_length(p_data->'releases')>50
    or jsonb_typeof(p_data->'credits')<>'array' or jsonb_array_length(p_data->'credits')>50
    or jsonb_typeof(p_data->'languages')<>'array' or jsonb_array_length(p_data->'languages')>100
    or jsonb_typeof(p_data->'classifications')<>'array' or jsonb_array_length(p_data->'classifications')>80
  then raise invalid_parameter_value; end if;
  insert into catalog.game_metadata_revisions(game_id,sequence,primary_language,original_title,game_type,source,confidence,reason,created_by)
  values(p_game,coalesce(previous.sequence,0)+1,p_data->>'primaryLanguage',p_data->>'originalTitle',p_data->>'gameType',p_source,p_confidence,p_reason,p_actor) returning id into target;
  for item in select value from jsonb_array_elements(p_data->'localizations') loop
    insert into catalog.metadata_localizations values(target,item->>'language',item->>'title',item->>'summary',item->>'description');
    if jsonb_typeof(item->'aliases')<>'array' or jsonb_array_length(item->'aliases')>20 then raise invalid_parameter_value; end if;
    for alias in select value from jsonb_array_elements(item->'aliases') loop
      insert into catalog.metadata_aliases values(target,item->>'language',alias#>>'{}');
    end loop;
  end loop;
  if not exists(select 1 from catalog.metadata_localizations where revision_id=target and language=p_data->>'primaryLanguage') then raise check_violation; end if;
  for item in select value from jsonb_array_elements(p_data->'releases') loop
    insert into catalog.metadata_releases(revision_id,id,platform_id,edition,region,announced_date,release_date,status,availability,store_url)
    values(target,(item->>'id')::uuid,(item->>'platformId')::uuid,item->>'edition',item->>'region',item->>'announcedDate',item->>'releaseDate',item->>'status',item->>'availability',item->>'storeUrl');
  end loop;
  for item in select value from jsonb_array_elements(p_data->'credits') loop
    insert into catalog.metadata_credits(revision_id,organization_id,role,release_id,region)
    values(target,(item->>'organizationId')::uuid,item->>'role',(item->>'releaseId')::uuid,item->>'region');
  end loop;
  for item in select value from jsonb_array_elements(p_data->'languages') loop
    insert into catalog.metadata_languages(revision_id,language,release_id,interface,subtitles,audio)
    values(target,item->>'language',(item->>'releaseId')::uuid,(item->>'interface')::boolean,(item->>'subtitles')::boolean,(item->>'audio')::boolean);
  end loop;
  for item in select value from jsonb_array_elements(p_data->'classifications') loop
    select kind into term_kind from catalog.metadata_terms where id=(item#>>'{}')::uuid;
    insert into catalog.metadata_classifications values(target,(item#>>'{}')::uuid,term_kind);
  end loop;
  insert into catalog.audit_events(actor_id,game_id,action,metadata) values(p_actor,p_game,'update',jsonb_build_object('operation','metadata_saved','revision',target,'reason',p_reason));
  return target;
end $$;

create function public.approve_game_metadata(p_actor uuid,p_session uuid,p_game uuid,p_expected uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare r catalog.game_metadata_revisions; l record; previous_localizations jsonb; begin
  if not public.admin_check(p_actor,p_session) or not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then raise insufficient_privilege; end if;
  if coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise invalid_parameter_value; end if;
  perform 1 from catalog.games where id=p_game for update;
  if not found then raise no_data_found; end if;
  select * into r from catalog.game_metadata_revisions where game_id=p_game order by sequence desc limit 1;
  if r.id is distinct from p_expected or r.id is null or r.status<>'pending' then raise serialization_failure; end if;
  select coalesce(jsonb_agg(to_jsonb(previous) order by previous.language),'[]'::jsonb) into previous_localizations from catalog.game_localizations previous where previous.game_id=p_game;
  update catalog.game_metadata_revisions set status='approved',reviewed_by=p_actor,reviewed_at=clock_timestamp() where id=r.id;
  update catalog.game_localizations set is_primary=false where game_id=p_game and is_primary;
  -- Only explicit approval updates searchable, reviewed localized text.
  for l in select * from catalog.metadata_localizations where revision_id=r.id loop
    insert into catalog.game_localizations(game_id,language,title,description,is_primary,source_reference,confidence,moderation_status,reviewed_by,reviewed_at)
    values(p_game,l.language,l.title,l.description,l.language=r.primary_language,r.source,r.confidence,'approved',p_actor,now())
    on conflict(game_id,language) do update set title=excluded.title,description=excluded.description,is_primary=excluded.is_primary,source_reference=excluded.source_reference,confidence=excluded.confidence,moderation_status=excluded.moderation_status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
  end loop;
  -- Removed translations remain preserved privately, never searchable as current facts.
  update catalog.game_localizations set moderation_status='in_review',is_primary=false,reviewed_by=null,reviewed_at=null where game_id=p_game and language not in (select language from catalog.metadata_localizations where revision_id=r.id);
  update catalog.games set updated_at=clock_timestamp() where id=p_game;
  insert into catalog.audit_events(actor_id,game_id,action,metadata) values(p_actor,p_game,'update',jsonb_build_object('operation','metadata_approved','revision',r.id,'reason',p_reason,'previousLocalizations',previous_localizations));
  return r.id;
end $$;

create function public.published_game_metadata(p_game uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
select jsonb_build_object('revisionId',r.id,'data',catalog.metadata_document(r.id),'terms',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'kind',t.kind,'name',t.name) order by t.kind,t.name) from catalog.metadata_terms t where t.id in (
  select organization_id from catalog.metadata_credits where revision_id=r.id union select platform_id from catalog.metadata_releases where revision_id=r.id union select term_id from catalog.metadata_classifications where revision_id=r.id
)),'[]'::jsonb)) from catalog.game_metadata_revisions r join catalog.games g on g.id=r.game_id where r.game_id=p_game and g.status='published' and r.status='approved' order by r.sequence desc limit 1;
$$;

revoke all on function catalog.valid_partial_date(text),catalog.metadata_document(uuid) from public,anon,authenticated,service_role;
revoke all on function public.admin_metadata_terms(uuid,uuid,text,text,text),public.admin_game_metadata(uuid,uuid,uuid),public.save_game_metadata(uuid,uuid,uuid,uuid,jsonb,text,numeric,text),public.approve_game_metadata(uuid,uuid,uuid,uuid,text),public.published_game_metadata(uuid) from public,anon,authenticated;
grant execute on function public.admin_metadata_terms(uuid,uuid,text,text,text),public.admin_game_metadata(uuid,uuid,uuid),public.save_game_metadata(uuid,uuid,uuid,uuid,jsonb,text,numeric,text),public.approve_game_metadata(uuid,uuid,uuid,uuid,text),public.published_game_metadata(uuid) to service_role;
commit;
