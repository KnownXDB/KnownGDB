reset role;
insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000001'; session uuid:='00000000-0000-4000-8000-000000000071'; term uuid; other uuid; platform uuid; result jsonb; identity uuid;
begin
 term:=(public.admin_metadata_terms(actor,session,'organization','Fixture Company','https://example.invalid')->>'id')::uuid;
 other:=(public.admin_metadata_terms(actor,session,'organization','Fixture Other','https://example.invalid')->>'id')::uuid;
 platform:=(public.admin_metadata_terms(actor,session,'platform','Fixture Platform','https://example.invalid')->>'id')::uuid;
 result:=public.admin_record_term_identity(actor,session,term,'organization','123','https://example.invalid/evidence','Reviewed');
 identity:=(result->>'id')::uuid; assert result->>'status'='verified';
 result:=public.admin_record_term_identity(actor,session,platform,'platform','123','https://example.invalid/evidence','Reviewed'); assert result->>'termId'=platform::text;
 result:=public.admin_record_term_identity(actor,session,term,'organization','123','https://example.invalid/evidence','Repeat'); assert result->>'status'='existing';
 assert (select count(*) from catalog.term_identity_events where identity_id=identity)=1;
 begin perform public.admin_record_term_identity(actor,session,other,'organization','123','https://example.invalid/evidence','Conflict'); raise exception 'Conflict accepted'; exception when unique_violation then null; end;
 begin perform public.admin_record_term_identity(actor,session,term,'platform','123','https://example.invalid/evidence','Wrong kind'); raise exception 'Wrong term kind accepted'; exception when foreign_key_violation then null; end;
 begin perform public.admin_record_term_identity(actor,session,term,'organization','abc','https://example.invalid/evidence','Bad ID'); raise exception 'Bad ID accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
set local role anon;
do $$ begin begin perform public.admin_record_term_identity(null,null,null,'organization','123','https://example.invalid','No'); raise exception 'Anonymous execution permitted'; exception when insufficient_privilege then null; end; end $$;
reset role;
