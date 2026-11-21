begin;
alter table catalog.metadata_localizations drop constraint metadata_localizations_summary_check;
alter table catalog.metadata_localizations drop constraint metadata_localizations_description_check;
alter table catalog.game_localizations drop constraint game_localizations_description_check;
create or replace function public.create_game_draft(p_actor uuid,p_session uuid,p_data jsonb) returns uuid
language plpgsql security invoker set search_path=pg_catalog as $$
declare target uuid; draft_title text:=trim(p_data->>'title');
begin
  if not public.admin_check(p_actor,p_session) then raise exception using errcode='42501',message='Administrative session required'; end if;
  if draft_title is null or length(draft_title) not between 1 and 300 or coalesce(length(trim(p_data->>'source_reference')),0) not between 1 and 2000
    or coalesce(p_data->>'language','') !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' or p_data->>'language'='und' then
    raise exception using errcode='22023',message='Title, language and source reference required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(draft_title),1));
  if exists(select 1 from catalog.game_localizations where lower(trim(game_localizations.title))=lower(draft_title) and language=p_data->>'language') then
    raise exception using errcode='23505',message='Check the existing title before creating another canonical game';
  end if;
  target:=public.admin_save_game(p_actor,p_session,null,null,jsonb_build_object(
    'title',draft_title,'language',p_data->>'language','source_reference',trim(p_data->>'source_reference'),
    'description',p_data->>'description','status','draft','approved',false,'confidence',0,'is_primary',true));
  return target;
end $$;
notify pgrst,'reload schema';
commit;
