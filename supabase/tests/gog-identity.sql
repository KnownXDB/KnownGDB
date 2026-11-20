reset role;
insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare target uuid; other uuid; result jsonb;
begin
  select id into target from catalog.games order by created_at limit 1;
  result:=public.admin_record_gog_product_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000041',target,'123456','https://example.invalid/evidence','Test evidence');
  if result->>'status'<>'in_review' then raise exception 'Expected pending review'; end if;
  result:=public.admin_record_gog_product_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000041',target,'123456','https://example.invalid/evidence','Test again');
  if result->>'status'<>'existing' then raise exception 'Retry was not idempotent'; end if;
  if (select count(*) from catalog.external_identities where game_id=target and provider='gog' and value='123456')<>1 then raise exception 'Duplicate identifier'; end if;
  if (select count(*) from catalog.audit_events where game_id=target and metadata->>'operation'='external_identity_submitted')<>1 then raise exception 'Audit event missing or duplicated'; end if;
  begin
    perform public.admin_record_gog_product_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000041',target,'987','https://user:secret@example.invalid/','Bad source');
    raise exception 'Credential-bearing URL accepted';
  exception when invalid_parameter_value then null; end;
  other:=gen_random_uuid();
  insert into catalog.games(id,item_type) values(other,'game');
  begin
    perform public.admin_record_gog_product_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000041',other,'123456','https://example.invalid/evidence','Conflicting ID');
    raise exception 'Conflicting ID accepted';
  exception when unique_violation then null; end;
  begin
    perform public.admin_record_gog_product_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000041',target,'invalid','https://example.invalid','Bad');
    raise exception 'Invalid ID accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.admin_record_gog_product_identity(null,null,null,'123','https://example.invalid','No access');
    raise exception 'Anonymous role can invoke identity function';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
