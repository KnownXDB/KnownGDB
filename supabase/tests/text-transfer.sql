reset role;
insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000001'; session uuid:='00000000-0000-4000-8000-000000000081'; hash text:=repeat('a',64); identity_hash text:=repeat('b',64); client uuid:=gen_random_uuid(); transfer uuid; result jsonb; full_text text:=repeat('ñ',550000); data bytea; part bytea; i integer; size integer;
begin
 perform public.create_text_transfer_credential(actor,session,'Text test',hash,'kgsvc_abc1234',now()+interval '30 days','Test');
 perform public.manage_integration_credential(actor,session,'create',null,'Read only',identity_hash,'kgsvc_def5678',now()+interval '30 days','Test');
 data:=convert_to(full_text,'UTF8'); size:=octet_length(data);
 assert size>1048576;
 result:=public.stage_text_transfer(identity_hash,'create',null,client,size,encode(sha256(data),'hex'),null,null,null); assert result->>'status'='denied';
 result:=public.stage_text_transfer(hash,'create',null,client,size,encode(sha256(data),'hex'),null,null,null); transfer:=(result->>'id')::uuid; assert result->>'status'='pending';
 result:=public.stage_text_transfer(hash,'create',null,client,size,encode(sha256(data),'hex'),null,null,null); assert (result->>'id')::uuid=transfer;
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
end $$;
reset role;
set local role anon;
do $$ begin begin perform public.stage_text_transfer(null,'create',null,null,null,null,null,null,null); raise exception 'Anonymous transfer allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
