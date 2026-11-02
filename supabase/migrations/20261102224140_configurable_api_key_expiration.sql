begin;
alter table catalog.api_keys alter column expires_at drop not null;
alter table catalog.api_keys alter column expires_at drop default;
drop function public.account_api_keys(uuid,uuid,text,uuid,text,text,text);
create function public.account_api_keys(p_actor uuid, p_session uuid, p_action text, p_id uuid, p_name text, p_hash text, p_prefix text, p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; new_id uuid;
begin
  if not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=p_session and s.user_id=p_actor and (s.not_after is null or s.not_after > now()) and u.email_confirmed_at is not null) then
    raise exception 'Active confirmed session required' using errcode='28000';
  end if;
  if p_action in ('POST','PATCH') and p_expires_at is not null and (not isfinite(p_expires_at) or p_expires_at <= now()) then
    raise exception 'Expiration must be in the future' using errcode='22023';
  end if;
  if p_action='POST' then
    insert into catalog.api_keys(user_id,name,key_hash,prefix,expires_at) values(p_actor,p_name,p_hash,p_prefix,p_expires_at) returning id into new_id;
    select jsonb_build_object('id',id,'name',name,'prefix',prefix,'scope',scope,'expiresAt',expires_at) into result from catalog.api_keys where id=new_id;
    return result;
  elsif p_action='PATCH' then
    update catalog.api_keys set expires_at=p_expires_at where id=p_id and user_id=p_actor and revoked_at is null;
    return jsonb_build_object('updated',found);
  elsif p_action='DELETE' then
    update catalog.api_keys set revoked_at=coalesce(revoked_at,now()) where id=p_id and user_id=p_actor;
    return jsonb_build_object('revoked',true);
  elsif p_action='GET' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'prefix',prefix,'scope',scope,'createdAt',created_at,'expiresAt',expires_at,'revokedAt',revoked_at,'lastUsedAt',last_used_at) order by created_at desc),'[]'::jsonb) into result from catalog.api_keys where user_id=p_actor;
    return jsonb_build_object('keys',result);
  end if;
  raise exception 'Unsupported operation';
end $$;
create or replace function public.consume_catalog_api_key(p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update catalog.api_keys k set last_used_at=now()
  where k.key_hash=p_hash and k.revoked_at is null and (k.expires_at is null or k.expires_at>now())
    and exists(select 1 from auth.users u where u.id=k.user_id and u.email_confirmed_at is not null);
  return found;
end $$;
revoke all on function public.account_api_keys(uuid,uuid,text,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.account_api_keys(uuid,uuid,text,uuid,text,text,text,timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
