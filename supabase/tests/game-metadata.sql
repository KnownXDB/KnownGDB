insert into auth.users(id,email_confirmed_at) values('00000000-0000-4000-8000-000000000032',now());
insert into catalog.admin_members(user_id,role) values('00000000-0000-4000-8000-000000000032','moderator');
insert into auth.sessions(id,user_id) values
('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000033','00000000-0000-4000-8000-000000000032');
set local role service_role;
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000001'; session uuid:='00000000-0000-4000-8000-000000000031';
  moderator uuid:='00000000-0000-4000-8000-000000000032'; mod_session uuid:='00000000-0000-4000-8000-000000000033';
  game uuid; org uuid; publisher uuid; platform uuid; genre uuid; first uuid; second uuid; stamp timestamptz; payload jsonb; result jsonb;
begin
  game:=public.create_game_draft(actor,session,'{"title":"Original fixture title","language":"en","source_reference":"Original source"}');
  org:=(public.admin_metadata_terms(actor,session,'organization','Fixture studio','Studio source')->>'id')::uuid;
  publisher:=(public.admin_metadata_terms(actor,session,'organization','Fixture publisher','Publisher source')->>'id')::uuid;
  platform:=(public.admin_metadata_terms(actor,session,'platform','Fixture platform','Platform source')->>'id')::uuid;
  genre:=(public.admin_metadata_terms(actor,session,'genre','Fixture genre','Genre source')->>'id')::uuid;
  begin perform public.admin_metadata_terms(actor,session,'organization','fixture STUDIO','Other source');raise exception 'Duplicate organization silently merged';exception when unique_violation then null;end;
  payload:=jsonb_build_object('primaryLanguage','en','originalTitle','Original title','gameType','game',
    'localizations','[{"language":"en","title":"Reviewed fixture title","summary":"Short summary","description":"Long description","aliases":["Fixture alias"]},{"language":"es","title":"Localized fixture title","summary":"Localized summary","description":"Localized description","aliases":[]}]'::jsonb,
    'releases',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-8000-000000000034','platformId',platform,'edition','Base','region','WW','announcedDate','2025-06','releaseDate','2026','status','released','availability','available','storeUrl','https://example.invalid/game')),
    'credits',jsonb_build_array(jsonb_build_object('organizationId',org,'role','developer','releaseId',null,'region',null),jsonb_build_object('organizationId',publisher,'role','publisher','releaseId','00000000-0000-4000-8000-000000000034','region','US')),
    'languages','[{"language":"en","releaseId":null,"interface":true,"subtitles":null,"audio":false}]'::jsonb,
    'classifications',jsonb_build_array(genre));
  first:=public.save_game_metadata(moderator,mod_session,game,null,payload,'Reviewed sources',0.8,'Initial metadata');
  if public.published_game_metadata(game) is not null then raise exception 'Draft metadata exposed';end if;
  if not exists(select 1 from catalog.game_localizations where game_id=game and title='Original fixture title' and moderation_status='in_review') then raise exception 'Saving draft changed searchable title';end if;
  if (select release_date from catalog.metadata_releases where revision_id=first)<>'2026' then raise exception 'Year precision lost';end if;
  if not exists(select 1 from catalog.metadata_languages where revision_id=first and interface and subtitles is null and audio=false) then raise exception 'Unknown language support lost';end if;
  begin perform public.approve_game_metadata(moderator,mod_session,game,first,'Self approval');raise exception 'Moderator approved metadata';exception when insufficient_privilege then null;end;
  perform public.approve_game_metadata(actor,session,game,first,'Verified all evidence');
  if not exists(select 1 from catalog.audit_events where game_id=game and metadata->>'operation'='metadata_approved' and metadata->'previousLocalizations'->0->>'title'='Original fixture title') then raise exception 'Pre-editor localization history was lost';end if;
  if public.published_game_metadata(game) is not null then raise exception 'Approval published game';end if;
  select updated_at into stamp from catalog.games where id=game;
  perform public.admin_save_game(actor,session,game,stamp,'{"title":"Reviewed fixture title","language":"en","description":"Long description","source_reference":"Reviewed sources","confidence":0.8,"approved":true,"is_primary":true,"status":"published"}');
  result:=public.published_game_metadata(game);
  if result->>'revisionId'<>first::text then raise exception 'Approved metadata not exposed';end if;
  if result::text like '%Reviewed sources%' or result::text like '%Verified all evidence%' then raise exception 'Private evidence exposed';end if;
  payload:=jsonb_set(payload,'{localizations,0,title}','"Pending replacement"');
  second:=public.save_game_metadata(actor,session,game,first,payload,'New evidence',0.9,'Pending change');
  if public.published_game_metadata(game)->>'revisionId'<>first::text then raise exception 'Pending revision replaced public revision';end if;
  if not exists(select 1 from catalog.game_localizations where game_id=game and language='en' and title='Reviewed fixture title') then raise exception 'Pending title exposed';end if;
  begin perform public.save_game_metadata(actor,session,game,first,payload,'Evidence',0.9,'Stale edit');raise exception 'Stale revision accepted';exception when serialization_failure then null;end;
  begin perform public.approve_game_metadata(actor,session,game,first,'Stale approval');raise exception 'Stale approval accepted';exception when serialization_failure then null;end;
  begin perform public.save_game_metadata(actor,session,game,second,jsonb_set(payload,'{releases,0,releaseDate}','"2026-02-30"'),'Evidence',0.9,'Invalid date');raise exception 'Invalid calendar date accepted';exception when check_violation then null;end;
  begin perform public.save_game_metadata(actor,session,game,second,jsonb_set(payload,'{releases,0,platformId}',to_jsonb(org::text)),'Evidence',0.9,'Wrong term type');raise exception 'Organization used as platform';exception when foreign_key_violation then null;end;
  begin perform public.save_game_metadata(actor,session,game,second,jsonb_set(payload,'{languages,0,releaseId}','"00000000-0000-4000-8000-000000000099"'),'Evidence',0.9,'Foreign release');raise exception 'Foreign release accepted';exception when foreign_key_violation then null;end;
  if (select count(*) from catalog.game_metadata_revisions where game_id=game)<>2 then raise exception 'Invalid edit partially committed';end if;
  if (select count(*) from catalog.audit_events where game_id=game and metadata->>'operation'='metadata_saved')<>2 then raise exception 'Metadata save audit missing';end if;
  if has_table_privilege('service_role','catalog.metadata_localizations','update') then raise exception 'Direct rewrite of metadata allowed';end if;
  if has_function_privilege('anon','public.published_game_metadata(uuid)','execute') or has_function_privilege('authenticated','public.save_game_metadata(uuid,uuid,uuid,uuid,jsonb,text,numeric,text)','execute') then raise exception 'Browser RPC exposed';end if;
  if exists(select 1 from catalog.asset_versions where game_id=game) then raise exception 'Metadata created asset versions';end if;
  if public.admin_game_metadata(actor,session,game)->'revision'->>'id'<>second::text then raise exception 'Admin cannot read pending revision';end if;
end $$;
reset role;
