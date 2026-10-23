insert into auth.users(id,email_confirmed_at) values
('00000000-0000-4000-8000-000000000002',now()),
('00000000-0000-4000-8000-000000000003',now());
insert into catalog.contributor_profiles(user_id,display_name) values
('00000000-0000-4000-8000-000000000001','Administrator'),
('00000000-0000-4000-8000-000000000002','Contributor'),
('00000000-0000-4000-8000-000000000003','Moderator');
insert into catalog.admin_members(user_id,role) values('00000000-0000-4000-8000-000000000003','moderator');
insert into auth.sessions(id,user_id) values
('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002'),
('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000003');
insert into catalog.games(id,status) values('00000000-0000-4000-8000-000000000021','published');
set local role service_role;
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000002'; session uuid:='00000000-0000-4000-8000-000000000012';
  moderator uuid:='00000000-0000-4000-8000-000000000003'; mod_session uuid:='00000000-0000-4000-8000-000000000013';
  intent uuid; second uuid; collection uuid; result jsonb; n integer;
  data jsonb:=jsonb_build_object('game_id','00000000-0000-4000-8000-000000000021','role','logo','credit_kind','personal','extension','png','language_kind','localized','language_tags',jsonb_build_array('en','es'),'context_key','new-year','source_reference','Contributor original','rights_reference','Licensed for distribution','byte_size',100,'checksum_sha256',repeat('a',64));
begin
  begin perform public.reserve_asset_submission(actor,session,data||'{"credit_kind":"official"}');raise exception 'Community official credit accepted';exception when insufficient_privilege then null;end;
  begin perform public.reserve_asset_submission(actor,mod_session,data);raise exception 'Foreign session accepted';exception when insufficient_privilege then null;end;
  begin perform public.reserve_asset_submission(actor,session,data||'{"language_tags":["en","en"]}');raise exception 'Duplicate language accepted';exception when invalid_parameter_value then null;end;
  intent:=(public.reserve_asset_submission(actor,session,data)->>'id')::uuid;
  if not exists(select 1 from catalog.asset_submissions where id=intent and object_key like '%/community/logo/multi/%') then raise exception 'Canonical multilingual key missing';end if;
  begin perform public.complete_asset_submission(intent,actor,session,repeat('b',64),100);raise exception 'Incorrect hash accepted';exception when check_violation then null;end;
  perform public.complete_asset_submission(intent,actor,session,repeat('a',64),100);
  perform public.complete_asset_submission(intent,actor,session,repeat('a',64),100);
  if (select count(*) from catalog.asset_version_events where version_id=intent)<>1 then raise exception 'Idempotent completion duplicated events';end if;
  select collection_id into collection from catalog.asset_versions where id=intent;
  begin perform public.reserve_asset_submission(moderator,mod_session,data||jsonb_build_object('collection_id',collection));raise exception 'Foreign collection accepted';exception when insufficient_privilege then null;end;
  begin update catalog.asset_submissions set metadata=data||'{"credit_kind":"official"}' where id=intent;raise exception 'Submission identity changed';exception when raise_exception then if sqlerrm='Submission identity changed' then raise;end if;end;
  second:=(public.reserve_asset_submission(actor,session,data||jsonb_build_object('collection_id',collection))->>'id')::uuid;
  perform public.complete_asset_submission(second,actor,session,repeat('a',64),100);
  if not exists(select 1 from catalog.asset_versions where id=second and revision_number=2 and publication_status='private' and moderation_status='submitted' and storage_verified_at is not null) then raise exception 'Revision or private state lost';end if;
  begin perform public.review_asset_version(intent,actor,session,'submitted','in_review','Self review');raise exception 'Contributor review accepted';exception when insufficient_privilege then null;end;
  begin perform public.review_asset_version(intent,moderator,mod_session,'submitted','approved','Skip review');raise exception 'Review transition skipped';exception when serialization_failure then null;end;
  perform public.review_asset_version(intent,moderator,mod_session,'submitted','in_review','Inspect original');
  perform public.review_asset_version(intent,moderator,mod_session,'in_review','approved','Source and rights checked');
  begin perform public.review_asset_version(intent,moderator,mod_session,'in_review','rejected','Stale state');raise exception 'Stale review accepted';exception when serialization_failure then null;end;
  if (select publication_status from catalog.asset_versions where id=intent)<>'private' then raise exception 'Review published original';end if;
  if (select count(*) from catalog.asset_version_events where version_id=intent)<>3 then raise exception 'Review audit missing';end if;
  begin perform public.set_asset_version_publication(intent,moderator,mod_session,'private','published','Moderator publish');raise exception 'Moderator publication accepted';exception when insufficient_privilege then null;end;
  second:=gen_random_uuid();
  insert into catalog.asset_submissions(id,uploader_id,expires_at,metadata,object_key)
  values(second,actor,now()-interval '1 second',data,'expired-fixture/'||second);
  begin perform public.complete_asset_submission(second,actor,session,repeat('a',64),100);raise exception 'Expired submission completed';exception when serialization_failure then null;end;
  for n in 4..20 loop perform public.reserve_asset_submission(actor,session,data);end loop;
  begin perform public.reserve_asset_submission(actor,session,data);raise exception 'Daily quota exceeded';exception when program_limit_exceeded then null;end;
  if has_function_privilege('anon','public.reserve_asset_submission(uuid,uuid,jsonb)','execute') or has_function_privilege('authenticated','public.complete_asset_submission(uuid,uuid,uuid,text,bigint)','execute') or has_function_privilege('authenticated','public.review_asset_version(uuid,uuid,uuid,text,text,text)','execute') then raise exception 'Browser role can invoke service transaction';end if;
end $$;
reset role;
