-- Pick at most one eligible cover per requested localization.
create function catalog.public_catalog_covers(requested jsonb)
returns table (game_id uuid, language text, version_id uuid)
language sql stable security invoker set search_path = '' as $$
  select item.game_id, item.language, cover.id
  from jsonb_to_recordset(requested) as item(game_id uuid, language text)
  join catalog.games g on g.id = item.game_id and g.status = 'published'
  join catalog.game_localizations loc on loc.game_id = g.id
    and loc.language = item.language and loc.moderation_status = 'approved'
  cross join lateral (
    select v.id
    from catalog.asset_versions v
    join catalog.asset_collections c on c.id = v.collection_id and c.game_id = v.game_id
    where v.game_id = item.game_id and v.context_key = 'base'
      and v.publication_status = 'published' and v.moderation_status = 'approved'
      and v.storage_verified_at is not null and length(trim(v.rights_reference)) > 0
      and v.created_at <= now() and (v.valid_from is null or v.valid_from <= now())
      and (v.valid_until is null or v.valid_until > now())
      and c.role in ('capsule','header','hero')
      and (v.language_kind = 'global' or exists (
        select 1 from unnest(v.language_tags) tag where lower(tag) = lower(item.language)
      ))
    order by case c.role when 'capsule' then 0 when 'header' then 1 else 2 end,
      v.created_at desc, v.id desc
    limit 1
  ) cover;
$$;
revoke all on function catalog.public_catalog_covers(jsonb) from public, anon, authenticated;
grant execute on function catalog.public_catalog_covers(jsonb) to service_role;
