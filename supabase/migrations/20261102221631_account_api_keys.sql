begin;
create table catalog.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  prefix text not null,
  scope text not null default 'catalog:read' check (scope = 'catalog:read'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  revoked_at timestamptz,
  last_used_at timestamptz
);
alter table catalog.api_keys enable row level security;
revoke all on catalog.api_keys from public, anon, authenticated;
grant select, insert, update, delete on catalog.api_keys to service_role;

create function public.account_api_keys(p_actor uuid, p_session uuid, p_action text, p_id uuid, p_name text, p_hash text, p_prefix text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; new_id uuid;
begin
  if not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=p_session and s.user_id=p_actor and (s.not_after is null or s.not_after > now()) and u.email_confirmed_at is not null) then
    raise exception 'Active confirmed session required' using errcode='28000';
  end if;
  if p_action='POST' then
    insert into catalog.api_keys(user_id,name,key_hash,prefix) values(p_actor,p_name,p_hash,p_prefix) returning id into new_id;
    select jsonb_build_object('id',id,'name',name,'prefix',prefix,'scope',scope,'expiresAt',expires_at) into result from catalog.api_keys where id=new_id;
    return result;
  elsif p_action='DELETE' then
    update catalog.api_keys set revoked_at=coalesce(revoked_at,now()) where id=p_id and user_id=p_actor;
    return jsonb_build_object('revoked',true);
  elsif p_action='GET' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'prefix',prefix,'scope',scope,'createdAt',created_at,'expiresAt',expires_at,'revokedAt',revoked_at,'lastUsedAt',last_used_at) order by created_at desc),'[]'::jsonb) into result from catalog.api_keys where user_id=p_actor;
    return jsonb_build_object('keys',result);
  end if;
  raise exception 'Unsupported operation';
end $$;

create function public.consume_catalog_api_key(p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update catalog.api_keys k set last_used_at=now()
  where k.key_hash=p_hash and k.revoked_at is null and k.expires_at>now()
    and exists(select 1 from auth.users u where u.id=k.user_id and u.email_confirmed_at is not null);
  return found;
end $$;
revoke all on function public.account_api_keys(uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.consume_catalog_api_key(text) from public,anon,authenticated;
grant execute on function public.account_api_keys(uuid,uuid,text,uuid,text,text,text) to service_role;
grant execute on function public.consume_catalog_api_key(text) to service_role;
notify pgrst, 'reload schema';
commit;
