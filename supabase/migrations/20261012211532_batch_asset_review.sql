begin;
create function public.admin_asset_batch_review(p_actor uuid,p_session uuid,p_game uuid,p_assets uuid[],
  p_decision text,p_publish boolean,p_rights text,p_reason text) returns uuid[]
language plpgsql security invoker set search_path=pg_catalog as $$
declare asset catalog.assets; result uuid[]:='{}';
begin
  if not public.admin_check(p_actor,p_session) then raise exception 'admin_forbidden'; end if;
  if coalesce(cardinality(p_assets),0) not between 1 and 100 or array_position(p_assets,null) is not null
    or (select count(distinct id) from unnest(p_assets) id)<>cardinality(p_assets)
    then raise exception 'invalid_request'; end if;
  perform 1 from catalog.assets where id=any(p_assets) and game_id=p_game order by id for update;
  if (select count(*) from catalog.assets where id=any(p_assets) and game_id=p_game)<>cardinality(p_assets)
    then raise exception 'asset_not_found'; end if;
  for asset in select * from catalog.assets where id=any(p_assets) and game_id=p_game order by id loop
    perform public.admin_asset_review(p_actor,p_session,asset.id,p_decision,p_publish,p_rights,p_reason,asset.valid_from,asset.valid_until);
    result:=array_append(result,asset.id);
  end loop;
  return result;
end;
$$;
revoke all on function public.admin_asset_batch_review(uuid,uuid,uuid,uuid[],text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.admin_asset_batch_review(uuid,uuid,uuid,uuid[],text,boolean,text,text) to service_role;
commit;
