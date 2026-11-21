begin;

-- Keep one candidate array per input, including missing identities. The extra
-- candidate preserves the resolver's conservative decision on truncated sets.
create function public.batch_identity_candidates(p_identities jsonb)
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select jsonb_agg(coalesce((
    select jsonb_agg(to_jsonb(candidate))
    from (
      select e.game_id, e.evidence_status, e.valid_from, e.valid_until
      from catalog.external_identities e
      where e.provider = (item->>'provider') and e.namespace = (item->>'namespace')
        and e.identifier_kind = (item->>'kind') and e.normalized_value = (item->>'value')
      limit 101
    ) candidate
  ), '[]'::jsonb) order by position)
  from jsonb_array_elements(p_identities) with ordinality as input(item, position)
  where jsonb_array_length(p_identities) between 1 and 20;
$$;

create function public.batch_published_metadata(p_games uuid[])
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select jsonb_object_agg(game_id, public.published_game_metadata(game_id) - 'terms')
  from (select distinct game_id from unnest(p_games) game_id) games
  where cardinality(p_games) between 1 and 20;
$$;

revoke all on function public.batch_identity_candidates(jsonb), public.batch_published_metadata(uuid[])
  from public, anon, authenticated;
grant execute on function public.batch_identity_candidates(jsonb), public.batch_published_metadata(uuid[])
  to service_role;
notify pgrst, 'reload schema';
commit;
