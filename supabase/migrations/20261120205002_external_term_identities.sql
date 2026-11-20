begin;
create table catalog.term_external_identities (
 id uuid primary key default gen_random_uuid(), term_id uuid not null, term_kind text not null check(term_kind in ('organization','platform')),
 provider text not null check(provider='igdb'), external_id text not null check(external_id ~ '^[1-9][0-9]{0,9}$'),
 source_reference text not null check(source_reference ~ '^https://[^/@[:space:]]+(/[^[:space:]]*)?$' and length(source_reference)<=2000),
 reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default now(),
 foreign key(term_id,term_kind) references catalog.metadata_terms(id,kind), unique(provider,term_kind,external_id)
);
create table catalog.term_identity_events (
 id bigint generated always as identity primary key, identity_id uuid not null references catalog.term_external_identities(id),
 actor_id uuid not null references auth.users(id), reason text not null check(length(trim(reason)) between 1 and 2000), created_at timestamptz not null default now()
);
alter table catalog.term_external_identities enable row level security;
alter table catalog.term_identity_events enable row level security;
revoke all on catalog.term_external_identities,catalog.term_identity_events from public,anon,authenticated;
grant select,insert on catalog.term_external_identities,catalog.term_identity_events to service_role;
grant usage on sequence catalog.term_identity_events_id_seq to service_role;
create function public.admin_record_term_identity(p_actor uuid,p_session uuid,p_term uuid,p_kind text,p_external_id text,p_source text,p_reason text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare current_row catalog.term_external_identities;
begin
 if not public.admin_check(p_actor,p_session) or not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then raise insufficient_privilege; end if;
 if p_kind is null or p_kind not in ('organization','platform') or p_external_id is null or p_external_id !~ '^[1-9][0-9]{0,9}$' or p_source is null or length(p_source)>2000 or p_source !~ '^https://[^/@[:space:]]+(/[^[:space:]]*)?$' or coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise invalid_parameter_value; end if;
 if not exists(select 1 from catalog.metadata_terms where id=p_term and kind=p_kind) then raise foreign_key_violation; end if;
 perform pg_advisory_xact_lock(hashtextextended('igdb.term:'||p_kind||':'||p_external_id,0));
 select * into current_row from catalog.term_external_identities where provider='igdb' and term_kind=p_kind and external_id=p_external_id;
 if found then
   if current_row.term_id<>p_term then raise unique_violation; end if;
   return jsonb_build_object('id',current_row.id,'termId',current_row.term_id,'status','existing');
 end if;
 insert into catalog.term_external_identities(term_id,term_kind,provider,external_id,source_reference,reviewed_by) values(p_term,p_kind,'igdb',p_external_id,p_source,p_actor) returning * into current_row;
 insert into catalog.term_identity_events(identity_id,actor_id,reason) values(current_row.id,p_actor,trim(p_reason));
 return jsonb_build_object('id',current_row.id,'termId',current_row.term_id,'status','verified');
end $$;
revoke all on function public.admin_record_term_identity(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_record_term_identity(uuid,uuid,uuid,text,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
