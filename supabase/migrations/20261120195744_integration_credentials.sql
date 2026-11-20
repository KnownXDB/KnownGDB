begin;
create table catalog.integration_credentials (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 80),
 key_hash text not null unique check(key_hash ~ '^[0-9a-f]{64}$'), prefix text not null check(prefix ~ '^kgsvc_[A-Za-z0-9_-]{7}$'),
 scope text not null check(scope='identity:resolve'), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz, last_used_at timestamptz, window_start timestamptz, window_count integer not null default 0
);
create table catalog.integration_credential_events (
 id bigint generated always as identity primary key, credential_id uuid not null references catalog.integration_credentials(id),
 actor_id uuid not null references auth.users(id), action text not null check(action in ('created','revoked')),
 reason text not null check(length(trim(reason)) between 1 and 2000), created_at timestamptz not null default now()
);
alter table catalog.integration_credentials enable row level security;
alter table catalog.integration_credential_events enable row level security;
revoke all on catalog.integration_credentials,catalog.integration_credential_events from public,anon,authenticated;
grant select,insert,update on catalog.integration_credentials to service_role;
grant select,insert on catalog.integration_credential_events to service_role;
grant usage on sequence catalog.integration_credential_events_id_seq to service_role;
create function public.manage_integration_credential(p_actor uuid,p_session uuid,p_action text,p_id uuid,p_name text,p_hash text,p_prefix text,p_expires timestamptz,p_reason text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare new_id uuid; result jsonb;
begin
 if not public.admin_check(p_actor,p_session) or not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then raise insufficient_privilege; end if;
 if p_action is null or p_action not in ('create','revoke','list') then raise invalid_parameter_value; end if;
 if p_action='list' then select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'prefix',prefix,'scope',scope,'createdAt',created_at,'expiresAt',expires_at,'revokedAt',revoked_at,'lastUsedAt',last_used_at) order by created_at desc),'[]'::jsonb) into result from catalog.integration_credentials; return result; end if;
 if coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise invalid_parameter_value; end if;
 if p_action='create' then
   if coalesce(length(trim(p_name)),0) not between 1 and 80 or p_name ~ '[[:cntrl:]<>]' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_prefix is null or p_prefix !~ '^kgsvc_[A-Za-z0-9_-]{7}$' or p_expires is null or p_expires<=now() or p_expires>now()+interval '1 year' then raise invalid_parameter_value; end if;
   insert into catalog.integration_credentials(name,key_hash,prefix,scope,created_by,expires_at) values(trim(p_name),p_hash,p_prefix,'identity:resolve',p_actor,p_expires) returning id into new_id;
   insert into catalog.integration_credential_events(credential_id,actor_id,action,reason) values(new_id,p_actor,'created',trim(p_reason));
   return jsonb_build_object('id',new_id,'scope','identity:resolve','expiresAt',p_expires);
 end if;
 update catalog.integration_credentials set revoked_at=now() where id=p_id and revoked_at is null returning id into new_id;
 if new_id is not null then insert into catalog.integration_credential_events(credential_id,actor_id,action,reason) values(new_id,p_actor,'revoked',trim(p_reason)); end if;
 return jsonb_build_object('revoked',new_id is not null);
end $$;
create function public.consume_integration_credential(p_hash text,p_scope text) returns text language plpgsql security invoker set search_path=pg_catalog as $$
declare item catalog.integration_credentials; stamp timestamptz:=clock_timestamp();
begin
 select * into item from catalog.integration_credentials where key_hash=p_hash and scope=p_scope and revoked_at is null and expires_at>stamp for update;
 if not found then return 'denied'; end if;
 if item.window_start is not null and item.window_start > stamp - interval '1 minute' and item.window_count >= 30 then return 'limited'; end if;
 update catalog.integration_credentials set last_used_at=stamp, window_start=case when item.window_start is null or item.window_start <= stamp-interval '1 minute' then stamp else item.window_start end, window_count=case when item.window_start is null or item.window_start <= stamp-interval '1 minute' then 1 else item.window_count+1 end where id=item.id;
 return 'allowed';
end $$;
revoke all on function public.manage_integration_credential(uuid,uuid,text,uuid,text,text,text,timestamptz,text),public.consume_integration_credential(text,text) from public,anon,authenticated;
grant execute on function public.manage_integration_credential(uuid,uuid,text,uuid,text,text,text,timestamptz,text),public.consume_integration_credential(text,text) to service_role;
notify pgrst,'reload schema';
commit;
