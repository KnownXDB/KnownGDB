reset role;
insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000001'; session uuid:='00000000-0000-4000-8000-000000000051'; key_id uuid; result jsonb;
begin
  result:=public.manage_integration_credential(actor,session,'create',null,'Fixture',repeat('a',64),'kgsvc_abc1234',now()+interval '30 days','Test');
  key_id:=(result->>'id')::uuid;
  assert result->>'scope'='identity:resolve';
  assert public.consume_integration_credential(repeat('a',64),'identity:resolve')='allowed';
  assert public.consume_integration_credential(repeat('a',64),'catalog:read')='denied';
  result:=public.manage_integration_credential(actor,session,'list',null,null,null,null,null,null);
  assert jsonb_array_length(result)=1 and not (result->0 ? 'key_hash');
  for i in 1..29 loop assert public.consume_integration_credential(repeat('a',64),'identity:resolve')='allowed'; end loop;
  assert public.consume_integration_credential(repeat('a',64),'identity:resolve')='limited';
  update catalog.integration_credentials set expires_at=now()-interval '1 second' where id=key_id;
  assert public.consume_integration_credential(repeat('a',64),'identity:resolve')='denied';
  update catalog.integration_credentials set expires_at=now()+interval '30 days' where id=key_id;
  perform public.manage_integration_credential(actor,session,'revoke',key_id,null,null,null,null,'Retired');
  assert public.consume_integration_credential(repeat('a',64),'identity:resolve')='denied';
  assert (select count(*) from catalog.integration_credential_events where credential_id=key_id)=2;
  update catalog.admin_members set role='moderator' where user_id=actor;
  begin
    perform public.manage_integration_credential(actor,session,'list',null,null,null,null,null,null);
    raise exception 'Moderator accessed credential management';
  exception when insufficient_privilege then null; end;
  update catalog.admin_members set role='super_admin' where user_id=actor;
  begin
    perform public.manage_integration_credential(actor,session,'create',null,'Fixture',repeat('b',64),'kgsvc_abc1234',now()-interval '1 day','Expired');
    raise exception 'Expired credential created';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.consume_integration_credential(repeat('a',64),'identity:resolve'); raise exception 'Anonymous execution allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
