-- Rolled back by the disposable database runner.
do $$
declare
  actor uuid := '00000000-0000-4000-8000-000000000001';
  first_game uuid;
  second_game uuid;
  col uuid;
  other_col uuid;
  es_cover uuid;
  other_cover uuid;
  requested jsonb;
  matches integer;
begin
  insert into catalog.games(status) values ('published') returning id into first_game;
  insert into catalog.games(status) values ('published') returning id into second_game;
  insert into catalog.game_localizations(game_id,language,title,source_reference,confidence,
    moderation_status,reviewed_at,reviewed_by)
    select id, lang, 'Cover fixture', 'Fixture', 1, 'approved', now(), actor
    from unnest(array[first_game,second_game]) id cross join unnest(array['en','es']) lang;
  insert into catalog.asset_collections(game_id,role,provenance,credit_kind,uploader_id)
    values(first_game,'capsule','official','official',actor) returning id into col;
  insert into catalog.asset_collections(game_id,role,provenance,credit_kind,uploader_id)
    values(second_game,'hero','official','official',actor) returning id into other_col;
  insert into catalog.asset_versions(collection_id,game_id,uploader_id,language_kind,language_tags,
    extension,checksum_sha256,byte_size,source_reference,rights_reference,storage_verified_at,
    reviewed_at,reviewed_by,publication_status,moderation_status,created_at)
    select col,first_game,actor,'localized',array['en'],'png',repeat('a',64),100,'Fixture','Fixture',
      now(),now(),actor,'published','approved',now() - n * interval '1 second'
    from generate_series(1,501) n;
  insert into catalog.asset_versions(collection_id,game_id,uploader_id,language_kind,language_tags,
    extension,checksum_sha256,byte_size,source_reference,rights_reference,storage_verified_at,
    reviewed_at,reviewed_by,publication_status,moderation_status,created_at)
    values(col,first_game,actor,'localized',array['es'],'png',repeat('b',64),100,'Fixture','Fixture',
      now(),now(),actor,'published','approved',now()-interval '1 day') returning id into es_cover;
  insert into catalog.asset_versions(collection_id,game_id,uploader_id,language_kind,extension,
    checksum_sha256,byte_size,source_reference,rights_reference,storage_verified_at,
    reviewed_at,reviewed_by,publication_status,moderation_status,created_at)
    values(other_col,second_game,actor,'global','png',repeat('c',64),100,'Fixture','Fixture',
      now(),now(),actor,'published','approved',now()-interval '2 days') returning id into other_cover;
  select jsonb_agg(jsonb_build_object('game_id',game_id,'language',language)) into requested
    from catalog.game_localizations where game_id in (first_game,second_game);
  select count(*) into matches from catalog.public_catalog_covers(requested)
    where (game_id=first_game and ((language='es' and version_id=es_cover)
      or (language='en' and version_id<>es_cover)))
      or (game_id=second_game and version_id=other_cover);
  if matches <> 4 then raise exception 'Missing localized or global cover'; end if;
  update catalog.games set status='withdrawn' where id=second_game;
  if exists(select from catalog.public_catalog_covers(requested) where game_id=second_game)
    then raise exception 'Withdrawn game returned'; end if;
  if has_function_privilege('anon','catalog.public_catalog_covers(jsonb)','execute')
    or has_function_privilege('authenticated','catalog.public_catalog_covers(jsonb)','execute')
    then raise exception 'Unexpected browser role grant'; end if;
end $$;
