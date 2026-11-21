reset role;
insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare target uuid; other uuid; ident uuid; result jsonb;
begin
  select id into target from catalog.games order by created_at limit 1;
  result:=public.admin_record_igdb_game_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061',target,'123456','https://example.invalid/evidence','Test evidence');
  if result->>'status'<>'in_review' then raise exception 'Expected pending review'; end if;
  ident:=(result->>'id')::uuid;
  result:=public.admin_record_igdb_game_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061',target,'123456','https://example.invalid/evidence','Test again');
  if result->>'status'<>'existing' then raise exception 'Retry was not idempotent'; end if;
  if (select count(*) from catalog.external_identities where game_id=target and provider='igdb' and value='123456')<>1 then raise exception 'Duplicate identifier'; end if;
  if (select count(*) from catalog.audit_events where game_id=target and metadata->>'operation'='external_identity_submitted')<>1 then raise exception 'Audit event missing or duplicated'; end if;
  begin
    perform public.admin_record_igdb_game_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061',target,'987','https://user:secret@example.invalid/','Bad source');
    raise exception 'Credential-bearing URL accepted';
  exception when invalid_parameter_value then null; end;
  result:=public.admin_review_external_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061',ident,'in_review','verified','Reviewed evidence');
  if result->>'status'<>'verified' or not exists(select 1 from catalog.external_identities where id=ident and last_verified_at is not null) then raise exception 'Verification failed'; end if;
  result := public.batch_identity_candidates('[{"provider":"igdb","namespace":"igdb.game_id","kind":"game_id","value":"missing"},{"provider":"igdb","namespace":"igdb.game_id","kind":"game_id","value":"123456"}]');
  if result->0 is distinct from '[]'::jsonb or result#>>'{1,0,game_id}' is distinct from target::text
     or result#>>'{1,0,evidence_status}' is distinct from 'verified' then raise exception 'Batch candidate mismatch'; end if;
  begin
    perform public.admin_review_external_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061',ident,'in_review','rejected','Stale review');
    raise exception 'Stale review accepted';
  exception when serialization_failure then null; end;
  if (select count(*) from catalog.audit_events where game_id=target and metadata->>'operation'='external_identity_reviewed')<>1 then raise exception 'Review audit missing'; end if;
  result:=public.admin_record_igdb_game_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061',target,'777','https://example.invalid/evidence','Submit another');
  result:=public.admin_review_external_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061',(result->>'id')::uuid,'in_review','rejected','Evidence inadequate');
  if result->>'status'<>'rejected' then raise exception 'Rejection failed'; end if;
  other:=gen_random_uuid();
  insert into catalog.games(id,item_type) values(other,'game');
  begin
    perform public.admin_record_igdb_game_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061',other,'123456','https://example.invalid/evidence','Conflicting ID');
    raise exception 'Conflicting ID accepted';
  exception when unique_violation then null; end;
  begin
    perform public.admin_record_igdb_game_identity('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061',target,'invalid','https://example.invalid','Bad');
    raise exception 'Invalid ID accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.admin_record_igdb_game_identity(null,null,null,'123','https://example.invalid','No access');
    raise exception 'Anonymous role can invoke identity function';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_review_external_identity(null,null,null,'in_review','verified','No access');
    raise exception 'Anonymous role can invoke review';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
