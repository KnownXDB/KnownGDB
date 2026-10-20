begin;

create table catalog.admin_allowlist (
  email text primary key check (email=lower(email)),
  created_at timestamptz not null default now()
);
create table catalog.admin_members (
  user_id uuid primary key references auth.users(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table catalog.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  game_id uuid not null references catalog.games(id) on delete restrict,
  action text not null check (action in ('create','update')),
  metadata jsonb not null,
  created_at timestamptz not null default now()
);
create index audit_events_game_idx on catalog.audit_events(game_id,created_at desc);
create table catalog.login_windows (
  bucket text primary key,
  window_start timestamptz not null,
  attempts integer not null
);

alter table catalog.admin_allowlist enable row level security;
alter table catalog.admin_members enable row level security;
alter table catalog.audit_events enable row level security;
alter table catalog.login_windows enable row level security;
revoke all on catalog.admin_allowlist,catalog.admin_members,catalog.audit_events,catalog.login_windows
from public,anon,authenticated;
grant select,insert,update on catalog.admin_members,catalog.audit_events,catalog.login_windows to service_role;
grant usage on sequence catalog.audit_events_id_seq to service_role;
grant select on auth.sessions to service_role;

-- The Auth service cannot write private catalog tables directly. This narrowly
-- scoped trigger grants membership only to confirmed, explicitly allowlisted users.
create function catalog.bootstrap_admin() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.email_confirmed_at is not null and exists (
    select 1 from catalog.admin_allowlist where email=lower(new.email)
  ) then
    insert into catalog.admin_members(user_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function catalog.bootstrap_admin() from public,anon,authenticated,service_role;
create trigger bootstrap_catalog_admin after insert or update of email_confirmed_at on auth.users
for each row execute function catalog.bootstrap_admin();

create function public.admin_check(p_actor uuid,p_session uuid) returns boolean
language sql security invoker set search_path=pg_catalog as $$
  select exists(select 1 from catalog.admin_members m join auth.sessions s
    on s.user_id=m.user_id where m.user_id=p_actor and m.active and s.id=p_session
    and (s.not_after is null or s.not_after>now()));
$$;

create function public.admin_login_gate(p_bucket text) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
declare attempt integer; minute_start timestamptz := date_trunc('minute',now());
begin
  if p_bucket !~ '^[0-9a-f]{64}$' then raise exception 'invalid_request'; end if;
  insert into catalog.login_windows(bucket,window_start,attempts)
  values(p_bucket,minute_start,1) on conflict(bucket) do update set
    window_start=excluded.window_start,
    attempts=case when catalog.login_windows.window_start=excluded.window_start
      then least(catalog.login_windows.attempts+1,100) else 1 end returning attempts into attempt;
  return attempt<=6;
end;
$$;

create function public.admin_catalog(p_actor uuid,p_session uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare result jsonb;
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  select coalesce(jsonb_agg(row_data),'[]'::jsonb) into result from (
    select jsonb_build_object('id',g.id,'status',g.status,'updated_at',g.updated_at,
      'localizations',coalesce((select jsonb_agg(to_jsonb(l) order by l.language)
        from catalog.game_localizations l where l.game_id=g.id),'[]'::jsonb)) as row_data
    from catalog.games g order by g.created_at desc,g.id limit 100
  ) rows;
  return result;
end;
$$;

create function public.admin_save_game(p_actor uuid,p_session uuid,p_game uuid,
  p_expected timestamptz,p_data jsonb) returns uuid
language plpgsql security invoker set search_path=pg_catalog as $$
declare target uuid; previous_time timestamptz; approval boolean;
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  if jsonb_typeof(p_data)<>'object' or coalesce(length(p_data->>'title'),0) not between 1 and 300
    or coalesce(length(p_data->>'source_reference'),0) not between 1 and 2000
    or coalesce(p_data->>'language','') !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
    or p_data->>'language'='und'
    or coalesce(p_data->>'status','') not in ('draft','published','withdrawn')
    then raise exception 'invalid_request'; end if;
  approval:=coalesce((p_data->>'approved')::boolean,false);
  if p_game is null then
    insert into catalog.games default values returning id into target;
  else
    select updated_at into previous_time from catalog.games where id=p_game for update;
    if not found then raise exception 'game_not_found'; end if;
    if p_expected is null or previous_time<>p_expected then raise exception 'edit_conflict'; end if;
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
    jsonb_build_object('language',p_data->>'language','status',p_data->>'status','approved',approval));
  return target;
end;
$$;

revoke all on function public.admin_check(uuid,uuid), public.admin_login_gate(text),
public.admin_catalog(uuid,uuid),public.admin_save_game(uuid,uuid,uuid,timestamptz,jsonb)
from public,anon,authenticated;
grant execute on function public.admin_check(uuid,uuid), public.admin_login_gate(text),
public.admin_catalog(uuid,uuid),public.admin_save_game(uuid,uuid,uuid,timestamptz,jsonb) to service_role;

commit;
