reset role;
insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000001'; session uuid:='00000000-0000-4000-8000-000000000081'; hash text:=repeat('a',64); identity_hash text:=repeat('b',64); other_hash text:=repeat('c',64); client uuid:=gen_random_uuid(); transfer uuid; result jsonb; full_text text:=repeat('ñ',550000); data bytea; part bytea; i integer; size integer;
begin
 perform public.create_multi_scope_credential(actor,session,'Combined test',repeat('d',64),'kgsvc_xyz1234',null,'Test');
 assert public.consume_integration_credential(repeat('d',64),'identity:resolve')='allowed';
 assert public.consume_integration_credential(repeat('d',64),'intake:text')='allowed';
 assert public.consume_integration_credential(repeat('d',64),'unknown')='denied';
 result:=public.stage_text_transfer(repeat('d',64),'create',null,gen_random_uuid(),0,encode(sha256(''::bytea),'hex'),null,null,null); assert result->>'status'='pending';
 update catalog.integration_credentials set revoked_at=clock_timestamp() where key_hash=repeat('d',64);
 assert public.consume_integration_credential(repeat('d',64),'identity:resolve')='denied';
 assert public.consume_integration_credential(repeat('d',64),'intake:text')='denied';
 result:=public.stage_text_transfer(repeat('d',64),'create',null,gen_random_uuid(),0,encode(sha256(''::bytea),'hex'),null,null,null); assert result->>'status'='denied';
 perform public.create_text_transfer_credential(actor,session,'Text test',hash,'kgsvc_abc1234',null,'Test');
 perform public.manage_integration_credential(actor,session,'create',null,'Read only',identity_hash,'kgsvc_def5678',now()+interval '30 days','Test');
 perform public.create_text_transfer_credential(actor,session,'Other test',other_hash,'kgsvc_ghi9012',now()+interval '30 days','Test');
 data:=convert_to(full_text,'UTF8'); size:=octet_length(data);
 assert size>1048576;
 result:=public.stage_text_transfer(identity_hash,'create',null,client,size,encode(sha256(data),'hex'),null,null,null); assert result->>'status'='denied';
 result:=public.stage_text_transfer(hash,'create',null,client,size,encode(sha256(data),'hex'),null,null,null); transfer:=(result->>'id')::uuid; assert result->>'status'='pending';
 result:=public.stage_text_transfer(hash,'create',null,client,size,encode(sha256(data),'hex'),null,null,null); assert (result->>'id')::uuid=transfer;
 begin perform public.stage_text_transfer(hash,'create',null,client,size,repeat('0',64),null,null,null); raise exception 'Conflicting manifest accepted'; exception when unique_violation then null; end;
 begin perform public.stage_text_transfer(other_hash,'complete',transfer,null,null,null,null,null,null); raise exception 'Other credential accessed transfer'; exception when no_data_found then null; end;
 update catalog.integration_credentials set revoked_at=clock_timestamp() where key_hash=hash;
 result:=public.stage_text_transfer(hash,'complete',transfer,null,null,null,null,null,null); assert result->>'status'='denied';
 update catalog.integration_credentials set revoked_at=null where key_hash=hash;
 begin perform public.stage_text_transfer(hash,'complete',transfer,null,null,null,null,null,null); raise exception 'Incomplete transfer accepted'; exception when serialization_failure then null; end;
 for i in 0..ceil(size::numeric/262144)::integer-1 loop
   part:=substring(data from i*262144+1 for 262144);
   if i=0 then
     begin perform public.stage_text_transfer(hash,'chunk',transfer,null,null,null,i,part,repeat('0',64)); raise exception 'Invalid checksum accepted'; exception when invalid_parameter_value then null; end;
   end if;
   result:=public.stage_text_transfer(hash,'chunk',transfer,null,null,null,i,part,encode(sha256(part),'hex')); assert result->>'status'='stored';
   result:=public.stage_text_transfer(hash,'chunk',transfer,null,null,null,i,part,encode(sha256(part),'hex')); assert result->>'status'='existing';
   if i=0 then
     begin perform public.stage_text_transfer(hash,'chunk',transfer,null,null,null,i,decode(repeat('ff',262144),'hex'),encode(sha256(decode(repeat('ff',262144),'hex')),'hex')); raise exception 'Conflicting chunk accepted'; exception when unique_violation then null; end;
   end if;
 end loop;
 result:=public.stage_text_transfer(hash,'complete',transfer,null,null,null,null,null,null); assert result->>'status'='complete';
 result:=public.stage_text_transfer(hash,'complete',transfer,null,null,null,null,null,null); assert result->>'status'='complete';
 assert (select encode(sha256(string_agg(c.data,''::bytea order by c.chunk_index)),'hex') from catalog.text_transfer_chunks c where c.transfer_id=transfer)=encode(sha256(data),'hex');
 result:=public.stage_text_transfer(hash,'delete',transfer,null,null,null,null,null,null); assert result->>'status'='deleted';
 result:=public.stage_text_transfer(hash,'delete',transfer,null,null,null,null,null,null); assert result->>'status'='deleted';
 data:=decode('ff','hex');
 result:=public.stage_text_transfer(hash,'create',null,gen_random_uuid(),1,encode(sha256(data),'hex'),null,null,null); transfer:=(result->>'id')::uuid;
 perform public.stage_text_transfer(hash,'chunk',transfer,null,null,null,0,data,encode(sha256(data),'hex'));
 begin perform public.stage_text_transfer(hash,'complete',transfer,null,null,null,null,null,null); raise exception 'Invalid UTF-8 accepted'; exception when character_not_in_repertoire then null; end;
end $$;
reset role;
set local role anon;
do $$ begin begin perform public.stage_text_transfer(null,'create',null,null,null,null,null,null,null); raise exception 'Anonymous transfer allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
