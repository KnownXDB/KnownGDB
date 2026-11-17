reset role;
insert into auth.sessions(id,user_id)
values('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare
  base uuid;
  demo uuid;
  playtest uuid;
  created uuid;
begin
  select id into base from catalog.games order by created_at limit 1;
  if (select item_type from catalog.games where id=base) <> 'game' then
    raise exception 'Existing catalog items must default to game';
  end if;
  created:=public.admin_save_game(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000030',
    null,
    null,
    jsonb_build_object(
      'title','Fixture Demo',
      'language','en',
      'description','Fixture',
      'source_reference','https://example.invalid/demo',
      'confidence',1,
      'status','draft',
      'approved',false,
      'is_primary',true,
      'item_type','demo'
    )
  );
  if (select item_type from catalog.games where id=created) <> 'demo' then
    raise exception 'Administrative creation lost item type';
  end if;
  demo:=created;
  playtest:=gen_random_uuid();
  insert into catalog.games(id,item_type) values(playtest,'playtest');
  insert into catalog.game_relations(parent_game_id,child_game_id,relation_type,source_reference,confidence)
  values(base,demo,'has_demo','https://example.invalid/demo',1),
    (base,playtest,'has_playtest','https://example.invalid/playtest',1);
  if (select count(*) from catalog.game_relations where parent_game_id=base)<>2 then
    raise exception 'Related catalog items were not preserved';
  end if;
  begin
    insert into catalog.game_relations(parent_game_id,child_game_id,relation_type,source_reference,confidence)
    values(base,playtest,'has_demo','https://example.invalid/wrong',1);
    raise exception 'Relation accepted an incompatible child type';
  exception when check_violation then null;
  end;
  begin
    update catalog.games set item_type='demo' where id=base;
    raise exception 'Catalog item type changed after registration';
  exception when check_violation then null;
  end;
  begin
    insert into catalog.game_relations(parent_game_id,child_game_id,relation_type,source_reference,confidence)
    values(base,base,'has_demo','https://example.invalid/self',1);
    raise exception 'Self relation accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;
