insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001');
insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-000000000031','other-key-fixture@example.invalid',now());
insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000031');
do $$
declare actor uuid := '00000000-0000-4000-8000-000000000001'; session uuid := '00000000-0000-4000-8000-000000000030'; result jsonb; key_id uuid;
begin
  result := public.account_api_keys(actor,session,'POST',null,'Fixture',repeat('a',64),'kgdb_fixture');
  key_id := (result->>'id')::uuid;
  assert result->'expiresAt' = 'null'::jsonb;
  assert not (result ? 'key_hash');
  assert public.consume_catalog_api_key(repeat('a',64));
  perform public.account_api_keys('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000032','DELETE',key_id,null,null,null);
  assert public.consume_catalog_api_key(repeat('a',64));
  result := public.account_api_keys('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000032','GET',null,null,null,null);
  assert jsonb_array_length(result->'keys')=0;
  assert not public.consume_catalog_api_key(repeat('b',64));
  result := public.account_api_keys(actor,session,'GET',null,null,null,null);
  assert jsonb_array_length(result->'keys')=1;
  assert not ((result->'keys'->0) ? 'key_hash');
  perform public.account_api_keys(actor,session,'DELETE',key_id,null,null,null);
  assert not public.consume_catalog_api_key(repeat('a',64));
  perform public.account_api_keys(actor,session,'PATCH',key_id,null,null,null,null);
  assert not public.consume_catalog_api_key(repeat('a',64));
  update catalog.api_keys set revoked_at=null where id=key_id;
  perform public.account_api_keys(actor,session,'PATCH',key_id,null,null,null,null);
  assert public.consume_catalog_api_key(repeat('a',64));
  perform public.account_api_keys(actor,session,'PATCH',key_id,null,null,null,now()+interval '1 year');
  assert (select expires_at is not null from catalog.api_keys where id=key_id);
  update catalog.api_keys set revoked_at=null,expires_at=now()-interval '1 second' where id=key_id;
  assert not public.consume_catalog_api_key(repeat('a',64));
  update auth.sessions set not_after=now()-interval '1 second' where id=session;
  begin
    perform public.account_api_keys(actor,session,'GET',null,null,null,null);
    raise exception 'Expired session accepted';
  exception when invalid_authorization_specification then null;
  end;
  assert not has_function_privilege('anon','public.consume_catalog_api_key(text)','execute');
  assert not has_function_privilege('authenticated','public.account_api_keys(uuid,uuid,text,uuid,text,text,text,timestamptz)','execute');
end $$;
