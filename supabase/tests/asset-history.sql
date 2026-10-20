-- Run after the migration inside a rollback-only transaction.
create function pg_temp.expect_failure(statement text, expected_state text) returns void
language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if SQLSTATE <> expected_state then raise; end if;
    caught := true;
  end;
  if not caught then raise exception 'Expected rejection did not occur'; end if;
end $$;
do $$
declare actor uuid; game uuid; collection uuid; first_version uuid; version_key text; seq integer; previous_assets integer;
begin
  select user_id into actor from catalog.admin_members where active and role='super_admin';
  select id into game from catalog.games limit 1;
  select count(*) into previous_assets from catalog.assets;
  if actor is null or game is null then raise exception 'Verified existing administrator and game required'; end if;
  insert into catalog.asset_collections(game_id,role,provenance,credit_kind,uploader_id)
    values(game,'hero','official','official',actor) returning id into collection;
  insert into catalog.asset_versions(collection_id,game_id,uploader_id,language_kind,extension,checksum_sha256,byte_size,source_reference,rights_reference,created_at)
    values(collection,game,actor,'global','png',repeat('a',64),128,'Transaction test source','Transaction test rights','2026-12-31T23:00:00-03:00')
    returning id,object_key,revision_number into first_version,version_key,seq;
  if version_key <> 'games/'||game||'/official/hero/global/2027/01/'||first_version||'/original.png' or seq<>1
    then raise exception 'Canonical object identity mismatch'; end if;
  insert into catalog.asset_versions(collection_id,game_id,uploader_id,language_kind,language_tags,context_key,extension,checksum_sha256,byte_size,source_reference,rights_reference)
    values(collection,game,actor,'localized',array['en','es'],'holiday','png',repeat('b',64),128,'Transaction test source','Transaction test rights')
    returning revision_number into seq;
  if seq<>2 then raise exception 'Revision order mismatch'; end if;
  perform pg_temp.expect_failure(format('insert into catalog.asset_collections(game_id,role,provenance,credit_kind,uploader_id) values(%L,%L,%L,%L,%L)',game,'hero','community','personal',actor),'23514');
  perform pg_temp.expect_failure(format('update catalog.asset_versions set checksum_sha256=%L,changed_by=%L where id=%L',repeat('c',64),actor,first_version),'P0001');
  perform pg_temp.expect_failure(format('delete from catalog.asset_versions where id=%L',first_version),'P0001');
  perform pg_temp.expect_failure(format('update catalog.asset_versions set publication_status=%L,changed_by=%L where id=%L','published',actor,first_version),'23514');
  perform pg_temp.expect_failure(format('insert into catalog.asset_versions(collection_id,game_id,uploader_id,language_kind,extension,checksum_sha256,byte_size,source_reference,rights_reference) values(%L,%L,%L,%L,%L,%L,128,%L,%L)',collection,gen_random_uuid(),actor,'global','png',repeat('a',64),'test source','test rights'),'P0001');
  perform pg_temp.expect_failure(format('insert into catalog.asset_versions(collection_id,game_id,uploader_id,language_kind,language_tags,extension,checksum_sha256,byte_size,source_reference,rights_reference) values(%L,%L,%L,%L,array[%L,%L],%L,%L,128,%L,%L)',collection,game,actor,'localized','en','en','png',repeat('a',64),'test source','test rights'),'P0001');
  update catalog.asset_versions set storage_verified_at=now(),moderation_status='approved',publication_status='published',reviewed_by=actor,reviewed_at=now(),changed_by=actor,change_reason='Transaction test approval' where id=first_version;
  if (select count(*) from catalog.asset_version_events where version_id=first_version)<>2 then raise exception 'Audit event missing'; end if;
  if (select count(*) from catalog.assets)<>previous_assets then raise exception 'Legacy assets changed'; end if;
end $$;
