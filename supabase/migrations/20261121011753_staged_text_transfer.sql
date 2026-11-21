begin;
alter table catalog.integration_credentials drop constraint integration_credentials_scope_check;
alter table catalog.integration_credentials add constraint integration_credentials_scope_check check(scope in ('identity:resolve','intake:text'));
create table catalog.text_transfers (
 id uuid primary key default gen_random_uuid(), credential_id uuid not null references catalog.integration_credentials(id),
 client_id uuid not null, expected_size bigint not null check(expected_size between 0 and 67108864),
 expected_hash text not null check(expected_hash ~ '^[0-9a-f]{64}$'), status text not null default 'pending' check(status in ('pending','complete')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '1 day',
 unique(credential_id,client_id)
);
create index text_transfers_expires_idx on catalog.text_transfers(expires_at);
create table catalog.text_transfer_chunks (
 transfer_id uuid not null references catalog.text_transfers(id) on delete cascade, chunk_index integer not null check(chunk_index between 0 and 255),
 data bytea not null check(octet_length(data) between 1 and 262144), hash text not null check(hash ~ '^[0-9a-f]{64}$'),
 primary key(transfer_id,chunk_index)
);
alter table catalog.text_transfers enable row level security;
alter table catalog.text_transfer_chunks enable row level security;
revoke all on catalog.text_transfers,catalog.text_transfer_chunks from public,anon,authenticated;
grant select,insert,update,delete on catalog.text_transfers,catalog.text_transfer_chunks to service_role;
create function public.create_text_transfer_credential(p_actor uuid,p_session uuid,p_name text,p_hash text,p_prefix text,p_expires timestamptz,p_reason text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare target uuid;
begin
 if not public.admin_check(p_actor,p_session) or not exists(select 1 from catalog.admin_members where user_id=p_actor and active and role='super_admin') then raise insufficient_privilege; end if;
 if coalesce(length(trim(p_name)),0) not between 1 and 80 or p_name ~ '[[:cntrl:]<>]' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_prefix is null or p_prefix !~ '^kgsvc_[A-Za-z0-9_-]{7}$' or p_expires is null or p_expires<=now() or p_expires>now()+interval '1 year' or coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise invalid_parameter_value; end if;
 insert into catalog.integration_credentials(name,key_hash,prefix,scope,created_by,expires_at) values(trim(p_name),p_hash,p_prefix,'intake:text',p_actor,p_expires) returning id into target;
 insert into catalog.integration_credential_events(credential_id,actor_id,action,reason) values(target,p_actor,'created',trim(p_reason));
 return jsonb_build_object('id',target,'scope','intake:text','expiresAt',p_expires);
end $$;
create function public.stage_text_transfer(p_hash text,p_action text,p_transfer uuid,p_client uuid,p_size bigint,p_digest text,p_index integer,p_data bytea,p_chunk_digest text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare credential uuid; transfer catalog.text_transfers; part catalog.text_transfer_chunks; assembled bytea; expected_chunks integer;
begin
 select id into credential from catalog.integration_credentials where key_hash=p_hash and scope='intake:text' and revoked_at is null and expires_at>clock_timestamp() for update;
 if not found then return jsonb_build_object('status','denied'); end if;
 delete from catalog.text_transfers where expires_at<=clock_timestamp();
 if p_action='create' then
   if p_client is null or p_size is null or p_size not between 0 and 67108864 or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then raise invalid_parameter_value; end if;
   perform pg_advisory_xact_lock(hashtextextended('text-transfer:'||credential::text,0));
   select * into transfer from catalog.text_transfers where credential_id=credential and client_id=p_client;
   if found then
     if transfer.expected_size<>p_size or transfer.expected_hash<>p_digest then raise unique_violation; end if;
     return jsonb_build_object('status',transfer.status,'id',transfer.id);
   end if;
   if (select count(*) from catalog.text_transfers where credential_id=credential)>=1 then raise exception using errcode='54000',message='Active transfer limit reached'; end if;
   insert into catalog.text_transfers(credential_id,client_id,expected_size,expected_hash) values(credential,p_client,p_size,p_digest) returning * into transfer;
   return jsonb_build_object('status',transfer.status,'id',transfer.id);
 end if;
 select * into transfer from catalog.text_transfers where id=p_transfer and credential_id=credential and expires_at>clock_timestamp() for update;
 if not found then
   if p_action='delete' then return jsonb_build_object('status','deleted'); end if;
   raise no_data_found;
 end if;
 if p_action='chunk' then
   expected_chunks:=ceil(transfer.expected_size::numeric/262144)::integer;
   if p_index is null or p_index<0 or p_index>=expected_chunks or p_data is null or octet_length(p_data)<>least(262144,transfer.expected_size-p_index::bigint*262144) or p_chunk_digest is null or p_chunk_digest !~ '^[0-9a-f]{64}$' or encode(sha256(p_data),'hex')<>p_chunk_digest then raise invalid_parameter_value; end if;
   select * into part from catalog.text_transfer_chunks where transfer_id=transfer.id and chunk_index=p_index;
   if found then if part.hash<>p_chunk_digest or part.data<>p_data then raise unique_violation; end if; return jsonb_build_object('status','existing'); end if;
   if transfer.status<>'pending' then raise exception using errcode='40001',message='Transfer already complete'; end if;
   insert into catalog.text_transfer_chunks(transfer_id,chunk_index,data,hash) values(transfer.id,p_index,p_data,p_chunk_digest);
   return jsonb_build_object('status','stored');
 elsif p_action='complete' then
   if transfer.status='complete' then return jsonb_build_object('status','complete','id',transfer.id); end if;
   expected_chunks:=ceil(transfer.expected_size::numeric/262144)::integer;
   if (select count(*) from catalog.text_transfer_chunks where transfer_id=transfer.id)<>expected_chunks then raise exception using errcode='40001',message='Transfer incomplete'; end if;
   select coalesce(string_agg(data,''::bytea order by chunk_index),''::bytea) into assembled from catalog.text_transfer_chunks where transfer_id=transfer.id;
   if octet_length(assembled)<>transfer.expected_size or encode(sha256(assembled),'hex')<>transfer.expected_hash then raise exception using errcode='23514',message='Transfer integrity failed'; end if;
   perform convert_from(assembled,'UTF8');
   update catalog.text_transfers set status='complete' where id=transfer.id;
   return jsonb_build_object('status','complete','id',transfer.id);
 elsif p_action='delete' then
   delete from catalog.text_transfers where id=transfer.id;
   return jsonb_build_object('status','deleted');
 end if;
 raise invalid_parameter_value;
end $$;
revoke all on function public.create_text_transfer_credential(uuid,uuid,text,text,text,timestamptz,text),public.stage_text_transfer(text,text,uuid,uuid,bigint,text,integer,bytea,text) from public,anon,authenticated;
grant execute on function public.create_text_transfer_credential(uuid,uuid,text,text,text,timestamptz,text),public.stage_text_transfer(text,text,uuid,uuid,bigint,text,integer,bytea,text) to service_role;
notify pgrst,'reload schema';
commit;
